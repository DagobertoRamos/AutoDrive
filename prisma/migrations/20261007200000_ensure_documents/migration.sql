-- Garante a tabela de documentos e colunas recentes caso uma migration anterior
-- tenha sido aplicada antes de recebê-las. Idempotente: não faz nada se já existem.

ALTER TABLE "financial_entry_attachments" ADD COLUMN IF NOT EXISTS "docType" TEXT;

CREATE TABLE IF NOT EXISTS "document_attachments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "docType" TEXT NOT NULL DEFAULT 'OUTRO',
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "document_attachments_tenantId_entityType_entityId_idx" ON "document_attachments"("tenantId", "entityType", "entityId");

ALTER TABLE "financial_settlement_batches" ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;
ALTER TABLE "financial_settlement_batches" ADD COLUMN IF NOT EXISTS "snapshot" JSONB;
