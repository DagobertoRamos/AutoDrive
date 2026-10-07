-- Conciliação bancária (linhas de extrato OFX/CSV) e aprovação de pagamentos por
-- alçada. Só adições, idempotente (pode rodar de novo sem efeito).

CREATE TABLE IF NOT EXISTS "bank_statement_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "document" TEXT,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "matchedEntryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchedAt" TIMESTAMP(3),
    "matchedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "bank_statement_lines_tenantId_fingerprint_key" ON "bank_statement_lines"("tenantId", "fingerprint");
CREATE INDEX IF NOT EXISTS "bank_statement_lines_tenantId_accountId_status_idx" ON "bank_statement_lines"("tenantId", "accountId", "status");
CREATE INDEX IF NOT EXISTS "bank_statement_lines_tenantId_date_idx" ON "bank_statement_lines"("tenantId", "date");

CREATE TABLE IF NOT EXISTS "financial_approvals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_approvals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "financial_approvals_entryId_key" ON "financial_approvals"("entryId");
CREATE INDEX IF NOT EXISTS "financial_approvals_tenantId_status_idx" ON "financial_approvals"("tenantId", "status");
