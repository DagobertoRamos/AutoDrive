-- Manual migration fallback.
-- Intended Prisma migration directory:
-- prisma/migrations/20260702173000_add_return_calculation_snapshots/migration.sql

CREATE TABLE "return_calculation_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "financingId" TEXT,
    "baseAmount" DECIMAL(14,2) NOT NULL,
    "returnPercent" DECIMAL(7,4) NOT NULL,
    "returnMinPercent" DECIMAL(7,4) NOT NULL,
    "returnMaxPercent" DECIMAL(7,4) NOT NULL,
    "grossReturnAmount" DECIMAL(14,2) NOT NULL,
    "ilaSettingId" TEXT,
    "ilaCompetenceMonth" INTEGER,
    "ilaCompetenceYear" INTEGER,
    "ilaPercent" DECIMAL(7,4),
    "ilaDiscountAmount" DECIMAL(14,2) NOT NULL,
    "iofRuleId" TEXT,
    "iofStartDate" TIMESTAMP(3),
    "iofEndDate" TIMESTAMP(3),
    "iofPercent" DECIMAL(7,4),
    "iofDiscountAmount" DECIMAL(14,2) NOT NULL,
    "netReturnAmount" DECIMAL(14,2) NOT NULL,
    "commissionBaseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "operationDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CALCULADO',
    "calculatedBy" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settingsVersion" TEXT,
    "snapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_calculation_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "return_calculation_snapshots_tenantId_idx" ON "return_calculation_snapshots"("tenantId");
CREATE INDEX "return_calculation_snapshots_negotiationId_idx" ON "return_calculation_snapshots"("negotiationId");
CREATE INDEX "return_calculation_snapshots_calculatedAt_idx" ON "return_calculation_snapshots"("calculatedAt");

ALTER TABLE "return_calculation_snapshots"
ADD CONSTRAINT "return_calculation_snapshots_negotiationId_fkey"
FOREIGN KEY ("negotiationId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
