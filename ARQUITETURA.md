# CRM Cortez — Arquitetura

Documento de referência do projeto. Direto ao ponto, na ordem pedida.

---

## 1. Análise da melhor stack para Netlify

| Camada | Escolha | Por quê |
|---|---|---|
| Front-end | **React + Vite** | O Netlify serve o build estático do Vite direto do CDN. Next.js também funciona no Netlify, mas adiciona runtime próprio (SSR, adapters) sem trazer benefício para um CRM interno atrás de login — o Vite é mais simples de manter. |
| Back-end | **Netlify Functions (Node.js + TypeScript)** | Roda no mesmo deploy do front, sem servidor para administrar. Cada arquivo em `netlify/functions/` vira um endpoint. |
| Banco | **Supabase (PostgreSQL)** | Postgres gerenciado + autenticação pronta. |
| Autenticação | **Supabase Auth** (e-mail/senha) | Segura, pronta e sem senha para gerenciar no nosso código. A aprovação de usuários é controlada pela tabela `perfis` (status `pendente` → `aprovado`). |
| IA | **API da Anthropic (Claude)** | Uma chamada HTTP a partir das Functions. Exige chave real (`ANTHROPIC_API_KEY`). |

**Sobre Laravel:** não foi usado. Laravel é PHP e precisa de um servidor de aplicação (VPS, Forge, Cloud Run etc.) — o Netlify não executa PHP. Só faria sentido se você mudasse a hospedagem do back-end para outro provedor.

**Limite relevante do Netlify:** cada Function tem ~10s de execução. Isso afeta apenas o disparo em massa (ver seção 6.3).

---

## 2. Arquitetura geral

```
Navegador (React + Vite, servido pelo CDN do Netlify)
   │
   ├── Login/Cadastro ──────────────► Supabase Auth (direto, com a chave pública)
   │
   └── Todos os dados ── /api/* ───► Netlify Functions (TypeScript)
                                        │  valida o JWT + permissões EM CÓDIGO
                                        │  usa a service_role key (nunca exposta)
                                        ▼
                                     Supabase PostgreSQL (RLS ligado, sem
                                     políticas públicas: acesso direto bloqueado)

Meta (WhatsApp Cloud API) ──webhook──► /api/whatsapp-webhook ──► banco (+ IA opcional)
Netlify Functions ──────── envio ────► graph.facebook.com (API oficial da Meta)
Netlify Functions ──────── IA ───────► API da Anthropic (Claude)
```

Princípios:
- O front **nunca** acessa as tabelas do Supabase diretamente. Ele só usa o Supabase para autenticação. Dados passam sempre pelo back-end.
- **Toda permissão é validada no servidor** (ver seção 6.1). O front só esconde botões — isso é UX, não segurança.
- Segredos (service_role, token da Meta, chave de IA) existem **apenas** como variáveis de ambiente no Netlify.

---

## 3. Estrutura de pastas

```
crm-cortez/
├── ARQUITETURA.md            ← este documento
├── README.md                 ← como rodar, publicar e configurar
├── netlify.toml               ← build, redirects /api/* → functions
├── package.json               ← um único pacote (front + functions)
├── vite.config.ts / tsconfig.json / index.html
├── .env.example               ← todas as variáveis necessárias
│
├── db/
│   └── schema.sql              ← BANCO: tabelas, trigger, seeds, RLS
│
├── netlify/                    ← BACK-END
│   ├── lib/                    ← código compartilhado entre endpoints
│   │   ├── supabase.ts         ← cliente service_role
│   │   ├── auth.ts             ← exigirUsuario / exigirAdmin / exigirAcessoLead
│   │   ├── http.ts             ← respostas JSON, rotas, erros
│   │   ├── atividades.ts       ← registrarAtividade (histórico)
│   │   ├── whatsapp.ts         ← envio pela API oficial da Meta
│   │   └── ia.ts               ← chamadas à API da Anthropic
│   └── functions/              ← 1 arquivo = 1 endpoint /api/<nome>
│       ├── users.ts            ├── leads.ts          ├── atividades.ts
│       ├── etapas.ts           ├── dashboard.ts      ├── whatsapp-webhook.ts
│       ├── whatsapp.ts         ├── disparos.ts       ├── configuracoes.ts
│       └── ia.ts
│
└── src/                        ← FRONT-END (React + Vite)
    ├── main.tsx / App.tsx / styles.css
    ├── lib/                    ← supabase (só auth), api (fetch), auth (contexto)
    ├── components/Layout.tsx   ← menu lateral com controle por perfil
    └── pages/
        ├── Login.tsx           ├── Cadastro.tsx      ├── Dashboard.tsx
        ├── Kanban.tsx          ├── Leads.tsx         ├── LeadDetalhe.tsx
        ├── Chat.tsx            ├── Disparos.tsx      ├── IA.tsx
        └── Configuracoes.tsx   (abas: usuários, funil, WhatsApp, empresa)
```

---

## 4. Modelo do banco de dados

Arquivo completo: `db/schema.sql`. Oito tabelas, o mínimo para atender tudo:

| Tabela | O que guarda |
|---|---|
| `perfis` | Usuários (nome, e-mail, `role` admin/atendente, `status` pendente/aprovado/inativo). Criada automaticamente por trigger quando alguém se cadastra no Supabase Auth. |
| `etapas` | Colunas do Kanban (nome, ordem). Editáveis pelo admin. Já vem com as 6 sugeridas. |
| `leads` | Lead completo, **incluindo os campos de venda** (valor estimado, valor fechado, status da venda, data de fechamento) e `modo_atendimento` (humano/ia). |
| `atividades` | **Atividades e histórico são a mesma tabela** — toda atividade é um registro de histórico (data/hora, usuário, tipo, descrição, lead). Movimentações de Kanban, transferências e vendas são gravadas aqui automaticamente pelo back-end. |
| `mensagens_whatsapp` | Cada mensagem recebida/enviada (conteúdo, direção, origem: cliente/humano/ia/disparo, id da Meta). |
| `configuracoes` | Chave/valor para dados NÃO sensíveis (nome da empresa, lista de templates). Tokens ficam em variáveis de ambiente. |
| `automacao_ia` | Linha única: automação ativa?, responde automaticamente?, prompt, mensagem de transferência, modelo. |
| `disparos` | Registro de cada disparo em lote (quem, mensagem/template, totais). |

**Relacionamentos:**
- `perfis.id` → `auth.users.id` (1:1)
- `leads.atendente_id` → `perfis.id` (o responsável)
- `leads.etapa_id` → `etapas.id` (posição no funil)
- `atividades.lead_id` → `leads.id`; `atividades.user_id` → `perfis.id` (null = sistema/IA)
- `mensagens_whatsapp.lead_id` → `leads.id`
- `disparos.user_id` → `perfis.id` (as mensagens do disparo também entram em `mensagens_whatsapp` e `atividades`, por lead)

**Decisões de simplicidade (de propósito):**
- Venda = campos no lead, não tabela separada.
- Histórico = tabela `atividades`, não duas tabelas.
- RLS ligado em tudo **sem políticas públicas**: ninguém acessa o banco direto do navegador; só o back-end (service_role) acessa, validando permissões em código.

---

## 5. Lista de endpoints

Todos em `/api/...`, todos exigem `Authorization: Bearer <token do Supabase>` (exceto o webhook). Permissão validada **no servidor**.

| Método e rota | Quem | O que faz |
|---|---|---|
| — (Supabase Auth) | público | Login e cadastro são feitos direto no Supabase Auth pelo front (`signInWithPassword` / `signUp`). O cadastro cria o perfil `pendente` via trigger. |
| `GET /api/users/me` | logado (qualquer status) | Perfil próprio (para o front saber se está aprovado). |
| `GET /api/users?status=` | admin | Lista usuários (ex.: pendentes de aprovação). |
| `PUT /api/users/:id` | admin | Aprovar, recusar, inativar, promover/rebaixar. Impõe o limite de **3 admins**. |
| `GET/POST /api/leads` | aprovado | Lista (atendente: só os dele) / cria lead. |
| `GET/PUT/DELETE /api/leads/:id` | aprovado (DELETE: admin) | Detalhe / edição / exclusão. |
| `POST /api/leads/:id/mover` | aprovado c/ acesso | Move no Kanban + grava no histórico. |
| `POST /api/leads/:id/atribuir` | admin | Troca o atendente responsável + histórico. |
| `POST /api/leads/:id/venda` | aprovado c/ acesso | Marca vendido / perdido / reaberto (valor + data de fechamento) + histórico. |
| `GET /api/atividades?lead_id=` | aprovado c/ acesso | Histórico do lead. |
| `POST /api/atividades` | aprovado c/ acesso | Registra atividade manual (ligação, reunião, retorno, observação…). |
| `GET/POST/PUT/DELETE /api/etapas` | GET: aprovado; resto: admin | CRUD das colunas do Kanban. |
| `GET /api/dashboard` | aprovado | Métricas reais do banco. Atendente recebe SÓ os dados dele (forçado no servidor). Filtros: `de`, `ate`, `atendente_id` (admin), `status_venda`, `etapa_id`, `origem`. |
| `GET/POST /api/whatsapp-webhook` | Meta (sem auth de usuário) | GET: verificação `hub.challenge` com `META_VERIFY_TOKEN`. POST: recebe mensagens da API oficial. |
| `GET /api/whatsapp/conversas` | aprovado | Conversas do usuário (admin: todas). |
| `GET /api/whatsapp?lead_id=` | aprovado c/ acesso | Mensagens do lead. |
| `POST /api/whatsapp` | aprovado c/ acesso | Envia texto pela API oficial da Meta + grava mensagem e histórico. |
| `GET/POST /api/disparos` | aprovado | Histórico de disparos / disparo em lote (máx. 50 no MVP). |
| `GET /api/configuracoes` / `PUT` | admin | Dados da empresa, templates e status das integrações (sem expor segredos). |
| `GET/PUT /api/ia` | admin | Configuração da automação de IA. |
| `POST /api/ia/sugerir` | aprovado c/ acesso | Sugestão de resposta da IA para o atendente. |

---

## 6. Fluxos principais

### 6.1 Permissões
1. O front envia o JWT do Supabase em toda chamada.
2. `netlify/lib/auth.ts` valida o token, carrega o perfil e aplica:
   - `exigirUsuario` → precisa estar `aprovado` (pendente/inativo recebem 403);
   - `exigirAdmin` → precisa ser admin;
   - `exigirAcessoLead` → admin vê tudo; **atendente só lead onde `atendente_id = ele`**. Vale para qualquer rota com lead — digitar a URL de um lead alheio devolve 403.
3. Aprovação: cadastro → perfil `pendente` → admin aprova em Configurações → usuário entra. Máximo de 3 admins aprovado é imposto no endpoint `PUT /api/users/:id`.

### 6.2 WhatsApp (somente API oficial da Meta — nada simulado)
**Recebimento:** Meta → `POST /api/whatsapp-webhook` → identifica o lead pelo número (cria automaticamente se não existir, com origem `whatsapp`) → salva em `mensagens_whatsapp` → registra no histórico → se a automação de IA estiver ativa e o lead em modo `ia`, a IA responde (ver 6.4).
**Envio:** atendente escreve no Chat → `POST /api/whatsapp` → `graph.facebook.com/v21.0/{phone_number_id}/messages` com o token real → salva mensagem + histórico. Se as variáveis da Meta não estiverem configuradas, o endpoint retorna erro claro — **não há fallback falso**.
**Regra da Meta respeitada:** texto livre só dentro da janela de 24h; mensagem ativa exige template aprovado (a tela de disparo deixa isso explícito).
**Atualização da tela:** polling simples (8s). Evolução futura: Supabase Realtime.

### 6.3 Disparo de mensagens
**MVP:** seleciona/filtra leads → texto livre ou template aprovado → envio sequencial pela API oficial, máx. **50 leads por disparo** (limite de ~10s das Functions) → cada envio vira mensagem + atividade no lead + linha em `disparos`.
**Versão futura (quando precisar de volume):** Netlify **Background Function** (sufixo `-background`, até 15 min) ou fila externa (ex.: Supabase cron + tabela de fila) processando em lotes. A estrutura atual já grava tudo por lead, então só muda o executor.

### 6.4 IA (simples e expansível)
- Configuração em `automacao_ia` (tela "IA e Automações"): ativa?, responder automaticamente?, prompt, mensagem de transferência, modelo.
- **Atendimento inicial:** mensagem chega → lead em modo `ia` → a IA (API da Anthropic) recebe o histórico e devolve JSON estruturado: `resposta`, `transferir_para_humano`, `motivo`, `classificacao` (quente/morno/frio), `intencao`, `resumo`.
- **Transferência para humano** (registrada no histórico) quando: o cliente pede um humano; a IA declara que não sabe responder; a IA/integração falha (fail-safe); ou um atendente responde manualmente pelo chat (o modo vira `humano`).
- **Sugestão para o atendente:** botão "Sugestão IA" no chat chama `POST /api/ia/sugerir` — a IA só sugere, quem envia é o humano.
- Resumo + classificação são gravados como atividade do lead.
- Sem `ANTHROPIC_API_KEY` real, nada disso roda — os endpoints avisam explicitamente.

### 6.5 Dashboard
- `GET /api/dashboard` consulta os **leads reais** e calcula: total de leads, clientes (vendidos), leads em atendimento, vendas fechadas/perdidas, valor total vendido, valor no mês atual, valor no período filtrado, leads por etapa e (só admin) leads/vendas/valor por atendente.
- Vendido soma no dashboard; perdido não soma — regra aplicada no cálculo.
- Filtros: período (de/até, cobre mês e ano), atendente (só admin), status da venda, etapa, origem.
- Atendente: o filtro `atendente_id = ele` é **forçado no servidor**; ele nunca vê números dos outros.
- Nenhum valor fixo ou fictício: sem dados no banco, o dashboard mostra zeros.

---

## 7. Telas do front-end

| Tela | Rota | Conteúdo |
|---|---|---|
| Login | `/login` | E-mail/senha (Supabase Auth). |
| Cadastro | `/cadastro` | Cria conta → aviso de "pendente de aprovação". |
| Aguardando aprovação | (automática) | Exibida para usuário logado não aprovado. |
| Dashboard | `/` | Cards + tabelas + filtros (visão por perfil). |
| Kanban | `/kanban` | Colunas = etapas; arrastar e soltar move o lead (histórico automático). |
| Leads | `/leads` | Lista, busca, filtros, criação, exclusão (admin). |
| Detalhe do lead | `/leads/:id` | Dados, etapa, responsável (admin), venda, registro de atividades e histórico completo. |
| Chat WhatsApp | `/chat` | Conversas + mensagens + envio + botão "Sugestão IA". |
| Disparos | `/disparos` | Seleção/filtro de leads, texto ou template, histórico de disparos. |
| IA e Automações | `/ia` (admin) | Configuração da automação e status da chave. |
| Configurações | `/configuracoes` (admin) | Abas: **Usuários e permissões** (pendentes, admins, atendentes), **Etapas do funil**, **WhatsApp (Meta)** (status da integração + templates), **Empresa**. |

Itens 8 a 11 da entrega (código, rodar localmente, publicar, dados reais): ver **README.md**.
