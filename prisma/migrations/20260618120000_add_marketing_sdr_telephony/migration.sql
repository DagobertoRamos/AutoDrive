-- AutoDrive — Marketing: Mesa SDR / Pré-Vendas + Telefonia (Fase 2, ADITIVO).
-- Cria apenas tabelas/enums novos. NÃO altera nem remove nada existente.
-- Credenciais ficam cifradas (secretsEncrypted) — nunca em texto puro.
-- Aplicar com: npx prisma migrate deploy

-- CreateEnum
CREATE TYPE "LeadDistributionMode" AS ENUM ('ROUND_ROBIN', 'SHARK_TANK', 'MANUAL', 'LOAD_BALANCED', 'PERFORMANCE_WEIGHTED', 'PRIORITY_RULES');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'CONVERTED', 'LOST', 'DISCARDED', 'RECYCLED');
CREATE TYPE "AgentPresenceStatus" AS ENUM ('ONLINE', 'BUSY', 'AWAY', 'OFFLINE', 'ON_CALL');
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'ANSWERED', 'MISSED', 'BUSY', 'FAILED', 'COMPLETED', 'VOICEMAIL', 'CANCELED');
CREATE TYPE "RecordingStatus" AS ENUM ('PENDING', 'AVAILABLE', 'FAILED', 'EXPIRED', 'BLOCKED', 'DELETED');
CREATE TYPE "TelephonyProviderKind" AS ENUM ('ASTERISK', 'THREE_CX', 'TWILIO', 'GENERIC_WEBHOOK', 'MANUAL');

-- CreateTable
CREATE TABLE "marketing_leads" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT,
    "unitId" TEXT,
    "teamId" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "customerId" TEXT,
    "vehicleId" TEXT,
    "assignedToUserId" TEXT,
    "claimedByUserId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "score" INTEGER,
    "lastContactAt" TIMESTAMP(3),
    "convertedDealId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketing_leads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_leads_tenantId_idx" ON "marketing_leads"("tenantId");
CREATE INDEX "marketing_leads_status_idx" ON "marketing_leads"("status");
CREATE INDEX "marketing_leads_assignedToUserId_idx" ON "marketing_leads"("assignedToUserId");
CREATE INDEX "marketing_leads_unitId_idx" ON "marketing_leads"("unitId");

-- CreateTable
CREATE TABLE "marketing_sdr_teams" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unitId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketing_sdr_teams_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_sdr_teams_tenantId_idx" ON "marketing_sdr_teams"("tenantId");

-- CreateTable
CREATE TABLE "marketing_sdr_members" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SDR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "presence" "AgentPresenceStatus" NOT NULL DEFAULT 'OFFLINE',
    "maxOpenLeads" INTEGER,
    "weight" DECIMAL(6,2),
    "unitId" TEXT,
    "lastAssignedAt" TIMESTAMP(3),
    "lastPresenceAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketing_sdr_members_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_sdr_members_tenantId_idx" ON "marketing_sdr_members"("tenantId");
CREATE INDEX "marketing_sdr_members_userId_idx" ON "marketing_sdr_members"("userId");
CREATE UNIQUE INDEX "marketing_sdr_members_teamId_userId_key" ON "marketing_sdr_members"("teamId", "userId");

-- CreateTable
CREATE TABLE "marketing_lead_distribution_policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "LeadDistributionMode" NOT NULL DEFAULT 'ROUND_ROBIN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "teamId" TEXT,
    "unitId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketing_lead_distribution_policies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_lead_distribution_policies_tenantId_idx" ON "marketing_lead_distribution_policies"("tenantId");
CREATE INDEX "marketing_lead_distribution_policies_teamId_idx" ON "marketing_lead_distribution_policies"("teamId");

-- CreateTable
CREATE TABLE "marketing_lead_distribution_queue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT,
    "leadId" TEXT,
    "mode" "LeadDistributionMode" NOT NULL DEFAULT 'ROUND_ROBIN',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "unitId" TEXT,
    "source" TEXT,
    "position" INTEGER,
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "fallbackAppliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketing_lead_distribution_queue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_lead_distribution_queue_tenantId_idx" ON "marketing_lead_distribution_queue"("tenantId");
CREATE INDEX "marketing_lead_distribution_queue_policyId_idx" ON "marketing_lead_distribution_queue"("policyId");
CREATE INDEX "marketing_lead_distribution_queue_status_idx" ON "marketing_lead_distribution_queue"("status");

-- CreateTable
CREATE TABLE "marketing_lead_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "assignedByUserId" TEXT,
    "teamId" TEXT,
    "mode" "LeadDistributionMode" NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "reason" TEXT,
    "slaDeadline" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketing_lead_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_lead_assignments_tenantId_idx" ON "marketing_lead_assignments"("tenantId");
CREATE INDEX "marketing_lead_assignments_leadId_idx" ON "marketing_lead_assignments"("leadId");
CREATE INDEX "marketing_lead_assignments_assignedToUserId_idx" ON "marketing_lead_assignments"("assignedToUserId");
CREATE INDEX "marketing_lead_assignments_status_idx" ON "marketing_lead_assignments"("status");

-- CreateTable
CREATE TABLE "marketing_lead_claims" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'VIEWED',
    "succeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketing_lead_claims_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_lead_claims_tenantId_idx" ON "marketing_lead_claims"("tenantId");
CREATE INDEX "marketing_lead_claims_leadId_idx" ON "marketing_lead_claims"("leadId");
CREATE INDEX "marketing_lead_claims_userId_idx" ON "marketing_lead_claims"("userId");

-- CreateTable
CREATE TABLE "marketing_lead_slas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "slaSeconds" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "breachedAt" TIMESTAMP(3),
    "escalatedToUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketing_lead_slas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_lead_slas_tenantId_idx" ON "marketing_lead_slas"("tenantId");
CREATE INDEX "marketing_lead_slas_leadId_idx" ON "marketing_lead_slas"("leadId");
CREATE INDEX "marketing_lead_slas_status_idx" ON "marketing_lead_slas"("status");

-- CreateTable
CREATE TABLE "marketing_lead_cadences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "steps" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketing_lead_cadences_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_lead_cadences_tenantId_idx" ON "marketing_lead_cadences"("tenantId");

-- CreateTable
CREATE TABLE "marketing_lead_tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "assignmentId" TEXT,
    "cadenceId" TEXT,
    "assignedToUserId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'FOLLOW_UP',
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketing_lead_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_lead_tasks_tenantId_idx" ON "marketing_lead_tasks"("tenantId");
CREATE INDEX "marketing_lead_tasks_leadId_idx" ON "marketing_lead_tasks"("leadId");
CREATE INDEX "marketing_lead_tasks_assignedToUserId_idx" ON "marketing_lead_tasks"("assignedToUserId");
CREATE INDEX "marketing_lead_tasks_status_idx" ON "marketing_lead_tasks"("status");

-- CreateTable
CREATE TABLE "telephony_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TelephonyProviderKind" NOT NULL DEFAULT 'MANUAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "supportsInbound" BOOLEAN NOT NULL DEFAULT false,
    "supportsOutbound" BOOLEAN NOT NULL DEFAULT false,
    "supportsRecording" BOOLEAN NOT NULL DEFAULT false,
    "supportsWebhook" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT,
    "apiVersion" TEXT,
    "fieldMappings" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telephony_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telephony_tenant_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'PRODUCAO',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "webhookActive" BOOLEAN NOT NULL DEFAULT false,
    "lastTestAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telephony_tenant_connections_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "telephony_tenant_connections_tenantId_idx" ON "telephony_tenant_connections"("tenantId");
CREATE INDEX "telephony_tenant_connections_providerId_idx" ON "telephony_tenant_connections"("providerId");

-- CreateTable
CREATE TABLE "telephony_credentials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT,
    "label" TEXT,
    "secretsEncrypted" TEXT,
    "maskedHints" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telephony_credentials_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "telephony_credentials_tenantId_idx" ON "telephony_credentials"("tenantId");
CREATE INDEX "telephony_credentials_connectionId_idx" ON "telephony_credentials"("connectionId");

-- CreateTable
CREATE TABLE "telephony_numbers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT,
    "number" TEXT NOT NULL,
    "label" TEXT,
    "extension" TEXT,
    "unitId" TEXT,
    "source" TEXT,
    "inbound" BOOLEAN NOT NULL DEFAULT true,
    "outbound" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telephony_numbers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "telephony_numbers_tenantId_idx" ON "telephony_numbers"("tenantId");
CREATE INDEX "telephony_numbers_connectionId_idx" ON "telephony_numbers"("connectionId");
CREATE INDEX "telephony_numbers_number_idx" ON "telephony_numbers"("number");

-- CreateTable
CREATE TABLE "telephony_routing_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "numberId" TEXT,
    "targetUserId" TEXT,
    "targetTeamId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telephony_routing_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "telephony_routing_rules_tenantId_idx" ON "telephony_routing_rules"("tenantId");

-- CreateTable
CREATE TABLE "telephony_calls" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT,
    "providerCallId" TEXT,
    "direction" "CallDirection" NOT NULL DEFAULT 'INBOUND',
    "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
    "fromNumber" TEXT,
    "toNumber" TEXT,
    "agentExtension" TEXT,
    "agentUserId" TEXT,
    "numberId" TEXT,
    "leadId" TEXT,
    "customerId" TEXT,
    "source" TEXT,
    "startedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telephony_calls_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "telephony_calls_tenantId_idx" ON "telephony_calls"("tenantId");
CREATE INDEX "telephony_calls_leadId_idx" ON "telephony_calls"("leadId");
CREATE INDEX "telephony_calls_numberId_idx" ON "telephony_calls"("numberId");
CREATE INDEX "telephony_calls_status_idx" ON "telephony_calls"("status");
CREATE INDEX "telephony_calls_createdAt_idx" ON "telephony_calls"("createdAt");

-- CreateTable
CREATE TABLE "telephony_call_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "callId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telephony_call_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "telephony_call_events_callId_idx" ON "telephony_call_events"("callId");

-- CreateTable
CREATE TABLE "telephony_recordings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "status" "RecordingStatus" NOT NULL DEFAULT 'PENDING',
    "storageUrl" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "durationSec" INTEGER,
    "sizeBytes" INTEGER,
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telephony_recordings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "telephony_recordings_callId_key" ON "telephony_recordings"("callId");
CREATE INDEX "telephony_recordings_tenantId_idx" ON "telephony_recordings"("tenantId");
CREATE INDEX "telephony_recordings_status_idx" ON "telephony_recordings"("status");

-- CreateTable
CREATE TABLE "telephony_webhook_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "providerKind" TEXT,
    "connectionId" TEXT,
    "eventType" TEXT,
    "externalId" TEXT,
    "payload" JSONB NOT NULL,
    "signatureValid" BOOLEAN,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "callId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telephony_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "telephony_webhook_events_tenantId_idx" ON "telephony_webhook_events"("tenantId");
CREATE INDEX "telephony_webhook_events_processed_idx" ON "telephony_webhook_events"("processed");
CREATE INDEX "telephony_webhook_events_createdAt_idx" ON "telephony_webhook_events"("createdAt");

-- CreateTable
CREATE TABLE "telephony_integration_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "connectionId" TEXT,
    "providerKind" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "message" TEXT,
    "metadata" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telephony_integration_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "telephony_integration_logs_tenantId_idx" ON "telephony_integration_logs"("tenantId");
CREATE INDEX "telephony_integration_logs_connectionId_idx" ON "telephony_integration_logs"("connectionId");
CREATE INDEX "telephony_integration_logs_createdAt_idx" ON "telephony_integration_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "marketing_sdr_members" ADD CONSTRAINT "marketing_sdr_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "marketing_sdr_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketing_lead_assignments" ADD CONSTRAINT "marketing_lead_assignments_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "marketing_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketing_lead_claims" ADD CONSTRAINT "marketing_lead_claims_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "marketing_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketing_lead_slas" ADD CONSTRAINT "marketing_lead_slas_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "marketing_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketing_lead_tasks" ADD CONSTRAINT "marketing_lead_tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "marketing_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketing_lead_tasks" ADD CONSTRAINT "marketing_lead_tasks_cadenceId_fkey" FOREIGN KEY ("cadenceId") REFERENCES "marketing_lead_cadences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "telephony_tenant_connections" ADD CONSTRAINT "telephony_tenant_connections_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "telephony_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telephony_credentials" ADD CONSTRAINT "telephony_credentials_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "telephony_tenant_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "telephony_numbers" ADD CONSTRAINT "telephony_numbers_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "telephony_tenant_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_numberId_fkey" FOREIGN KEY ("numberId") REFERENCES "telephony_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "marketing_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "telephony_call_events" ADD CONSTRAINT "telephony_call_events_callId_fkey" FOREIGN KEY ("callId") REFERENCES "telephony_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telephony_recordings" ADD CONSTRAINT "telephony_recordings_callId_fkey" FOREIGN KEY ("callId") REFERENCES "telephony_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
