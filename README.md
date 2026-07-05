# CRM Cortez

CRM simples para Netlify: React + Vite (front), Netlify Functions em TypeScript (back),
Supabase/PostgreSQL (banco e autenticação), WhatsApp pela **API oficial da Meta** e
automações de IA pela API da Anthropic.

📐 A arquitetura completa (stack, banco, endpoints, fluxos) está em **[ARQUITETURA.md](./ARQUITETURA.md)**.

> ⚠️ **Nada aqui é simulado.** WhatsApp e IA só funcionam com credenciais reais
> (Meta Developers e Anthropic). Sem elas, o CRM funciona normalmente para leads,
> Kanban, atividades, vendas e dashboard — e as telas de chat/disparo/IA avisam
> claramente o que falta configurar.

---

## 1. Rodar localmente

Pré-requisitos: Node.js 18+, conta no [Supabase](https://supabase.com) (grátis) e a CLI do Netlify.

```bash
# 1. Instalar dependências
npm install
npm install -g netlify-cli

# 2. Criar o banco
#    - Crie um projeto no Supabase
#    - Abra o SQL Editor e execute TODO o arquivo db/schema.sql

# 3. Variáveis de ambiente
cp .env.example .env
#    Preencha ao menos: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
#    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
#    (Dashboard do Supabase > Settings > API)

# 4. Subir front + functions juntos (http://localhost:8888)
netlify dev
```

### Criar o primeiro administrador
1. Acesse a tela de **Cadastro** e crie sua conta (ela nasce como "pendente").
2. No SQL Editor do Supabase, rode:
   ```sql
   update public.perfis
      set role = 'admin', status = 'aprovado'
    where email = 'seu-email@exemplo.com';
   ```
3. Entre pelo **Login**. Os próximos usuários você aprova pela tela Configurações → Usuários.

> Dica: em Supabase → Authentication → Providers → Email, você pode desativar
> "Confirm email" durante o desenvolvimento para não depender de e-mail de confirmação.

---

## 2. Publicar no Netlify

1. Suba o repositório para o GitHub.
2. No Netlify: **Add new site → Import an existing project** e selecione o repositório.
   O `netlify.toml` já define build (`npm run build`), pasta `dist` e as functions.
3. Em **Site settings → Environment variables**, cadastre todas as variáveis do
   `.env.example` (as `VITE_*` também — elas são usadas no build do front).
4. Deploy. O site fica em `https://SEU-SITE.netlify.app` e os endpoints em
   `https://SEU-SITE.netlify.app/api/...`.

---

## 3. Dados reais que você precisa configurar

### Supabase (obrigatório)
| O quê | Onde obter | Vai em |
|---|---|---|
| URL do projeto | Settings → API | `VITE_SUPABASE_URL` e `SUPABASE_URL` |
| Chave anon (pública) | Settings → API | `VITE_SUPABASE_ANON_KEY` |
| Chave service_role (SECRETA) | Settings → API | `SUPABASE_SERVICE_ROLE_KEY` — só no Netlify, nunca no front |
| Schema | Executar `db/schema.sql` no SQL Editor | — |

### Meta Developers / WhatsApp (obrigatório para chat e disparos)
Pré-requisitos na Meta: app criado em [developers.facebook.com](https://developers.facebook.com)
com o produto **WhatsApp**, uma **WhatsApp Business Account (WABA)** real, um **número
de telefone** conectado e verificado, e um **token de acesso permanente** (via System User).

| O quê | Vai em |
|---|---|
| Token de acesso permanente | `META_ACCESS_TOKEN` |
| Phone Number ID do número | `META_PHONE_NUMBER_ID` |
| Token de verificação do webhook (você inventa o valor) | `META_VERIFY_TOKEN` |

Depois do deploy, cadastre o webhook no painel da Meta (WhatsApp → Configuration):
- **Callback URL:** `https://SEU-SITE.netlify.app/api/whatsapp-webhook`
- **Verify token:** o mesmo valor de `META_VERIFY_TOKEN`
- Assine o campo (subscribe) **messages**.

Regras da Meta que o sistema respeita (e não burla):
- Texto livre só é entregue dentro da **janela de 24h** após a última mensagem do cliente.
- Mensagem ativa (fora da janela) exige **template aprovado** no gerenciador do WhatsApp
  Business — cadastre os nomes dos templates em Configurações → WhatsApp.

### IA / Anthropic (opcional — atendimento automático e sugestões)
| O quê | Onde obter | Vai em |
|---|---|---|
| Chave da API | [platform.claude.com](https://platform.claude.com) | `ANTHROPIC_API_KEY` |

Sem a chave, o CRM funciona; apenas as funções de IA ficam desativadas (com aviso).
O modelo usado é configurável na tela **IA e Automações** (padrão: `claude-opus-4-8`;
é possível trocar por um modelo mais barato se preferir).

---

## 4. Estrutura do projeto (resumo)

```
db/schema.sql            → banco (tabelas, trigger de cadastro, seeds, RLS)
netlify/lib/             → código compartilhado do back-end (auth, whatsapp, ia…)
netlify/functions/       → endpoints /api/* (validação de permissão no servidor)
src/                     → front-end React (páginas, layout, contexto de auth)
```

Detalhes de cada camada: [ARQUITETURA.md](./ARQUITETURA.md).
