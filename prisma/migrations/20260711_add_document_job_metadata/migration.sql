-- Adicionar campos opcionais necessários para a sessão de processamento (Pipeline V2)
ALTER TABLE "DocumentProcessingJob" ADD COLUMN "documentHash" TEXT;
ALTER TABLE "DocumentProcessingJob" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "DocumentProcessingJob" ADD COLUMN "metadata" JSONB;
