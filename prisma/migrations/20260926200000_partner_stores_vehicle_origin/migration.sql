-- Lojas parceiras + origem do veículo (próprio / loja parceira / particular).
-- Só ADICIONA (tabela nova + 2 colunas anuláveis em vehicles). Reverter:
--   ALTER TABLE "vehicles" DROP CONSTRAINT IF EXISTS "vehicles_partnerStoreId_fkey";
--   ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "partnerStoreId", DROP COLUMN IF EXISTS "originType";
--   DROP TABLE IF EXISTS "partner_stores";

-- CreateTable
CREATE TABLE "partner_stores" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "cnpj" TEXT,
    "responsibleName" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "city" TEXT,
    "state" TEXT,
    "address" TEXT,
    "instagram" TEXT,
    "website" TEXT,
    "commission" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_stores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_stores_tenantId_sourceRef_key" ON "partner_stores"("tenantId", "sourceRef");
CREATE INDEX "partner_stores_tenantId_active_idx" ON "partner_stores"("tenantId", "active");

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN "originType" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "partnerStoreId" TEXT;
CREATE INDEX "vehicles_partnerStoreId_idx" ON "vehicles"("partnerStoreId");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_partnerStoreId_fkey" FOREIGN KEY ("partnerStoreId") REFERENCES "partner_stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
