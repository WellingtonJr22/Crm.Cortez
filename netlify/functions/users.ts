import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from '../lib/supabase'
import { json, corpo, segmentos, tratarErro, ApiError } from '../lib/http'
import { obterPerfil, exigirAdmin } from '../lib/auth'

const MAX_ADMINS = 3

// GET  /api/users/me           -> perfil do usuário logado (qualquer status)
// GET  /api/users?status=x     -> lista usuários (admin)
// PUT  /api/users/:id          -> aprovar / mudar role / inativar (admin)
export const handler: Handler = async (event) => {
  try {
    const seg = segmentos(event)

    if (event.httpMethod === 'GET' && seg[0] === 'me') {
      const perfil = await obterPerfil(event)
      return json(200, perfil)
    }

    if (event.httpMethod === 'GET') {
      await exigirAdmin(event)
      const status = event.queryStringParameters?.status
      let query = supabaseAdmin
        .from('perfis')
        .select('id, nome, email, role, status, created_at')
        .order('created_at', { ascending: false })
      if (status) query = query.eq('status', status)
      const { data, error } = await query
      if (error) throw new ApiError(500, error.message)
      return json(200, data)
    }

    if (event.httpMethod === 'PUT' && seg[0]) {
      const admin = await exigirAdmin(event)
      const alvoId = seg[0]
      const { status, role } = corpo<{ status?: string; role?: string }>(event)

      if (status && !['pendente', 'aprovado', 'inativo'].includes(status))
        throw new ApiError(400, 'Status inválido')
      if (role && !['admin', 'atendente'].includes(role))
        throw new ApiError(400, 'Role inválida')
      if (alvoId === admin.id && (status === 'inativo' || role === 'atendente'))
        throw new ApiError(400, 'Você não pode rebaixar ou inativar a si mesmo')

      const { data: alvo } = await supabaseAdmin
        .from('perfis').select('id, role, status').eq('id', alvoId).single()
      if (!alvo) throw new ApiError(404, 'Usuário não encontrado')

      // Limite de 3 administradores ativos
      const novaRole = role ?? alvo.role
      const novoStatus = status ?? alvo.status
      if (novaRole === 'admin' && novoStatus === 'aprovado') {
        const { count } = await supabaseAdmin
          .from('perfis')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'admin')
          .eq('status', 'aprovado')
          .neq('id', alvoId)
        if ((count ?? 0) >= MAX_ADMINS)
          throw new ApiError(400, `O sistema permite no máximo ${MAX_ADMINS} administradores`)
      }

      const { data, error } = await supabaseAdmin
        .from('perfis')
        .update({ ...(status && { status }), ...(role && { role }) })
        .eq('id', alvoId)
        .select()
        .single()
      if (error) throw new ApiError(500, error.message)
      return json(200, data)
    }

    return json(404, { erro: 'Rota não encontrada' })
  } catch (err) {
    return tratarErro(err)
  }
}
