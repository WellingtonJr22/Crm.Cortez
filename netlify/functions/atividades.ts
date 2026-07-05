import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from '../lib/supabase'
import { json, corpo, tratarErro, ApiError } from '../lib/http'
import { exigirUsuario, exigirAcessoLead } from '../lib/auth'

const TIPOS_VALIDOS = [
  'ligacao',
  'mensagem_enviada',
  'reuniao',
  'retorno_agendado',
  'observacao',
]

// GET  /api/atividades?lead_id=x  -> histórico do lead
// POST /api/atividades            -> registrar atividade manual
export const handler: Handler = async (event) => {
  try {
    const perfil = await exigirUsuario(event)

    if (event.httpMethod === 'GET') {
      const leadId = event.queryStringParameters?.lead_id
      if (!leadId) throw new ApiError(400, 'lead_id é obrigatório')
      await exigirAcessoLead(perfil, leadId)

      const { data, error } = await supabaseAdmin
        .from('atividades')
        .select('*, usuario:perfis(id, nome)')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
      if (error) throw new ApiError(500, error.message)
      return json(200, data)
    }

    if (event.httpMethod === 'POST') {
      const b = corpo<{ lead_id: string; tipo: string; descricao?: string }>(event)
      if (!b.lead_id || !b.tipo) throw new ApiError(400, 'lead_id e tipo são obrigatórios')
      if (!TIPOS_VALIDOS.includes(b.tipo))
        throw new ApiError(400, `Tipo inválido. Use: ${TIPOS_VALIDOS.join(', ')}`)
      await exigirAcessoLead(perfil, b.lead_id)

      const { data, error } = await supabaseAdmin
        .from('atividades')
        .insert({
          lead_id: b.lead_id,
          user_id: perfil.id,
          tipo: b.tipo,
          descricao: b.descricao ?? null,
        })
        .select()
        .single()
      if (error) throw new ApiError(500, error.message)
      return json(201, data)
    }

    return json(404, { erro: 'Rota não encontrada' })
  } catch (err) {
    return tratarErro(err)
  }
}
