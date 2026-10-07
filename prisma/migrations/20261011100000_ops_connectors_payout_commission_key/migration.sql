-- Conectores das lojas (RENAVE, fiscal, transferência, consulta veicular), consultas
-- de débitos/restrições, repasse do consignado e chave única de comissão.
-- Só adição, idempotente.

ALTER TABLE "commission_calculations" ADD COLUMN IF NOT EXISTS "dedupKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "commission_calculations_dedupKey_key" ON "commission_calculations"("dedupKey");

ALTER TABLE "consignment_contracts" ADD COLUMN IF NOT EXISTS "payoutDays" INTEGER;
ALTER TABLE "consignment_contracts" ADD COLUMN IF NOT EXISTS "payoutDueAt" TIMESTAMP(3);
ALTER TABLE "consignment_contracts" ADD COLUMN IF NOT EXISTS "payoutEntryId" TEXT;
ALTER TABLE "consignment_contracts" ADD COLUMN IF NOT EXISTS "salePrice" DECIMAL(12,2);
ALTER TABLE "consignment_contracts" ADD COLUMN IF NOT EXISTS "soldAt" TIMESTAMP(3);
ALTER TABLE "consignment_contracts" ADD COLUMN IF NOT EXISTS "saleDealId" TEXT;

CREATE TABLE IF NOT EXISTS "integration_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "scopeKey" TEXT NOT NULL DEFAULT 'ALL',
    "domain" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'PRODUCAO',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "secretsEncrypted" TEXT,
    "maskedHints" JSONB,
    "settings" JSONB,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastError" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "integration_connections_tenantId_domain_providerId_scopeKey_key" ON "integration_connections"("tenantId", "domain", "providerId", "scopeKey");
CREATE INDEX IF NOT EXISTS "integration_connections_tenantId_domain_status_idx" ON "integration_connections"("tenantId", "domain", "status");

CREATE TABLE IF NOT EXISTS "vehicle_data_queries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "evaluationId" TEXT,
    "plate" TEXT,
    "renavam" TEXT,
    "chassi" TEXT,
    "uf" TEXT,
    "providerId" TEXT NOT NULL,
    "connectionId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'FULL',
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "debtsTotal" DECIMAL(12,2),
    "debtsCount" INTEGER NOT NULL DEFAULT 0,
    "restrictionsCount" INTEGER NOT NULL DEFAULT 0,
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "result" JSONB,
    "errorMessage" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "vehicle_data_queries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "vehicle_data_queries_tenantId_vehicleId_createdAt_idx" ON "vehicle_data_queries"("tenantId", "vehicleId", "createdAt");
CREATE INDEX IF NOT EXISTS "vehicle_data_queries_tenantId_plate_idx" ON "vehicle_data_queries"("tenantId", "plate");
