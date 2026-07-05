import { createClient } from '@supabase/supabase-js'

// Cliente com a service_role key: ignora RLS. Só existe no back-end.
// As permissões são validadas em código (ver auth.ts) em TODOS os endpoints.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } }
)
