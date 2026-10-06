-- Centros de resultado por serviço + F&I do financiamento. Somente ADIÇÕES.

-- AlterTable
ALTER TABLE "deal_payments" ADD COLUMN     "addOns" JSONB,
ADD COLUMN     "contractNumber" TEXT,
ADD COLUMN     "ilaValue" DECIMAL(12,2),
ADD COLUMN     "iofValue" DECIMAL(12,2),
ADD COLUMN     "irrfValue" DECIMAL(12,2),
ADD COLUMN     "plusValue" DECIMAL(12,2),
ADD COLUMN     "returnGrossValue" DECIMAL(12,2),
ADD COLUMN     "returnNetValue" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "deal_services" ADD COLUMN     "kind" TEXT,
ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "financial_cost_centers" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'CUSTO',
ADD COLUMN     "systemKey" TEXT;

-- AlterTable
ALTER TABLE "warranty_sales" ADD COLUMN     "costValue" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "financial_entry_attachments" ADD COLUMN     "docType" TEXT;

-- CreateTable
CREATE TABLE "document_attachments" (
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

-- CreateIndex
CREATE INDEX "document_attachments_tenantId_entityType_entityId_idx" ON "document_attachments"("tenantId", "entityType", "entityId");
