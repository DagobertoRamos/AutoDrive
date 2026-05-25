-- CreateEnum
CREATE TYPE "EmailPurpose" AS ENUM ('SYSTEM', 'NOTICES', 'PASSWORD_RESET', 'TRANSACTIONAL');

-- AlterTable
ALTER TABLE "email_configs" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purpose" "EmailPurpose" NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "whatsapp_templates" ADD COLUMN     "purpose" TEXT DEFAULT 'GENERAL';

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "purpose" "EmailPurpose" NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT,
    "variables" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_templates_tenantId_idx" ON "email_templates"("tenantId");

-- CreateIndex
CREATE INDEX "email_templates_purpose_idx" ON "email_templates"("purpose");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_tenantId_purpose_key_key" ON "email_templates"("tenantId", "purpose", "key");

-- CreateIndex
CREATE INDEX "email_configs_purpose_idx" ON "email_configs"("purpose");

-- CreateIndex
CREATE INDEX "whatsapp_templates_purpose_idx" ON "whatsapp_templates"("purpose");
