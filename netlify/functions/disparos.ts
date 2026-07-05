import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from '../lib/supabase'
import { json, corpo, tratarErro, ApiError } from '../lib/http'
import { exigirUsuario } from '../lib/auth'
import { registrarAtividade } from '../lib/atividades'
import { enviarTexto, enviarTemplate } from '../lib/whatsapp'

// Disparo de mensagens pela API OFICIAL da Meta.
//
// LIMITES DO MVP (Netlify Functions têm tempo máximo de execução ~10s):
// - Máximo de 50 leads por disparo, envio sequencial.
// - Para volumes maiores: versão futura com Netlify Background Function
//   (sufixo -background, até 15 min) ou fila externa. Ver ARQUITETURA.md.
//
// REGRAS DA META (não burlamos):
// - Mensagem ativa (fora da janela de 24h) exige TEMPLATE APROVADO.
// - Texto livre só chega a quem falou com você nas últimas 24h.
const MAX_LEADS_POR_DISPARO = 50

// GET  /api/disparos  -> histórico de disparos
// POST /api/disparos  -> { lead_ids: [], mensagem? , template_nome? }
export const handler: Handler = async (event) => {
  try {
    const perfil = await exigirUsuario(event)

    if (event.httpMethod === 'GET') {
      let query = supabaseAdmin
        .from('disparos')
        .select('*, usuario:perfis(id, nome)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (perfil.role !== 'admin') query = query.eq('user_id', perfil.id)
      const { data, error } = await query
      if (error) throw new ApiError(500, error.message)
      return json(200, data)
    }

    if (event.httpMethod === 'POST') {
      const b = corpo<{ lead_ids: string[]; mensagem?: string; template_nome?: string }>(event)
      if (!Array.isArray(b.lead_ids) || b.lead_ids.length === 0)
        throw new ApiError(400, 'Selecione ao menos um lead')
      if (!b.mensagem && !b.template_nome)
        throw new ApiError(400, 'Informe a mensagem ou o nome de um template aprovado')
      if (b.lead_ids.length > MAX_LEADS_POR_DISPARO)
        throw new ApiError(400, `Máximo de ${MAX_LEADS_POR_DISPARO} leads por disparo no MVP`)

      // Carrega apenas os leads que o usuário PODE acessar
      let leadsQuery = supabaseAdmin
        .from('leads')
        .select('id, nome, whatsapp, atendente_id')
        .in('id', b.lead_ids)
        .not('whatsapp', 'is', null)
      if (perfil.role !== 'admin') leadsQuery = leadsQuery.eq('atendente_id', perfil.id)
      const { data: leads, error } = await leadsQuery
      if (error) throw new ApiError(500, error.message)
      if (!leads || leads.length === 0)
        throw new ApiError(400, 'Nenhum lead válido (com WhatsApp e com acesso permitido)')

      let enviados = 0
      let falhas = 0
      for (const lead of leads) {
        try {
          const waId = b.template_nome
            ? await enviarTemplate(lead.whatsapp!, b.template_nome)
            : await enviarTexto(lead.whatsapp!, b.mensagem!)
          await supabaseAdmin.from('mensagens_whatsapp').insert({
            lead_id: lead.id,
            direcao: 'enviada',
            conteudo: b.template_nome ? `[template: ${b.template_nome}]` : b.mensagem,
            tipo: b.template_nome ? 'template' : 'texto',
            wa_message_id: waId ?? null,
            enviada_por: perfil.id,
            origem: 'disparo',
          })
          await registrarAtividade(
            lead.id, 'mensagem_enviada',
            `Disparo: ${b.template_nome ? `template ${b.template_nome}` : b.mensagem}`.slice(0, 500),
            perfil.id
          )
          enviados++
        } catch (e) {
          console.error(`Falha no envio para o lead ${lead.id}:`, e)
          falhas++
        }
      }

      const { data: disparo } = await supabaseAdmin
        .from('disparos')
        .insert({
          user_id: perfil.id,
          mensagem: b.mensagem ?? null,
          template_nome: b.template_nome ?? null,
          total: leads.length,
          enviados,
          falhas,
        })
        .select().single()

      return json(201, disparo)
    }

    return json(404, { erro: 'Rota não encontrada' })
  } catch (err) {
    return tratarErro(err)
  }
}
