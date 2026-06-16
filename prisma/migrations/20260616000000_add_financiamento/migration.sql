-- AutoDrive — Módulo Financiamento (FN). Aditivo; não altera tabelas existentes.

-- CreateEnum
CREATE TYPE "ProponentOccupation" AS ENUM ('AUTONOMO', 'CLT', 'EMPRESARIO', 'APOSENTADO_PENSIONISTA');

-- CreateEnum
CREATE TYPE "FinanceProposalStatus" AS ENUM ('SIMULACAO', 'ENVIADA', 'APROVADA', 'RECUSADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "finance_proponents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "nomeCompleto" TEXT NOT NULL,
    "dataNascimento" TIMESTAMP(3),
    "cpf" TEXT,
    "rg" TEXT,
    "nomeMae" TEXT,
    "nomePai" TEXT,
    "email" TEXT,
    "celular" TEXT,
    "telefoneFixo" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "occupation" "ProponentOccupation",
    "cargo" TEXT,
    "renda" DECIMAL(14,2),
    "outrasRendas" JSONB,
    "numeroBeneficio" TEXT,
    "empresaNome" TEXT,
    "empresaCnpj" TEXT,
    "empresaTelefone" TEXT,
    "empresaCep" TEXT,
    "empresaLogradouro" TEXT,
    "empresaBairro" TEXT,
    "empresaCidade" TEXT,
    "empresaEstado" TEXT,
    "empresaNumero" TEXT,
    "empresaComplemento" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_proponents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_banks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_proposals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "proponentId" TEXT NOT NULL,
    "bankId" TEXT,
    "sellerId" TEXT,
    "vehicle" TEXT,
    "amountRequested" DECIMAL(14,2),
    "downPayment" DECIMAL(14,2),
    "installments" INTEGER,
    "status" "FinanceProposalStatus" NOT NULL DEFAULT 'SIMULACAO',
    "simulationResult" JSONB,
    "approvedValue" DECIMAL(14,2),
    "monthlyPayment" DECIMAL(14,2),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_proponents_tenantId_idx" ON "finance_proponents"("tenantId");
CREATE INDEX "finance_proponents_cpf_idx" ON "finance_proponents"("cpf");
CREATE INDEX "finance_proponents_nomeCompleto_idx" ON "finance_proponents"("nomeCompleto");
CREATE INDEX "finance_banks_tenantId_idx" ON "finance_banks"("tenantId");
CREATE INDEX "finance_proposals_tenantId_idx" ON "finance_proposals"("tenantId");
CREATE INDEX "finance_proposals_status_idx" ON "finance_proposals"("status");
CREATE INDEX "finance_proposals_proponentId_idx" ON "finance_proposals"("proponentId");
CREATE INDEX "finance_proposals_bankId_idx" ON "finance_proposals"("bankId");
CREATE INDEX "finance_proposals_sellerId_idx" ON "finance_proposals"("sellerId");

-- AddForeignKey
ALTER TABLE "finance_proposals" ADD CONSTRAINT "finance_proposals_proponentId_fkey" FOREIGN KEY ("proponentId") REFERENCES "finance_proponents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_proposals" ADD CONSTRAINT "finance_proposals_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "finance_banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
