# Sistema de Informações EasyCar

Sistema profissional de gestão de pendências, comissões e notificações para a EasyCar Veículos.

## Stack Tecnológica

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes
- **Banco de dados:** PostgreSQL + Prisma ORM
- **Autenticação:** NextAuth.js v4
- **Estado:** Zustand + React Query
- **Integração:** Meta WhatsApp Cloud API, Google Sheets API
- **Notificações:** Polling + Toast tipo WhatsApp Web

---

## Pré-requisitos

- Node.js 18.17 ou superior — baixar em: https://nodejs.org
- PostgreSQL 14+ — ou usar o serviço gratuito do Supabase/Neon
- Conta na Meta (para WhatsApp API)
- Service Account do Google (para importar planilha)

---

## Instalação

### 1. Clone o repositório

```bash
git clone <url-do-repositorio>
cd sistema-easycar
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env` com os valores reais:

```env
# Banco de dados PostgreSQL
DATABASE_URL="postgresql://usuario:senha@localhost:5432/easycar_db"

# NextAuth (gere um secret com: openssl rand -base64 32)
NEXTAUTH_SECRET="seu_secret_aqui"
NEXTAUTH_URL="http://localhost:3000"

# Meta WhatsApp Cloud API
META_WHATSAPP_TOKEN="EAAxxxxxxxxxxxxxxx"
META_PHONE_NUMBER_ID="1234567890"
META_WEBHOOK_VERIFY_TOKEN="easycar_verify_2024"
META_API_VERSION="v19.0"

# Google Sheets (JSON da service account em uma linha)
GOOGLE_SHEETS_CREDENTIALS='{"type":"service_account","project_id":"..."}'
GOOGLE_SHEETS_ID="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"

# JWT
JWT_SECRET="seu_jwt_secret_aqui"
```

### 4. Configure o banco de dados

```bash
# Criar as tabelas
npm run prisma:migrate

# Ou se for a primeira vez em produção:
npx prisma migrate deploy

# Popular com dados iniciais (usuário master, configurações, templates)
npm run prisma:seed
```

### 5. Execute o projeto

```bash
# Desenvolvimento
npm run dev

# Produção
npm run build
npm start
```

Acesse: http://localhost:3000

---

## Primeiro Acesso

Após rodar o seed, faça login com:

```
E-mail: admin@easycar.com
Senha: Admin@123
```

**Troque a senha imediatamente após o primeiro acesso.**

---

## Módulos do Sistema

### Autenticação
- Login com e-mail/senha
- Recuperação de senha por e-mail
- Novo cadastro (fica pendente até aprovação)
- Ativação de cadastro
- Controle de sessão JWT
- Log de acessos

### Pendências
- **Vendedor:** visualiza e responde suas próprias pendências
- **Gerência:** tabela completa com filtros, ações e exportação
- Cores por prioridade (Crítica/Alta/Média/Baixa)
- Modal com histórico, respostas WhatsApp, e ações
- Polling automático a cada 30 segundos

### Comissões
- Extrato de vendas, compras, bônus, serviços, garantias, retornos
- Saldo total com toggle mostrar/ocultar
- Histórico por período

### Configurações
- **Sistema:** horários, WhatsApp, importação, pendências
- **Comissões:** faixas, serviços, garantias, retornos

### Cadastros
- Unidades/Lojas
- Vendedores
- Gerentes
- Serviços
- Garantias

### Notificações
- Balões tipo WhatsApp Web no canto inferior direito
- Central de notificações com histórico
- Badge de não lidas no sino
- Eventos: resposta WhatsApp, pendência resolvida, nova pendência, erro de envio

---

## Integração WhatsApp (Meta)

### Configurar o Webhook

1. No Facebook Developers, configure o webhook apontando para:
   ```
   https://seu-dominio.com/api/webhook/meta
   ```

2. Token de verificação: o valor de `META_WEBHOOK_VERIFY_TOKEN` no `.env`

3. Assine os eventos: `messages`, `message_status_updates`

### Enviar Template

```bash
POST /api/whatsapp/send-template
{
  "to": "5511999999999",
  "templateName": "entrega_pendente",
  "bodyParams": ["João Silva", "SIC2F20", "F12345"]
}
```

---

## Importação da Planilha Fonte

### Configurar Service Account Google

1. No Google Cloud Console, crie uma Service Account
2. Baixe a chave JSON
3. Compartilhe a planilha com o e-mail da service account
4. Cole o JSON (em uma linha) em `GOOGLE_SHEETS_CREDENTIALS`
5. Configure o ID da planilha em `GOOGLE_SHEETS_ID`

### Executar importação

```bash
POST /api/import/sheets/run
Authorization: Bearer <token>
```

Ou acesse **Configurações → Importação** no sistema.

---

## Estrutura do Projeto

```
src/
├── app/
│   ├── (auth)/              # Telas de autenticação (login, cadastro)
│   ├── (dashboard)/         # Telas internas (pendências, comissões, etc.)
│   └── api/                 # API Routes
│       ├── auth/            # Login, registro, recuperação de senha
│       ├── pendencies/      # CRUD de pendências + resolver/não-resolver
│       ├── notifications/   # Notificações internas
│       ├── units/           # Cadastro de unidades
│       ├── sellers/         # Cadastro de vendedores
│       ├── managers/        # Cadastro de gerentes
│       ├── services/        # Cadastro de serviços
│       ├── warranties/      # Cadastro de garantias
│       ├── settings/        # Configurações do sistema
│       ├── webhook/meta/    # Webhook da Meta WhatsApp
│       └── import/sheets/   # Importação da planilha
├── components/
│   ├── layout/              # Sidebar, Topbar
│   ├── notifications/       # Toast container, Central de notificações
│   └── pendencies/          # PendencyCard, PendencyModal, badges
├── lib/
│   ├── auth.ts              # Configuração NextAuth
│   ├── prisma.ts            # Prisma Client singleton
│   ├── utils.ts             # Utilitários (cn, formatMoney, formatDate...)
│   └── validators/          # Schemas Zod
├── services/
│   ├── meta-whatsapp.service.ts   # Envio via Meta API
│   └── sheets-import.service.ts   # Importação Google Sheets
├── store/
│   ├── auth.store.ts              # Estado de autenticação
│   └── notification.store.ts      # Estado de notificações e toasts
├── types/
│   └── index.ts             # Types TypeScript globais
└── hooks/
    ├── useNotifications.ts  # Polling de notificações
    └── usePermissions.ts    # Controle de permissões por role
prisma/
├── schema.prisma            # Schema do banco (22 models)
└── seed.ts                  # Dados iniciais (admin, configurações, templates)
```

---

## Perfis de Acesso

| Perfil | Pendências | Comissões | Config | Cadastros |
|--------|-----------|-----------|--------|-----------|
| MASTER | Total | Total | Total | Total |
| ADMIN | Total | Total | Total | Total |
| GERENTE | Equipe | Equipe | Parcial | Parcial |
| VENDEDOR | Próprias | Próprias | — | — |
| FINANCEIRO | — | Total | — | — |
| DOCUMENTACAO | Docs | — | — | — |

---

## Scripts Disponíveis

```bash
npm run dev              # Iniciar em desenvolvimento
npm run build            # Build de produção
npm start                # Iniciar produção
npm run lint             # Verificar erros de lint
npm run prisma:generate  # Gerar client Prisma
npm run prisma:migrate   # Rodar migrations
npm run prisma:studio    # Abrir Prisma Studio (admin BD)
npm run prisma:seed      # Popular banco com dados iniciais
```

---

## Solução de Problemas

**Node.js não encontrado:**
- Baixar em: https://nodejs.org/en/download
- Versão mínima: 18.17

**Erro de conexão com banco:**
- Verificar se PostgreSQL está rodando
- Verificar `DATABASE_URL` no `.env`
- Para teste local: `postgresql://postgres:postgres@localhost:5432/easycar_db`

**Prisma Client desatualizado:**
```bash
npm run prisma:generate
```

**Erro de autenticação NextAuth:**
- Verificar `NEXTAUTH_SECRET` e `NEXTAUTH_URL`
- Em desenvolvimento: `NEXTAUTH_URL=http://localhost:3000`

---

## Suporte e Evolução

O sistema foi construído com arquitetura modular para facilitar:
- Adição de novos provedores WhatsApp (Zenvia, Twilio, W-API)
- Novos módulos (relatórios, financeiro, dashboards)
- Integração com outros ERPs

Para dúvidas: configure um usuário MASTER e acesse **Configurações → Sistema**.
