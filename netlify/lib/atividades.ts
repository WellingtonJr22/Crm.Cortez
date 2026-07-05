import { supabaseAdmin } from './supabase'

// Registra uma atividade no histórico do lead.
// user_id null = ação do sistema (webhook, IA, disparo).
export async function registrarAtividade(
  leadId: string,
  tipo: string,
  descricao: string,
  userId: string | null = null
) {
  await supabaseAdmin.from('atividades').insert({
    lead_id: leadId,
    user_id: userId,
    tipo,
    descricao,
  })
}
