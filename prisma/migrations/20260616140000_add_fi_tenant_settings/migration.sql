-- AutoDrive — F&I Fase 2b.3 (aditivo). Nova tabela de configurações por loja.
-- Não altera tabelas existentes. Tenant-scoped, chave/JSON.

-- CreateTable
CREATE TABLE "finance_tenant_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_tenant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_tenant_settings_tenantId_key_key" ON "finance_tenant_settings"("tenantId", "key");
CREATE INDEX "finance_tenant_settings_tenantId_idx" ON "finance_tenant_settings"("tenantId");
