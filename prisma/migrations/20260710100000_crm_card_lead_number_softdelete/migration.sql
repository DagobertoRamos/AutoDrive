-- CRM Card F4: leadNumber público por tenant + soft delete. Aditivo.
ALTER TABLE "marketing_leads"
  ADD COLUMN IF NOT EXISTS "leadNumber"      INTEGER,
  ADD COLUMN IF NOT EXISTS "deletedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "deleteReason"    TEXT;

-- Índice único p/ isolamento por tenant (leadNumber único dentro do tenant).
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_leads_tenantId_leadNumber_key"
  ON "marketing_leads"("tenantId", "leadNumber");

-- Índice p/ filtrar excluídos rapidamente (WHERE deletedAt IS NULL).
CREATE INDEX IF NOT EXISTS "marketing_leads_deletedAt_idx"
  ON "marketing_leads"("deletedAt");
