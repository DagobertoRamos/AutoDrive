# AutoDrive — Android MVP (Capacitor) — Setup 2026-06-22

## Estado inicial

- O worktree estava na branch `feature/mobile-capacitor-android-mvp` apontando para `90ac777`, **150 commits atrás** de `origin/main` e **sem `README_ROBOTS.md`**.
- Os arquivos mobile (`manifest.ts`, `api/mobile/bootstrap`, `lib/mobile/client.ts`, `capacitor.config.example.json`, `icons/autodrive-icon.svg`) **não existiam em nenhuma branch** — confirmado por `Test-Path` (False) e por inspeção do Git.

## Por que os commits do Codex não estavam no repositório

Os commits/branches mobile citados anteriormente (`8a1d038`, `d802f7d`, `056a12f`, `7b582d3`, branch `feature/mobile-capacitor-android-mvp` remota, `mobile/capacitor/android`) **não existiam** no Git local nem no remoto `origin` (`git show`/`git ls-remote` retornaram unknown revision). O bloqueio 403 relatado era do ambiente remoto do Codex, não deste computador. Portanto a fundação mobile foi **reconstruída do zero** localmente.

## Decisão de base

Com confirmação do usuário, a reconstrução foi feita sobre **`origin/main`** (código atual completo, com `README_ROBOTS.md` e todas as features), em nova branch **`feat/mobile-pwa-android`** — e não sobre a branch 150 commits atrás.

## Arquivos recriados (fundação PWA/mobile)

- `src/app/manifest.ts` — manifest PWA (`/inicio`, standalone, tema #16A34A, ícone local).
- `public/icons/autodrive-icon.svg` — ícone local (sem asset externo/copyright).
- `src/lib/mobile/client.ts` — headers `x-autodrive-*`, saneamento (CR/LF/tab, ≤120 chars), plataforma android|ios|web|unknown, `isMobileClient`.
- `src/lib/mobile/client.test.ts` — 11 testes.
- `src/app/api/mobile/bootstrap/route.ts` — `GET` autenticado: user/client/modules/entrypoints/security, **sem segredos**; auditoria `MOBILE_BOOTSTRAP` best-effort quando vem do app nativo.
- `src/app/api/mobile/bootstrap/route.test.ts` — 6 testes (401 sem auth, payload, módulos, entrypoints, security, auditoria, ausência de segredos).
- `mobile/README.md`, `mobile/capacitor.config.example.json`, `docs/mobile/README.md`.

## Capacitor / Android

- Instalado: `@capacitor/core@8.4.1`, `@capacitor/android@8.4.1`, `@capacitor/cli@8.4.1` (devDep).
- `capacitor.config.ts` na raiz: `appId: br.com.autodrive.app`, `appName: AutoDrive`, `server.url` via `CAP_SERVER_URL` (placeholder HTTPS seguro), `cleartext: false`, `webDir: public`.
- `npx cap add android` → `android/` criado. `npx cap sync android` → OK.
- **iOS NÃO criado** (fora do escopo).
- O app abre a **URL HTTPS** do AutoDrive (Next.js/API/NextAuth/Prisma) — **não** é export estático.

## Comandos executados e resultados

- `npx prisma generate` → OK
- `npx tsc --noEmit` → 0 erros
- `npm run lint` → 0 erros
- `npm test` → **194/194** (24 arquivos; +17 mobile)
- `npm run build` → OK (rota `/manifest.webmanifest` gerada)
- `npx cap add android` / `npx cap sync android` → OK

## Variáveis de homologação

`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` apareceram **absent** no shell de validação. Nenhum `.env` fictício foi criado e nenhum segredo foi commitado. O **smoke autenticado real** (`/api/mobile/bootstrap` + login) depende dessas variáveis de homologação configuradas no ambiente.

## Segurança

- Nenhum segredo exposto/commitado. `capacitor.config.json` gerado contém apenas appId/appName/URL placeholder.
- O endpoint de bootstrap retorna apenas dados não sensíveis.
- O `assets/public` copiado pelo Capacitor (21MB) é ignorado pelo `.gitignore` do Android (não vai ao commit).

## Riscos pendentes

- Abrir/rodar no Android Studio exige toolchain Android local (JDK + Android SDK).
- `server.url` é placeholder; ajustar para a URL HTTPS de homologação real (via `CAP_SERVER_URL` ou editando o config).
- Smoke autenticado depende de variáveis de homologação.

## Próximo passo seguro

1. Configurar `CAP_SERVER_URL` com a URL HTTPS de homologação.
2. `npx cap open android` e rodar no emulador/dispositivo.
3. Login real + `GET /api/mobile/bootstrap` autenticado quando as variáveis de homologação estiverem ativas.
4. iOS em etapa futura.
