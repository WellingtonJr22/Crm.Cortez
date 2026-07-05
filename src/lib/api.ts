import { supabase } from './supabase'

// Wrapper de chamadas ao back-end: anexa o token da sessão do Supabase.
export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const res = await fetch(`/api/${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as any).erro || `Erro ${res.status}`)
  return body as T
}
