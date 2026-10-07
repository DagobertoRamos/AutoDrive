-- Etapa e datas do contrato de financiamento (F&I) até o crédito do banco.
-- Só adição, idempotente.

CREATE TABLE IF NOT EXISTS "finance_contract_tracks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'ENVIADO',
    "proposalNumber" TEXT,
    "approvedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "sentToBankAt" TIMESTAMP(3),
    "expectedCreditAt" TIMESTAMP(3),
    "creditedAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_contract_tracks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "finance_contract_tracks_paymentId_key" ON "finance_contract_tracks"("paymentId");
CREATE INDEX IF NOT EXISTS "finance_contract_tracks_tenantId_stage_idx" ON "finance_contract_tracks"("tenantId", "stage");
