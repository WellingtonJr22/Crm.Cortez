import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from '../lib/supabase'
import { json, corpo, segmentos, tratarErro, ApiError } from '../lib/http'
import { exigirUsuario, exigirAdmin, exigirAcessoLead } from '../lib/auth'
import { registrarAtividade } from '../lib/atividades'
import { normalizarNumero } from '../lib/whatsapp'

// GET    /api/leads                  -> lista (atendente vê só os dele)
// POST   /api/leads                  -> criar
// GET    /api/leads/:id              -> detalhe
// PUT    /api/leads/:id              -> editar
// DELETE /api/leads/:id              -> excluir (admin)
// POST   /api/leads/:id/mover        -> mudar etapa do Kanban
// POST   /api/leads/:id/atribuir     -> trocar atendente (admin)
// POST   /api/leads/:id/venda        -> vendido / perdido / reabrir
export const handler: Handler = async (event) => {
  try {
    const perfil = await exigirUsuario(event)
    const seg = segmentos(event)
    const leadId = seg[0]
    const acao = seg[1]

    // ---------- LISTAR ----------
    if (event.httpMethod === 'GET' && !leadId) {
      const q = event.queryStringParameters || {}
      let query = supabaseAdmin
        .from('leads')
        .select('*, etapa:etapas(id, nome), atendente:perfis(id, nome)')
        .order('created_at', { ascending: false })
        .limit(1000)
      if (perfil.role !== 'admin') query = query.eq('atendente_id', perfil.id)
      else if (q.atendente_id) query = query.eq('atendente_id', q.atendente_id)
      if (q.etapa_id) query = query.eq('etapa_id', q.etapa_id)
      if (q.status_venda) query = query.eq('status_venda', q.status_venda)
      if (q.origem) query = query.eq('origem', q.origem)
      if (q.busca) query = query.or(`nome.ilike.%${q.busca}%,email.ilike.%${q.busca}%,whatsapp.ilike.%${q.busca}%`)
      const { data, error } = await query
      if (error) throw new ApiError(500, error.message)
      return json(200, data)
    }

    // ---------- CRIAR ----------
    if (event.httpMethod === 'POST' && !leadId) {
      const b = corpo<any>(event)
      if (!b.nome) throw new ApiError(400, 'Nome é obrigatório')

      // Atendente só cria lead para si mesmo; admin escolhe o responsável.
      const atendenteId =
        perfil.role === 'admin' ? b.atendente_id ?? perfil.id : perfil.id

      let etapaId = b.etapa_id
      if (!etapaId) {
        const { data: primeira } = await supabaseAdmin
          .from('etapas').select('id').order('ordem').limit(1).single()
        etapaId = primeira?.id
      }

      const { data, error } = await supabaseAdmin
        .from('leads')
        .insert({
          nome: b.nome,
          whatsapp: b.whatsapp ? normalizarNumero(b.whatsapp) : null,
          email: b.email ?? null,
          etapa_id: etapaId,
          atendente_id: atendenteId,
          origem: b.origem ?? null,
          observacoes: b.observacoes ?? null,
          valor_estimado: b.valor_estimado ?? null,
        })
        .select()
        .single()
      if (error) throw new ApiError(500, error.message)
      await registrarAtividade(data.id, 'observacao', 'Lead cadastrado', perfil.id)
      return json(201, data)
    }

    if (!leadId) return json(404, { erro: 'Rota não encontrada' })

    // A partir daqui todas as rotas exigem acesso ao lead
    const lead = await exigirAcessoLead(perfil, leadId)

    // ---------- DETALHE ----------
    if (event.httpMethod === 'GET' && !acao) {
      const { data } = await supabaseAdmin
        .from('leads')
        .select('*, etapa:etapas(id, nome), atendente:perfis(id, nome)')
        .eq('id', leadId)
        .single()
      return json(200, data)
    }

    // ---------- EDITAR ----------
    if (event.httpMethod === 'PUT' && !acao) {
      const b = corpo<any>(event)
      const campos: Record<string, unknown> = {}
      for (const c of ['nome', 'email', 'origem', 'observacoes', 'valor_estimado', 'modo_atendimento']) {
        if (c in b) campos[c] = b[c]
      }
      if ('whatsapp' in b) campos.whatsapp = b.whatsapp ? normalizarNumero(b.whatsapp) : null
      // Troca de responsável só pelo admin (também disponível em /atribuir)
      if ('atendente_id' in b && perfil.role === 'admin') campos.atendente_id = b.atendente_id
      campos.updated_at = new Date().toISOString()

      const { data, error } = await supabaseAdmin
        .from('leads').update(campos).eq('id', leadId).select().single()
      if (error) throw new ApiError(500, error.message)
      return json(200, data)
    }

    // ---------- EXCLUIR (admin) ----------
    if (event.httpMethod === 'DELETE' && !acao) {
      await exigirAdmin(event)
      const { error } = await supabaseAdmin.from('leads').delete().eq('id', leadId)
      if (error) throw new ApiError(500, error.message)
      return json(200, { ok: true })
    }

    // ---------- MOVER NO KANBAN ----------
    if (event.httpMethod === 'POST' && acao === 'mover') {
      const { etapa_id } = corpo<{ etapa_id: string }>(event)
      if (!etapa_id) throw new ApiError(400, 'etapa_id é obrigatório')

      const { data: etapas } = await supabaseAdmin.from('etapas').select('id, nome')
      const de = etapas?.find((e) => e.id === lead.etapa_id)?.nome ?? '—'
      const para = etapas?.find((e) => e.id === etapa_id)?.nome
      if (!para) throw new ApiError(400, 'Etapa não existe')

      const { data, error } = await supabaseAdmin
        .from('leads')
        .update({ etapa_id, updated_at: new Date().toISOString() })
        .eq('id', leadId).select().single()
      if (error) throw new ApiError(500, error.message)
      await registrarAtividade(leadId, 'mudanca_etapa', `Etapa alterada: ${de} → ${para}`, perfil.id)
      return json(200, data)
    }

    // ---------- ATRIBUIR ATENDENTE (admin) ----------
    if (event.httpMethod === 'POST' && acao === 'atribuir') {
      await exigirAdmin(event)
      const { atendente_id } = corpo<{ atendente_id: string }>(event)
      const { data: novo } = await supabaseAdmin
        .from('perfis').select('nome, status').eq('id', atendente_id).single()
      if (!novo || novo.status !== 'aprovado') throw new ApiError(400, 'Atendente inválido')

      const { data, error } = await supabaseAdmin
        .from('leads')
        .update({ atendente_id, updated_at: new Date().toISOString() })
        .eq('id', leadId).select().single()
      if (error) throw new ApiError(500, error.message)
      await registrarAtividade(leadId, 'transferencia', `Lead transferido para ${novo.nome}`, perfil.id)
      return json(200, data)
    }

    // ---------- VENDA ----------
    if (event.httpMethod === 'POST' && acao === 'venda') {
      const b = corpo<{ status_venda: string; valor_fechado?: number; data_fechamento?: string }>(event)
      if (!['em_negociacao', 'vendido', 'perdido'].includes(b.status_venda))
        throw new ApiError(400, 'status_venda inválido')

      const campos: Record<string, unknown> = {
        status_venda: b.status_venda,
        updated_at: new Date().toISOString(),
      }
      if (b.status_venda === 'vendido') {
        campos.valor_fechado = b.valor_fechado ?? lead.valor_estimado ?? 0
        campos.data_fechamento = b.data_fechamento ?? new Date().toISOString().slice(0, 10)
      } else if (b.status_venda === 'perdido') {
        campos.valor_fechado = null
        campos.data_fechamento = b.data_fechamento ?? new Date().toISOString().slice(0, 10)
      } else {
        campos.valor_fechado = null
        campos.data_fechamento = null
      }

      const { data, error } = await supabaseAdmin
        .from('leads').update(campos).eq('id', leadId).select().single()
      if (error) throw new ApiError(500, error.message)

      const tipo =
        b.status_venda === 'vendido' ? 'venda_fechada'
        : b.status_venda === 'perdido' ? 'venda_perdida'
        : 'mudanca_status'
      const desc =
        b.status_venda === 'vendido'
          ? `Venda fechada no valor de R$ ${Number(campos.valor_fechado).toFixed(2)}`
          : b.status_venda === 'perdido'
            ? 'Venda marcada como perdida'
            : 'Venda reaberta (em negociação)'
      await registrarAtividade(leadId, tipo, desc, perfil.id)
      return json(200, data)
    }

    return json(404, { erro: 'Rota não encontrada' })
  } catch (err) {
    return tratarErro(err)
  }
}
