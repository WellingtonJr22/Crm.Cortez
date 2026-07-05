import { ApiError } from './http'

// Integração EXCLUSIVA com a API oficial do WhatsApp (Meta Cloud API).
// Nada aqui é simulado: sem token/phone number id reais, os envios falham
// com um erro claro pedindo a configuração.
const GRAPH_URL = 'https://graph.facebook.com/v21.0'

export function configuracaoWhatsApp() {
  const token = process.env.META_ACCESS_TOKEN
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) {
    throw new ApiError(
      503,
      'Integração WhatsApp não configurada. Defina META_ACCESS_TOKEN e META_PHONE_NUMBER_ID ' +
        'nas variáveis de ambiente do Netlify (dados reais do app na Meta Developers).'
    )
  }
  return { token, phoneNumberId }
}

export function whatsappConfigurado(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID)
}

async function chamarGraph(payload: Record<string, unknown>) {
  const { token, phoneNumberId } = configuracaoWhatsApp()
  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  })
  const body = (await res.json().catch(() => ({}))) as any
  if (!res.ok) {
    const detalhe = body?.error?.message || `HTTP ${res.status}`
    throw new ApiError(502, `Falha ao enviar pela API da Meta: ${detalhe}`)
  }
  return body?.messages?.[0]?.id as string | undefined
}

// Mensagem de texto livre — a Meta só entrega dentro da janela de 24h
// após a última mensagem do cliente. Fora da janela, use template aprovado.
export function enviarTexto(para: string, texto: string) {
  return chamarGraph({
    to: para,
    type: 'text',
    text: { body: texto },
  })
}

// Template aprovado na Meta (obrigatório para mensagens ativas / fora da janela de 24h).
export function enviarTemplate(para: string, nomeTemplate: string, idioma = 'pt_BR') {
  return chamarGraph({
    to: para,
    type: 'template',
    template: { name: nomeTemplate, language: { code: idioma } },
  })
}

// Normaliza número: só dígitos (a Meta envia "from" já com DDI, sem "+").
export function normalizarNumero(numero: string): string {
  return (numero || '').replace(/\D/g, '')
}
