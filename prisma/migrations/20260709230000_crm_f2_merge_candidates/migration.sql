-- CRM F2: candidatos à mesclagem (dedup em modo alerta). Aditiva.
CREATE TABLE IF NOT EXISTS "crm_merge_candidates" (
    "id"                TEXT NOT NULL,
    "tenantId"          TEXT NOT NULL,
    "leadId"            TEXT NOT NULL,
    "matchType"         TEXT NOT NULL,
    "matchedLeadId"     TEXT,
    "matchedCustomerId" TEXT,
    "reason"            TEXT,
    "status"            TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedByUserId"  TEXT,
    "resolvedAt"        TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_merge_candidates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "crm_merge_candidates_tenantId_status_idx" ON "crm_merge_candidates"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "crm_merge_candidates_leadId_idx" ON "crm_merge_candidates"("leadId");
