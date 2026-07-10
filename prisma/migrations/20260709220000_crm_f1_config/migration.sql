-- CRM Reforma F1: Etapas configuráveis + Etiquetas (N:N). Aditiva.
CREATE TABLE IF NOT EXISTS "crm_stages" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "code"        TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "color"       TEXT,
    "order"       INTEGER NOT NULL DEFAULT 0,
    "active"      BOOLEAN NOT NULL DEFAULT true,
    "category"    TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_stages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_stages_tenantId_code_key" ON "crm_stages"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "crm_stages_tenantId_idx" ON "crm_stages"("tenantId");

CREATE TABLE IF NOT EXISTS "crm_tags" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "color"       TEXT,
    "description" TEXT,
    "category"    TEXT,
    "active"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_tags_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "crm_tags_tenantId_active_idx" ON "crm_tags"("tenantId", "active");

CREATE TABLE IF NOT EXISTS "crm_lead_tags" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "leadId"          TEXT NOT NULL,
    "tagId"           TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_lead_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_lead_tags_leadId_tagId_key" ON "crm_lead_tags"("leadId", "tagId");
CREATE INDEX IF NOT EXISTS "crm_lead_tags_leadId_idx" ON "crm_lead_tags"("leadId");
CREATE INDEX IF NOT EXISTS "crm_lead_tags_tagId_idx" ON "crm_lead_tags"("tagId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'crm_lead_tags_tagId_fkey') THEN
    ALTER TABLE "crm_lead_tags" ADD CONSTRAINT "crm_lead_tags_tagId_fkey"
      FOREIGN KEY ("tagId") REFERENCES "crm_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
