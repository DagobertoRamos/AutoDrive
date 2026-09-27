-- Preparação do veículo + extrato financeiro (só ADICIONA: 5 tabelas novas e
-- 2 colunas anuláveis em financial_entries). Reverter:
--   DROP TABLE IF EXISTS "vehicle_service_events", "vehicle_services", "suppliers", "vehicle_receptions", "vehicle_files";
--   DROP INDEX IF EXISTS "financial_entries_vehicleServiceId_key"; DROP INDEX IF EXISTS "financial_entries_vehicleId_idx";
--   ALTER TABLE "financial_entries" DROP COLUMN IF EXISTS "vehicleId", DROP COLUMN IF EXISTS "vehicleServiceId";

-- AlterTable
ALTER TABLE "financial_entries" ADD COLUMN     "vehicleId" TEXT,
ADD COLUMN     "vehicleServiceId" TEXT;

-- CreateTable
CREATE TABLE "vehicle_files" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refKey" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_receptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "items" JSONB,
    "km" INTEGER,
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "confirmedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_receptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OFICINA',
    "document" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "city" TEXT,
    "address" TEXT,
    "pixKey" TEXT,
    "bankInfo" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_services" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "evaluationServiceId" TEXT,
    "description" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL DEFAULT 'OUTRO',
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO',
    "supplierId" TEXT,
    "estimatedCost" DECIMAL(12,2),
    "actualCost" DECIMAL(12,2),
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "deniedReason" TEXT,
    "overdueNotifiedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_service_events" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "note" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_service_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_files_vehicleId_kind_idx" ON "vehicle_files"("vehicleId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_receptions_vehicleId_key" ON "vehicle_receptions"("vehicleId");

-- CreateIndex
CREATE INDEX "suppliers_tenantId_active_idx" ON "suppliers"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_services_evaluationServiceId_key" ON "vehicle_services"("evaluationServiceId");

-- CreateIndex
CREATE INDEX "vehicle_services_vehicleId_idx" ON "vehicle_services"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_services_tenantId_status_idx" ON "vehicle_services"("tenantId", "status");

-- CreateIndex
CREATE INDEX "vehicle_services_supplierId_idx" ON "vehicle_services"("supplierId");

-- CreateIndex
CREATE INDEX "vehicle_service_events_serviceId_idx" ON "vehicle_service_events"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_entries_vehicleServiceId_key" ON "financial_entries"("vehicleServiceId");

-- CreateIndex
CREATE INDEX "financial_entries_vehicleId_idx" ON "financial_entries"("vehicleId");

-- AddForeignKey
ALTER TABLE "vehicle_files" ADD CONSTRAINT "vehicle_files_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_receptions" ADD CONSTRAINT "vehicle_receptions_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_services" ADD CONSTRAINT "vehicle_services_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_services" ADD CONSTRAINT "vehicle_services_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_service_events" ADD CONSTRAINT "vehicle_service_events_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "vehicle_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
