# AutoDrive — Mobile

Estratégia mobile do AutoDrive (PWA + Capacitor). **Android primeiro, iOS depois.**

## Princípios

- O app mobile é uma **camada cliente** do backend AutoDrive (Next.js / API / NextAuth / Prisma). Ele **não** reimplementa regras de negócio.
- **Nunca** salvar API keys, tokens de integração ou segredos no app.
- **Nunca** chamar Gemini/OpenAI, bancos, gateways de pagamento ou qualquer integração externa **diretamente do app**. Toda integração passa pelo backend.
- Autenticação e sessão são responsabilidade do backend (NextAuth). O app apenas consome as APIs autenticadas.
- O app identifica-se via headers (`x-autodrive-device-id`, `x-autodrive-platform`, `x-autodrive-app-version`) — ver `src/lib/mobile/client.ts`.
- Bootstrap do app: `GET /api/mobile/bootstrap` (autenticado) devolve identidade, módulos liberados, entrypoints e flags de segurança — **sem segredos**.

## Por que Capacitor (e não export estático)

O AutoDrive usa Next.js com **backend/API/NextAuth/Prisma**. Um `next export` estático quebraria APIs, autenticação e Prisma. Por isso o app Capacitor abre a **URL HTTPS** do AutoDrive (homologação/produção), funcionando como wrapper nativo do PWA — com acesso a recursos nativos (notificações, etc.) quando necessário, sem perder o backend.

## Arquivos

- `mobile/capacitor.config.example.json` — exemplo seguro de configuração (copiar para `capacitor.config.ts` na raiz e ajustar `server.url`).
- `src/app/manifest.ts` — manifest PWA.
- `public/icons/autodrive-icon.svg` — ícone local.
- `src/lib/mobile/client.ts` — headers/identificação do cliente mobile.
- `src/app/api/mobile/bootstrap/route.ts` — endpoint de bootstrap.
- `docs/mobile/README.md` — diagnóstico, checklists e próximos passos.

## Roadmap curto

1. PWA instalável (manifest + ícone) ✅
2. Bootstrap mobile autenticado ✅
3. Capacitor Android (wrapper da URL HTTPS) — Android MVP.
4. Recursos nativos pontuais (push, câmera) conforme necessidade.
5. iOS depois.
