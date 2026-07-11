-- CRM F3: Kanban profissional (transições + campos obrigatórios por etapa). Aditiva.
ALTER TABLE "crm_stages" ADD COLUMN IF NOT EXISTS "requiredFields" JSONB;
ALTER TABLE "crm_stages" ADD COLUMN IF NOT EXISTS "allowSkip" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "crm_stages" ADD COLUMN IF NOT EXISTS "allowBack" BOOLEAN NOT NULL DEFAULT true;
