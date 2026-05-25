-- AlterTable
ALTER TABLE "email_configs" ADD COLUMN     "apiKey" TEXT,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'smtp',
ADD COLUMN     "region" TEXT,
ALTER COLUMN "smtpHost" DROP NOT NULL,
ALTER COLUMN "smtpUser" DROP NOT NULL,
ALTER COLUMN "smtpPass" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "email_configs_provider_idx" ON "email_configs"("provider");
