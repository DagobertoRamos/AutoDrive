-- Baixas parciais (lançamento filho do título) e lotes de baixa. Somente ADIÇÕES.

-- AlterTable
ALTER TABLE "financial_entries" ADD COLUMN     "parentEntryId" TEXT,
ADD COLUMN     "settlementBatchId" TEXT;

-- CreateTable
CREATE TABLE "financial_settlement_batches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "type" "FinancialEntryType" NOT NULL,
    "paidDate" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT,
    "paymentMethod" TEXT,
    "description" TEXT,
    "total" DECIMAL(14,2) NOT NULL,
    "count" INTEGER NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "snapshot" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_settlement_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_settlement_batches_tenantId_paidDate_idx" ON "financial_settlement_batches"("tenantId", "paidDate");

-- CreateIndex
CREATE INDEX "financial_entries_parentEntryId_idx" ON "financial_entries"("parentEntryId");

-- CreateIndex
CREATE INDEX "financial_entries_settlementBatchId_idx" ON "financial_entries"("settlementBatchId");

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_parentEntryId_fkey" FOREIGN KEY ("parentEntryId") REFERENCES "financial_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_settlementBatchId_fkey" FOREIGN KEY ("settlementBatchId") REFERENCES "financial_settlement_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
