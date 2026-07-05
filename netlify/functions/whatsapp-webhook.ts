import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from '../lib/supabase'
import { registrarAtividade } from '../lib/atividades'
import { enviarTexto, normalizarNumero, whatsappConfigurado } from '../lib/whatsapp'
import { obterConfigIA, atenderComIA, iaConfigurada } from '../lib/ia'

// Webhook da API OFICIAL do WhatsApp (Meta Developers).
// URL a cadastrar no painel da Meta:  https://SEU-SITE.netlify.app/api/whatsapp-webhook
//
// GET  -> verificação do webhook (hub.challenge) usando META_VERIFY_TOKEN
// POST -> recebimento de mensagens
//
// Fluxo no POST:
// 1. Identifica o lead pelo número (cria automaticamente se não existir).
// 2. Salva a mensagem recebida e registra no histórico do lead.
// 3. Se a automação de IA estiver ativa e o lead estiver em modo 'ia',
//    a IA responde; se decidir transferir, passa para humano e registra.
export const handler: Handler = async (event) => {
  // ---------- VERIFICAÇÃO (GET) ----------
  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {}
    const modo = q['hub.mode']
    const token = q['hub.verify_token']
    const challenge = q['hub.challenge']
    if (modo === 'subscribe' && token && token === process.env.META_VERIFY_TOKEN) {
      return { statusCode: 200, body: challenge || '' }
    }
    return { statusCode: 403, body: 'Token de verificação inválido' }
  }

  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Método não permitido' }

  // A Meta exige resposta 200 rápida; erros internos são logados, não propagados.
  try {
    const payload = JSON.parse(event.body || '{}')
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        if (!value?.messages) continue // ignora eventos de status de entrega no MVP

        for (const msg of value.messages) {
          const numero = normalizarNumero(msg.from)
          const texto: string | null =
            msg.type === 'text' ? msg.text?.body ?? null : `[mensagem do tipo ${msg.type}]`
          const nomeContato =
            value.contacts?.find((c: any) => normalizarNumero(c.wa_id) === numero)?.profile
              ?.name ?? numero

          await processarMensagem(numero, nomeContato, texto, msg.id)
        }
      }
    }
  } catch (err) {
    console.error('Erro ao processar webhook do WhatsApp:', err)
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}

async function processarMensagem(
  numero: string,
  nomeContato: string,
  texto: string | null,
  waMessageId: string
) {
  // Evita processar a mesma mensagem duas vezes (a Meta pode reenviar)
  const { data: jaExiste } = await supabaseAdmin
    .from('mensagens_whatsapp').select('id').eq('wa_message_id', waMessageId).maybeSingle()
  if (jaExiste) return

  const configIA = await obterConfigIA()

  // 1. Lead pelo número — cria automaticamente se não existir
  let { data: lead } = await supabaseAdmin
    .from('leads').select('*').eq('whatsapp', numero).maybeSingle()

  if (!lead) {
    const { data: primeiraEtapa } = await supabaseAdmin
      .from('etapas').select('id').order('ordem').limit(1).single()
    const { data: novo } = await supabaseAdmin
      .from('leads')
      .insert({
        nome: nomeContato,
        whatsapp: numero,
        etapa_id: primeiraEtapa?.id ?? null,
        origem: 'whatsapp',
        // IA atende primeiro quando a automação está ligada e configurada
        modo_atendimento: configIA.ativa && iaConfigurada() ? 'ia' : 'humano',
      })
      .select().single()
    lead = novo
    if (lead) await registrarAtividade(lead.id, 'observacao', 'Lead criado automaticamente por mensagem no WhatsApp')
  }
  if (!lead) return

  // 2. Salva a mensagem recebida + histórico
  await supabaseAdmin.from('mensagens_whatsapp').insert({
    lead_id: lead.id,
    direcao: 'recebida',
    conteudo: texto,
    wa_message_id: waMessageId,
    origem: 'cliente',
  })
  await registrarAtividade(lead.id, 'mensagem_recebida', `WhatsApp: ${texto ?? ''}`.slice(0, 500))

  // 3. Atendimento automático por IA (somente se tudo estiver configurado)
  const deveResponder =
    configIA.ativa &&
    configIA.responder_automaticamente &&
    iaConfigurada() &&
    whatsappConfigurado() &&
    lead.modo_atendimento === 'ia'
  if (!deveResponder) return

  try {
    const { data: historico } = await supabaseAdmin
      .from('mensagens_whatsapp')
      .select('direcao, conteudo')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: true })
      .limit(30)

    const ia = await atenderComIA(configIA, lead.nome, historico ?? [])

    if (ia.transferir_para_humano) {
      // Passa para humano, avisa o cliente e registra tudo no histórico
      await supabaseAdmin.from('leads')
        .update({ modo_atendimento: 'humano' }).eq('id', lead.id)
      await registrarAtividade(
        lead.id, 'transferencia',
        `IA transferiu para atendimento humano. Motivo: ${ia.motivo_transferencia}`
      )
      const aviso = configIA.mensagem_transferencia
      if (aviso) {
        const idMsg = await enviarTexto(numero, aviso)
        await supabaseAdmin.from('mensagens_whatsapp').insert({
          lead_id: lead.id, direcao: 'enviada', conteudo: aviso,
          wa_message_id: idMsg ?? null, origem: 'ia',
        })
      }
    } else {
      const idMsg = await enviarTexto(numero, ia.resposta)
      await supabaseAdmin.from('mensagens_whatsapp').insert({
        lead_id: lead.id, direcao: 'enviada', conteudo: ia.resposta,
        wa_message_id: idMsg ?? null, origem: 'ia',
      })
      await registrarAtividade(lead.id, 'mensagem_enviada', `IA respondeu: ${ia.resposta}`.slice(0, 500))
    }

    // Resumo/classificação da conversa no histórico
    await registrarAtividade(
      lead.id, 'ia',
      `Classificação: ${ia.classificacao} | Intenção: ${ia.intencao} | Resumo: ${ia.resumo}`
    )
  } catch (err) {
    // IA falhou: transfere para humano para não deixar o cliente sem resposta
    console.error('Erro no atendimento por IA:', err)
    await supabaseAdmin.from('leads').update({ modo_atendimento: 'humano' }).eq('id', lead.id)
    await registrarAtividade(lead.id, 'transferencia', 'IA indisponível — lead passado para atendimento humano')
  }
}
