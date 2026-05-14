-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('CAR', 'MOTORCYCLE', 'TRUCK');

-- CreateEnum
CREATE TYPE "VehicleCondition" AS ENUM ('ZERO_KM', 'SEMINOVO', 'USADO');

-- CreateEnum
CREATE TYPE "VehicleStockType" AS ENUM ('PROPRIO', 'CONSIGNADO');

-- CreateEnum
CREATE TYPE "VehicleStockLocation" AS ENUM ('SHOWROOM', 'ATACADO', 'FORA_ESTOQUE', 'OUTROS');

-- CreateEnum
CREATE TYPE "VehicleStockStatus" AS ENUM ('DISPONIVEL', 'VENDIDO', 'COMPRADO', 'CANCELADO', 'DEVOLVIDO', 'BLOQUEADO', 'EM_PROMOCAO', 'EM_ATACADO', 'EM_NEGOCIACAO', 'EM_SERVICO', 'RESERVADO', 'PENDENTE_DOCUMENTACAO', 'PENDENTE_AVALIACAO', 'PENDENTE_PREPARACAO');

-- CreateEnum
CREATE TYPE "CautelarStatus" AS ENUM ('APROVADA', 'REPROVADA', 'PENDENTE', 'COM_APONTAMENTO', 'SEM_CAUTELAR');

-- CreateEnum
CREATE TYPE "EvaluationResult" AS ENUM ('APROVADO', 'RECUSADO', 'PENDENTE');

-- CreateEnum
CREATE TYPE "EvaluationIntention" AS ENUM ('COMPRA', 'TROCA', 'CONSIGNACAO', 'APENAS_AVALIACAO');

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "bodyType" TEXT,
ADD COLUMN     "cautelarNotes" TEXT,
ADD COLUMN     "cautelarNumber" TEXT,
ADD COLUMN     "cautelarStatus" "CautelarStatus" DEFAULT 'SEM_CAUTELAR',
ADD COLUMN     "conditionType" "VehicleCondition",
ADD COLUMN     "displacement" TEXT,
ADD COLUMN     "doors" INTEGER,
ADD COLUMN     "engine" TEXT,
ADD COLUMN     "entryDate" TIMESTAMP(3),
ADD COLUMN     "exitDate" TIMESTAMP(3),
ADD COLUMN     "fipeCode" TEXT,
ADD COLUMN     "fipeReferenceMonth" TEXT,
ADD COLUMN     "fipeValue" DECIMAL(12,2),
ADD COLUMN     "fuel" TEXT,
ADD COLUMN     "km" INTEGER,
ADD COLUMN     "mainPhotoUrl" TEXT,
ADD COLUMN     "modelYear" INTEGER,
ADD COLUMN     "originEvaluationId" TEXT,
ADD COLUMN     "power" TEXT,
ADD COLUMN     "purchasePrice" DECIMAL(12,2),
ADD COLUMN     "salePrice" DECIMAL(12,2),
ADD COLUMN     "stockLocation" "VehicleStockLocation",
ADD COLUMN     "stockStatus" "VehicleStockStatus" DEFAULT 'DISPONIVEL',
ADD COLUMN     "stockType" "VehicleStockType",
ADD COLUMN     "transmission" TEXT,
ADD COLUMN     "unitId" TEXT,
ADD COLUMN     "vehicleType" "VehicleType",
ADD COLUMN     "version" TEXT;

-- CreateTable
CREATE TABLE "vehicle_photos" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_evaluations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "unitId" TEXT,
    "vehicleId" TEXT,
    "plate" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "version" TEXT,
    "manufactureYear" INTEGER,
    "modelYear" INTEGER,
    "km" INTEGER,
    "color" TEXT,
    "fuel" TEXT,
    "transmission" TEXT,
    "chassi" TEXT,
    "renavam" TEXT,
    "vehicleType" "VehicleType",
    "conditionType" "VehicleCondition",
    "doors" INTEGER,
    "engine" TEXT,
    "displacement" TEXT,
    "power" TEXT,
    "bodyType" TEXT,
    "fipeCode" TEXT,
    "fipeReferenceMonth" TEXT,
    "fipeValue" DECIMAL(12,2),
    "evaluatedValue" DECIMAL(12,2),
    "desiredValue" DECIMAL(12,2),
    "minimumValue" DECIMAL(12,2),
    "suggestedSalePrice" DECIMAL(12,2),
    "stockType" "VehicleStockType",
    "evaluationNotes" TEXT,
    "result" "EvaluationResult" NOT NULL DEFAULT 'PENDENTE',
    "intention" "EvaluationIntention" NOT NULL DEFAULT 'APENAS_AVALIACAO',
    "lookupSource" TEXT,
    "lookupDataRaw" JSONB,
    "cautelarStatus" "CautelarStatus",
    "cautelarNumber" TEXT,
    "cautelarNotes" TEXT,
    "ownerName" TEXT,
    "ownerCpf" TEXT,
    "ownerPhone" TEXT,
    "ownerEmail" TEXT,
    "ownerNotes" TEXT,
    "pendencyNotes" TEXT,
    "evaluatedById" TEXT,
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_pendency_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByMaster" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_pendency_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_stock_pendencies" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "notes" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_stock_pendencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_lookup_cache" (
    "id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "found" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "data" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_lookup_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_photos_vehicleId_idx" ON "vehicle_photos"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_evaluations_tenantId_idx" ON "vehicle_evaluations"("tenantId");

-- CreateIndex
CREATE INDEX "vehicle_evaluations_vehicleId_idx" ON "vehicle_evaluations"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_evaluations_unitId_idx" ON "vehicle_evaluations"("unitId");

-- CreateIndex
CREATE INDEX "vehicle_evaluations_result_idx" ON "vehicle_evaluations"("result");

-- CreateIndex
CREATE INDEX "vehicle_evaluations_createdAt_idx" ON "vehicle_evaluations"("createdAt");

-- CreateIndex
CREATE INDEX "stock_pendency_options_tenantId_idx" ON "stock_pendency_options"("tenantId");

-- CreateIndex
CREATE INDEX "stock_pendency_options_active_idx" ON "stock_pendency_options"("active");

-- CreateIndex
CREATE INDEX "vehicle_stock_pendencies_vehicleId_idx" ON "vehicle_stock_pendencies"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_stock_pendencies_optionId_idx" ON "vehicle_stock_pendencies"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_stock_pendencies_vehicleId_optionId_key" ON "vehicle_stock_pendencies"("vehicleId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_lookup_cache_plate_key" ON "vehicle_lookup_cache"("plate");

-- CreateIndex
CREATE INDEX "vehicle_lookup_cache_plate_idx" ON "vehicle_lookup_cache"("plate");

-- CreateIndex
CREATE INDEX "vehicle_lookup_cache_expiresAt_idx" ON "vehicle_lookup_cache"("expiresAt");

-- CreateIndex
CREATE INDEX "vehicles_unitId_idx" ON "vehicles"("unitId");

-- CreateIndex
CREATE INDEX "vehicles_stockStatus_idx" ON "vehicles"("stockStatus");

-- CreateIndex
CREATE INDEX "vehicles_stockLocation_idx" ON "vehicles"("stockLocation");

-- CreateIndex
CREATE INDEX "vehicles_brand_model_idx" ON "vehicles"("brand", "model");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_photos" ADD CONSTRAINT "vehicle_photos_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_evaluations" ADD CONSTRAINT "vehicle_evaluations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_evaluations" ADD CONSTRAINT "vehicle_evaluations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_evaluations" ADD CONSTRAINT "vehicle_evaluations_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_stock_pendencies" ADD CONSTRAINT "vehicle_stock_pendencies_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_stock_pendencies" ADD CONSTRAINT "vehicle_stock_pendencies_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "stock_pendency_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_stock_pendencies" ADD CONSTRAINT "vehicle_stock_pendencies_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
