import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from '../lib/supabase'
import { json, tratarErro, ApiError } from '../lib/http'
import { exigirUsuario } from '../lib/auth'

// GET /api/dashboard
// Filtros (query string): de, ate (YYYY-MM-DD), atendente_id (só admin),
// status_venda, etapa_id, origem.
// Todos os números são calculados a partir dos leads reais do banco.
// Atendente recebe SOMENTE os dados dos leads dele (forçado no servidor).
export const handler: Handler = async (event) => {
  try {
    const perfil = await exigirUsuario(event)
    const q = event.queryStringParameters || {}

    let query = supabaseAdmin
      .from('leads')
      .select('id, etapa_id, atendente_id, origem, status_venda, valor_estimado, valor_fechado, data_fechamento, created_at')
      .limit(5000) // MVP: para volumes maiores, migrar agregações para SQL/RPC

    if (perfil.role !== 'admin') query = query.eq('atendente_id', perfil.id)
    else if (q.atendente_id) query = query.eq('atendente_id', q.atendente_id)
    if (q.status_venda) query = query.eq('status_venda', q.status_venda)
    if (q.etapa_id) query = query.eq('etapa_id', q.etapa_id)
    if (q.origem) query = query.eq('origem', q.origem)

    const { data: leads, error } = await query
    if (error) throw new ApiError(500, error.message)

    const de = q.de ? new Date(q.de + 'T00:00:00') : null
    const ate = q.ate ? new Date(q.ate + 'T23:59:59') : null
    const noPeriodoCriacao = (l: any) => {
      const d = new Date(l.created_at)
      return (!de || d >= de) && (!ate || d <= ate)
    }
    const noPeriodoFechamento = (l: any) => {
      if (!l.data_fechamento) return false
      const d = new Date(l.data_fechamento + 'T12:00:00')
      return (!de || d >= de) && (!ate || d <= ate)
    }

    const filtrados = (leads ?? []).filter(noPeriodoCriacao)
    const vendidos = (leads ?? []).filter((l) => l.status_venda === 'vendido')
    const vendidosPeriodo = vendidos.filter(noPeriodoFechamento)

    const agora = new Date()
    const mesAtual = vendidos.filter((l) => {
      if (!l.data_fechamento) return false
      const d = new Date(l.data_fechamento + 'T12:00:00')
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear()
    })

    const soma = (arr: any[]) => arr.reduce((s, l) => s + Number(l.valor_fechado ?? 0), 0)

    // Leads por etapa
    const { data: etapas } = await supabaseAdmin.from('etapas').select('id, nome').order('ordem')
    const porEtapa = (etapas ?? []).map((e) => ({
      etapa_id: e.id,
      nome: e.nome,
      quantidade: filtrados.filter((l) => l.etapa_id === e.id).length,
    }))

    const resultado: Record<string, unknown> = {
      total_leads: filtrados.length,
      total_clientes: filtrados.filter((l) => l.status_venda === 'vendido').length,
      leads_em_atendimento: filtrados.filter((l) => l.status_venda === 'em_negociacao').length,
      vendas_fechadas: vendidosPeriodo.length || (de || ate ? 0 : vendidos.length),
      vendas_perdidas: filtrados.filter((l) => l.status_venda === 'perdido').length,
      valor_total_vendido: soma(vendidos),
      valor_vendido_mes_atual: soma(mesAtual),
      valor_vendido_periodo: de || ate ? soma(vendidosPeriodo) : soma(vendidos),
      leads_por_etapa: porEtapa,
    }

    // Visão por atendente: somente para admin
    if (perfil.role === 'admin') {
      const { data: perfis } = await supabaseAdmin
        .from('perfis').select('id, nome').eq('status', 'aprovado')
      resultado.por_atendente = (perfis ?? []).map((p) => {
        const doAtendente = filtrados.filter((l) => l.atendente_id === p.id)
        const vendidosAt = vendidos.filter((l) => l.atendente_id === p.id)
        return {
          atendente_id: p.id,
          nome: p.nome,
          leads: doAtendente.length,
          vendas: vendidosAt.length,
          valor_vendido: soma(vendidosAt),
        }
      })
    }

    return json(200, resultado)
  } catch (err) {
    return tratarErro(err)
  }
}
