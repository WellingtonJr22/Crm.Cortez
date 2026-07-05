import type { HandlerEvent } from '@netlify/functions'
import { supabaseAdmin } from './supabase'
import { ApiError } from './http'

export interface Perfil {
  id: string
  nome: string
  email: string
  role: 'admin' | 'atendente'
  status: 'pendente' | 'aprovado' | 'inativo'
}

// Valida o JWT do Supabase e carrega o perfil (qualquer status).
export async function obterPerfil(event: HandlerEvent): Promise<Perfil> {
  const auth = event.headers.authorization || event.headers.Authorization
  if (!auth || !auth.startsWith('Bearer ')) throw new ApiError(401, 'Não autenticado')

  const token = auth.slice('Bearer '.length)
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) throw new ApiError(401, 'Sessão inválida ou expirada')

  const { data: perfil } = await supabaseAdmin
    .from('perfis')
    .select('id, nome, email, role, status')
    .eq('id', data.user.id)
    .single()
  if (!perfil) throw new ApiError(401, 'Perfil não encontrado')
  return perfil as Perfil
}

// Usuário aprovado (admin ou atendente).
export async function exigirUsuario(event: HandlerEvent): Promise<Perfil> {
  const perfil = await obterPerfil(event)
  if (perfil.status !== 'aprovado') {
    throw new ApiError(403, 'Usuário aguardando aprovação de um administrador')
  }
  return perfil
}

export async function exigirAdmin(event: HandlerEvent): Promise<Perfil> {
  const perfil = await exigirUsuario(event)
  if (perfil.role !== 'admin') throw new ApiError(403, 'Acesso restrito a administradores')
  return perfil
}

// Regra central de acesso a lead: admin vê tudo; atendente só o que é dele.
// Vale para QUALQUER endpoint que receba um lead_id — inclusive URL digitada.
export async function exigirAcessoLead(perfil: Perfil, leadId: string) {
  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()
  if (error || !lead) throw new ApiError(404, 'Lead não encontrado')
  if (perfil.role !== 'admin' && lead.atendente_id !== perfil.id) {
    throw new ApiError(403, 'Você não tem acesso a este lead')
  }
  return lead
}
