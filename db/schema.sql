-- ============================================================
-- CRM Cortez — Schema do banco (Supabase / PostgreSQL)
-- Execute este arquivo no SQL Editor do Supabase (uma única vez).
-- ============================================================

-- ------------------------------------------------------------
-- 1. PERFIS (espelho de auth.users com role e status)
--    Todo usuário nasce como 'pendente'; um admin aprova depois.
-- ------------------------------------------------------------
create table if not exists public.perfis (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null,
  email      text not null,
  role       text not null default 'atendente' check (role in ('admin', 'atendente')),
  status     text not null default 'pendente'  check (status in ('pendente', 'aprovado', 'inativo')),
  created_at timestamptz not null default now()
);

-- Cria o perfil automaticamente quando alguém se cadastra no Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', new.email),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 2. ETAPAS do funil (colunas do Kanban) — editáveis pelo admin
-- ------------------------------------------------------------
create table if not exists public.etapas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  ordem      int  not null default 0,
  created_at timestamptz not null default now()
);

insert into public.etapas (nome, ordem)
select * from (values
  ('Novo lead', 1),
  ('Em atendimento', 2),
  ('Proposta enviada', 3),
  ('Aguardando resposta', 4),
  ('Fechado', 5),
  ('Perdido', 6)
) as seed (nome, ordem)
where not exists (select 1 from public.etapas);

-- ------------------------------------------------------------
-- 3. LEADS — inclui os campos de venda (sem tabela separada,
--    para manter o modelo simples)
-- ------------------------------------------------------------
create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  whatsapp         text,                                   -- somente dígitos, com DDI (ex.: 5511999998888)
  email            text,
  etapa_id         uuid references public.etapas (id),
  atendente_id     uuid references public.perfis (id),
  origem           text,                                   -- ex.: whatsapp, site, indicação
  observacoes      text,
  valor_estimado   numeric(12,2),
  valor_fechado    numeric(12,2),
  status_venda     text not null default 'em_negociacao'
                   check (status_venda in ('em_negociacao', 'vendido', 'perdido')),
  data_fechamento  date,
  modo_atendimento text not null default 'humano'
                   check (modo_atendimento in ('humano', 'ia')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_leads_atendente on public.leads (atendente_id);
create index if not exists idx_leads_etapa     on public.leads (etapa_id);
create index if not exists idx_leads_whatsapp  on public.leads (whatsapp);

-- ------------------------------------------------------------
-- 4. ATIVIDADES = histórico do lead (uma tabela só, de propósito:
--    toda atividade É um registro de histórico)
-- ------------------------------------------------------------
create table if not exists public.atividades (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  user_id    uuid references public.perfis (id),          -- null = ação do sistema (webhook/IA)
  tipo       text not null,                               -- ligacao, mensagem_enviada, mensagem_recebida,
                                                          -- reuniao, retorno_agendado, observacao,
                                                          -- mudanca_status, mudanca_etapa, transferencia,
                                                          -- venda_fechada, venda_perdida, ia
  descricao  text,
  created_at timestamptz not null default now()
);

create index if not exists idx_atividades_lead on public.atividades (lead_id, created_at desc);

-- ------------------------------------------------------------
-- 5. MENSAGENS DO WHATSAPP (recebidas via webhook e enviadas
--    pela plataforma — API oficial da Meta)
-- ------------------------------------------------------------
create table if not exists public.mensagens_whatsapp (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads (id) on delete cascade,
  direcao       text not null check (direcao in ('recebida', 'enviada')),
  conteudo      text,
  tipo          text not null default 'texto',            -- texto | template
  wa_message_id text,                                     -- id da mensagem na API da Meta
  enviada_por   uuid references public.perfis (id),       -- quem enviou (null = webhook/IA/disparo)
  origem        text not null default 'humano'            -- humano | ia | disparo | cliente
                check (origem in ('humano', 'ia', 'disparo', 'cliente')),
  created_at    timestamptz not null default now()
);

create index if not exists idx_msgs_lead on public.mensagens_whatsapp (lead_id, created_at);

-- ------------------------------------------------------------
-- 6. CONFIGURAÇÕES gerais (chave/valor). Tokens e segredos NÃO
--    ficam aqui — ficam em variáveis de ambiente no Netlify.
-- ------------------------------------------------------------
create table if not exists public.configuracoes (
  chave      text primary key,
  valor      jsonb,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7. AUTOMAÇÃO DE IA (linha única de configuração)
-- ------------------------------------------------------------
create table if not exists public.automacao_ia (
  id                        int primary key default 1 check (id = 1),
  ativa                     boolean not null default false,
  responder_automaticamente boolean not null default false, -- IA responde a 1ª mensagem do WhatsApp
  prompt_sistema            text,
  mensagem_transferencia    text default 'Um de nossos atendentes vai continuar seu atendimento em instantes.',
  modelo                    text not null default 'claude-opus-4-8',
  updated_at                timestamptz not null default now()
);

insert into public.automacao_ia (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 8. DISPAROS de mensagens (registro de cada envio em lote)
-- ------------------------------------------------------------
create table if not exists public.disparos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.perfis (id),
  mensagem      text,
  template_nome text,
  total         int not null default 0,
  enviados      int not null default 0,
  falhas        int not null default 0,
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- SEGURANÇA: RLS ligado em tudo, SEM políticas para anon/authenticated.
-- O front-end nunca acessa as tabelas direto — todo acesso passa pelas
-- Netlify Functions, que usam a service_role key (ignora RLS) e validam
-- as permissões em código.
-- ------------------------------------------------------------
alter table public.perfis              enable row level security;
alter table public.etapas              enable row level security;
alter table public.leads               enable row level security;
alter table public.atividades          enable row level security;
alter table public.mensagens_whatsapp  enable row level security;
alter table public.configuracoes       enable row level security;
alter table public.automacao_ia        enable row level security;
alter table public.disparos            enable row level security;

-- ------------------------------------------------------------
-- PRIMEIRO ADMIN: depois de se cadastrar pela tela de cadastro,
-- rode (trocando o e-mail) para promover e aprovar:
--
-- update public.perfis
--    set role = 'admin', status = 'aprovado'
--  where email = 'seu-email@exemplo.com';
-- ------------------------------------------------------------
