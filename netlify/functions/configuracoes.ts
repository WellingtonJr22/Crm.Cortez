import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from '../lib/supabase'
import { json, corpo, tratarErro, ApiError } from '../lib/http'
import { exigirAdmin } from '../lib/auth'
import { whatsappConfigurado } from '../lib/whatsapp'
import { iaConfigurada } from '../lib/ia'

// Configurações gerais (somente admin).
// Segredos (tokens da Meta, chave da IA, service_role) ficam SOMENTE em
// variáveis de ambiente do Netlify — nunca no banco, nunca no front.
// Aqui o banco guarda apenas dados não sensíveis (nome da empresa etc.).
const CHAVES_PERMITIDAS = [
  'empresa_nome',
  'empresa_telefone',
  'empresa_email',
  'whatsapp_templates', // lista de nomes de templates aprovados na Meta
]

// GET /api/configuracoes -> valores + status das integrações (sem segredos)
// PUT /api/configuracoes -> { valores: { chave: valor, ... } }
export const handler: Handler = async (event) => {
  try {
    await exigirAdmin(event)

    if (event.httpMethod === 'GET') {
      const { data } = await supabaseAdmin.from('configuracoes').select('chave, valor')
      const valores: Record<string, unknown> = {}
      for (const row of data ?? []) valores[row.chave] = row.valor

      return json(200, {
        valores,
        integracoes: {
          whatsapp_configurado: whatsappConfigurado(),
          ia_configurada: iaConfigurada(),
          webhook_verify_token_definido: Boolean(process.env.META_VERIFY_TOKEN),
        },
      })
    }

    if (event.httpMethod === 'PUT') {
      const b = corpo<{ valores: Record<string, unknown> }>(event)
      if (!b.valores) throw new ApiError(400, 'Informe "valores"')
      for (const chave of Object.keys(b.valores)) {
        if (!CHAVES_PERMITIDAS.includes(chave))
          throw new ApiError(400, `Chave não permitida: ${chave}`)
        const { error } = await supabaseAdmin
          .from('configuracoes')
          .upsert({ chave, valor: b.valores[chave], updated_at: new Date().toISOString() })
        if (error) throw new ApiError(500, error.message)
      }
      return json(200, { ok: true })
    }

    return json(404, { erro: 'Rota não encontrada' })
  } catch (err) {
    return tratarErro(err)
  }
}
