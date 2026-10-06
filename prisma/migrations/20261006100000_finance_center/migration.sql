-- Centro Financeiro: plano de contas em árvore + grupo da DRE, centros de custo,
-- recorrências, anexos, orçamento, transferências/parcelas/folha nos lançamentos.
-- Somente ADIÇÕES.

-- AlterTable
ALTER TABLE "financial_accounts" ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "agency" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "includeInTotal" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "openingDate" TIMESTAMP(3),
ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "financial_categories" ADD COLUMN     "code" TEXT,
ADD COLUMN     "dreGroup" TEXT,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "financial_entries" ADD COLUMN     "costCenterId" TEXT,
ADD COLUMN     "discountAmount" DECIMAL(14,2),
ADD COLUMN     "employeeUserId" TEXT,
ADD COLUMN     "installmentGroupId" TEXT,
ADD COLUMN     "installmentNumber" INTEGER,
ADD COLUMN     "installmentTotal" INTEGER,
ADD COLUMN     "interestAmount" DECIMAL(14,2),
ADD COLUMN     "recurrenceId" TEXT,
ADD COLUMN     "transferGroupId" TEXT;

-- CreateTable
CREATE TABLE "financial_cost_centers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_recurrences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "type" "FinancialEntryType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "accountId" TEXT,
    "categoryId" TEXT,
    "costCenterId" TEXT,
    "supplierId" TEXT,
    "employeeUserId" TEXT,
    "counterparty" TEXT,
    "dayOfMonth" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "generatedUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_recurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_entry_attachments" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_entry_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_budgets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "month" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_cost_centers_tenantId_idx" ON "financial_cost_centers"("tenantId");

-- CreateIndex
CREATE INDEX "financial_recurrences_tenantId_idx" ON "financial_recurrences"("tenantId");

-- CreateIndex
CREATE INDEX "financial_entry_attachments_entryId_idx" ON "financial_entry_attachments"("entryId");

-- CreateIndex
CREATE INDEX "financial_entry_attachments_tenantId_idx" ON "financial_entry_attachments"("tenantId");

-- CreateIndex
CREATE INDEX "financial_budgets_tenantId_month_idx" ON "financial_budgets"("tenantId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "financial_budgets_tenantId_month_categoryId_costCenterId_key" ON "financial_budgets"("tenantId", "month", "categoryId", "costCenterId");

-- CreateIndex
CREATE INDEX "financial_categories_parentId_idx" ON "financial_categories"("parentId");

-- CreateIndex
CREATE INDEX "financial_entries_costCenterId_idx" ON "financial_entries"("costCenterId");

-- CreateIndex
CREATE INDEX "financial_entries_transferGroupId_idx" ON "financial_entries"("transferGroupId");

-- CreateIndex
CREATE INDEX "financial_entries_installmentGroupId_idx" ON "financial_entries"("installmentGroupId");

-- CreateIndex
CREATE INDEX "financial_entries_recurrenceId_idx" ON "financial_entries"("recurrenceId");

-- CreateIndex
CREATE INDEX "financial_entries_employeeUserId_idx" ON "financial_entries"("employeeUserId");

-- AddForeignKey
ALTER TABLE "financial_categories" ADD CONSTRAINT "financial_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "financial_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "financial_recurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "financial_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entry_attachments" ADD CONSTRAINT "financial_entry_attachments_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "financial_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_budgets" ADD CONSTRAINT "financial_budgets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "financial_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_budgets" ADD CONSTRAINT "financial_budgets_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "financial_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
