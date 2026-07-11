-- =============================================================================
-- AutoConf Importer V2 — Fase 2 — migration ADITIVA
-- Habilita upsert por-filho + sourceHash por seção + catálogo canônico.
-- 100% aditivo: colunas novas nullable, unique index parciais (só valem quando
-- externalId presente), tabela nova. Nenhum dado existente é alterado.
-- Aplicar MANUALMENTE na Neon (o build não roda migrate).
-- =============================================================================

-- Deal: hashes por-seção do snapshot importado
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "sourceSectionHashes" JSONB;

-- DealVehicle: ID externo + source
ALTER TABLE "deal_vehicles" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "deal_vehicles" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE INDEX IF NOT EXISTS "deal_vehicles_externalId_idx" ON "deal_vehicles" ("externalId");
-- Unique só quando externalId presente (import legado sem ID não bloqueia).
CREATE UNIQUE INDEX IF NOT EXISTS "deal_vehicles_source_ext_uk"
  ON "deal_vehicles" ("dealId", "source", "externalId")
  WHERE "externalId" IS NOT NULL;

-- DealPayment: ID externo + source
ALTER TABLE "deal_payments" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "deal_payments" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE INDEX IF NOT EXISTS "deal_payments_externalId_idx" ON "deal_payments" ("externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "deal_payments_source_ext_uk"
  ON "deal_payments" ("dealId", "source", "externalId")
  WHERE "externalId" IS NOT NULL;

-- DealDebt: ID externo + source
ALTER TABLE "deal_debts" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "deal_debts" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE INDEX IF NOT EXISTS "deal_debts_externalId_idx" ON "deal_debts" ("externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "deal_debts_source_ext_uk"
  ON "deal_debts" ("dealId", "source", "externalId")
  WHERE "externalId" IS NOT NULL;

-- Catálogo canônico AutoConf (Gestauto + tipos de débito). Preserva SEMPRE
-- o nome/código originais; unknown vira category=OTHER até admin mapear.
CREATE TABLE IF NOT EXISTS "autoconf_product_map" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "externalTipoDebitoId" TEXT,
  "externalProdutoId" TEXT,
  "externalLabel" TEXT NOT NULL,
  "canonicalCategory" TEXT NOT NULL DEFAULT 'OTHER',
  "canonicalProductId" TEXT,
  "autoMapped" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "autoconf_product_map_uk"
  ON "autoconf_product_map" ("tenantId", "sourceSystem", "externalTipoDebitoId", "externalProdutoId");
CREATE INDEX IF NOT EXISTS "autoconf_product_map_tenantId_idx"
  ON "autoconf_product_map" ("tenantId");
CREATE INDEX IF NOT EXISTS "autoconf_product_map_tenantId_sourceSystem_idx"
  ON "autoconf_product_map" ("tenantId", "sourceSystem");
