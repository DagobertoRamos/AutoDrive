# README_ROBOTS.md — Coordenação entre agentes (AutoDrive)

> Arquivo de coordenação para IAs (Claude, Codex, etc.) que trabalham neste
> repositório. **Leia este arquivo inteiro antes de qualquer alteração.**

## Protocolo obrigatório (toda IA)

1. Ler este arquivo e **todos os logs anteriores** antes de mexer em qualquer coisa.
2. Verificar se outro agente já trabalhou no mesmo fluxo (ver logs abaixo).
3. **Não apagar logs antigos.** Sempre acrescentar um novo no final.
4. **Não alterar arquivos/fluxos marcados como PENDENTE/PARCIAL** por outro agente sem autorização do usuário.
5. Preservar layout, componentes, telas e funcionalidades já prontas.
6. Alterar **somente o que foi pedido**; não refatorar arquivos inteiros sem necessidade.
7. Dividir fluxos grandes em etapas pequenas, com `tsc`/lint/build verdes a cada etapa.
8. Nunca mexer em `schema.prisma`, permissões, cálculo financeiro/comissão, estoque, negociação ou documentação fora do escopo do pedido.
9. Migrations só aditivas e seguras; nunca apagar dados.
10. Ao final, **registrar um novo log** (data, IA, branch, tarefa, arquivos, validações, observações).

## Contexto do projeto

- **AutoDrive** (antigo EasyCar) — SaaS multi-tenant para loja de veículos. Next.js 16 (App Router, `--webpack`), TypeScript, Prisma 6 + PostgreSQL (Neon), NextAuth v4, Zustand/React Query, Tailwind.
- **Raiz do app / worktree:** `D:\Sistema de avisos\Robo\.claude\worktrees\distracted-dhawan-fd8ce5`.
- **Branch canônica atual:** `main` (HEAD contém todo o trabalho abaixo). A branch `feat/autodrive-metas-ranking` é ancestral (histórica).
- **Login dev (MASTER):** `admin@autodrive.com.br` / `Admin@123`.
- **Convenções:** isolamento multi-tenant via `src/lib/auth-guards.ts` (`tenantWhere`, `assertTenantId`); permissões em `src/lib/permissions.ts`; cálculo sempre no service layer; Decimal para dinheiro. Comissão de retorno SEMPRE sobre o líquido; ILA/IOF SEMPRE sobre o bruto.
- **Lint:** `npm run lint` (ESLint 9 flat config). Código novo deve passar sem erros; legado tem dívida pré-existente (warnings + ~33 erros) — não mascarar regras de correção.

---

## LOGS

### LOG 0001 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** feat/autodrive-metas-ranking → mergeada em `main`.
- **Tarefa:** Módulo de Metas + Ranking, módulo de Retorno + Garantia, e correções de base.
- **Entregue (CONCLUÍDO):**
  - Higiene + identidade AutoDrive; ESLint 9 flat config habilitado (antes inexistente).
  - **Metas:** schema (Goal/GoalLevel/GoalProgress + enums), service (`src/lib/goals/*`), API `/api/goals/*`, cards no dashboard, tela de gestão `/metas`, menu+permissões (`goals`/`goals.manage`).
  - **Ranking:** schema (RankingRule/RankingScore), service (`src/lib/ranking/service.ts`), API `/api/ranking/*`, dashboard de desempenho `/desempenho`, menu (`ranking`).
  - **Retorno + Garantia:** perfis novos `GERENTE_ADMINISTRATIVO`/`FINANCEIRO`; `Warranty` estendido (cheio/reduzido/prêmio + comissões fixas); model `WarrantySale`; campos de retorno no `Deal`; cálculos puros (`src/lib/finance/return-calc.ts`, `src/lib/warranty/warranty-calc.ts`); integração no motor de comissões (RETORNO sobre líquido via CommissionRule; GARANTIA por valores fixos via WarrantySale); `recalculateNegotiationCommissions`; rotas `/api/warranties` (+`[id]`), `/api/negotiations/[id]/warranty-sales` (+`[saleId]`), `/api/negotiations/[id]/return`; tela de cadastro de garantias com form rico.
  - Migrations aplicadas: `20260613000000_add_goals_ranking`, `20260614120000_add_return_warranty`.
- **Validações:** `tsc --noEmit` limpo; `npm run build` OK em todas as etapas; validação HTTP com login real (criar garantia, venda → comissão 750 PREVISTO; retorno conferido com exemplos da spec).
- **Observações p/ próxima IA:** deals demo têm `tenantId` null (legado). MASTER não tem tenant → ranking vazio no dashboard (usa impersonation).

### LOG 0002 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree). Trabalho não commitado até autorização do usuário.
- **Tarefa:** VOLTAR ÀS TAREFAS PENDENTES → Painel da negociação (Retorno + Garantia), Fase D.
- **Arquivos alterados/criados:**
  - `README_ROBOTS.md` (criado — este arquivo, com protocolo + LOG 0001 histórico).
  - `src/app/(dashboard)/negociacoes/[id]/_components/ReturnPanel.tsx` (novo): retorno financeiro — % (0–6, máscara) + ILA/IOF (desabilitados sem `negotiations.financing`), preview ao vivo de bruto/ILA/IOF/líquido, salvar via PUT.
  - `src/app/(dashboard)/negociacoes/[id]/_components/WarrantySalesPanel.tsx` (novo): venda de garantia — selecionar garantia + cheio/reduzido + adicional prêmio, preview de preço e comissão, listar/cancelar vendas.
  - `src/app/(dashboard)/negociacoes/[id]/page.tsx` (mínimo): 2 imports + montagem dos 2 painéis na aba "valores", logo após o Phase2Panel. **Phase2Panel NÃO foi alterado.**
- **Validações:** `tsc --noEmit` limpo; `npm run lint` (arquivos novos) sem erros (2 warnings advisory set-state-in-effect); `npm run build` OK.
- **Observações p/ próxima IA:** componentes autocontidos (consomem `/api/negotiations/[id]/return` e `.../warranty-sales`). Backend já validado no LOG 0001. Não verificado visualmente no navegador ainda. Não mexi em schema/permissões/cálculo.

### LOG 0003 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Config de pesos do ranking (UI) + refino dos agregadores.
- **Arquivos alterados/criados:**
  - `src/lib/goals/aggregators.ts`: `EXTENDED_WARRANTY` agora conta `WarrantySale` ATIVA em deals concluídos (antes era heurística por nome de serviço); `RETURN` conta deals concluídos com `returnNetValue > 0` (antes retornava 0). Removidas as notas "provisório". Afeta Metas E Ranking (o ranking reusa estes agregadores).
  - `src/app/(dashboard)/ranking/configuracao/page.tsx` (novo): UI dos 9 pesos + nome + restaurar padrões + desempate (read-only), sobre `/api/ranking/rules` (GET/PUT).
  - `src/components/layout/navigation.ts`: item "Ranking → Configurar Pesos" (módulo `ranking.configure`, MASTER/ADM).
- **Validações:** `tsc` limpo; `npm run lint` (novos) sem erros (1 warning advisory); `npm run build` OK (/ranking/configuracao registrada).
- **Observações p/ próxima IA:** não mexi em schema/permissões/cálculo. Pesos podem ser negativos (penalizações). Não verificado visualmente.

### LOG 0004 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree). Verificação visual — sem alteração de código.
- **Tarefa:** Verificação visual no navegador (Chrome MCP, login real do usuário).
- **Verificado (renderiza correto):**
  - `/cadastros/garantias`: tabela (Nome/Cobertura/Cheio/Reduzido/Prêmio/Status) + modal rico; toggle "Possui adicional prêmio/luxo?" revela nome/valor/comissão do adicional.
  - Negociação → aba Valores: painel **Retorno financeiro** (valor financiado, % 0–6 com máscara, ILA/IOF editáveis p/ MASTER, retorno bruto/líquido, salvar) e painel **Garantia** (select garantia + tipo de venda); Phase2Panel e Resumo legado intactos.
  - `/ranking/configuracao`: pesos com defaults da spec (100/40/25/20/30/20/−15…), menu "Configurar Pesos" ativo.
- **Observações p/ próxima IA:** catálogo de garantias estava vazio (garantia de teste foi removida em LOG 0001) — por isso o select de garantia na negociação aparece vazio; cadastre uma garantia para testar a venda ponta a ponta. Sessão do navegador expira (~horas) — pode precisar relogar.

### LOG 0005 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Views de comissão — exibir RETORNO e GARANTIA.
- **Contexto:** o motor grava em `CommissionCalculation` (ruleType VENDA/RETORNO/GARANTIA/...), mas `/comissoes/extrato` lê `CommissionExtract` (tabela diferente) e `/comissoes/retornos`+`/garantias` são telas de CONFIG de regras. Por isso as comissões de retorno/garantia não apareciam. Criada view dedicada (não mexi nas telas/tabelas existentes).
- **Arquivos criados/alterados:**
  - `src/app/api/commissions/calculations/route.ts` (novo): GET read-only de CommissionCalculation, tenant-scoped, filtros ruleType/period/status, totais por tipo (groupBy) + total geral, resolve nomes (seller/manager). VENDEDOR/FINANCEIRO/usuário vê só as próprias.
  - `src/app/(dashboard)/comissoes/lancamentos/page.tsx` (novo): cards de total por tipo (Venda/Retorno/Garantia/Serviço + total geral), filtros (período/tipo/status), tabela (responsável/tipo/descrição/base/comissão/status/período). Status com rótulos prevista/liberada/paga/estornada.
  - `src/components/layout/navigation.ts`: item "Comissões → Lançamentos" (módulo `commissions`).
- **Validações:** `tsc` limpo; `npm run lint` (novos) sem erros (1 warning advisory); `npm run build` OK (rotas registradas).
- **Observações p/ próxima IA:** não mexi em /comissoes/extrato nem nas tabelas. CommissionExtract continua sendo o extrato consolidado por período (fluxo separado). Não verificado visualmente.

### LOG 0006 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Fase 5 — Avisos de meta (meta abaixo do esperado), integrado a Notificações.
- **Arquivos criados:**
  - `src/services/goalAlertScanner.ts`: varre metas ATIVAS no período, calcula progresso (computeGoalProgress), e quando o realizado está atrás do ritmo esperado (decorrido ≥25% e %realizado < ritmo*0.8, não atingida) dispara aviso reusando `notify`/`notifyByRole` (NotificationService). USER → notifica o vendedor; UNIT/TENANT → notifica gestores (da unidade quando UNIT). Idempotente: 1 aviso por meta/período (dedupe via metadata.goalId desde startDate). Tipo de notificação SISTEMA.
  - `src/app/api/goals/scan-alerts/run/route.ts`: POST dispara a varredura (MASTER/ADM/GERENTE_GERAL; MASTER sem tenantId varre todos). Espelha /api/pendency-scan/run.
- **Validações:** `tsc` limpo; `npm run lint` (novos) 0 problemas; `npm run build` OK (rota registrada).
- **Observações p/ próxima IA:** avisos aparecem na central de notificações existente (NotificationCenter) — não criei UI nova. Disparo é manual via rota; pode ser agendado por cron depois. Thresholds em constantes no topo do scanner (MIN_ELAPSED, PACE_MARGIN). Não verificado visualmente.

### LOG 0007 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Fase 9 — Testes automatizados (unitários da lógica de negócio).
- **Infra:** instalado **vitest** (devDep); `vitest.config.ts` (alias `@`→src, env node); scripts `test`/`test:watch` no package.json.
- **Testes criados (34, todos passando):**
  - `src/lib/finance/return-calc.test.ts`: retorno (bruto/ILA/IOF/líquido, clamp 0–6, comissão sobre líquido, negativos).
  - `src/lib/warranty/warranty-calc.test.ts`: vendas V1/V2/V3 da spec (preço + comissão).
  - `src/lib/permissions.test.ts`: RBAC por módulo (master, goals.manage, ranking.configure, negotiations.financing, garantias).
  - `src/lib/auth-guards.test.ts`: isolamento multi-tenant (tenantWhere/assertTenantId/hasRole).
  - `src/lib/goals/progression.test.ts`: progressão de níveis (currentLevel/nextLevelTarget).
  - `src/lib/ranking/ranking.test.ts`: pontuação, qualidade, desempate e janela de período.
- **Mudança de apoio:** exportados `pointsFor`/`qualityFor`/`sortRanking` em `lib/ranking/service.ts` (eram privados) p/ testar o desempate.
- **Validações:** `npm run test` 34/34; `tsc` limpo; `npm run build` OK.
- **ACHADO (decisão p/ usuário):** `GERENTE_ADMINISTRATIVO` está em MANAGEMENT_ROLES mas NÃO em `goals.manage` (módulo criado antes do perfil). Ver pendência. NÃO alterei permissões (fora do escopo).
- **Observações p/ próxima IA:** testes cobrem LÓGICA PURA. Faltam testes de integração de rotas/DB (precisam de banco de teste/mocks) — ver pendência Fase 9 (resto).

### LOG 0008 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Decisão do usuário — GERENTE_ADMINISTRATIVO tem acesso à administração da empresa → deve gerir metas e configurar ranking.
- **Arquivos alterados:**
  - `src/lib/permissions.ts`: adicionado `GERENTE_ADMINISTRATIVO` aos módulos `goals` (read), `goals.manage`, `ranking` (read) e `ranking.configure`. (FINANCEIRO também adicionado a `goals` read.)
  - `src/lib/permissions.test.ts`: testes ajustados para a regra correta (goals.manage e ranking.configure incluem GERENTE_ADMINISTRATIVO).
- **Validações:** `npm test` 34/34; `tsc` limpo; `npm run build` OK.
- **Observações:** módulos de gestão criados em Fase A (negotiations, etc.) já incluíam GERENTE_ADMINISTRATIVO; só os de Metas/Ranking (criados antes do perfil) estavam defasados — agora alinhados.

### LOG 0009 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Páginas de Ranking dedicadas (geral/unidade).
- **Arquivos criados/alterados:**
  - `src/components/ranking/RankingTable.tsx` (novo): tabela de ranking reutilizável (busca /api/ranking por período+unidade; props period/unitId/highlightUserId/reloadKey).
  - `src/app/(dashboard)/ranking/geral/page.tsx` (novo): Ranking Geral (período + RankingTable).
  - `src/app/(dashboard)/ranking/unidade/page.tsx` (novo): Ranking da Unidade (gestor escolhe unidade; vendedor restrito pelo backend).
  - `src/app/(dashboard)/desempenho/page.tsx`: refatorado para REUSAR RankingTable (removida a tabela inline duplicada; mantidas metas agregadas + filtros). Sem perda de função.
  - `src/components/layout/navigation.ts`: itens "Ranking Geral" e "Ranking da Unidade" (módulo `ranking`).
- **Validações:** `tsc` limpo; lint (novos) sem erros; `npm test` 34/34; `npm run build` OK (rotas registradas).
- **Observações p/ próxima IA:** escopo (geral×unidade) é decidido no backend (/api/ranking): vendedor sempre restrito à própria unidade. Não verificado visualmente.

### LOG 0010 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Limpeza do lint legado.
- **Estado encontrado:** os ~33 ERROS já não existiam (resolvidos por commits paralelos do usuário) — `npm run lint` já saía 0. Restavam ~476 warnings legados.
- **Feito (seguro, proporcional):**
  - Removido `eslint-report.json` (3,2 MB, artefato commitado por engano) + adicionado ao `.gitignore`.
  - `eslint . --fix`: removeu diretivas `eslint-disable` inúteis (10 arquivos, ±2 linhas cada). 476 → 464 warnings.
  - NÃO mascarei nenhuma regra de correção (react-hooks "during render" seguem como warnings visíveis, não silenciadas).
- **Validações:** `npm run lint` exit 0; `tsc` limpo; `npm test` 34/34; `npm run build` OK.
- **PENDENTE (incremental, NÃO fazer em sweep único):** ~464 warnings legados = 124 `no-explicit-any` + 92 `no-unused-vars` + 88 react-hooks "Cannot create components/call impure during render" (correção real — hoistar componentes internos, por arquivo) + 39 `react/no-unescaped-entities` + misc. Tratar por área, com cuidado de regressão. As 88 de react-hooks são as mais relevantes (potenciais bugs) — priorizar quando mexer nos arquivos afetados.

### LOG 0011 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Limpeza incremental de warnings legados — área `react/no-unescaped-entities`.
- **Feito:** escapadas 44 aspas `"`→`&quot;` em texto JSX (14 arquivos), via codemod dirigido pelas posições exatas do ESLint (só onde ele apontou; cosmético, zero lógica). Warnings 464 → 420; `no-unescaped-entities` agora = 0.
- **Validações:** `tsc` limpo; `npm test` 34/34; `npm run build` OK; `npm run lint` exit 0.
- **Observações p/ próxima IA:** próximas áreas de warning (incrementais): 124 `no-explicit-any` (tipar), 92 `no-unused-vars` (remover dead code/imports), 88 react-hooks "during render" (hoistar componentes — correção, por arquivo). Fazer por área, validando a cada passo.

### LOG 0012 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Limpeza incremental de warnings — imports não usados.
- **Feito:** instalado `eslint-plugin-unused-imports` (devDep) + configurado no eslint.config.mjs (`unused-imports/no-unused-imports` fixável; `unused-imports/no-unused-vars` com ignore `^_`; desligada a base `@typescript-eslint/no-unused-vars` para não duplicar). `eslint --fix` removeu 47 imports mortos (27 arquivos). Warnings 420 → 373.
- **Validações:** `tsc` limpo (nenhum import removido indevidamente); `npm test` 34/34; `npm run build` OK; `npm run lint` exit 0.
- **Observações p/ próxima IA:** o plugin agora remove imports mortos no --fix automaticamente (melhoria permanente). Restam ~373 warnings: ~124 `no-explicit-any`, ~75 `unused-imports/no-unused-vars` (vars locais, NÃO imports — exigem julgar caso a caso), 88 react-hooks "during render", misc.

### LOG 0013 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree). Verificação end-to-end — sem alteração de código.
- **Tarefa:** Verificação visual do fluxo Retorno/Garantia no navegador (Chrome MCP, login real).
- **Verificado (funcionando):** cadastro de garantia "Garantia Excelente" (cheio 3.350 / reduzido 2.250 / prêmio 300) listado; venda na negociação com preview ao vivo **Preço R$ 3.650,00 / comissão R$ 750,00** (cheio + prêmio); registro com auditoria (VENDER_GARANTIA); `/comissoes/lancamentos` exibindo a comissão **GARANTIA R$ 750,00 (Prevista)** por vendedor, com totais por tipo.
- **Observações p/ próxima IA:** ficaram no banco demo 1 garantia "Garantia Excelente" + 1 venda + 1 comissão GARANTIA de teste (deal cmpsv91fb, tenantId null). Limpar se desejar. Vendas de veículo mostram comissão 0 por falta de CommissionRule(VENDA) — esperado.

---

## TAREFAS PENDENTES
> **Não alterar sem autorização do usuário.** Marcar `[em andamento]` ao iniciar e mover para LOG ao concluir.

### Retorno + Garantia (Fase D — UI) — PARCIAL
- [x] **Painel da negociação** — CONCLUÍDO no LOG 0002 (ReturnPanel + WarrantySalesPanel na aba "valores").
- [x] **Verificação visual** das telas novas — CONCLUÍDO no LOG 0004 (garantias, negociação Valores, configuração de pesos).
- [x] **Views de comissão** — CONCLUÍDO no LOG 0005 (`/comissoes/lancamentos` + API `/api/commissions/calculations`).
- [x] **Verificação visual end-to-end** — CONCLUÍDO no LOG 0013 (criar garantia → vender cheio+prêmio → preço R$3.650/comissão R$750 → lançamento de comissão GARANTIA visível).

### Metas + Ranking — PENDENTE
- [x] Tela de **configuração de pesos do ranking** — CONCLUÍDO no LOG 0003 (`/ranking/configuracao`).
- [x] **Páginas de Ranking** dedicadas (geral/unidade) — CONCLUÍDO no LOG 0009 (RankingTable reutilizável + /ranking/geral + /ranking/unidade; /desempenho refatorado).
- [x] **Fase 5 — Avisos de meta** — CONCLUÍDO no LOG 0006 (goalAlertScanner + /api/goals/scan-alerts/run, via NotificationService).
- [x] **Fase 9 — Testes unitários** — CONCLUÍDO no LOG 0007 (vitest; 34 testes de lógica pura). 
- [ ] **Fase 9 — Testes de integração** (rotas/API, login, não-vazamento de tenant em queries reais) — precisa de banco de teste/mocks.
- [x] **DECISÃO RESOLVIDA (LOG 0008):** GERENTE_ADMINISTRATIVO tem acesso à administração da empresa → adicionado a goals/goals.manage/ranking/ranking.configure.

### Agregadores (Metas/Ranking) — CONCLUÍDO (LOG 0003)
- [x] `EXTENDED_WARRANTY` conta `WarrantySale` ATIVA; `RETURN` conta deals com `returnNetValue > 0`. Não são mais provisórios.

### Base — DÍVIDA TÉCNICA
- [x] Lint: 0 ERROS (`npm run lint` passa); artefato eslint-report.json removido; auto-fixes aplicados (LOG 0010).
- [ ] WARNINGS legados — limpeza incremental. Progresso: entidades JSX=0 (LOG 0011); imports mortos removidos + plugin unused-imports (LOG 0012). Restam ~373: ~124 `no-explicit-any`, ~75 unused-vars locais, 88 react-hooks "during render", misc.
