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

---

## TAREFAS PENDENTES
> **Não alterar sem autorização do usuário.** Marcar `[em andamento]` ao iniciar e mover para LOG ao concluir.

### Retorno + Garantia (Fase D — UI) — PARCIAL
- [x] **Painel da negociação** — CONCLUÍDO no LOG 0002 (componentes ReturnPanel + WarrantySalesPanel montados na aba "valores"). Falta verificação visual no navegador.
- [ ] **Views de comissão** (`/comissoes/retornos`, `/comissoes/garantias`, extrato): exibir comissões de RETORNO e GARANTIA (já categorizadas pelo motor).
- [ ] **Verificação visual** do cadastro de garantias e do painel no navegador.

### Metas + Ranking — PENDENTE
- [x] Tela de **configuração de pesos do ranking** — CONCLUÍDO no LOG 0003 (`/ranking/configuracao`).
- [ ] **Páginas de Ranking** dedicadas (geral/unidade) além do `/desempenho`.
- [ ] **Fase 5 — Avisos de meta** (meta abaixo do esperado → integrar a Pendências/Notificações).
- [ ] **Fase 9 — Testes automatizados** (permissões, isolamento tenant, progressão de meta, desempate, retorno/garantia) e docs.

### Agregadores (Metas/Ranking) — CONCLUÍDO (LOG 0003)
- [x] `EXTENDED_WARRANTY` conta `WarrantySale` ATIVA; `RETURN` conta deals com `returnNetValue > 0`. Não são mais provisórios.

### Base — DÍVIDA TÉCNICA
- [ ] Limpeza do **lint legado** (~33 erros + ~473 warnings pré-existentes; não mascarar regras de correção react-hooks).
