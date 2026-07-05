import type { HandlerEvent, HandlerResponse } from '@netlify/functions'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function json(status: number, body: unknown): HandlerResponse {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// Extrai os segmentos de URL depois do nome da function.
// Ex.: /api/leads/123/mover -> ['123', 'mover']
export function segmentos(event: HandlerEvent): string[] {
  const path = event.path
    .replace(/^\/\.netlify\/functions\//, '')
    .replace(/^\/?api\//, '')
  return path.split('/').filter(Boolean).slice(1)
}

export function corpo<T = Record<string, unknown>>(event: HandlerEvent): T {
  try {
    return JSON.parse(event.body || '{}') as T
  } catch {
    throw new ApiError(400, 'Corpo da requisição não é um JSON válido')
  }
}

export function tratarErro(err: unknown): HandlerResponse {
  if (err instanceof ApiError) return json(err.status, { erro: err.message })
  console.error(err)
  return json(500, { erro: 'Erro interno do servidor' })
}
