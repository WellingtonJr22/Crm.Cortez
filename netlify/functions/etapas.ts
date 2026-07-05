import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from '../lib/supabase'
import { json, corpo, segmentos, tratarErro, ApiError } from '../lib/http'
import { exigirUsuario, exigirAdmin } from '../lib/auth'

// GET    /api/etapas       -> lista (qualquer usuário aprovado)
// POST   /api/etapas       -> criar (admin)
// PUT    /api/etapas/:id   -> renomear / reordenar (admin)
// DELETE /api/etapas/:id   -> excluir se não houver leads nela (admin)
export const handler: Handler = async (event) => {
  try {
    const seg = segmentos(event)
    const etapaId = seg[0]

    if (event.httpMethod === 'GET') {
      await exigirUsuario(event)
      const { data, error } = await supabaseAdmin
        .from('etapas').select('*').order('ordem')
      if (error) throw new ApiError(500, error.message)
      return json(200, data)
    }

    if (event.httpMethod === 'POST') {
      await exigirAdmin(event)
      const b = corpo<{ nome: string; ordem?: number }>(event)
      if (!b.nome) throw new ApiError(400, 'Nome é obrigatório')
      const { data, error } = await supabaseAdmin
        .from('etapas')
        .insert({ nome: b.nome, ordem: b.ordem ?? 99 })
        .select().single()
      if (error) throw new ApiError(500, error.message)
      return json(201, data)
    }

    if (event.httpMethod === 'PUT' && etapaId) {
      await exigirAdmin(event)
      const b = corpo<{ nome?: string; ordem?: number }>(event)
      const { data, error } = await supabaseAdmin
        .from('etapas')
        .update({ ...(b.nome && { nome: b.nome }), ...(b.ordem != null && { ordem: b.ordem }) })
        .eq('id', etapaId)
        .select().single()
      if (error) throw new ApiError(500, error.message)
      return json(200, data)
    }

    if (event.httpMethod === 'DELETE' && etapaId) {
      await exigirAdmin(event)
      const { count } = await supabaseAdmin
        .from('leads').select('id', { count: 'exact', head: true }).eq('etapa_id', etapaId)
      if ((count ?? 0) > 0)
        throw new ApiError(400, 'Mova os leads desta etapa antes de excluí-la')
      const { error } = await supabaseAdmin.from('etapas').delete().eq('id', etapaId)
      if (error) throw new ApiError(500, error.message)
      return json(200, { ok: true })
    }

    return json(404, { erro: 'Rota não encontrada' })
  } catch (err) {
    return tratarErro(err)
  }
}
