-- CRM Pipelines: multi-funil com etapas livres. Aditiva — não altera
-- marketing_leads (funil/etapa do lead ficam em crm_lead_placements).
CREATE TABLE IF NOT EXISTS "crm_pipelines" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "color"       TEXT,
    "order"       INTEGER NOT NULL DEFAULT 0,
    "active"      BOOLEAN NOT NULL DEFAULT true,
    "isDefault"   BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_pipelines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "crm_pipelines_tenantId_idx" ON "crm_pipelines"("tenantId");

CREATE TABLE IF NOT EXISTS "crm_pipeline_stages" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "pipelineId"     TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "color"          TEXT,
    "order"          INTEGER NOT NULL DEFAULT 0,
    "active"         BOOLEAN NOT NULL DEFAULT true,
    "statusCode"     TEXT NOT NULL,
    "requiredFields" JSONB,
    "allowSkip"      BOOLEAN NOT NULL DEFAULT true,
    "allowBack"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_pipeline_stages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "crm_pipeline_stages_tenantId_idx" ON "crm_pipeline_stages"("tenantId");
CREATE INDEX IF NOT EXISTS "crm_pipeline_stages_pipelineId_idx" ON "crm_pipeline_stages"("pipelineId");
DO $$ BEGIN
  ALTER TABLE "crm_pipeline_stages" ADD CONSTRAINT "crm_pipeline_stages_pipelineId_fkey"
    FOREIGN KEY ("pipelineId") REFERENCES "crm_pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "crm_lead_placements" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "leadId"         TEXT NOT NULL,
    "pipelineId"     TEXT NOT NULL,
    "stageId"        TEXT,
    "enteredStageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_lead_placements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_lead_placements_leadId_key" ON "crm_lead_placements"("leadId");
CREATE INDEX IF NOT EXISTS "crm_lead_placements_tenantId_pipelineId_idx" ON "crm_lead_placements"("tenantId", "pipelineId");
DO $$ BEGIN
  ALTER TABLE "crm_lead_placements" ADD CONSTRAINT "crm_lead_placements_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "marketing_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_lead_placements" ADD CONSTRAINT "crm_lead_placements_pipelineId_fkey"
    FOREIGN KEY ("pipelineId") REFERENCES "crm_pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_lead_placements" ADD CONSTRAINT "crm_lead_placements_stageId_fkey"
    FOREIGN KEY ("stageId") REFERENCES "crm_pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
