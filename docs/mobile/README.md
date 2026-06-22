# AutoDrive — Mobile / PWA / Capacitor (diagnóstico e plano)

## Diagnóstico da stack

- **Backend/Frontend acoplados:** Next.js 16 (App Router, build `--webpack`), TypeScript, Prisma 6 + PostgreSQL (Neon), NextAuth v4, Tailwind.
- **Consequência:** o app mobile **não** pode ser um export estático — depende de API/SSR/NextAuth/Prisma. A abordagem é **PWA instalável** + **Capacitor** apontando para a **URL HTTPS** do AutoDrive.

## Estratégia PWA + Capacitor

1. **PWA:** `src/app/manifest.ts` + `public/icons/autodrive-icon.svg` tornam o app instalável e com identidade.
2. **Identificação do cliente:** `src/lib/mobile/client.ts` lê/sanea os headers `x-autodrive-*`.
3. **Bootstrap:** `GET /api/mobile/bootstrap` devolve o contexto inicial autenticado (sem segredos).
4. **Capacitor Android:** wrapper nativo que abre a URL HTTPS (homologação/produção). iOS depois.

## Checklist de telas MVP (cliente do backend)

- [ ] Login (NextAuth) e sessão persistente.
- [ ] Início (`/inicio`).
- [ ] Fila de Atendimento / "Vendedor da vez" (`/vendedor-da-vez/minha-fila`).
- [ ] Negociações (lista/visualização).
- [ ] Estoque (consulta).
- [ ] Perfil.

> As telas reaproveitam o app web existente (via wrapper). Não há reimplementação de regra de negócio no app.

## Checklist de APIs

- [x] `GET /api/mobile/bootstrap` — contexto inicial (auth, módulos, entrypoints, security).
- [ ] Reuso das APIs já existentes (negociações, estoque, fila) com sessão autenticada.
- [ ] (Futuro) push/notificações nativas.

## Permissões por perfil

- O bootstrap calcula `modules` a partir de `canAccessModule(role, …)` **e** da habilitação por loja (`TenantModule`). MASTER vê tudo do papel; tenant respeita o que o MASTER liberou.
- O app deve renderizar entrypoints apenas dos módulos retornados.

## Riscos

- **Sem export estático:** o app precisa de conectividade com o backend HTTPS.
- **Segredos:** nunca embutir tokens/keys no app; tudo via backend.
- **Variáveis de homologação:** smoke autenticado real depende de `DATABASE_URL`/`NEXTAUTH_*` configuradas no ambiente.
- **Capacitor/Android Studio:** geração do `android/` exige toolchain Android local (JDK/SDK) para abrir/rodar.

## Próximos passos

1. Instalar Capacitor e gerar `android/` (Android MVP).
2. Ajustar `capacitor.config.ts` com a URL HTTPS de homologação real.
3. Abrir no Android Studio e testar login real + `/api/mobile/bootstrap` autenticado.
4. Avaliar recursos nativos (push) conforme necessidade.
5. iOS em etapa futura.
