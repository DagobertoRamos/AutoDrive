-- Adiciona campos opcionais da sessão de processamento do Document Reader V2.
-- O modelo DocumentProcessingJob usa @@map("document_processing_jobs").

ALTER TABLE "document_processing_jobs"
  ADD COLUMN IF NOT EXISTS "documentHash" TEXT,
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;