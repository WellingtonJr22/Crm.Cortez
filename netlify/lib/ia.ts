import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from './supabase'
import { ApiError } from './http'

export interface ConfigIA {
  ativa: boolean
  responder_automaticamente: boolean
  prompt_sistema: string | null
  mensagem_transferencia: string | null
  modelo: string
}

export async function obterConfigIA(): Promise<ConfigIA> {
  const { data } = await supabaseAdmin.from('automacao_ia').select('*').eq('id', 1).single()
  return (data as ConfigIA) ?? {
    ativa: false,
    responder_automaticamente: false,
    prompt_sistema: null,
    mensagem_transferencia: null,
    modelo: 'claude-opus-4-8',
  }
}

export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

function cliente(): Anthropic {
  if (!iaConfigurada()) {
    throw new ApiError(
      503,
      'IA não configurada. Defina ANTHROPIC_API_KEY nas variáveis de ambiente do Netlify.'
    )
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

interface MensagemHistorico {
  direcao: 'recebida' | 'enviada'
  conteudo: string | null
}

function montarConversa(mensagens: MensagemHistorico[]): Anthropic.MessageParam[] {
  // 'recebida' = cliente (user); 'enviada' = empresa (assistant)
  const conversa: Anthropic.MessageParam[] = []
  for (const m of mensagens) {
    if (!m.conteudo) continue
    conversa.push({
      role: m.direcao === 'recebida' ? 'user' : 'assistant',
      content: m.conteudo,
    })
  }
  // A API exige começar com 'user'
  while (conversa.length && conversa[0].role !== 'user') conversa.shift()
  return conversa
}

export interface RespostaIA {
  resposta: string
  transferir_para_humano: boolean
  motivo_transferencia: string
  classificacao: string
  intencao: string
  resumo: string
}

const SCHEMA_RESPOSTA = {
  type: 'object',
  properties: {
    resposta: {
      type: 'string',
      description: 'Resposta curta e educada para enviar ao cliente pelo WhatsApp',
    },
    transferir_para_humano: {
      type: 'boolean',
      description:
        'true se o cliente pediu um humano, se você não sabe responder, ou se o assunto exige atendente',
    },
    motivo_transferencia: { type: 'string' },
    classificacao: {
      type: 'string',
      enum: ['quente', 'morno', 'frio'],
      description: 'Classificação do lead pelo interesse demonstrado',
    },
    intencao: { type: 'string', description: 'Intenção do cliente em poucas palavras' },
    resumo: { type: 'string', description: 'Resumo de 1 a 2 frases da conversa até aqui' },
  },
  required: [
    'resposta',
    'transferir_para_humano',
    'motivo_transferencia',
    'classificacao',
    'intencao',
    'resumo',
  ],
  additionalProperties: false,
} as const

// Primeiro atendimento automático: responde, classifica, identifica intenção
// e decide se transfere para humano. Estrutura simples e expansível.
export async function atenderComIA(
  config: ConfigIA,
  nomeLead: string,
  mensagens: MensagemHistorico[]
): Promise<RespostaIA> {
  const client = cliente()
  const system =
    (config.prompt_sistema || 'Você é um atendente virtual educado e objetivo de uma empresa.') +
    '\n\nRegras fixas:' +
    '\n- Responda em português do Brasil, em tom adequado para WhatsApp (curto).' +
    '\n- Se o cliente pedir para falar com uma pessoa, marque transferir_para_humano = true.' +
    '\n- Se você não tiver certeza da resposta, marque transferir_para_humano = true.' +
    `\n- O nome do cliente é: ${nomeLead}.`

  const response = await client.messages.create({
    model: config.modelo || 'claude-opus-4-8',
    max_tokens: 1024,
    system,
    messages: montarConversa(mensagens),
    output_config: { format: { type: 'json_schema', schema: SCHEMA_RESPOSTA } },
  })

  const texto = response.content.find((b) => b.type === 'text')
  if (!texto || texto.type !== 'text') throw new ApiError(502, 'IA não retornou resposta')
  return JSON.parse(texto.text) as RespostaIA
}

// Sugestão de resposta para o atendente humano (não envia nada sozinha).
export async function sugerirResposta(
  config: ConfigIA,
  nomeLead: string,
  mensagens: MensagemHistorico[]
): Promise<string> {
  const client = cliente()
  const response = await client.messages.create({
    model: config.modelo || 'claude-opus-4-8',
    max_tokens: 512,
    system:
      (config.prompt_sistema || 'Você ajuda atendentes de uma empresa a responder clientes.') +
      `\n\nEscreva UMA sugestão de resposta para o atendente enviar ao cliente ${nomeLead} ` +
      'pelo WhatsApp. Responda apenas com o texto da mensagem, sem explicações.',
    messages: montarConversa(mensagens),
  })
  const texto = response.content.find((b) => b.type === 'text')
  if (!texto || texto.type !== 'text') throw new ApiError(502, 'IA não retornou sugestão')
  return texto.text.trim()
}
