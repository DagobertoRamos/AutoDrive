-- =============================================================================
-- Correção do fluxo de importação planilha → negociação oficial
--
-- 1. Adiciona coluna `source` em deals (se não existir)
-- 2. Reseta sheet_import_rows presas em PROCESSANDO → PENDENTE
-- 3. Garante índice para busca por tenantId+externalId em deals
-- =============================================================================

-- ── 1. Coluna source em deals (para distinguir origem: MANUAL, PLANILHA, API) ─
ALTER TABLE "deals"
  ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'MANUAL';

-- Atualiza deals importados de planilha que ainda estão sem source
-- (identifica pelo campo notes que contém a assinatura do importador)
UPDATE "deals"
SET "source" = 'PLANILHA'
WHERE "source" = 'MANUAL'
  AND "notes" LIKE '%Negociação importada da planilha%';

-- ── 2. Reseta sheet_import_rows presas em PROCESSANDO → PENDENTE ──────────────
-- Rows que ficaram em PROCESSANDO após falha/interrupção nunca serão reprocessadas
-- O deal processor só processa PENDENTE — este reset garante reprocessamento
UPDATE "sheet_import_rows"
SET "status"       = 'PENDENTE',
    "errorMessage" = NULL,
    "processedAt"  = NULL
WHERE "status" = 'PROCESSANDO';

-- ── 3. Índice composto tenantId + externalId (dedup do deal processor) ─────────
CREATE INDEX IF NOT EXISTS "deals_tenantId_externalId_idx" ON "deals"("tenantId", "externalId");

-- ── 4. Índice em pendencies para busca de órfãs ───────────────────────────────
CREATE INDEX IF NOT EXISTS "pendencies_source_dealId_idx" ON "pendencies"("source", "dealId");
