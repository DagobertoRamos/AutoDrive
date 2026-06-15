-- AutoDrive — Módulo Financeiro (aditivo). Tabelas novas; não altera tabelas existentes.

-- CreateEnum
CREATE TYPE "FinancialEntryType" AS ENUM ('RECEITA', 'DESPESA');

-- CreateEnum
CREATE TYPE "FinancialEntryStatus" AS ENUM ('PREVISTO', 'PAGO', 'RECEBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "FinancialAccountType" AS ENUM ('CAIXA', 'BANCO', 'CARTAO', 'OUTRO');

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "type" "FinancialAccountType" NOT NULL DEFAULT 'CAIXA',
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "FinancialEntryType" NOT NULL,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "unitId" TEXT,
    "accountId" TEXT,
    "categoryId" TEXT,
    "type" "FinancialEntryType" NOT NULL,
    "status" "FinancialEntryStatus" NOT NULL DEFAULT 'PREVISTO',
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "competenceDate" TIMESTAMP(3),
    "dealId" TEXT,
    "commissionCalculationId" TEXT,
    "sellerId" TEXT,
    "source" TEXT DEFAULT 'MANUAL',
    "counterparty" TEXT,
    "documentNumber" TEXT,
    "paymentMethod" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_accounts_tenantId_idx" ON "financial_accounts"("tenantId");

-- CreateIndex
CREATE INDEX "financial_categories_tenantId_idx" ON "financial_categories"("tenantId");

-- CreateIndex
CREATE INDEX "financial_categories_kind_idx" ON "financial_categories"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "financial_entries_commissionCalculationId_key" ON "financial_entries"("commissionCalculationId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_entries_dealId_source_key" ON "financial_entries"("dealId", "source");

-- CreateIndex
CREATE INDEX "financial_entries_tenantId_idx" ON "financial_entries"("tenantId");

-- CreateIndex
CREATE INDEX "financial_entries_type_idx" ON "financial_entries"("type");

-- CreateIndex
CREATE INDEX "financial_entries_status_idx" ON "financial_entries"("status");

-- CreateIndex
CREATE INDEX "financial_entries_dueDate_idx" ON "financial_entries"("dueDate");

-- CreateIndex
CREATE INDEX "financial_entries_paidDate_idx" ON "financial_entries"("paidDate");

-- CreateIndex
CREATE INDEX "financial_entries_competenceDate_idx" ON "financial_entries"("competenceDate");

-- CreateIndex
CREATE INDEX "financial_entries_sellerId_idx" ON "financial_entries"("sellerId");

-- CreateIndex
CREATE INDEX "financial_entries_unitId_idx" ON "financial_entries"("unitId");

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
