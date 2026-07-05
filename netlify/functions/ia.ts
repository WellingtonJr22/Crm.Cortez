import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from '../lib/supabase'
import { json, corpo, segmentos, tratarErro, ApiError } from '../lib/http'
import { exigirUsuario, exigirAdmin, exigirAcessoLead } from '../lib/auth'
import { obterConfigIA, sugerirResposta, iaConfigurada } from '../lib/ia'

// GET  /api/ia            -> configuração da automação (admin)
// PUT  /api/ia            -> atualizar configuração (admin)
// POST /api/ia/sugerir    -> { lead_id } sugestão de resposta para o atendente
export const handler: Handler = async (event) => {
  try {
    const seg = segmentos(event)

    if (event.httpMethod === 'GET') {
      await exigirAdmin(event)
      const config = await obterConfigIA()
      return json(200, { ...config, ia_configurada: iaConfigurada() })
    }

    if (event.httpMethod === 'PUT') {
      await exigirAdmin(event)
      const b = corpo<any>(event)
      const campos: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const c of ['ativa', 'responder_automaticamente', 'prompt_sistema', 'mensagem_transferencia', 'modelo']) {
        if (c in b) campos[c] = b[c]
      }
      const { data, error } = await supabaseAdmin
        .from('automacao_ia').update(campos).eq('id', 1).select().single()
      if (error) throw new ApiError(500, error.message)
      return json(200, data)
    }

    if (event.httpMethod === 'POST' && seg[0] === 'sugerir') {
      const perfil = await exigirUsuario(event)
      const { lead_id } = corpo<{ lead_id: string }>(event)
      if (!lead_id) throw new ApiError(400, 'lead_id é obrigatório')
      const lead = await exigirAcessoLead(perfil, lead_id)

      const { data: historico } = await supabaseAdmin
        .from('mensagens_whatsapp')
        .select('direcao, conteudo')
        .eq('lead_id', lead_id)
        .order('created_at', { ascending: true })
        .limit(30)
      if (!historico || historico.length === 0)
        throw new ApiError(400, 'Este lead ainda não tem mensagens de WhatsApp')

      const config = await obterConfigIA()
      const sugestao = await sugerirResposta(config, lead.nome, historico)
      return json(200, { sugestao })
    }

    return json(404, { erro: 'Rota não encontrada' })
  } catch (err) {
    return tratarErro(err)
  }
}
