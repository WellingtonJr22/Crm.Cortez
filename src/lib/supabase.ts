import { createClient } from '@supabase/supabase-js'

// Front-end usa SOMENTE a chave anônima (pública) e SOMENTE para autenticação.
// Todo acesso a dados passa pelas Netlify Functions (/api/*).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
)
