-- AlterEnum
ALTER TYPE "VehicleStockStatus" ADD VALUE 'EM_PRECIFICACAO';

-- AlterTable
ALTER TABLE "vehicles"
  ADD COLUMN "promoPrice"          DECIMAL(12,2),
  ADD COLUMN "isPromo"              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "promoStartsAt"        TIMESTAMP(3),
  ADD COLUMN "promoEndsAt"          TIMESTAMP(3),
  ADD COLUMN "isAvailableForSale"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pricingNotes"         TEXT,
  ADD COLUMN "pricedById"           TEXT,
  ADD COLUMN "pricedAt"             TIMESTAMP(3);

-- CreateTable
CREATE TABLE "vehicle_pricing_history" (
    "id"             TEXT NOT NULL,
    "vehicleId"      TEXT NOT NULL,
    "tenantId"       TEXT,
    "changedById"    TEXT NOT NULL,
    "action"         TEXT NOT NULL,
    "oldSalePrice"   DECIMAL(12,2),
    "newSalePrice"   DECIMAL(12,2),
    "oldPromoPrice"  DECIMAL(12,2),
    "newPromoPrice"  DECIMAL(12,2),
    "oldIsAvailable" BOOLEAN,
    "newIsAvailable" BOOLEAN,
    "oldIsPromo"     BOOLEAN,
    "newIsPromo"     BOOLEAN,
    "reason"         TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_pricing_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_pricing_history_vehicleId_idx" ON "vehicle_pricing_history"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_pricing_history_tenantId_idx" ON "vehicle_pricing_history"("tenantId");

-- AddForeignKey
ALTER TABLE "vehicle_pricing_history"
  ADD CONSTRAINT "vehicle_pricing_history_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
