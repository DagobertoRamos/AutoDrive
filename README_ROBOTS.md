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

## 🤖 PROMPT PARA O CODEX — Onde paramos e próximos passos
> Atualizado a cada sessão. Leia ANTES de começar. Branch: `main` (worktree em `.claude/worktrees/distracted-dhawan-fd8ce5`). Sempre: rodar `npm run lint` / `npx tsc --noEmit` / `npm test` / `npm run build` a cada etapa, e **GRAVAR UM LOG aqui ao final de QUALQUER mexida em código**.

**Onde paramos (último estado):** núcleo completo (Metas, Ranking, Retorno/Garantia, Comissões, Avisos), testes 45/45, build OK, lint 0 erros. Menu enxugado (Configurações = Loja/Identidade/Perfil; placeholders com badge "em breve"). Fronteira MASTER(global)×ADM(tenant) aplicada. **Relatórios sobre dados existentes CONCLUÍDOS = 27 telas** — Estoque (6), Negociações (4), Comissões (4), Pendências (5), Comunicação (4), Auditoria (4). **Financeiro COMPLETO** (F1-F5, LOGs 0026-0030): schema+migration, CRUD APIs, integração vendas/comissões, UI operacional (/financeiro/*) e 11 relatórios. **ÚNICO pendente: aplicar a migration `20260615000000_add_financeiro` no banco (`prisma migrate deploy`)** — telas vazias/erro até lá; depois usar "Sincronizar".

**PADRÃO de relatório (siga-o):**
1. API `src/app/api/reports/<área>/<nome>/route.ts`: `getSessionUser` → `canAccessModule(role,'logs')` → `assertTenantId` → `tenantWhere(role, tenantId, {...})` → agregação (`aggregate`/`groupBy`/`findMany take:≤1000`) → `handlePrismaError`. Decimais via helper `num()`.
2. Página: substituir o `PlaceholderPage` por cards + tabela (ver `relatorios/estoque/atual`).
3. `navigation.ts`: **remover o `badge: 'em breve'`** do item implementado.
4. Validar (tsc/lint/test/build) e **gravar LOG**.

**Próximos passos seguros (em ordem):**
1. ✅ **Relatórios de Estoque CONCLUÍDOS** (LOG 0019-0021): atual, parados, margem, giro, preparacao, avaliacoes.
2. ✅ **Relatórios de Negociações CONCLUÍDOS** (LOG 0022): vendas, trocas, compras, consignacao (1 API parametrizada + componente reutilizável).
3. ✅ **Relatórios de Comissões CONCLUÍDOS** (LOG 0023): extrato, vendedor, garantias, retornos (1 API `?view=` + CommissionLedgerReport).
4. ✅ **Relatórios de Pendências CONCLUÍDOS** (LOG 0024): abertas, resolvidas, sla, responsavel, unidade.
5. ✅ **Relatórios de Comunicação e Auditoria CONCLUÍDOS** (LOG 0025): comunicacao (whatsapp/email/avisos/logs) + auditoria (acessos/alteracoes/exclusoes/eventos).
6. **Resta só Financeiro** (11 telas: caixa/DRE/contas a pagar-receber/fluxo) — **exige novos models** no schema.prisma. NÃO criar sem alinhar regras com o usuário. Legado abaixo: `vendas`/`trocas`/`compras`/`consignacao` sobre `Deal` (type+status FINALIZADA; já há `/comissoes/lancamentos` como referência de agregação).
3. **Relatórios de Comissões:** `extrato`/`vendedor`/`garantias`/`retornos` sobre `CommissionCalculation` (reusar `/api/commissions/calculations`).
4. **Relatórios de Pendências:** sobre `Pendency` (status/SLA/responsável).
5. **Fase 3 (resíduo):** separar de `/configuracoes/sistema` os campos GLOBAIS (mode/environment) que ainda moram lá — já está MASTER-only no PUT, mas a página mistura conteúdo; idealmente uma página Master limpa só com toggles globais.
6. **Dívida de lint (oportunística):** tipar `no-explicit-any` (186) por arquivo ao mexer nele; NÃO em sweep único.

**NÃO FAZER sem autorização:** refatorar arquivos gigantes (`negociacoes/nova` 4780l, `negociacoes/[id]`, `master/communication`, `master/sheets`, `estoque/avaliacao`); mexer em schema/permissions/cálculo de comissão fora do escopo; apagar páginas; criar módulos novos (Leads/CRM, Pós-vendas, Financeiro com models) sem pedido explícito.

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

### LOG 0014 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Fase 9 — Testes de integração das rotas.
- **Abordagem:** handlers REAIS com `@/lib/prisma` e `@/lib/auth` mockados (vi.hoisted). auth-guards/permissions/validators rodam de verdade → valida RBAC + isolamento de tenant sem banco.
- **Criado:** `src/app/api/routes-integration.test.ts` (11 testes): /api/goals (401 sem auth; GET filtra tenantId; POST 403 p/ VENDEDOR; POST ADM cria com tenantId; 400 inválido), /api/warranties (GET tenant; POST 403 VENDEDOR; POST FINANCEIRO cria), /api/ranking (VENDEDOR restrito à própria unidade+tenant, ignora unitId da query; MASTER sem tenant→400), /api/commissions/calculations (VENDEDOR vê só as próprias, no seu tenant).
- **Validações:** suíte completa 45/45 (34 unit + 11 integração); `tsc` limpo; `npm run build` OK.
- **Observações p/ próxima IA:** são testes de unidade-de-rota com mocks (não tocam DB). Teste com banco real (e2e) ainda não feito — opcional.

### LOG 0015 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Limpeza de warnings — fim das correções mecânicas seguras.
- **Feito:** corrigido o único `import/no-anonymous-default-export` (nomeado o export em eslint.config.mjs). Warnings 373 → 372.
- **DIAGNÓSTICO dos 372 restantes (recomendação):** não há mais sweep mecânico seguro. Composição: **186 `no-explicit-any`** (dívida de tipagem — fazer por arquivo, manual), **105 `react-hooks/set-state-in-effect`** (INTENCIONAL — padrão fetch-on-mount usado em todo o app; advisory, não bug), **75 `unused-imports/no-unused-vars`** (params/caught → prefixar `_`; "assigned but unused" → remover; tem destructures → codemod inseguro, requer julgamento), **6 `react-hooks/exhaustive-deps`** (arriscado: pode causar loop), **0 demais**. RECOMENDAÇÃO: tratar `any` e unused-vars **oportunisticamente ao editar cada arquivo**, não em passe único. set-state-in-effect pode ficar como está (ou virar regra desligada se incomodar).
- **Validações:** `npm run lint` exit 0; `npm test` 45/45.

### LOG 0016 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** AUDITORIA READ-ONLY + MAPA MESTRE DE MONTAGEM do AutoDrive (a pedido do usuário).
- **Nenhum código alterado** — apenas este log gravado.
- **Números:** 118 páginas (45 placeholders), 237 API routes, 92 models Prisma, 6 services, 45 testes verdes, lint 0 erros/372 warnings.
- **Achados-chave:**
  - **Relatórios: 38/40 páginas são placeholder** (módulo inteiro a implementar — dados já existem). Documentos: 3 placeholders (procuracoes/termos/declaracoes). Comunicações: 3 placeholders (avisos/central/logs). Pendências: 1 (configuracoes).
  - **Menu Configurações tem 7 itens; deveria ter 3** (Loja, Identidade, Perfil). Realocar E-mail/WhatsApp/Sheets/Comissões.
  - **Módulos AUSENTES:** Leads/CRM e Pós-vendas (não existem páginas/models).
  - **Financeiro:** só placeholders (sem models de transação financeira).
  - **Arquivos gigantes (risco):** negociacoes/nova 4780l, negociacoes/[id] 2133l, master/communication 2130l, master/sheets 1893l, estoque/avaliacao 1766l.
  - **Stubs:** /negociacoes/[id]/editar (23l), /pendencias (27l), /estoque/novo (32l). **Órfãs notáveis:** /inicio, /relatorios/logs.
  - 0 links de menu quebrados.
- **Observações p/ próxima IA:** o MAPA MESTRE completo (10 seções) foi entregue ao usuário no chat. Ordem segura sugerida: Fase 2 enxugar menu Configurações → Fase 3 base administrativa/Loja → relatórios incrementais. NÃO refatorar os arquivos gigantes sem necessidade.

### LOG 0017 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Fase 2 — Limpeza do menu (Configurações enxuto, "em breve" nos placeholders, distinção MASTER×ADM).
- **Arquivos alterados (somente menu/UI):**
  - `src/components/layout/navigation.ts`: **Configurações → 3 itens** (Loja → /configuracoes/sistema; Identidade; Perfil). Removidos do grupo: E-mail/WhatsApp/Sheets (domínio MASTER — já existem em Master › Comunicação / Importador Sheets) e Comissões (realocada para grupo **Comissões › Configurações**). **45 itens placeholder** marcados com `badge: 'em breve'` (todo Relatórios + comunicacao avisos/central/logs + documentos procuracoes/termos/declaracoes + pendencias configuracoes). Removidos imports de ícone órfãos (Mail/Smartphone/Plug).
  - `src/components/layout/Sidebar.tsx`: NavLeaf passa a renderizar `item.badge` (pílula "em breve").
- **MASTER × ADM:** o grupo **Master** já é MASTER-only (`module: 'master'` → roles ['MASTER']) — ADM não vê. Confirmado, não alterado. MASTER mexe no sistema todo (tenants, bloqueio, preço, teste/cortesia via master/tenants, master/plans, master/maintenance); ADM só o próprio tenant.
- **NÃO alterado:** schema, permissões (permissions.ts), rotas/páginas, cálculo. Páginas /configuracoes/{email,whatsapp,sheets} continuam existindo (apenas desvinculadas deste menu).
- **CAVEAT p/ Fase 3:** `/configuracoes/sistema` ("Loja") ainda mistura dados da loja com toggles GLOBAIS (modo manutenção, ambiente TESTE) e sua API libera ADM. Fase 3 deve SEPARAR os controles globais para MASTER-only (master/maintenance já existe) e deixar em "Loja" só os dados do tenant.
- **Validações:** `tsc` limpo; `npm test` 45/45; `npm run build` OK; `npm run lint` exit 0.

### LOG 0018 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Fase 3 — Base administrativa: "Configuração da Loja" (tenant) + separar Sistema global para MASTER.
- **Arquivos criados/alterados:**
  - `src/app/api/settings/store/route.ts` (novo): GET/PUT do PRÓPRIO tenant do ADM (whitelist de campos cadastrais: nomeFantasia/razaoSocial/cnpj/IE/endereço/telefone/email/responsável/slogan). NÃO permite editar contrato (plano/status/trial/limites/slug) — isso é MASTER. MASTER sem tenant → 400 (usa Master › Tenants). Permissão `settings` (MASTER+ADM), auditoria.
  - `src/app/(dashboard)/configuracoes/loja/page.tsx` (novo): form de dados da loja (dados/endereço/responsável) + faixa read-only do contrato (ID/plano/status, "gerenciado pelo MASTER").
  - `src/components/layout/navigation.ts`: "Loja" agora → `/configuracoes/loja` (era /configuracoes/sistema). Adicionado **Master › "Sistema (global)"** → /configuracoes/sistema (module `master`).
  - `src/app/api/settings/system/route.ts`: PUT agora **MASTER-only** (era MASTER+ADM) — config global (manutenção/ambiente) é do MASTER.
- **Resultado da fronteira MASTER×ADM:** ADM edita só os dados cadastrais da própria loja; toggles globais (manutenção/ambiente/SystemSetting) ficaram MASTER-only e fora do menu do ADM. Caveat do LOG 0017 RESOLVIDO.
- **Validações:** `tsc` limpo; lint (novos) sem erro (1 warning advisory); `npm test` 45/45; `npm run build` OK (rotas /configuracoes/loja e /api/settings/store registradas).
- **Observações p/ próxima IA:** NÃO mexi no schema (Tenant já tinha os campos) nem em permissions.ts. /configuracoes/sistema ainda contém campos operacionais (agenda/pendências/whatsapp/import) além dos globais — se algum precisar voltar ao nível do tenant, é decisão futura. Não verificado visualmente.

### LOG 0019 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Fase 4 — Estoque/Avaliação: relatório-piloto **Estoque Atual** (estabelece o PADRÃO de relatório read-only).
- **Arquivos criados/alterados:**
  - `src/app/api/reports/stock/current/route.ts` (novo): GET agregado tenant-scoped sobre `Vehicle` (em estoque = ativo & stockStatus ∉ VENDIDO/CANCELADO/DEVOLVIDO). Retorna summary (count, total venda/compra/FIPE), quebra por status (groupBy) e lista (até 500, com diasEmEstoque). Permissão `logs`.
  - `src/app/(dashboard)/relatorios/estoque/atual/page.tsx`: substituído PlaceholderPage por relatório real (cards + chips por status + tabela). PADRÃO reutilizável p/ os demais relatórios.
  - `src/components/layout/navigation.ts`: removido badge "em breve" de Estoque Atual (agora implementado).
- **Validações:** `tsc` limpo; lint (novos) sem erro (1 warning advisory); `npm test` 45/45; `npm run build` OK (rota /api/reports/stock/current registrada).
- **Observações p/ próxima IA:** PADRÃO de relatório = `/api/reports/<área>/<nome>` (agregação tenant-scoped via tenantWhere + canAccessModule('logs')) consumido por página com cards+tabela. Replicar para os outros relatórios de Estoque (giro, parados, margem, preparacao, avaliacoes) e demais áreas. Lembrar de remover o badge "em breve" do item no menu ao implementar cada um. Dados já existem em `Vehicle`/`VehicleEvaluation`/`Deal`/`CommissionCalculation`.

### LOG 0020 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Fase 4 — relatórios **Veículos Parados** e **Margem por Veículo** (+ seção "PROMPT PARA O CODEX").
- **Arquivos criados/alterados:**
  - `src/app/api/reports/stock/stale/route.ts` (novo): veículos parados — faixas (0–30/31–60/61–90/90+) + lista filtrada por `?minDays=` (dias em estoque via entryDate). Tenant-scoped.
  - `src/app/api/reports/stock/margin/route.ts` (novo): margem = salePrice − purchasePrice por veículo + summary (margem total, % média). Tenant-scoped.
  - `src/app/(dashboard)/relatorios/estoque/parados/page.tsx` e `…/margem/page.tsx`: PlaceholderPage → relatórios reais (cards/faixas/tabela).
  - `src/components/layout/navigation.ts`: removidos badges "em breve" de Parados e Margem.
  - `README_ROBOTS.md`: adicionada seção **PROMPT PARA O CODEX** (onde paramos + próximos passos + padrão de relatório).
- **Validações:** `tsc` limpo; lint (novos) sem erro (2 warnings advisory); `npm test` 45/45; `npm run build` OK (rotas stale/margin registradas).
- **Observações p/ próxima IA:** relatórios de Estoque restantes: giro, preparacao, avaliacoes (mesmo padrão). Ver "PROMPT PARA O CODEX" no topo.

### LOG 0021 — 2026-06-14 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Fase 4 — relatórios de Estoque restantes: **Giro**, **Preparação**, **Avaliações** (Estoque agora 6/6).
- **Arquivos criados/alterados:**
  - `src/app/api/reports/stock/turnover/route.ts` (novo): veículos com exitDate (saídas) + tempo médio até vender (entryDate→exitDate), mais rápido/lento. Tenant-scoped.
  - `src/app/api/reports/stock/preparation/route.ts` (novo): `EvaluationService` agregado (estimado vs realizado), por tipo (groupBy serviceType) e por status. Tenant-scoped.
  - `src/app/api/reports/stock/evaluations/route.ts` (novo): `VehicleEvaluation` por resultado/intenção + lista. Tenant-scoped.
  - 3 páginas `relatorios/estoque/{giro,preparacao,avaliacoes}`: PlaceholderPage → relatórios reais.
  - `navigation.ts`: removidos os 3 badges "em breve".
- **Validações:** `tsc` limpo; lint (novos) sem erro (4 warnings advisory); `npm test` 45/45; `npm run build` OK (rotas turnover/preparation/evaluations registradas).
- **Observações p/ próxima IA:** Estoque 6/6 concluído. Seguir com Relatórios de Negociações (`Deal`) e Comissões (reusar /api/commissions/calculations). Padrão idêntico — ver "PROMPT PARA O CODEX".

### LOG 0022 — 2026-06-15 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Relatórios de **Negociações** (Vendas, Trocas, Compras, Consignação) sobre `Deal`.
- **Arquivos criados/alterados:**
  - `src/app/api/reports/negotiations/route.ts` (novo): **1 API parametrizada** `?type=VENDA|TROCA|COMPRA|CONSIGNACAO`. Summary (count, finalizadas, valorRealizado, valorTotal) + byStatus (groupBy) + lista (take 500). Valor = saleAmount, exceto COMPRA = purchaseAmount. Tenant-scoped via `tenantWhere`, gated `canAccessModule('logs')`.
  - `src/components/reports/NegotiationsReport.tsx` (novo): **componente reutilizável** (props type/title/valueLabel/Icon) — cards + chips por status + tabela.
  - 4 páginas `relatorios/negociacoes/{vendas,trocas,compras,consignacao}`: PlaceholderPage → `<NegotiationsReport type=... />` (finas, 5 linhas cada).
  - `navigation.ts`: removidos os 4 badges "em breve".
- **Validações:** `tsc` limpo; lint sem erro (1 warning advisory); `npm test` 45/45; `npm run build` OK (rota + 4 páginas registradas).
- **Observações p/ próxima IA:** Padrão DRY (1 API + 1 componente) economiza muito vs. 4 rotas. Próximo: **Comissões** (`relatorios/comissoes/*`) — reusar `CommissionCalculation`/`/api/commissions/calculations`. Depois Pendências (`Pendency`). Ver "PROMPT PARA O CODEX".

### LOG 0023 — 2026-06-15 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Relatórios de **Comissões** (Extrato Geral, Por Vendedor, Garantias, Retornos) sobre `CommissionCalculation`.
- **Arquivos criados/alterados:**
  - `src/app/api/reports/commissions/route.ts` (novo): **1 API parametrizada** `?view=geral|garantias|retornos|vendedor`. Ledger (geral/garantias/retornos) = lista + totalsByType + totalsByStatus + grandTotal; vendedor = agregado por vendedor (groupBy [sellerId, ruleType] → total + byType + count). Tenant-scoped via `tenantWhere`, gated `canAccessModule('logs')`.
  - `src/components/reports/CommissionLedgerReport.tsx` (novo): componente reutilizável das 3 views ledger (cards + chips por status + tabela).
  - 3 páginas `relatorios/comissoes/{extrato,garantias,retornos}` → `<CommissionLedgerReport view=... />`; `relatorios/comissoes/vendedor` = página própria (tabela agregada por vendedor).
  - `navigation.ts`: removidos os 4 badges "em breve".
- **Validações:** `tsc` limpo; lint sem erro (3 warnings advisory); `npm test` 45/45; `npm run build` OK (rota + 4 páginas registradas).
- **Observações p/ próxima IA:** Reusa o mesmo padrão da view existente `/api/commissions/calculations` (não alterada). Próximo relatório: **Pendências** (`Pendency`) — ver "PROMPT PARA O CODEX".

### LOG 0024 — 2026-06-15 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Relatórios de **Pendências** (Em Aberto, Resolvidas, SLA, Por Responsável, Por Unidade) sobre `Pendency`.
- **Arquivos criados/alterados:**
  - `src/app/api/reports/pendencies/route.ts` (novo): **1 API parametrizada** `?view=abertas|resolvidas|sla|responsavel|unidade`. Listas (abertas/resolvidas/sla) com byStatus/byPriority + flag `vencida` (slaDeadline/dueDate < now e não fechada); resolvidas calcula tempo médio (resolvedAt-createdAt); sla classifica no-prazo×vencida + %; responsavel/unidade agregam em JS (groupBy lógico por responsibleId/unitId → total/abertas/resolvidas/vencidas) com nomes resolvidos. Tenant-scoped via `tenantWhere`, gated `canAccessModule('logs')`.
  - `src/components/reports/PendencyListReport.tsx` (novo): 3 views de lista (cards adaptáveis + chips prioridade + tabela; destaca linha vencida).
  - `src/components/reports/PendencyGroupedReport.tsx` (novo): agregado responsável/unidade.
  - 5 páginas `relatorios/pendencias/{abertas,resolvidas,sla,responsavel,unidade}` → componentes.
  - `navigation.ts`: removidos os 5 badges "em breve".
- **Validações:** `tsc` limpo; lint sem erro (2 warnings advisory); `npm test` 45/45; `npm run build` OK (rota + 5 páginas registradas).
- **Observações p/ próxima IA:** Relatórios principais (Estoque/Negociações/Comissões/Pendências = 19 telas) concluídos. Próximas áreas de relatório: **Comunicação** (WhatsApp/mensagens — ver MessageReturn/PendencyMessage/WhatsappTemplate) e **Auditoria** (AuditLog). **Financeiro** exige novos models (projeto à parte). Ver "PROMPT PARA O CODEX".

### LOG 0025 — 2026-06-15 — Claude (Opus 4.8)
- **Branch:** main (worktree).
- **Tarefa:** Relatórios de **Comunicação** (WhatsApp, E-mail, Avisos Internos, Logs) e **Auditoria** (Acessos, Alterações, Exclusões, Eventos Críticos).
- **Arquivos criados/alterados:**
  - `src/app/api/reports/communication/route.ts` (novo): `?view=whatsapp|email|avisos|logs`. WhatsApp=PendencyMessage(+MessageReturn recebidas); E-mail=NotificationDelivery channel EMAIL; Avisos=Notification (lidas/não lidas/byType); Logs=NotificationDelivery todos canais (byChannel/byStatus). **Models sem tenantId escopados via relação** (`{ pendency: { tenantId } }` / `{ notification: { tenantId } }`); MASTER vê tudo. Gated `canAccessModule('logs')`.
  - `src/app/api/reports/audit/route.ts` (novo): `?view=acessos|alteracoes|exclusoes|eventos` sobre AuditLog. Classificação por `action` (LOGIN/LOGOUT; UPDATE/CREATE/APPROVE…; DELETE/REMOVE/CANCEL…; status≠SUCCESS ou ações sensíveis). byAction/byEntity + erros + usuários distintos. Tenant-scoped via `tenantWhere`.
  - `src/components/reports/CommunicationReport.tsx` (adapta colunas/cards por view) e `AuditReport.tsx`.
  - 8 páginas `relatorios/{comunicacao,auditoria}/*` → componentes.
  - `navigation.ts`: removidos os 8 badges "em breve".
- **Validações:** `tsc` limpo; lint sem erro (4 warnings advisory); `npm test` 45/45; `npm run build` OK (2 rotas + 8 páginas registradas).
- **Observações p/ próxima IA:** Relatórios sobre dados existentes = **27 telas** concluídas (Estoque 6, Negociações 4, Comissões 4, Pendências 5, Comunicação 4, Auditoria 4). Resta apenas **Financeiro** (11 telas) que **exige novos models** (fluxo de caixa/DRE/contas) — projeto à parte, alinhar com o usuário antes. Ver "PROMPT PARA O CODEX".

### LOG 0026 — 2026-06-15 — Claude (Opus 4.8) — MÓDULO FINANCEIRO (PLANO + Fase F1)
- **Branch:** main (worktree). **Autorizado pelo usuário** a modelar o Financeiro do zero (migration + lançamentos manuais + integração com vendas/comissões).

#### PLANO EM FASES (Financeiro) — para qualquer IA continuar
- **F1 — Fundação de dados (CONCLUÍDA neste log):** schema + migration + permissões + client.
- **F2 — Service + APIs CRUD (CONCLUÍDA — LOG 0027):** `validators/finance.ts` (zod), `lib/finance/finance-service.ts` (tenant-safe, usa `tenantWhere`/`assertTenantId`, audit via `createSafeAuditLog`), rotas:
  - `/api/finance/accounts` (GET/POST) + `/[id]` (PATCH/DELETE)
  - `/api/finance/categories` (GET/POST) + `/[id]` (PATCH/DELETE)
  - `/api/finance/entries` (GET com filtros type/status/period/unit/category + POST) + `/[id]` (GET/PATCH/DELETE). Liquidar = PATCH status PAGO/RECEBIDO + paidDate.
  - Gating: `canAccessModule(role,'finance')` leitura; `'finance.manage'` escrita.
- **F3 — Integração vendas/comissões (CONCLUÍDA — LOG 0028):** `lib/finance/finance-sync.ts` — gera `FinancialEntry` idempotente: Deal FINALIZADA → RECEITA (source=VENDA, unique [dealId,source]); cada `CommissionCalculation` → DESPESA (source=COMISSAO/RETORNO/GARANTIA, unique [commissionCalculationId]). Endpoint `/api/finance/sync` (POST, finance.manage). createMany skipDuplicates. Cada entry herda tenantId da origem.
- **F4 — UI lançamentos (CONCLUÍDA — LOG 0030):** páginas em `/(dashboard)/financeiro/{lancamentos,contas,categorias}` (CRUD + liquidar + sincronizar). Grupo "Financeiro" operacional no navigation.ts (módulo `finance`).
- **F5 — Relatórios (11 telas, CONCLUÍDA — LOG 0029):** `/api/reports/finance?view=...` + páginas `relatorios/financeiro/*`, remover badges. Telas: visao-geral, dre, contas, contas-a-pagar, contas-a-receber, fluxo-de-caixa, receitas, despesas, resultado-unidade, resultado-vendedor, resultado-periodo. Reusar padrão DRY (1 API parametrizada + componentes). DRE = agregação por categoria/kind no período (regime de competência via competenceDate). Fluxo = paidDate. Contas a pagar/receber = status PREVISTO por dueDate (aging).

#### Fase F1 — FEITO neste log
- `prisma/schema.prisma`: enums `FinancialEntryType`(RECEITA/DESPESA), `FinancialEntryStatus`(PREVISTO/PAGO/RECEBIDO/CANCELADO), `FinancialAccountType`(CAIXA/BANCO/CARTAO/OUTRO); models `FinancialAccount`, `FinancialCategory`, `FinancialEntry`. **Aditivo** — não altera tabelas existentes; `dealId/sellerId/unitId/commissionCalculationId` são String (resolvidos na app, como AuditLog/Pendency), só `account`/`category` têm FK (entre tabelas novas). Idempotência: `@@unique([commissionCalculationId])` e `@@unique([dealId, source])`. `amount`/`openingBalance` = Decimal(14,2).
- `prisma/migrations/20260615000000_add_financeiro/migration.sql` (criado, **PENDENTE de aplicar** — rodar `npx prisma migrate deploy` ou `migrate dev`; banco Neon é aplicado pelo usuário).
- `src/lib/permissions.ts`: módulos `finance` (read/export) e `finance.manage` (CRUD) → MASTER/ADM/GERENTE_GERAL/GERENTE_ADMINISTRATIVO/FINANCEIRO.
- `npx prisma generate` OK; `tsc` limpo; `npm test` 45/45; `npm run build` OK.
- **Observações:** migration ainda NÃO aplicada ao banco — qualquer chamada Prisma a finance falhará até `migrate deploy`. F2+ pode ser desenvolvida (build valida tipos pelo client gerado).

### LOG 0027 — 2026-06-15 — Claude (Opus 4.8) — Financeiro Fase F2 (Service + APIs CRUD)
- **Branch:** main (worktree).
- **Arquivos criados:**
  - `src/lib/validators/finance.ts`: zod (create/update Account, Category, Entry; settle).
  - `src/lib/finance/finance-service.ts`: helpers `zodErrorResponse`, `ownsTenant`, `num`.
  - `src/app/api/finance/accounts/route.ts` (GET/POST) + `[id]/route.ts` (PATCH/DELETE soft).
  - `src/app/api/finance/categories/route.ts` (GET ?kind=/POST) + `[id]/route.ts` (PATCH/DELETE soft).
  - `src/app/api/finance/entries/route.ts` (GET filtros type/status/unitId/categoryId/from-to + totals por tipo; POST source=MANUAL) + `[id]/route.ts` (GET/PATCH com liquidação PAGO|RECEBIDO→paidDate/DELETE: MANUAL apaga, integrado vira CANCELADO).
  - Todas tenant-scoped (`tenantWhere`/`ownsTenant`), gating `finance` (read) e `finance.manage` (escrita), auditoria via `createSafeAuditLog`.
- **Validações:** `tsc` limpo; lint 0; `npm test` 45/45; `npm run build` OK (6 rotas registradas).
- **Observações:** ainda depende da migration F1 aplicada no banco p/ funcionar em runtime. Próximo: **F3** (integração) — `lib/finance/finance-sync.ts` + `/api/finance/sync`.

### LOG 0028 — 2026-06-15 — Claude (Opus 4.8) — Financeiro Fase F3 (Integração)
- **Branch:** main (worktree).
- **Arquivos criados:** `src/lib/finance/finance-sync.ts` (`syncFinanceFromBusiness(role, tenantId)` → {vendas, comissoes}; idempotente via existência + skipDuplicates), `src/app/api/finance/sync/route.ts` (POST, finance.manage).
- **Regras:** Deal type VENDA + status FINALIZADA + saleAmount>0 → RECEITA RECEBIDO (source VENDA). CommissionCalculation → DESPESA (PAGO se comissão PAGO senão PREVISTO; source RETORNO/GARANTIA/COMISSAO por ruleType). `CommissionCalculation` NÃO tem dealId — vínculo é por commissionCalculationId.
- **Validações:** `tsc` limpo; lint 0; `npm test` 45/45; `npm run build` OK.
- **Observações:** Falta **F4** (UI /financeiro/*) e **F5** (11 relatórios). Tudo depende da migration F1 aplicada no banco.

### LOG 0029 — 2026-06-15 — Claude (Opus 4.8) — Financeiro Fase F5 (11 relatórios)
- **Branch:** main (worktree).
- **Arquivos criados:**
  - `src/app/api/reports/finance/route.ts`: 1 API `?view=` cobrindo as 11 telas. Agregações sobre FinancialEntry/FinancialAccount, tenant-scoped, gated `canAccessModule('logs')`.
  - `src/components/reports/FinanceEntryListReport.tsx` (receitas/despesas/contas-a-pagar/contas-a-receber; prop `aging`) e `FinanceResultReport.tsx` (resultado unidade/vendedor/período).
  - 11 páginas `relatorios/financeiro/*`: 7 via componentes + 4 inline (visao-geral KPIs, dre por categoria, contas com saldo, fluxo-de-caixa por mês com acumulado).
  - `navigation.ts`: removidos os 11 badges "em breve".
- **Regras dos relatórios:** receitas/despesas realizadas = status PAGO/RECEBIDO; a pagar/receber = PREVISTO; contas a pagar/receber com flag vencida (dueDate<now); fluxo por paidDate; DRE por categoria (competência, exclui CANCELADO); resultado-* agrega receitas-despesas por unidade/vendedor/mês; saldo de conta = openingBalance + recebido - pago.
- **Validações:** `tsc` limpo; lint sem erro (6 warnings advisory); `npm test` 45/45; `npm run build` OK (API + 11 páginas registradas).
- **MÓDULO FINANCEIRO: F1-F3 e F5 concluídas.** Falta **F4 (UI operacional de lançamentos/contas/categorias)** e **aplicar a migration `20260615000000_add_financeiro` no banco** (`prisma migrate deploy`) + opcional rodar POST /api/finance/sync para popular. Sem isso, as telas financeiras carregam vazias.

### LOG 0030 — 2026-06-15 — Claude (Opus 4.8) — Financeiro Fase F4 (UI operacional) — MÓDULO 100%
- **Branch:** main (worktree).
- **Arquivos criados:**
  - `src/app/(dashboard)/financeiro/lancamentos/page.tsx`: hub — lista com filtros (tipo/status) + totais, criar/editar (modal com selects de categoria/conta), liquidar (PREVISTO→PAGO/RECEBIDO), excluir, e botão **Sincronizar** (POST /api/finance/sync).
  - `src/app/(dashboard)/financeiro/contas/page.tsx`: CRUD de contas (tipo + saldo inicial com maskBRL; inativar).
  - `src/app/(dashboard)/financeiro/categorias/page.tsx`: CRUD de categorias (kind RECEITA/DESPESA; inativar).
  - `navigation.ts`: grupo operacional "Financeiro" (Lançamentos/Contas/Categorias, módulo `finance`); imports Landmark/Tags.
- **Validações:** `tsc` limpo; lint sem erro (3 warnings advisory); `npm test` 45/45; `npm run build` OK (3 páginas registradas).
- **MÓDULO FINANCEIRO COMPLETO (F1-F5).** ÚNICO pendente operacional: **aplicar a migration `20260615000000_add_financeiro` no banco** (`npx prisma migrate deploy`) — sem isso as telas/APIs financeiras falham em runtime. Após aplicar, usar o botão "Sincronizar" em /financeiro/lancamentos para popular a partir de vendas/comissões.

### LOG 0031 — 2026-06-15 — Claude (Opus 4.8) — FIX (verificação visual): 'use client' nas páginas de relatório
- **Branch:** main (worktree).
- **Bug encontrado na verificação visual (Chrome MCP, login real Master):** as páginas finas de relatório eram Server Components passando `Icon={Componente}` para um Client Component → runtime error "Only plain objects can be passed to Client Components from Server Components". **`tsc`/`build` NÃO pegam** (erro só em runtime). Afetava ~27 páginas.
- **Correção:** prepend `'use client'` em todas as páginas finas que passam `Icon=` a componente client: relatorios/{negociacoes(4), comissoes extrato|garantias|retornos(3), pendencias(5), comunicacao(4), auditoria(4), financeiro receitas|despesas|contas-a-pagar|contas-a-receber|resultado-*(7)}. Páginas já `'use client'` (estoque, comissoes/vendedor, financeiro visao-geral/dre/contas/fluxo) não foram tocadas.
- **Validação visual confirmada:** Vendas, Contas a Pagar, Comissões/Extrato, Pendências/Abertas, Auditoria/Acessos, Visão Geral, DRE renderizam OK. **Integração validada end-to-end:** botão Sincronizar gerou 1 RECEITA (venda R$45.900) + 3 DESPESAS (comissões/garantia R$750); relatórios financeiros leem corretamente (realizado×previsto).
- **Validações:** `tsc` limpo; `npm test` 45/45; `npm run build` OK. (Obs.: rodar build com o dev server ligado dá EPERM no query_engine.dll do Prisma — parar o dev antes.)
- **APRENDIZADO p/ próxima IA:** página fina que repassa um componente (ex. ícone lucide) como prop a um client component PRECISA de `'use client'`. Não confie só em tsc/build — fazer smoke visual.

### LOG 0032 — 2026-06-15 — Claude (Opus 4.8) — Testes de integração (Relatórios + Financeiro)
- **Branch:** main (worktree).
- **Arquivo criado:** `src/app/api/reports-finance-integration.test.ts` (37 testes; mesmo padrão do routes-integration.test.ts — mocka `@/lib/prisma` e `@/lib/auth`, chama handlers reais).
- **Cobertura:** APIs de relatórios (negotiations, commissions, pendencies, communication, audit, finance) — 401 sem sessão, 403 sem `'logs'` (VENDEDOR), 200 ADM, isolamento de tenant no `where`, filtros (type/view/action), escopo por relação (communication whatsapp → `{ pendency: { tenantId } }`), MASTER sem filtro de tenant. APIs financeiras CRUD (accounts/categories/entries) — gating `finance`/`finance.manage`, 201 grava tenantId/source=MANUAL, 400 inválido, 403/404 no PATCH de outro tenant/inexistente. `/api/finance/sync` — 403 sem permissão, 200 escopa deal/commission por tenant.
- **Total de testes: 45 → 82 (todos verdes).** `tsc` limpo.
- **Observação:** são testes de unidade de rota (prisma/sessão mockados) — validam auth/RBAC/tenant/validação, NÃO o banco real. A validação contra o banco real foi a verificação visual (LOG 0031).

### LOG 0033 — 2026-06-15 — Claude (Opus 4.8) — Lint (slice seguro) + Fase 3 resíduo (segurança)
- **Branch:** main (worktree).
- **(A) Limpeza de lint — slice SEGURO (397 → 384 warnings, 0 erros):** só mudanças mecânicas/sem risco — meu `TYPE_LABEL` morto em relatorios/comissoes/vendedor; `req` posicional não usado → `_req`/`GET()` em reports/stock/preparation + 6 rotas (commissions return/warranty-rules, communication/templates, settings/sheets, whatsapp connect-test/webhook-validate); `catch (err)` não usado → `catch {` em notifications e pendencies/[id]. **NÃO mexi** nos `any` (186), `set-state-in-effect` (128, padrão de loading já aceito como WARN no projeto) nem em vars mortas dentro de páginas legadas gigantes (risco de regressão / protocolo "não refatorar arquivo inteiro").
- **(B) Fase 3 RESOLVIDA (resíduo de segurança):** `GET /api/settings/system` estava **aberto a qualquer autenticado** → vazava segredos globais (Access Token WhatsApp/Meta, webhook token) para ADM. Agora **GET é MASTER-only** (igual ao PUT). Página `/configuracoes/sistema` ganhou **guard de papel** (useSession → não-MASTER vê "Configuração global da plataforma", sem fetch dos dados). Comentário NOTA(Fase 3) na navigation atualizado para "RESOLVIDA".
- **Validações:** `tsc` limpo; lint 384 (0 erros); `npm test` 82/82; `npm run build` OK.
- **Pendências menores restantes:** lint legado (`any`/`set-state`/vars mortas em arquivos grandes) — fazer per-arquivo quando aquele código for tocado, com cuidado; não vale refatoração em massa cega.

### LOG 0034 — 2026-06-15 — Claude (Opus 4.8) — Financeiro: filtro de período + sync automático + categorias
- **Branch:** main (worktree).
- **(#4) Categorias automáticas:** `finance-sync.ts` agora cria/atribui categoria padrão por origem (Vendas/Comissões/Comissões — Garantias/Comissões — Retornos), criada sob demanda por tenant. Inclui **backfill**: lançamentos antigos sem categoria mas com origem conhecida são categorizados no próximo sync. + **reconciliação**: remove DESPESA PREVISTO de comissão órfã (comissão recalculada/excluída).
- **(#3) Sync automático:** novo `syncTenantFinance(tenantId)` (estrito ao tenant). Engatado em: `negotiations/[id]/finalize` (após gerar comissões), `.../return`, `.../warranty-sales`, `.../warranty-sales/[saleId]` (após recálculo). Não bloqueia o fluxo (try/catch). `syncFinanceFromBusiness(role,tenantId)` (endpoint manual) mantido.
- **(#2) Filtro de período:** `/api/reports/finance` aceita `from`/`to`; campo de data por view (fluxo=paidDate, contas a pagar/receber=dueDate, demais=competenceDate, "contas"=sem filtro). Novo componente `components/reports/PeriodFilter.tsx`; ligado em FinanceEntryListReport, FinanceResultReport e nas páginas inline visão-geral/dre/fluxo.
- **Validações:** `tsc` limpo; `npm test` 82/82 (mock ganhou deleteMany/updateMany/findFirst); `npm run build` OK. **Verificado no navegador (login Master):** backfill categorizou os lançamentos (Vendas/Comissões/Garantias); filtro de período confere via API (from=2026-06-01 → 0; ano 2026 → 1).
- **Observação p/ próxima IA:** sync é idempotente (@@unique + skipDuplicates) e reconcilia comissões PREVISTO. Manual entries (source=MANUAL) nunca são tocados pelo sync.

### LOG 0035 — 2026-06-15 — Claude (Opus 4.8) — FIX CRÍTICO middleware (prod) + busca textual no Financeiro
- **Branch:** main (worktree).
- **BUG CRÍTICO de PRODUÇÃO (o "This page couldn't load" do online):** `src/proxy.ts` (middleware do Next 16 — renomeado de middleware.ts) usava `withAuth` do next-auth v4, que **quebra no edge runtime de PRODUÇÃO** com `TypeError: Invalid URL` (`new URL('')` → ERR_INVALID_URL) em TODA rota protegida. Funcionava em `next dev` mas falhava em `next start`/Vercel (por isso só dava erro no online). **Reproduzido localmente com `npm run build && npm start`** (a chave p/ achar — dev esconde). **Corrigido:** reescrito sem `withAuth`, usando `getToken()` + `req.nextUrl.clone()` (sempre URL válida). Verificado em produção local: redireciona p/ login corretamente, sem crash.
  - **APRENDIZADO p/ próxima IA:** bug que só aparece no online → reproduzir com BUILD DE PRODUÇÃO local (`npm run build && npm start`), não só `npm run dev`. `next dev` é tolerante; prod é estrito.
- **Busca textual (#3 do pedido):** novo `entryTextSearch()` em finance-service (OR contains insensitive em description/counterparty/documentNumber + match de `amount` se numérico → cobre placa, negociação, nome, fornecedor, valor). Param `q` em `/api/finance/entries` e `/api/reports/finance` (views de lista). Componente `components/reports/SearchBox.tsx` (debounce 350ms) ligado em /financeiro/lancamentos e no FinanceEntryListReport (receitas/despesas/contas-a-pagar/contas-a-receber). **Verificado no navegador:** buscar placa "JKE2G14" filtrou 5→1.
- **Validações:** `tsc` limpo; lint 0 erros; `npm test` 82/82; `npm run build` OK; verificação visual prod (middleware) + dev (busca).

### LOG 0036 — 2026-06-16 — Claude (Opus 4.8) — SESSÃO AUTÔNOMA (usuário dormindo): avaliação + 404 + segurança
- **Branch:** main (worktree). Usuário autorizou trabalho autônomo noturno; escolheu **Google Gemini** como motor de leitura de documento.
- **404 da raiz (FIX):** criado `src/app/page.tsx` → redirect `/dashboard` (domínio puro caía em not-found). **ATENÇÃO:** precisa de `export const dynamic = 'force-dynamic'` senão o build estático quebra com `Invalid URL` (layout raiz toca next-auth no prerender). O 1º push (88ca755) NÃO tinha isso → build Vercel falharia; corrigido neste log.
- **Leitura de documento por IA (Gemini) — Fase A:** `src/lib/crlv/ai-extract.ts` (`extractWithAI`) chama `generativelanguage.googleapis.com` (modelo `GEMINI_MODEL` default gemini-2.0-flash) com o PDF/imagem inline + responseSchema → JSON estruturado dos campos do CRLV. **Degradação graciosa:** só ativa se `GEMINI_API_KEY` (ou `GOOGLE_API_KEY`) estiver no ambiente; senão cai no parser regex de PDF (imagem → mensagem). `extractFromCRLV` agora tenta IA primeiro (PDF E imagem), fallback regex. **AÇÃO DO USUÁRIO: definir `GEMINI_API_KEY` no .env e na Vercel para ligar a leitura por IA (PDF+imagem).**
- **Wizard "não avança" (FIX):** o botão "Próxima etapa" exigia `documentUploaded` (contradizendo o comentário "documento é opcional") — travava sem leitura. Removido; agora exige só os campos reais (placa, marca, modelo, unidade, condição) com tooltip dinâmico dos que faltam. Permite preenchimento manual e avança.
- **Segurança (auditoria):** 257 rotas de API — TODAS com guard (getServerAuthSession/getSessionUser/requireMaster/requireModule/CRON_SECRET); só `auth/*` e `webhook` públicas. Nenhum vazamento de API. Middleware (LOG 0035) bloqueia páginas sem login. **Falta (próxima fase):** guards de papel por página (RBAC defense-in-depth contra abrir tela de outro perfil via URL).
- **Validações:** `tsc` limpo; lint 0 erros; `npm test` 82/82; `npm run build` OK.
- **PRÓXIMAS FASES desta sessão:** (B) RBAC por página; (C) varredura geral de bugs via build de produção + smoke; (D) campos obrigatórios com indicadores visuais.

### LOG 0037 — 2026-06-16 — Claude (Opus 4.8) — Sessão autônoma Fase B/C: FURO DE SEGURANÇA + RBAC + varredura
- **Branch:** main (worktree).
- **🔴 FURO DE SEGURANÇA CRÍTICO (FIX):** o matcher do middleware (`src/proxy.ts`) excluía `cadastro` (página pública), mas o regex **prefix-matchava `cadastros/*`** (plural, PROTEGIDO) → todo o `/cadastros/*` (clientes, vendedores, gerentes, veículos, garantias, unidades, cargos, serviços) **ficava acessível SEM login** e crashava no SSR. Corrigido: `cadastro` → `cadastro(?=/|$)` (casa só o segmento exato). Verificado: `/cadastros/*` agora 307→login; `/cadastro` público segue 200.
- **RBAC defense-in-depth:** middleware agora bloqueia `/master/*` para papel ≠ MASTER (redireciona /inicio; fail-open se papel ausente p/ não trancar ninguém). Reforço contra abrir painel master pela barra de endereço.
- **Varredura de bugs (build de produção + 55 rotas via HTTP):** método = `npm run build && npm start` + curl checando 500. **Resultado: 0 crashes** (todas 200 público / 307 protegido).
- **Falso-positivo investigado (NÃO é bug de prod):** `/login` e `/cadastro` davam 500 no MEU `next start` local porque `process.env.NEXTAUTH_URL` chegava VAZIO no runtime (provável pelas aspas no .env: `NEXTAUTH_URL="..."`), e o next-auth faz `new URL('')` quando a var é string vazia (undefined cairia no default OK). Subindo com `NEXTAUTH_URL` explícito → 200. **Na Vercel é env var real → funciona** (usuário loga online). Para testar localmente: remover as aspas do NEXTAUTH_URL no .env ou exportar a var.
- **Validações:** `tsc` limpo; `npm test` 82/82; `npm run build` OK; varredura 55 rotas 0 crash.

### LOG 0038 — 2026-06-16 — Claude (Opus 4.8) — Sessão autônoma Fase D: campos obrigatórios visíveis na avaliação
- **Branch:** main (worktree).
- **Avaliação — campos obrigatórios "como sistema grande":** adicionado banner visível acima do botão "Próxima etapa" (etapa Veículo) que lista dinamicamente os campos obrigatórios faltantes (Placa, Marca, Modelo, Unidade, Condição) em amber, ou um "tudo certo, pode avançar" em verde. Reforça o que o tooltip já dizia. Documento/CRLV reforçado como OPCIONAL (IA preenche quando enviado).
- **Verificação:** página `/estoque/avaliacao` carrega 200 (autenticado Master), sem erros no log; step bar e step 0 renderizam. (Screenshot da etapa Veículo travou na automação — página pesada de FIPE — mas é só a captura; a rota responde 200.)
- **Validações:** `tsc` limpo; `npm test` 82/82; `npm run build` OK.
- **RESUMO DA SESSÃO AUTÔNOMA (LOGs 0036-0038):** 404 raiz, leitura IA Gemini (graceful), wizard destravado, campos obrigatórios visíveis, FURO de segurança /cadastros/* corrigido, RBAC /master, varredura 55 rotas 0 crash. **AÇÃO DO USUÁRIO: definir `GEMINI_API_KEY` na Vercel p/ ligar leitura de PDF+imagem por IA.**

### LOG 0039 — 2026-06-16 — Claude (Opus 4.8) — Limpeza de lint (código morto seguro)
- **Branch:** main (worktree).
- Removidos 9 `unused-vars` claramente mortos e isolados (sem efeito colateral, fora de fluxos sensíveis): `inferVehicleType`/`normalizePlate` (crlv/parser, órfãos pós-IA), `SELLER_ROLES` (negotiation-rbac), `MANAGER_ROLES` (api/pendencies), `SecretKey`/`SECRET_FULL_KEYS` (master/whatsapp), `MASKED` (master/integrations), `IdentityField` (master/system-identity), `isMaster` (pendencias/central). Lint **385→376** (0 erros).
- **NÃO mexido (proposital, sistema no ar):** `no-explicit-any` (~186) e `set-state-in-effect` (~128, padrão de loading já aceito como WARN) e `exhaustive-deps` (~13) — trocar em massa gera regressão; fazer per-feature quando tocar o código. Também pulei `unused-vars` em arquivos gigantes (negociacoes/nova 4575 linhas, avaliacao) e casos de risco (`session` de auth, props destructuradas).
- **Validações:** `tsc` limpo; `npm test` 87/87; `npm run build` OK.

### LOG 0040 — 2026-06-16 — Claude (Opus 4.8) — MÓDULO FINANCIAMENTO (FN) Fase FN-1: fundação
- **Branch:** main (worktree). Pedido do usuário: módulo de Financiamento (cadastro de proponentes + bancos + fichas/simulações/aprovadas/recusadas/relatórios). Decisão do usuário: **"Cadastro + relatórios primeiro"** — o ENVIO ao banco fica para depois. **NÃO construir** a automação oculta que lê a tela do banco imitando humano p/ não ser detectada (burla os bancos, risco de bloqueio/legal) — alternativas legítimas: API oficial, assistente Gemini VISÍVEL/supervisionado, ou registro manual + resultado.
- **FN-1 (esta entrega):** schema aditivo `prisma/schema.prisma` — enums `ProponentOccupation`(AUTONOMO/CLT/EMPRESARIO/APOSENTADO_PENSIONISTA), `FinanceProposalStatus`(SIMULACAO/ENVIADA/APROVADA/RECUSADA/CANCELADA); models `FinanceProponent` (dados pessoais+endereço+ocupação/renda+empresa+outrasRendas Json), `FinanceBank`, `FinanceProposal` (FK proponent/bank). Migration `20260616000000_add_financiamento` (**PENDENTE aplicar: `prisma migrate deploy`**). Permissões `financing`/`financing.manage` (vendas+gestão). Menu "Financiamento" (Proponentes/Bancos/Fichas/Simulações/Aprovadas/Recusadas/Relatórios) + 7 stubs PlaceholderPage (não tocam DB → funcionam sem migration).
- **Reuso:** CEP via `/api/address/lookup-by-cep`, CNPJ via `/api/companies/lookup` (já existem) — usar no form FN-2.
- **Validações:** `tsc` limpo; `npm test` 87/87; `npm run build` OK (rotas /financiamento/* registradas).
- **PRÓXIMAS FASES:** FN-2 form profissional de proponente (condicional por ocupação, CEP/CNPJ auto, campos obrigatórios) + CRUD; FN-3 bancos CRUD; FN-4 fichas/simulações + status; FN-5 relatórios. **AÇÃO USUÁRIO: aplicar a migration no banco.**

### LOG 0041 — 2026-06-16 — Claude (Opus 4.8) — Financiamento FN-2: cadastro de proponentes
- **Branch:** main (worktree).
- **Arquivos:** `validators/financing.ts` (zod com superRefine condicional por ocupação), `/api/financing/proponents` (GET busca ?q= nome/cpf/email/celular + POST) e `/[id]` (GET/PATCH/DELETE), e a página `/(dashboard)/financiamento/proponentes` (substituiu o stub).
- **Formulário profissional:** seções Dados pessoais / Endereço / Ocupação+Renda / Empresa (condicional) / Outras rendas (dinâmicas) / Observações. Obrigatórios com asterisco; **CEP automático** (residencial e empresa via `/api/address/lookup-by-cep`), **CNPJ automático** (empresário via `/api/companies/lookup` → preenche nome+endereço). Máscaras CPF/CNPJ/telefone/CEP/BRL. Validação condicional: AUTONOMO→cargo, CLT→empresa, EMPRESARIO→CNPJ+nome, APOSENTADO→benefício; renda sempre obrigatória. Busca na lista. Gating financing/financing.manage, tenant-scoped, auditoria.
- **Validações:** `tsc` limpo; lint 1 warning advisory; `npm test` 87/87; `npm run build` OK.
- **PRÓXIMO:** FN-3 bancos CRUD; FN-4 fichas/simulações; FN-5 relatórios. Migration FN-1 ainda PENDENTE de aplicar (o cadastro só funciona após `migrate deploy`).

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
- [x] **Fase 9 — Testes de integração de rotas** — CONCLUÍDO no LOG 0014 (11 testes com prisma/auth mockados; RBAC + isolamento de tenant). Opcional: e2e com banco real.
- [x] **DECISÃO RESOLVIDA (LOG 0008):** GERENTE_ADMINISTRATIVO tem acesso à administração da empresa → adicionado a goals/goals.manage/ranking/ranking.configure.

### Agregadores (Metas/Ranking) — CONCLUÍDO (LOG 0003)
- [x] `EXTENDED_WARRANTY` conta `WarrantySale` ATIVA; `RETURN` conta deals com `returnNetValue > 0`. Não são mais provisórios.

### Base — DÍVIDA TÉCNICA
- [x] Lint: 0 ERROS (`npm run lint` passa); artefato eslint-report.json removido; auto-fixes aplicados (LOG 0010).
- [~] WARNINGS legados — sweeps mecânicos seguros CONCLUÍDOS (entidades=0 LOG 0011; imports mortos+plugin LOG 0012; anonymous-export LOG 0015). Restam 372 sem sweep seguro: 186 `no-explicit-any` (tipagem manual por arquivo), 105 `set-state-in-effect` (intencional/advisory), 75 unused-vars (julgamento), 6 exhaustive-deps (arriscado). Tratar oportunisticamente — ver LOG 0015.
