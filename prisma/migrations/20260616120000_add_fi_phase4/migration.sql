-- AutoDrive — F&I Fase 4 (aditivo). Novas tabelas; não altera tabelas existentes.

-- CreateEnum
CREATE TYPE "FinanceProviderKind" AS ENUM ('CREDERE', 'BANCO_DIRETO', 'INTEGRADOR', 'MANUAL', 'OUTRO');
CREATE TYPE "FinanceEnvironment" AS ENUM ('HOMOLOGACAO', 'PRODUCAO');

-- CreateTable
CREATE TABLE "finance_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FinanceProviderKind" NOT NULL DEFAULT 'MANUAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "baseUrlHomolog" TEXT,
    "baseUrlProd" TEXT,
    "apiVersion" TEXT,
    "supportsSimulate" BOOLEAN NOT NULL DEFAULT false,
    "supportsSubmit" BOOLEAN NOT NULL DEFAULT false,
    "supportsWebhook" BOOLEAN NOT NULL DEFAULT false,
    "supportsStatus" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_providers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_provider_banks" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_provider_banks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_tenant_integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "environment" "FinanceEnvironment" NOT NULL DEFAULT 'HOMOLOGACAO',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "storeCode" TEXT,
    "webhookActive" BOOLEAN NOT NULL DEFAULT false,
    "lastTestAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_tenant_integrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_credentials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT,
    "bankId" TEXT,
    "label" TEXT,
    "environment" "FinanceEnvironment" NOT NULL DEFAULT 'HOMOLOGACAO',
    "secretsEncrypted" TEXT,
    "maskedHints" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_bank_priorities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rule" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_bank_priorities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_routing_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "bankId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_routing_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_return_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankId" TEXT,
    "percent" DECIMAL(6,2),
    "fixedValue" DECIMAL(14,2),
    "minInstallments" INTEGER,
    "maxInstallments" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_return_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT,
    "defaultValue" DECIMAL(14,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_product_sales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT,
    "proposalId" TEXT,
    "description" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_product_sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_consents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proponentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "grantedAt" TIMESTAMP(3),
    "ip" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_simulations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proponentId" TEXT,
    "vehicle" TEXT,
    "vehicleValue" DECIMAL(14,2),
    "downPayment" DECIMAL(14,2),
    "financedAmount" DECIMAL(14,2),
    "installments" INTEGER,
    "sellerId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_simulations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_simulation_options" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "bankId" TEXT,
    "installments" INTEGER,
    "installmentValue" DECIMAL(14,2),
    "rate" DECIMAL(8,4),
    "cet" DECIMAL(8,4),
    "estimatedReturn" DECIMAL(14,2),
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_simulation_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_proposal_submissions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "bankId" TEXT,
    "providerId" TEXT,
    "environment" "FinanceEnvironment" NOT NULL DEFAULT 'HOMOLOGACAO',
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ENVIADA',
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_proposal_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_proposal_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "proposalId" TEXT,
    "submissionId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT,
    "message" TEXT,
    "source" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_proposal_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_proposal_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposalId" TEXT,
    "proponentId" TEXT,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_proposal_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_webhook_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "provider" TEXT,
    "externalId" TEXT,
    "signatureValid" BOOLEAN,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_integration_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "providerId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT,
    "durationMs" INTEGER,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_integration_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_provider_banks_providerId_idx" ON "finance_provider_banks"("providerId");
CREATE INDEX "finance_tenant_integrations_tenantId_idx" ON "finance_tenant_integrations"("tenantId");
CREATE INDEX "finance_tenant_integrations_providerId_idx" ON "finance_tenant_integrations"("providerId");
CREATE INDEX "finance_credentials_tenantId_idx" ON "finance_credentials"("tenantId");
CREATE INDEX "finance_credentials_bankId_idx" ON "finance_credentials"("bankId");
CREATE UNIQUE INDEX "finance_bank_priorities_tenantId_bankId_key" ON "finance_bank_priorities"("tenantId", "bankId");
CREATE INDEX "finance_bank_priorities_tenantId_idx" ON "finance_bank_priorities"("tenantId");
CREATE INDEX "finance_routing_rules_tenantId_idx" ON "finance_routing_rules"("tenantId");
CREATE INDEX "finance_return_rules_tenantId_idx" ON "finance_return_rules"("tenantId");
CREATE INDEX "finance_return_rules_bankId_idx" ON "finance_return_rules"("bankId");
CREATE INDEX "finance_products_tenantId_idx" ON "finance_products"("tenantId");
CREATE INDEX "finance_product_sales_tenantId_idx" ON "finance_product_sales"("tenantId");
CREATE INDEX "finance_product_sales_proposalId_idx" ON "finance_product_sales"("proposalId");
CREATE INDEX "finance_consents_tenantId_idx" ON "finance_consents"("tenantId");
CREATE INDEX "finance_consents_proponentId_idx" ON "finance_consents"("proponentId");
CREATE INDEX "finance_simulations_tenantId_idx" ON "finance_simulations"("tenantId");
CREATE INDEX "finance_simulations_proponentId_idx" ON "finance_simulations"("proponentId");
CREATE INDEX "finance_simulation_options_simulationId_idx" ON "finance_simulation_options"("simulationId");
CREATE INDEX "finance_proposal_submissions_tenantId_idx" ON "finance_proposal_submissions"("tenantId");
CREATE INDEX "finance_proposal_submissions_proposalId_idx" ON "finance_proposal_submissions"("proposalId");
CREATE INDEX "finance_proposal_submissions_externalId_idx" ON "finance_proposal_submissions"("externalId");
CREATE INDEX "finance_proposal_events_proposalId_idx" ON "finance_proposal_events"("proposalId");
CREATE INDEX "finance_proposal_events_submissionId_idx" ON "finance_proposal_events"("submissionId");
CREATE INDEX "finance_proposal_documents_tenantId_idx" ON "finance_proposal_documents"("tenantId");
CREATE INDEX "finance_proposal_documents_proposalId_idx" ON "finance_proposal_documents"("proposalId");
CREATE INDEX "finance_proposal_documents_proponentId_idx" ON "finance_proposal_documents"("proponentId");
CREATE INDEX "finance_webhook_events_processed_idx" ON "finance_webhook_events"("processed");
CREATE INDEX "finance_webhook_events_externalId_idx" ON "finance_webhook_events"("externalId");
CREATE INDEX "finance_integration_logs_tenantId_idx" ON "finance_integration_logs"("tenantId");
CREATE INDEX "finance_integration_logs_providerId_idx" ON "finance_integration_logs"("providerId");
CREATE INDEX "finance_integration_logs_createdAt_idx" ON "finance_integration_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "finance_provider_banks" ADD CONSTRAINT "finance_provider_banks_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "finance_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_tenant_integrations" ADD CONSTRAINT "finance_tenant_integrations_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "finance_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_credentials" ADD CONSTRAINT "finance_credentials_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "finance_tenant_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_product_sales" ADD CONSTRAINT "finance_product_sales_productId_fkey" FOREIGN KEY ("productId") REFERENCES "finance_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_product_sales" ADD CONSTRAINT "finance_product_sales_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "finance_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_consents" ADD CONSTRAINT "finance_consents_proponentId_fkey" FOREIGN KEY ("proponentId") REFERENCES "finance_proponents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_simulations" ADD CONSTRAINT "finance_simulations_proponentId_fkey" FOREIGN KEY ("proponentId") REFERENCES "finance_proponents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_simulation_options" ADD CONSTRAINT "finance_simulation_options_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "finance_simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_proposal_submissions" ADD CONSTRAINT "finance_proposal_submissions_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "finance_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_proposal_events" ADD CONSTRAINT "finance_proposal_events_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "finance_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_proposal_events" ADD CONSTRAINT "finance_proposal_events_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "finance_proposal_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_proposal_documents" ADD CONSTRAINT "finance_proposal_documents_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "finance_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_proposal_documents" ADD CONSTRAINT "finance_proposal_documents_proponentId_fkey" FOREIGN KEY ("proponentId") REFERENCES "finance_proponents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
