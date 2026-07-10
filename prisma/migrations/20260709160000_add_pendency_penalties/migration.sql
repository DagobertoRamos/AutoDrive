-- Penalidades de pendência (Fase 5). Aditiva. NÃO altera enums nem dados existentes.
CREATE TABLE IF NOT EXISTS "pendency_penalties" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT,
    "unitId"          TEXT,
    "pendencyId"      TEXT,
    "sellerUserId"    TEXT NOT NULL,
    "type"            TEXT NOT NULL,
    "reason"          TEXT,
    "active"          BOOLEAN NOT NULL DEFAULT true,
    "appliedByUserId" TEXT,
    "removedByUserId" TEXT,
    "removedReason"   TEXT,
    "removedAt"       TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pendency_penalties_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pendency_penalties_tenantId_active_idx" ON "pendency_penalties"("tenantId", "active");
CREATE INDEX IF NOT EXISTS "pendency_penalties_sellerUserId_active_idx" ON "pendency_penalties"("sellerUserId", "active");
CREATE INDEX IF NOT EXISTS "pendency_penalties_pendencyId_idx" ON "pendency_penalties"("pendencyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'pendency_penalties_pendencyId_fkey'
  ) THEN
    ALTER TABLE "pendency_penalties"
      ADD CONSTRAINT "pendency_penalties_pendencyId_fkey"
      FOREIGN KEY ("pendencyId") REFERENCES "pendencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
