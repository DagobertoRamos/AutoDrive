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

**Onde paramos (último estado):** núcleo completo (Metas, Ranking, Retorno/Garantia, Comissões, Avisos), testes 45/45, build OK, lint 0 erros. Menu enxugado (Configurações = Loja/Identidade/Perfil; placeholders com badge "em breve"). Fronteira MASTER(global)×ADM(tenant) aplicada. **Relatórios sobre dados existentes CONCLUÍDOS = 27 telas** — Estoque (6), Negociações (4), Comissões (4), Pendências (5), Comunicação (4), Auditoria (4). Resta só **Financeiro** (11 telas) que **exige novos models** (projeto à parte — alinhar com usuário).

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
