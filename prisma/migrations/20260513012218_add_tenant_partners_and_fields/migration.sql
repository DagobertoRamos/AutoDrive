/*
  Warnings:

  - A unique constraint covering the columns `[cpf]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PartnerRole" AS ENUM ('SOCIO_ADMINISTRADOR', 'SOCIO', 'REPRESENTANTE_LEGAL', 'PROCURADOR');

-- AlterEnum
ALTER TYPE "TenantStatus" ADD VALUE 'BANIDO';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cnaeCode" TEXT,
ADD COLUMN     "complemento" TEXT,
ADD COLUMN     "dataAbertura" TIMESTAMP(3),
ADD COLUMN     "isentoInscricaoEstadual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "logradouro" TEXT,
ADD COLUMN     "maxUnits" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "maxUsers" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "maxVehicles" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "nomeFantasia" TEXT,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "situacaoCadastral" TEXT,
ADD COLUMN     "statusReason" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "tenant_partners" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "rg" TEXT,
    "celular" TEXT,
    "email" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "role" "PartnerRole" NOT NULL DEFAULT 'SOCIO',
    "participacao" DECIMAL(5,2),
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "userId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_partners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_partners_userId_key" ON "tenant_partners"("userId");

-- CreateIndex
CREATE INDEX "tenant_partners_tenantId_idx" ON "tenant_partners"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_partners_cpf_idx" ON "tenant_partners"("cpf");

-- CreateIndex
CREATE INDEX "tenants_cnpj_idx" ON "tenants"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "users_cpf_key" ON "users"("cpf");

-- CreateIndex
CREATE INDEX "users_cpf_idx" ON "users"("cpf");

-- AddForeignKey
ALTER TABLE "tenant_partners" ADD CONSTRAINT "tenant_partners_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_partners" ADD CONSTRAINT "tenant_partners_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
