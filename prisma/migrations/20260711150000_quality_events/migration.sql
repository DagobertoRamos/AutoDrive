-- QualityEvent: ledger global de score de qualidade por vendedor.
-- Cobre pendências, leads, atendimentos, administração, fila e eventos manuais.

CREATE TABLE IF NOT EXISTS "quality_events" (
    "id"              TEXT NOT NULL PRIMARY KEY,
    "tenantId"        TEXT NOT NULL,
    "sellerId"        TEXT NOT NULL,
    "unitId"          TEXT,
    "category"        TEXT NOT NULL,
    "type"            TEXT NOT NULL,
    "points"          INTEGER NOT NULL,
    "reason"          TEXT NOT NULL,
    "referenceId"     TEXT,
    "referenceType"   TEXT,
    "appliedById"     TEXT,
    "appliedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active"          BOOLEAN NOT NULL DEFAULT true,
    "reversedById"    TEXT,
    "reversedAt"      TIMESTAMP(3),
    "reversedReason"  TEXT,
    "metadata"        JSONB,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "quality_events_tenantId_sellerId_idx" ON "quality_events"("tenantId", "sellerId");
CREATE INDEX IF NOT EXISTS "quality_events_tenantId_idx" ON "quality_events"("tenantId");
CREATE INDEX IF NOT EXISTS "quality_events_referenceId_idx" ON "quality_events"("referenceId");
CREATE INDEX IF NOT EXISTS "quality_events_appliedAt_idx" ON "quality_events"("appliedAt");
