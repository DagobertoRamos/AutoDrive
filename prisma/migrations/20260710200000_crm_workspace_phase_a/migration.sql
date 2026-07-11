-- CRM Workspace 360° Fase A — 6 tabelas satélite do lead. Aditivo, tolerante.
CREATE TABLE IF NOT EXISTS "crm_lead_interactions" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "leadId" TEXT NOT NULL,
  "type" TEXT NOT NULL, "channel" TEXT, "result" TEXT, "summary" TEXT,
  "objections" TEXT, "nextAction" TEXT, "nextActionAt" TIMESTAMP(3),
  "nextActionUserId" TEXT, "discussedVehicle" TEXT,
  "authorId" TEXT NOT NULL, "authorName" TEXT, "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_lead_interactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "crm_lead_interactions_tenantId_leadId_occurredAt_idx"
  ON "crm_lead_interactions"("tenantId","leadId","occurredAt");

CREATE TABLE IF NOT EXISTS "crm_lead_summaries" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "leadId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1, "objective" TEXT, "desiredVehicle" TEXT,
  "hasTradeIn" BOOLEAN NOT NULL DEFAULT false, "tradeInVehicle" TEXT,
  "tradeInValue" DECIMAL(12,2), "budget" DECIMAL(12,2), "downPayment" DECIMAL(12,2),
  "monthlyPayment" DECIMAL(12,2), "paymentMethod" TEXT, "purchaseTimeline" TEXT,
  "objections" TEXT, "competitors" TEXT, "narrative" TEXT,
  "authorId" TEXT NOT NULL, "authorName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_lead_summaries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "crm_lead_summaries_tenantId_leadId_version_idx"
  ON "crm_lead_summaries"("tenantId","leadId","version");

CREATE TABLE IF NOT EXISTS "crm_lead_deals" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "leadId" TEXT NOT NULL,
  "dealId" TEXT NOT NULL, "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "linkedByUserId" TEXT, "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_lead_deals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_lead_deals_leadId_dealId_key" ON "crm_lead_deals"("leadId","dealId");
CREATE INDEX IF NOT EXISTS "crm_lead_deals_tenantId_leadId_idx" ON "crm_lead_deals"("tenantId","leadId");
CREATE INDEX IF NOT EXISTS "crm_lead_deals_dealId_idx" ON "crm_lead_deals"("dealId");

CREATE TABLE IF NOT EXISTS "crm_lead_visits" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "leadId" TEXT NOT NULL,
  "unitId" TEXT, "hostUserId" TEXT, "scheduledAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL DEFAULT 60,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "objective" TEXT, "vehicleRef" TEXT, "clientConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT, "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
  "cancelReason" TEXT, "completedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crm_lead_visits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "crm_lead_visits_tenantId_leadId_idx" ON "crm_lead_visits"("tenantId","leadId");
CREATE INDEX IF NOT EXISTS "crm_lead_visits_tenantId_scheduledAt_idx" ON "crm_lead_visits"("tenantId","scheduledAt");

CREATE TABLE IF NOT EXISTS "crm_lead_vehicles" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "leadId" TEXT NOT NULL,
  "vehicleId" TEXT, "brand" TEXT, "model" TEXT, "version" TEXT, "year" INTEGER,
  "plate" TEXT, "priceViewed" DECIMAL(12,2),
  "interest" TEXT NOT NULL DEFAULT 'PRIMARY', "status" TEXT NOT NULL DEFAULT 'INTERESTED',
  "isPrimary" BOOLEAN NOT NULL DEFAULT false, "notes" TEXT, "addedByUserId" TEXT,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMP(3), "removedReason" TEXT,
  CONSTRAINT "crm_lead_vehicles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_lead_vehicles_leadId_vehicleId_key"
  ON "crm_lead_vehicles"("leadId","vehicleId") WHERE "vehicleId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "crm_lead_vehicles_tenantId_leadId_idx" ON "crm_lead_vehicles"("tenantId","leadId");

CREATE TABLE IF NOT EXISTS "crm_lead_evaluations" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "leadId" TEXT NOT NULL,
  "evaluationId" TEXT NOT NULL, "linkedByUserId" TEXT,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_lead_evaluations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "crm_lead_evaluations_leadId_evaluationId_key"
  ON "crm_lead_evaluations"("leadId","evaluationId");
CREATE INDEX IF NOT EXISTS "crm_lead_evaluations_tenantId_leadId_idx" ON "crm_lead_evaluations"("tenantId","leadId");
