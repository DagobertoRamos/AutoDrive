-- Timeline unificada de pendências (Fase 2). Aditiva, sem tocar dados existentes.
CREATE TABLE IF NOT EXISTS "pendency_events" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT,
    "pendencyId"   TEXT NOT NULL,
    "type"         TEXT NOT NULL,
    "authorId"     TEXT,
    "authorName"   TEXT,
    "content"      TEXT,
    "prevStatus"   TEXT,
    "newStatus"    TEXT,
    "prevPriority" TEXT,
    "newPriority"  TEXT,
    "prevDueDate"  TIMESTAMP(3),
    "newDueDate"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pendency_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pendency_events_pendencyId_createdAt_idx" ON "pendency_events"("pendencyId", "createdAt");
CREATE INDEX IF NOT EXISTS "pendency_events_tenantId_idx" ON "pendency_events"("tenantId");
CREATE INDEX IF NOT EXISTS "pendency_events_type_idx" ON "pendency_events"("type");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'pendency_events_pendencyId_fkey'
  ) THEN
    ALTER TABLE "pendency_events"
      ADD CONSTRAINT "pendency_events_pendencyId_fkey"
      FOREIGN KEY ("pendencyId") REFERENCES "pendencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
