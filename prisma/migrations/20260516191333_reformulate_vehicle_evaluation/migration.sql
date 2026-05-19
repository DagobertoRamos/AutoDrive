-- DropIndex
DROP INDEX "deals_tenantId_externalId_idx";

-- DropIndex
DROP INDEX "pendencies_source_dealId_idx";

-- AlterTable
ALTER TABLE "vehicle_evaluations" ADD COLUMN     "estimatedDays" INTEGER,
ADD COLUMN     "evaluatorFeedback" TEXT,
ADD COLUMN     "negotiationId" TEXT,
ADD COLUMN     "status" TEXT DEFAULT 'DRAFT',
ADD COLUMN     "testDriveDone" BOOLEAN DEFAULT false,
ADD COLUMN     "totalExpenses" DECIMAL(12,2) DEFAULT 0;

-- CreateTable
CREATE TABLE "banks" (
    "id" TEXT NOT NULL,
    "code" INTEGER,
    "ispb" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fipe_cache" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'parallelum',
    "cacheKey" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "vehicleType" TEXT,
    "brandId" TEXT,
    "modelId" TEXT,
    "yearId" TEXT,
    "codeFipe" TEXT,
    "reference" TEXT,
    "data" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fipe_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "evaluationId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "catalogKey" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT,
    "notes" TEXT,
    "totalExpenses" DECIMAL(12,2) DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_services" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "evaluationId" TEXT NOT NULL,
    "itemId" TEXT,
    "section" TEXT,
    "description" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "estimatedCost" DECIMAL(12,2) DEFAULT 0,
    "actualCost" DECIMAL(12,2),
    "priority" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PREDICTED',
    "responsibleId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_attachments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "itemId" TEXT,
    "serviceId" TEXT,
    "section" TEXT,
    "category" TEXT,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT,
    "uploadedById" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "itemId" TEXT,
    "serviceId" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "userRole" TEXT,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banks_ispb_key" ON "banks"("ispb");

-- CreateIndex
CREATE INDEX "banks_code_idx" ON "banks"("code");

-- CreateIndex
CREATE INDEX "banks_active_idx" ON "banks"("active");

-- CreateIndex
CREATE UNIQUE INDEX "fipe_cache_cacheKey_key" ON "fipe_cache"("cacheKey");

-- CreateIndex
CREATE INDEX "fipe_cache_provider_idx" ON "fipe_cache"("provider");

-- CreateIndex
CREATE INDEX "fipe_cache_endpoint_idx" ON "fipe_cache"("endpoint");

-- CreateIndex
CREATE INDEX "fipe_cache_vehicleType_idx" ON "fipe_cache"("vehicleType");

-- CreateIndex
CREATE INDEX "fipe_cache_expiresAt_idx" ON "fipe_cache"("expiresAt");

-- CreateIndex
CREATE INDEX "evaluation_items_evaluationId_idx" ON "evaluation_items"("evaluationId");

-- CreateIndex
CREATE INDEX "evaluation_items_evaluationId_section_idx" ON "evaluation_items"("evaluationId", "section");

-- CreateIndex
CREATE INDEX "evaluation_items_catalogKey_idx" ON "evaluation_items"("catalogKey");

-- CreateIndex
CREATE INDEX "evaluation_services_evaluationId_idx" ON "evaluation_services"("evaluationId");

-- CreateIndex
CREATE INDEX "evaluation_services_itemId_idx" ON "evaluation_services"("itemId");

-- CreateIndex
CREATE INDEX "evaluation_services_status_idx" ON "evaluation_services"("status");

-- CreateIndex
CREATE INDEX "evaluation_attachments_evaluationId_idx" ON "evaluation_attachments"("evaluationId");

-- CreateIndex
CREATE INDEX "evaluation_attachments_itemId_idx" ON "evaluation_attachments"("itemId");

-- CreateIndex
CREATE INDEX "evaluation_attachments_section_idx" ON "evaluation_attachments"("section");

-- CreateIndex
CREATE INDEX "evaluation_attachments_category_idx" ON "evaluation_attachments"("category");

-- CreateIndex
CREATE INDEX "evaluation_history_evaluationId_idx" ON "evaluation_history"("evaluationId");

-- CreateIndex
CREATE INDEX "evaluation_history_itemId_idx" ON "evaluation_history"("itemId");

-- CreateIndex
CREATE INDEX "evaluation_history_action_idx" ON "evaluation_history"("action");

-- CreateIndex
CREATE INDEX "vehicle_evaluations_status_idx" ON "vehicle_evaluations"("status");

-- CreateIndex
CREATE INDEX "vehicle_evaluations_negotiationId_idx" ON "vehicle_evaluations"("negotiationId");

-- AddForeignKey
ALTER TABLE "evaluation_services" ADD CONSTRAINT "evaluation_services_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "evaluation_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_attachments" ADD CONSTRAINT "evaluation_attachments_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "evaluation_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_history" ADD CONSTRAINT "evaluation_history_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "evaluation_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
