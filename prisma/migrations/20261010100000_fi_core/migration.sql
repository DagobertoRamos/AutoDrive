-- F&I Core (ficha universal, tentativa por banco, formalização, gravame,
-- pagamento do banco, portal do cliente, deduplicação de webhook, LGPD).
-- Somente ADITIVA e idempotente (pode rodar de novo sem efeito).
ALTER TYPE "FinanceProposalStatus" ADD VALUE IF NOT EXISTS 'PREENCHENDO';
ALTER TYPE "FinanceProposalStatus" ADD VALUE IF NOT EXISTS 'EM_ANALISE';
ALTER TYPE "FinanceProposalStatus" ADD VALUE IF NOT EXISTS 'PRE_APROVADA';
ALTER TYPE "FinanceProposalStatus" ADD VALUE IF NOT EXISTS 'EXPIRADA';

-- AlterTable
ALTER TABLE "finance_banks" ADD COLUMN IF NOT EXISTS "adapterKey" TEXT;

-- AlterTable
ALTER TABLE "finance_consents" ADD COLUMN IF NOT EXISTS "legalBasis" TEXT,
ADD COLUMN IF NOT EXISTS "origin" TEXT,
ADD COLUMN IF NOT EXISTS "privacyVersion" TEXT,
ADD COLUMN IF NOT EXISTS "proposalId" TEXT,
ADD COLUMN IF NOT EXISTS "purpose" TEXT,
ADD COLUMN IF NOT EXISTS "sharedWith" JSONB,
ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

-- AlterTable
ALTER TABLE "finance_integration_logs" ADD COLUMN IF NOT EXISTS "adapterKey" TEXT,
ADD COLUMN IF NOT EXISTS "attempt" INTEGER,
ADD COLUMN IF NOT EXISTS "correlationId" TEXT,
ADD COLUMN IF NOT EXISTS "errorCode" TEXT,
ADD COLUMN IF NOT EXISTS "proposalId" TEXT,
ADD COLUMN IF NOT EXISTS "submissionId" TEXT;

-- AlterTable
ALTER TABLE "finance_proponents" ADD COLUMN IF NOT EXISTS "atividade" TEXT,
ADD COLUMN IF NOT EXISTS "cnh" TEXT,
ADD COLUMN IF NOT EXISTS "cnpj" TEXT,
ADD COLUMN IF NOT EXISTS "customerId" TEXT,
ADD COLUMN IF NOT EXISTS "dataFundacao" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "estadoCivil" TEXT,
ADD COLUMN IF NOT EXISTS "faturamentoMensal" DECIMAL(14,2),
ADD COLUMN IF NOT EXISTS "nacionalidade" TEXT,
ADD COLUMN IF NOT EXISTS "naturalidade" TEXT,
ADD COLUMN IF NOT EXISTS "nomeFantasia" TEXT,
ADD COLUMN IF NOT EXISTS "personId" TEXT,
ADD COLUMN IF NOT EXISTS "personType" TEXT NOT NULL DEFAULT 'PF',
ADD COLUMN IF NOT EXISTS "profissao" TEXT,
ADD COLUMN IF NOT EXISTS "razaoSocial" TEXT,
ADD COLUMN IF NOT EXISTS "referencias" JSONB,
ADD COLUMN IF NOT EXISTS "representanteCpf" TEXT,
ADD COLUMN IF NOT EXISTS "representanteNome" TEXT,
ADD COLUMN IF NOT EXISTS "rgOrgao" TEXT,
ADD COLUMN IF NOT EXISTS "socios" JSONB,
ADD COLUMN IF NOT EXISTS "tempoEmpregoMeses" INTEGER,
ADD COLUMN IF NOT EXISTS "tempoResidenciaMeses" INTEGER,
ADD COLUMN IF NOT EXISTS "tipoResidencia" TEXT;

-- AlterTable
ALTER TABLE "finance_proposal_documents" ADD COLUMN IF NOT EXISTS "extracted" JSONB,
ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
ADD COLUMN IF NOT EXISTS "retainUntil" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER,
ADD COLUMN IF NOT EXISTS "source" TEXT,
ADD COLUMN IF NOT EXISTS "storageKey" TEXT,
ADD COLUMN IF NOT EXISTS "submissionId" TEXT,
ADD COLUMN IF NOT EXISTS "uploadedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "finance_proposal_events" ADD COLUMN IF NOT EXISTS "data" JSONB;

-- AlterTable
ALTER TABLE "finance_proposal_submissions" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "approvedAmount" DECIMAL(14,2),
ADD COLUMN IF NOT EXISTS "attemptVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "cetMonthly" DECIMAL(8,4),
ADD COLUMN IF NOT EXISTS "cetYearly" DECIMAL(8,4),
ADD COLUMN IF NOT EXISTS "errorMessage" TEXT,
ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
ADD COLUMN IF NOT EXISTS "installmentValue" DECIMAL(14,2),
ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN IF NOT EXISTS "offerDownPayment" DECIMAL(14,2),
ADD COLUMN IF NOT EXISTS "offerInstallments" INTEGER,
ADD COLUMN IF NOT EXISTS "pendingItems" JSONB,
ADD COLUMN IF NOT EXISTS "rateMonthly" DECIMAL(8,4),
ADD COLUMN IF NOT EXISTS "requestId" TEXT,
ADD COLUMN IF NOT EXISTS "respondedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "returnPercent" DECIMAL(6,2),
ADD COLUMN IF NOT EXISTS "statusReason" TEXT,
ADD COLUMN IF NOT EXISTS "tacValue" DECIMAL(14,2),
ADD COLUMN IF NOT EXISTS "terms" JSONB,
ADD COLUMN IF NOT EXISTS "totalAmount" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "finance_proposals" ADD COLUMN IF NOT EXISTS "coProponentId" TEXT,
ADD COLUMN IF NOT EXISTS "code" TEXT,
ADD COLUMN IF NOT EXISTS "contractNumber" TEXT,
ADD COLUMN IF NOT EXISTS "contractSignedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "customerId" TEXT,
ADD COLUMN IF NOT EXISTS "dealPaymentId" TEXT,
ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "formalizationStatus" TEXT NOT NULL DEFAULT 'NAO_INICIADA',
ADD COLUMN IF NOT EXISTS "fundedAmount" DECIMAL(14,2),
ADD COLUMN IF NOT EXISTS "fundedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "fundingExpectedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "fundingRequestedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "fundingStatus" TEXT NOT NULL DEFAULT 'NAO_ESPERADO',
ADD COLUMN IF NOT EXISTS "leadId" TEXT,
ADD COLUMN IF NOT EXISTS "lienRegisteredAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lienStatus" TEXT NOT NULL DEFAULT 'NAO_INICIADO',
ADD COLUMN IF NOT EXISTS "origin" TEXT DEFAULT 'INTERNO',
ADD COLUMN IF NOT EXISTS "originMeta" JSONB,
ADD COLUMN IF NOT EXISTS "portalTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "portalTokenHash" TEXT,
ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "selectedSubmissionId" TEXT,
ADD COLUMN IF NOT EXISTS "vehicleId" TEXT,
ADD COLUMN IF NOT EXISTS "vehicleValue" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "finance_webhook_events" ADD COLUMN IF NOT EXISTS "eventId" TEXT,
ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "submissionId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "finance_integration_logs_submissionId_idx" ON "finance_integration_logs"("submissionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "finance_proponents_cnpj_idx" ON "finance_proponents"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "finance_proposal_submissions_idempotencyKey_key" ON "finance_proposal_submissions"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "finance_proposal_submissions_providerId_externalId_idx" ON "finance_proposal_submissions"("providerId", "externalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "finance_proposal_submissions_tenantId_status_idx" ON "finance_proposal_submissions"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "finance_proposals_portalTokenHash_key" ON "finance_proposals"("portalTokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "finance_proposals_tenantId_status_updatedAt_idx" ON "finance_proposals"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "finance_proposals_tenantId_fundingStatus_idx" ON "finance_proposals"("tenantId", "fundingStatus");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "finance_proposals_leadId_idx" ON "finance_proposals"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "finance_proposals_tenantId_code_key" ON "finance_proposals"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "finance_webhook_events_provider_eventId_key" ON "finance_webhook_events"("provider", "eventId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_proposals_coProponentId_fkey') THEN
    ALTER TABLE "finance_proposals" ADD CONSTRAINT "finance_proposals_coProponentId_fkey" FOREIGN KEY ("coProponentId") REFERENCES "finance_proponents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Snapshot de retorno: existia só como SQL solto (prisma/20260702173000_...sql),
-- fora de prisma/migrations. Garantido aqui de forma idempotente.
CREATE TABLE IF NOT EXISTS "return_calculation_snapshots" (
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

CREATE INDEX IF NOT EXISTS "return_calculation_snapshots_tenantId_idx" ON "return_calculation_snapshots"("tenantId");
CREATE INDEX IF NOT EXISTS "return_calculation_snapshots_negotiationId_idx" ON "return_calculation_snapshots"("negotiationId");
CREATE INDEX IF NOT EXISTS "return_calculation_snapshots_calculatedAt_idx" ON "return_calculation_snapshots"("calculatedAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_calculation_snapshots_negotiationId_fkey') THEN
    ALTER TABLE "return_calculation_snapshots" ADD CONSTRAINT "return_calculation_snapshots_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
