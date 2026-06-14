-- CreateEnum
CREATE TYPE "WarrantySaleType" AS ENUM ('FULL', 'REDUCED');

-- CreateEnum
CREATE TYPE "WarrantySaleStatus" AS ENUM ('ATIVA', 'CANCELADA', 'ESTORNADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'GERENTE_ADMINISTRATIVO';
ALTER TYPE "UserRole" ADD VALUE 'FINANCEIRO';

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "ilaPercent" DECIMAL(7,4),
ADD COLUMN     "ilaValue" DECIMAL(12,2),
ADD COLUMN     "iofPercent" DECIMAL(7,4),
ADD COLUMN     "iofValue" DECIMAL(12,2),
ADD COLUMN     "returnCommissionStatus" "CommissionStatus" NOT NULL DEFAULT 'PREVISTO',
ADD COLUMN     "returnGrossValue" DECIMAL(12,2),
ADD COLUMN     "returnNetValue" DECIMAL(12,2),
ADD COLUMN     "returnRatePercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "warranties" ADD COLUMN     "coverageType" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "fullPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "fullSaleCommissionValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "hasPremiumAddon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "premiumAddonCommissionValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "premiumAddonName" TEXT,
ADD COLUMN     "premiumAddonValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "reducedPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "reducedSaleCommissionValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "updatedById" TEXT;

-- CreateTable
CREATE TABLE "warranty_sales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "dealId" TEXT NOT NULL,
    "warrantyId" TEXT NOT NULL,
    "sellerId" TEXT,
    "saleType" "WarrantySaleType" NOT NULL,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "hasPremiumAddon" BOOLEAN NOT NULL DEFAULT false,
    "premiumAddonValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "finalPrice" DECIMAL(12,2) NOT NULL,
    "status" "WarrantySaleStatus" NOT NULL DEFAULT 'ATIVA',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranty_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warranty_sales_tenantId_idx" ON "warranty_sales"("tenantId");

-- CreateIndex
CREATE INDEX "warranty_sales_dealId_idx" ON "warranty_sales"("dealId");

-- CreateIndex
CREATE INDEX "warranty_sales_warrantyId_idx" ON "warranty_sales"("warrantyId");

-- CreateIndex
CREATE INDEX "warranty_sales_sellerId_idx" ON "warranty_sales"("sellerId");

-- AddForeignKey
ALTER TABLE "warranty_sales" ADD CONSTRAINT "warranty_sales_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_sales" ADD CONSTRAINT "warranty_sales_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "warranties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

