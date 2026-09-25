# Central de Publicações (Marketing)

Publicação e sincronização do estoque no site próprio, portais e redes, com
confirmação de cada canal. Menu **Marketing › Publicações / Calendário / Canais conectados**.

## Fluxo

1. **Fotos** — no painel de fotos do veículo (Estoque) → botão **Preparar publicação**;
   fotos do estúdio (extensão) chegam sozinhas como revisão pendente.
2. **Nova publicação** — veículos → fotos (capa, ordem, **Aprovar fotos**) → conteúdo
   (título, descrição, condições, preço) → canais/contas → revisão (prévia, pendências
   com "como resolver", conferência das imagens) → **Publicar agora** ou **Agendar**.
3. O envio segue sozinho na fila do servidor. "Publicado" só aparece quando o canal
   confirma (consulta ou evento). Acompanhe em Publicações (resumo "3 publicados, 1 pendente").
4. **Venda**: negociação aberta → anúncios pausados (canal sem pausa: retira e
   republica se a venda cair, ou só avisa — configurável). Negociação **finalizada** →
   agendamentos cancelados, anúncios retirados e **arquivados como Vendido**.
   Venda cancelada → reativa o que a venda pausou.
5. **Publicação automática** após aprovação das fotos: só com ativação expressa
   (Canais conectados › Contatos e regras), registrando quem ligou e quando.

## Arquitetura

| Parte | Onde |
| --- | --- |
| Catálogo de canais (fontes, capacidades, estados) | `src/lib/publications/channels.ts` |
| Situações, transições, resumo | `states.ts` |
| Conteúdo por canal (sem inventar dados), contatos | `content-core.ts`, `settings.ts` |
| Pendências por canal | `validate-core.ts` |
| Serviço (transação intenção+tarefa, idempotência, venda) | `service.ts` |
| Fila/worker (SKIP LOCKED, trava com prazo, reconsulta) | `worker.ts` |
| Reconciliação (venda×anúncio, conferência 12 h, conteúdo) | `reconcile.ts` |
| Conectores | `connectors/*.ts` (site, webmotors, olx, mercadolivre, chavesnamao, meta) |
| Imagens assinadas / variantes / SSRF | `media-token.ts`, `media.ts`, `safe-fetch.ts` |
| Webhooks (dedup, fora de ordem) | `webhooks.ts` |
| Proteção de feed (nunca vazio por erro) | `feed-guard-core.ts` (aplicado ao feed do Catálogo Meta) |
| OAuth (state assinado) | `oauth.ts` |

Tabelas (migração `20260925150000_publication_center`): `publication_connections`,
`publications`, `publication_jobs`, `publication_events`, `publication_revisions`,
`publication_drafts`, `publication_mappings`, `publication_webhook_events`.
Configuração por empresa em `system_settings` (`t:<loja>:publications:v1`).

Permissões (Cadastros › módulos): `marketing.publications` (ver),
`.prepare`, `.approve`, `.publish`, `.connections`.

## Configuração e execução

Variáveis (Vercel/`.env`):

| Variável | Uso |
| --- | --- |
| `MASTER_ENCRYPTION_KEY` | já existente — cifra credenciais das lojas (64 hex) |
| `CRON_SECRET` | já existente — protege `/api/internal/publications/run` |
| `NEXTAUTH_URL` | base dos links de foto e do retorno OAuth |
| `PUBLICATIONS_MEDIA_SECRET` (opcional) | assina links de foto (padrão: `NEXTAUTH_SECRET`) |
| `ML_CLIENT_ID` / `ML_CLIENT_SECRET` | app do Mercado Livre (DevCenter) |
| `OLX_CLIENT_ID` / `OLX_CLIENT_SECRET` | app registrado com suporteintegrador@olxbr.com |
| `META_APP_ID` / `META_APP_SECRET` / `META_GRAPH_VERSION` | app Meta (Página + Instagram) |

URLs a cadastrar nos apps dos canais:
- Retorno OAuth: `https://www.appautodrive.online/api/publications/oauth/{mercado-livre|olx|meta}/callback`
- Notificações Mercado Livre (tópico `items`): `https://www.appautodrive.online/api/webhook/publications/mercado-livre`

Fila: cron da Vercel (`vercel.json`) a cada minuto + `?reconcile=1` a cada 15 min;
também processa logo após cada pedido (`after()`). Em VM/local:
`npm run publications:worker` (ou `--once`).

Banco: a migração **não** roda no build. Aplicar antes do deploy:
`DATABASE_URL=<neon> DIRECT_URL=<neon> npx prisma migrate deploy`
(já aplicada no banco local 5433). Reversão: `REVERTER.md`.

## Testes

- `npx vitest run src/lib/publications` — núcleo (41) + contrato dos conectores (26, **simulação**).
- Banco local (13 cenários): `PUBLICATIONS_DB_TEST=1 DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_dev npx vitest run src/lib/publications/flows.db.test.ts`
  (recusa rodar fora de `localhost:5433`; cria e apaga duas lojas de teste).

Mock/simulação não comprova integração externa. Ver a matriz em `CANAIS.md`.
