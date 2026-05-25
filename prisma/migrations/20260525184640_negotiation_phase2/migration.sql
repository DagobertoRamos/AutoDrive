-- CreateEnum
CREATE TYPE "DiscountRequestStatus" AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO');

-- AlterTable
ALTER TABLE "deal_payments" ADD COLUMN     "cardBrand" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "firstDueDate" TIMESTAMP(3),
ADD COLUMN     "tenantId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "deal_discount_requests" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "tenantId" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedValue" DECIMAL(12,2) NOT NULL,
    "approvedValue" DECIMAL(12,2),
    "reason" TEXT NOT NULL,
    "status" "DiscountRequestStatus" NOT NULL DEFAULT 'PENDENTE',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_discount_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_changes" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "tenantId" TEXT,
    "value" DECIMAL(12,2) NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "document" TEXT,
    "bank" TEXT,
    "agency" TEXT,
    "account" TEXT,
    "pixKey" TEXT,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_reopen_logs" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "tenantId" TEXT,
    "reopenedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previousStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_reopen_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_discount_requests_dealId_idx" ON "deal_discount_requests"("dealId");

-- CreateIndex
CREATE INDEX "deal_discount_requests_tenantId_idx" ON "deal_discount_requests"("tenantId");

-- CreateIndex
CREATE INDEX "deal_discount_requests_status_idx" ON "deal_discount_requests"("status");

-- CreateIndex
CREATE INDEX "deal_changes_dealId_idx" ON "deal_changes"("dealId");

-- CreateIndex
CREATE INDEX "deal_changes_tenantId_idx" ON "deal_changes"("tenantId");

-- CreateIndex
CREATE INDEX "deal_reopen_logs_dealId_idx" ON "deal_reopen_logs"("dealId");

-- CreateIndex
CREATE INDEX "deal_reopen_logs_tenantId_idx" ON "deal_reopen_logs"("tenantId");

-- CreateIndex
CREATE INDEX "deal_payments_tenantId_idx" ON "deal_payments"("tenantId");

-- AddForeignKey
ALTER TABLE "deal_discount_requests" ADD CONSTRAINT "deal_discount_requests_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_changes" ADD CONSTRAINT "deal_changes_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_reopen_logs" ADD CONSTRAINT "deal_reopen_logs_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
