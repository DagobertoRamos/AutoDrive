-- Motor de operações veiculares: operação (TXN), chamadas externas idempotentes,
-- linha do tempo, fiscal, vistoria, restrições, transferência entre lojas,
-- consignação, caixa de saída de eventos, webhooks e certificado digital.
-- Só adição, idempotente.

CREATE TABLE IF NOT EXISTS "vehicle_operations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "dealId" TEXT,
    "dealVehicleId" TEXT,
    "parentId" TEXT,
    "customerId" TEXT,
    "unitId" TEXT,
    "commercialStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "financialStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "fiscalStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "renaveStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "transferStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "inspectionStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "restrictionStatus" TEXT NOT NULL DEFAULT 'CLEAR',
    "documentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "financingStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "transferStage" TEXT,
    "renaveProviderId" TEXT,
    "renaveCycleId" TEXT,
    "fiscalDocumentId" TEXT,
    "bankContractRef" TEXT,
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_operations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "operation_sequences" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "operation_sequences_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "external_operations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operationId" TEXT,
    "vehicleId" TEXT,
    "domain" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "externalId" TEXT,
    "protocol" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3),
    "requestSummary" JSONB,
    "responseSummary" JSONB,
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "userMessage" TEXT,
    "createdById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_operations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "operation_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "operationId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'USER',
    "providerId" TEXT,
    "externalOperationId" TEXT,
    "requestId" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "technical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fiscal_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "operationId" TEXT,
    "vehicleId" TEXT,
    "dealId" TEXT,
    "model" TEXT NOT NULL DEFAULT 'NFE',
    "direction" TEXT NOT NULL,
    "purpose" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "providerId" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalOperationId" TEXT,
    "number" TEXT,
    "series" TEXT,
    "accessKey" TEXT,
    "cfop" TEXT,
    "amount" DECIMAL(12,2),
    "issuerDoc" TEXT,
    "issuerName" TEXT,
    "recipientDoc" TEXT,
    "recipientName" TEXT,
    "chassi" TEXT,
    "renavam" TEXT,
    "plate" TEXT,
    "issuedAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3),
    "authorizationProtocol" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "rejectionCode" TEXT,
    "rejectionMessage" TEXT,
    "xml" TEXT,
    "pdfUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vehicle_inspections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "operationId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "company" TEXT,
    "performedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "protocol" TEXT,
    "fileId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_inspections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vehicle_restrictions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "blocking" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "description" TEXT,
    "reference" TEXT,
    "institution" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolution" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_restrictions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "store_transfers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "fromUnitId" TEXT,
    "toUnitId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "operationId" TEXT,
    "reason" TEXT,
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "consignment_contracts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "operationId" TEXT,
    "ownerName" TEXT NOT NULL,
    "ownerDoc" TEXT,
    "ownerPhone" TEXT,
    "minPrice" DECIMAL(12,2),
    "commissionType" TEXT NOT NULL DEFAULT 'PERCENT',
    "commissionValue" DECIMAL(12,2),
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "payoutStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "payoutAmount" DECIMAL(12,2),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consignment_contracts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ops_outbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "type" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_outbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "webhook_inbox" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tenantId" TEXT,
    "payloadHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_inbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tenant_certificates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "subjectName" TEXT,
    "subjectDoc" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "fingerprint" TEXT,
    "pfxEncrypted" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_operations_code_key" ON "vehicle_operations"("code");

CREATE INDEX IF NOT EXISTS "vehicle_operations_tenantId_vehicleId_idx" ON "vehicle_operations"("tenantId", "vehicleId");

CREATE INDEX IF NOT EXISTS "vehicle_operations_tenantId_kind_commercialStatus_idx" ON "vehicle_operations"("tenantId", "kind", "commercialStatus");

CREATE INDEX IF NOT EXISTS "vehicle_operations_dealId_idx" ON "vehicle_operations"("dealId");

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_operations_dealVehicleId_kind_key" ON "vehicle_operations"("dealVehicleId", "kind");

CREATE UNIQUE INDEX IF NOT EXISTS "external_operations_idempotencyKey_key" ON "external_operations"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "external_operations_state_nextCheckAt_idx" ON "external_operations"("state", "nextCheckAt");

CREATE INDEX IF NOT EXISTS "external_operations_operationId_idx" ON "external_operations"("operationId");

CREATE INDEX IF NOT EXISTS "external_operations_tenantId_domain_state_idx" ON "external_operations"("tenantId", "domain", "state");

CREATE INDEX IF NOT EXISTS "operation_events_vehicleId_createdAt_idx" ON "operation_events"("vehicleId", "createdAt");

CREATE INDEX IF NOT EXISTS "operation_events_operationId_createdAt_idx" ON "operation_events"("operationId", "createdAt");

CREATE INDEX IF NOT EXISTS "operation_events_tenantId_createdAt_idx" ON "operation_events"("tenantId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_documents_accessKey_key" ON "fiscal_documents"("accessKey");

CREATE INDEX IF NOT EXISTS "fiscal_documents_tenantId_status_idx" ON "fiscal_documents"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "fiscal_documents_operationId_idx" ON "fiscal_documents"("operationId");

CREATE INDEX IF NOT EXISTS "fiscal_documents_vehicleId_idx" ON "fiscal_documents"("vehicleId");

CREATE INDEX IF NOT EXISTS "fiscal_documents_dealId_idx" ON "fiscal_documents"("dealId");

CREATE INDEX IF NOT EXISTS "vehicle_inspections_tenantId_vehicleId_idx" ON "vehicle_inspections"("tenantId", "vehicleId");

CREATE INDEX IF NOT EXISTS "vehicle_restrictions_tenantId_vehicleId_status_idx" ON "vehicle_restrictions"("tenantId", "vehicleId", "status");

CREATE INDEX IF NOT EXISTS "store_transfers_tenantId_status_idx" ON "store_transfers"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "store_transfers_vehicleId_idx" ON "store_transfers"("vehicleId");

CREATE INDEX IF NOT EXISTS "consignment_contracts_tenantId_status_idx" ON "consignment_contracts"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "consignment_contracts_vehicleId_idx" ON "consignment_contracts"("vehicleId");

CREATE UNIQUE INDEX IF NOT EXISTS "ops_outbox_dedupKey_key" ON "ops_outbox"("dedupKey");

CREATE INDEX IF NOT EXISTS "ops_outbox_status_availableAt_idx" ON "ops_outbox"("status", "availableAt");

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_inbox_provider_eventId_key" ON "webhook_inbox"("provider", "eventId");

CREATE INDEX IF NOT EXISTS "tenant_certificates_tenantId_active_idx" ON "tenant_certificates"("tenantId", "active");


