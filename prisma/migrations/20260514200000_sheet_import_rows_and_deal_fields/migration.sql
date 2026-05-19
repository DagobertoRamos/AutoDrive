-- =============================================================================
-- Migration: sheet_import_rows + deal/pendency/contract deal fields
-- Adds staging table for sheet rows and links them to Deals
-- =============================================================================

-- SheetRowStatus enum
CREATE TYPE "SheetRowStatus" AS ENUM (
  'PENDENTE',
  'PROCESSANDO',
  'NEGOCIACAO_CRIADA',
  'NEGOCIACAO_ATUALIZADA',
  'IGNORADA',
  'ERRO',
  'AGUARDANDO_CONFERENCIA'
);

-- SheetImportRow staging table
CREATE TABLE "sheet_import_rows" (
  "id"             TEXT NOT NULL,
  "configId"       TEXT NOT NULL,
  "tabId"          TEXT,
  "sheetName"      TEXT NOT NULL,
  "rowIndex"       INTEGER NOT NULL,
  "referenceMonth" TEXT,
  "rawData"        JSONB NOT NULL,
  "externalId"     TEXT,
  "dedupeKey"      TEXT,
  "customerName"   TEXT,
  "sellerName"     TEXT,
  "plate"          TEXT,
  "vehicleModel"   TEXT,
  "saleDate"       TEXT,
  "statusMain"     TEXT,
  "statusDetail"   TEXT,
  "saleValue"      TEXT,
  "docValue"       TEXT,
  "financedValue"  TEXT,
  "bank"           TEXT,
  "returnType"     TEXT,
  "dealType"       TEXT,
  "timeInStock"    TEXT,
  "status"         "SheetRowStatus" NOT NULL DEFAULT 'PENDENTE',
  "dealId"         TEXT,
  "errorMessage"   TEXT,
  "warningMessage" TEXT,
  "processedAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sheet_import_rows_pkey" PRIMARY KEY ("id")
);

-- Indexes for sheet_import_rows
CREATE INDEX "sheet_import_rows_configId_status_idx"    ON "sheet_import_rows"("configId", "status");
CREATE INDEX "sheet_import_rows_dedupeKey_idx"          ON "sheet_import_rows"("dedupeKey");
CREATE INDEX "sheet_import_rows_dealId_idx"             ON "sheet_import_rows"("dealId");
CREATE INDEX "sheet_import_rows_configId_sheet_ext_idx" ON "sheet_import_rows"("configId", "sheetName", "externalId");

-- FK: sheet_import_rows → google_sheet_configs
ALTER TABLE "sheet_import_rows"
  ADD CONSTRAINT "sheet_import_rows_configId_fkey"
  FOREIGN KEY ("configId") REFERENCES "google_sheet_configs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: sheet_import_rows → deals (nullable)
ALTER TABLE "sheet_import_rows"
  ADD CONSTRAINT "sheet_import_rows_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "deals"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Deal: add sheet-origin fields ────────────────────────────────────────────
ALTER TABLE "deals"
  ADD COLUMN IF NOT EXISTS "externalId"          TEXT,
  ADD COLUMN IF NOT EXISTS "saleDate"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sellerNameFromSheet" TEXT,
  ADD COLUMN IF NOT EXISTS "isSellerProvisional" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "deals_externalId_idx" ON "deals"("externalId");

-- ── Pendency: add dealId ──────────────────────────────────────────────────────
ALTER TABLE "pendencies"
  ADD COLUMN IF NOT EXISTS "dealId" TEXT;

CREATE INDEX IF NOT EXISTS "pendencies_dealId_idx" ON "pendencies"("dealId");

ALTER TABLE "pendencies"
  ADD CONSTRAINT "pendencies_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "deals"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Contract: add dealId ──────────────────────────────────────────────────────
ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "dealId" TEXT;

CREATE INDEX IF NOT EXISTS "contracts_dealId_idx" ON "contracts"("dealId");

ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "deals"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
