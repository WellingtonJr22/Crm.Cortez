import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from '../lib/supabase'
import { json, corpo, segmentos, tratarErro, ApiError } from '../lib/http'
import { exigirUsuario, exigirAcessoLead } from '../lib/auth'
import { registrarAtividade } from '../lib/atividades'
import { enviarTexto } from '../lib/whatsapp'

// GET  /api/whatsapp/conversas      -> leads com mensagens (última mensagem de cada)
// GET  /api/whatsapp?lead_id=x      -> mensagens do lead
// POST /api/whatsapp                -> enviar texto { lead_id, texto } (API oficial da Meta)
export const handler: Handler = async (event) => {
  try {
    const perfil = await exigirUsuario(event)
    const seg = segmentos(event)

    // ---------- LISTA DE CONVERSAS ----------
    if (event.httpMethod === 'GET' && seg[0] === 'conversas') {
      let leadsQuery = supabaseAdmin
        .from('leads')
        .select('id, nome, whatsapp, modo_atendimento, atendente_id')
        .not('whatsapp', 'is', null)
      if (perfil.role !== 'admin') leadsQuery = leadsQuery.eq('atendente_id', perfil.id)
      const { data: leads, error } = await leadsQuery
      if (error) throw new ApiError(500, error.message)

      const ids = (leads ?? []).map((l) => l.id)
      if (ids.length === 0) return json(200, [])

      const { data: msgs } = await supabaseAdmin
        .from('mensagens_whatsapp')
        .select('lead_id, conteudo, direcao, created_at')
        .in('lead_id', ids)
        .order('created_at', { ascending: false })
        .limit(2000)

      const conversas = (leads ?? [])
        .map((l) => {
          const ultima = (msgs ?? []).find((m) => m.lead_id === l.id)
          return ultima ? { ...l, ultima_mensagem: ultima } : null
        })
        .filter(Boolean)
        .sort((a: any, b: any) =>
          b.ultima_mensagem.created_at.localeCompare(a.ultima_mensagem.created_at)
        )
      return json(200, conversas)
    }

    // ---------- MENSAGENS DE UM LEAD ----------
    if (event.httpMethod === 'GET') {
      const leadId = event.queryStringParameters?.lead_id
      if (!leadId) throw new ApiError(400, 'lead_id é obrigatório')
      await exigirAcessoLead(perfil, leadId)
      const { data, error } = await supabaseAdmin
        .from('mensagens_whatsapp')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })
      if (error) throw new ApiError(500, error.message)
      return json(200, data)
    }

    // ---------- ENVIAR MENSAGEM ----------
    if (event.httpMethod === 'POST') {
      const b = corpo<{ lead_id: string; texto: string }>(event)
      if (!b.lead_id || !b.texto) throw new ApiError(400, 'lead_id e texto são obrigatórios')
      const lead = await exigirAcessoLead(perfil, b.lead_id)
      if (!lead.whatsapp) throw new ApiError(400, 'Este lead não tem número de WhatsApp')

      // Envio real pela API oficial da Meta (falha com mensagem clara se não configurada)
      const waMessageId = await enviarTexto(lead.whatsapp, b.texto)

      // Atendente respondeu: conversa passa a ser humana
      if (lead.modo_atendimento === 'ia') {
        await supabaseAdmin.from('leads')
          .update({ modo_atendimento: 'humano' }).eq('id', lead.id)
      }

      const { data, error } = await supabaseAdmin
        .from('mensagens_whatsapp')
        .insert({
          lead_id: lead.id,
          direcao: 'enviada',
          conteudo: b.texto,
          wa_message_id: waMessageId ?? null,
          enviada_por: perfil.id,
          origem: 'humano',
        })
        .select().single()
      if (error) throw new ApiError(500, error.message)
      await registrarAtividade(lead.id, 'mensagem_enviada', `WhatsApp: ${b.texto}`.slice(0, 500), perfil.id)
      return json(201, data)
    }

    return json(404, { erro: 'Rota não encontrada' })
  } catch (err) {
    return tratarErro(err)
  }
}
