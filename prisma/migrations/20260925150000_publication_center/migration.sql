-- Central de Publicações (Marketing). Só cria tabelas novas; não altera tabelas existentes.
-- Reverter: ver docs/publicacoes/REVERTER.md (DROP das 8 tabelas publication_*/publications).

-- CreateTable
CREATE TABLE "publication_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL DEFAULT 'default',
    "status" TEXT NOT NULL DEFAULT 'NAO_CONECTADO',
    "environment" TEXT NOT NULL DEFAULT 'PRODUCAO',
    "secretsEncrypted" TEXT,
    "maskedHints" JSONB,
    "config" JSONB,
    "tokenExpiresAt" TIMESTAMP(3),
    "throttledUntil" TIMESTAMP(3),
    "quota" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "connectedById" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publication_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_drafts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "conditions" TEXT,
    "price" DECIMAL(12,2),
    "photos" JSONB,
    "mediaRevisionId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publication_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_revisions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "origin" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "connectionId" TEXT,
    "connectionKey" TEXT NOT NULL DEFAULT 'default',
    "campaignKey" TEXT NOT NULL DEFAULT 'principal',
    "externalRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "desiredState" TEXT NOT NULL DEFAULT 'PUBLICADO',
    "confirmedState" TEXT,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "overrides" JSONB,
    "sentRevisionHash" TEXT,
    "remoteId" TEXT,
    "remoteUrl" TEXT,
    "remoteStatus" TEXT,
    "remoteData" JSONB,
    "pendingToken" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "manualAction" TEXT,
    "lastError" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorHint" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "lastRemoteEventAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "pausedReason" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archiveReason" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 6,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "revisionHash" TEXT,
    "outcomeUnknown" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "lastErrorKind" TEXT,
    "result" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "publication_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicationId" TEXT,
    "vehicleId" TEXT,
    "channel" TEXT,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_webhook_events" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "tenantId" TEXT,
    "dedupKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RECEBIDO',
    "payload" JSONB,
    "error" TEXT,

    CONSTRAINT "publication_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_mappings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REVISAR',
    "candidates" JSONB,
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publication_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "publication_connections_tenantId_channel_idx" ON "publication_connections"("tenantId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "publication_connections_tenantId_channel_externalAccountId_key" ON "publication_connections"("tenantId", "channel", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "publication_drafts_vehicleId_key" ON "publication_drafts"("vehicleId");

-- CreateIndex
CREATE INDEX "publication_drafts_tenantId_idx" ON "publication_drafts"("tenantId");

-- CreateIndex
CREATE INDEX "publication_revisions_tenantId_vehicleId_kind_idx" ON "publication_revisions"("tenantId", "vehicleId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "publication_revisions_vehicleId_kind_number_key" ON "publication_revisions"("vehicleId", "kind", "number");

-- CreateIndex
CREATE INDEX "publications_tenantId_status_idx" ON "publications"("tenantId", "status");

-- CreateIndex
CREATE INDEX "publications_tenantId_vehicleId_idx" ON "publications"("tenantId", "vehicleId");

-- CreateIndex
CREATE INDEX "publications_tenantId_scheduledAt_idx" ON "publications"("tenantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "publications_tenantId_channel_idx" ON "publications"("tenantId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "publications_tenantId_vehicleId_channel_connectionKey_campa_key" ON "publications"("tenantId", "vehicleId", "channel", "connectionKey", "campaignKey");

-- CreateIndex
CREATE UNIQUE INDEX "publications_channel_connectionKey_externalRef_key" ON "publications"("channel", "connectionKey", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "publication_jobs_idempotencyKey_key" ON "publication_jobs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "publication_jobs_status_runAt_priority_idx" ON "publication_jobs"("status", "runAt", "priority");

-- CreateIndex
CREATE INDEX "publication_jobs_publicationId_status_idx" ON "publication_jobs"("publicationId", "status");

-- CreateIndex
CREATE INDEX "publication_jobs_tenantId_status_idx" ON "publication_jobs"("tenantId", "status");

-- CreateIndex
CREATE INDEX "publication_events_tenantId_createdAt_idx" ON "publication_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "publication_events_publicationId_createdAt_idx" ON "publication_events"("publicationId", "createdAt");

-- CreateIndex
CREATE INDEX "publication_events_tenantId_vehicleId_createdAt_idx" ON "publication_events"("tenantId", "vehicleId", "createdAt");

-- CreateIndex
CREATE INDEX "publication_webhook_events_channel_receivedAt_idx" ON "publication_webhook_events"("channel", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "publication_webhook_events_channel_dedupKey_key" ON "publication_webhook_events"("channel", "dedupKey");

-- CreateIndex
CREATE INDEX "publication_mappings_tenantId_channel_status_idx" ON "publication_mappings"("tenantId", "channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "publication_mappings_tenantId_channel_kind_sourceKey_key" ON "publication_mappings"("tenantId", "channel", "kind", "sourceKey");

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "publication_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_jobs" ADD CONSTRAINT "publication_jobs_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Uma tarefa em execução por publicação (processamento concorrente bloqueado no banco).
CREATE UNIQUE INDEX "publication_jobs_one_running_per_publication" ON "publication_jobs"("publicationId") WHERE "status" = 'EXECUTANDO';
