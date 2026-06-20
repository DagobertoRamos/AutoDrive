-- AutoDrive — Comercial: Fila de Atendimento ("Vendedor da Vez") (Fase 2, ADITIVO).
-- Cria apenas tabelas/enums novos (seller_*). NÃO altera nem remove nada existente.
-- Presença é registrada por evento (sem rastreio contínuo). Tudo tenant/unit-scoped.
-- Aplicar com: npx prisma migrate deploy

-- CreateEnum
CREATE TYPE "SellerQueueEntryStatus" AS ENUM ('WAITING', 'NEXT', 'CALLED', 'ACCEPTED', 'IN_ATTENDANCE', 'PAUSED', 'SKIPPED', 'LEFT', 'EXPIRED', 'BLOCKED');
-- CreateEnum
CREATE TYPE "SellerQueueEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'PAUSE', 'RESUME', 'CUSTOMER_ARRIVED', 'CALLED', 'ACCEPTED', 'REJECTED', 'TIMEOUT', 'SKIPPED', 'ATTENDANCE_STARTED', 'ATTENDANCE_FINISHED', 'MOVED_TO_END', 'MANAGER_OVERRIDE', 'LEADER_OVERRIDE', 'QUEUE_REORDERED', 'FRAUD_FLAGGED');
-- CreateEnum
CREATE TYPE "SellerPresenceMethod" AS ENUM ('GPS', 'QR_CODE', 'DEVICE_CHECK', 'MANAGER_OVERRIDE', 'LEADER_OVERRIDE', 'MANUAL_REVIEW');
-- CreateEnum
CREATE TYPE "SellerAttendanceType" AS ENUM ('SALE', 'EXCHANGE', 'PURCHASE', 'CONSIGNMENT', 'FINANCING', 'AFTER_SALES', 'OTHER');
-- CreateEnum
CREATE TYPE "SellerAttendanceResult" AS ENUM ('CONVERTED_TO_NEGOTIATION', 'SCHEDULED_RETURN', 'NO_INTEREST', 'LOST', 'DUPLICATED', 'FORWARDED_TO_RESPONSIBLE', 'INVALID_ATTENDANCE');
-- CreateTable
CREATE TABLE "seller_queues" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_queues_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "seller_queue_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" "SellerQueueEntryStatus" NOT NULL DEFAULT 'WAITING',
    "position" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "lastAttendanceAt" TIMESTAMP(3),
    "attendanceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_queue_entries_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "seller_queue_customer_arrivals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "registeredById" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerId" TEXT,
    "leadId" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "suggestedSellerId" TEXT,
    "requestedSellerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_queue_customer_arrivals_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "seller_queue_attendances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "arrivalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CALLED',
    "type" "SellerAttendanceType",
    "result" "SellerAttendanceResult",
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptDeadline" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "notes" TEXT,
    "leadId" TEXT,
    "dealId" TEXT,
    "customerId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_queue_attendances_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "seller_queue_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "queueId" TEXT,
    "type" "SellerQueueEventType" NOT NULL,
    "sellerId" TEXT,
    "actorId" TEXT,
    "arrivalId" TEXT,
    "attendanceId" TEXT,
    "entryId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_queue_events_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "seller_presence_checks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "method" "SellerPresenceMethod" NOT NULL,
    "context" TEXT NOT NULL DEFAULT 'CHECK_IN',
    "success" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "distanceM" DOUBLE PRECISION,
    "deviceId" TEXT,
    "overrideById" TEXT,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_presence_checks_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "seller_queue_unit_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "presenceMethods" TEXT[],
    "geofenceLat" DOUBLE PRECISION,
    "geofenceLng" DOUBLE PRECISION,
    "geofenceRadiusM" INTEGER NOT NULL DEFAULT 150,
    "qrSecret" TEXT,
    "acceptTimeoutSeconds" INTEGER NOT NULL DEFAULT 60,
    "requireRevalidationOnAccept" BOOLEAN NOT NULL DEFAULT true,
    "openTime" TEXT,
    "closeTime" TEXT,
    "allowedDays" TEXT[],
    "recurringCustomerRule" TEXT NOT NULL DEFAULT 'RESPONSIBLE',
    "requestByNameRequiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_queue_unit_configs_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "seller_queue_penalties" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "appliedById" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_queue_penalties_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "seller_queue_fraud_flags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "sellerId" TEXT,
    "actorId" TEXT,
    "arrivalId" TEXT,
    "attendanceId" TEXT,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_queue_fraud_flags_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "seller_queues_tenantId_idx" ON "seller_queues"("tenantId");
-- CreateIndex
CREATE INDEX "seller_queues_unitId_idx" ON "seller_queues"("unitId");
-- CreateIndex
CREATE INDEX "seller_queues_date_idx" ON "seller_queues"("date");
-- CreateIndex
CREATE INDEX "seller_queues_status_idx" ON "seller_queues"("status");
-- CreateIndex
CREATE UNIQUE INDEX "seller_queues_tenantId_unitId_date_key" ON "seller_queues"("tenantId", "unitId", "date");
-- CreateIndex
CREATE INDEX "seller_queue_entries_tenantId_idx" ON "seller_queue_entries"("tenantId");
-- CreateIndex
CREATE INDEX "seller_queue_entries_unitId_idx" ON "seller_queue_entries"("unitId");
-- CreateIndex
CREATE INDEX "seller_queue_entries_queueId_idx" ON "seller_queue_entries"("queueId");
-- CreateIndex
CREATE INDEX "seller_queue_entries_sellerId_idx" ON "seller_queue_entries"("sellerId");
-- CreateIndex
CREATE INDEX "seller_queue_entries_status_idx" ON "seller_queue_entries"("status");
-- CreateIndex
CREATE UNIQUE INDEX "seller_queue_entries_queueId_sellerId_key" ON "seller_queue_entries"("queueId", "sellerId");
-- CreateIndex
CREATE INDEX "seller_queue_customer_arrivals_tenantId_idx" ON "seller_queue_customer_arrivals"("tenantId");
-- CreateIndex
CREATE INDEX "seller_queue_customer_arrivals_unitId_idx" ON "seller_queue_customer_arrivals"("unitId");
-- CreateIndex
CREATE INDEX "seller_queue_customer_arrivals_queueId_idx" ON "seller_queue_customer_arrivals"("queueId");
-- CreateIndex
CREATE INDEX "seller_queue_customer_arrivals_status_idx" ON "seller_queue_customer_arrivals"("status");
-- CreateIndex
CREATE INDEX "seller_queue_customer_arrivals_createdAt_idx" ON "seller_queue_customer_arrivals"("createdAt");
-- CreateIndex
CREATE INDEX "seller_queue_attendances_tenantId_idx" ON "seller_queue_attendances"("tenantId");
-- CreateIndex
CREATE INDEX "seller_queue_attendances_unitId_idx" ON "seller_queue_attendances"("unitId");
-- CreateIndex
CREATE INDEX "seller_queue_attendances_queueId_idx" ON "seller_queue_attendances"("queueId");
-- CreateIndex
CREATE INDEX "seller_queue_attendances_sellerId_idx" ON "seller_queue_attendances"("sellerId");
-- CreateIndex
CREATE INDEX "seller_queue_attendances_status_idx" ON "seller_queue_attendances"("status");
-- CreateIndex
CREATE INDEX "seller_queue_attendances_calledAt_idx" ON "seller_queue_attendances"("calledAt");
-- CreateIndex
CREATE INDEX "seller_queue_events_tenantId_idx" ON "seller_queue_events"("tenantId");
-- CreateIndex
CREATE INDEX "seller_queue_events_unitId_idx" ON "seller_queue_events"("unitId");
-- CreateIndex
CREATE INDEX "seller_queue_events_queueId_idx" ON "seller_queue_events"("queueId");
-- CreateIndex
CREATE INDEX "seller_queue_events_sellerId_idx" ON "seller_queue_events"("sellerId");
-- CreateIndex
CREATE INDEX "seller_queue_events_type_idx" ON "seller_queue_events"("type");
-- CreateIndex
CREATE INDEX "seller_queue_events_createdAt_idx" ON "seller_queue_events"("createdAt");
-- CreateIndex
CREATE INDEX "seller_presence_checks_tenantId_idx" ON "seller_presence_checks"("tenantId");
-- CreateIndex
CREATE INDEX "seller_presence_checks_unitId_idx" ON "seller_presence_checks"("unitId");
-- CreateIndex
CREATE INDEX "seller_presence_checks_sellerId_idx" ON "seller_presence_checks"("sellerId");
-- CreateIndex
CREATE INDEX "seller_presence_checks_createdAt_idx" ON "seller_presence_checks"("createdAt");
-- CreateIndex
CREATE INDEX "seller_queue_unit_configs_tenantId_idx" ON "seller_queue_unit_configs"("tenantId");
-- CreateIndex
CREATE INDEX "seller_queue_unit_configs_unitId_idx" ON "seller_queue_unit_configs"("unitId");
-- CreateIndex
CREATE UNIQUE INDEX "seller_queue_unit_configs_tenantId_unitId_key" ON "seller_queue_unit_configs"("tenantId", "unitId");
-- CreateIndex
CREATE INDEX "seller_queue_penalties_tenantId_idx" ON "seller_queue_penalties"("tenantId");
-- CreateIndex
CREATE INDEX "seller_queue_penalties_unitId_idx" ON "seller_queue_penalties"("unitId");
-- CreateIndex
CREATE INDEX "seller_queue_penalties_sellerId_idx" ON "seller_queue_penalties"("sellerId");
-- CreateIndex
CREATE INDEX "seller_queue_penalties_active_idx" ON "seller_queue_penalties"("active");
-- CreateIndex
CREATE INDEX "seller_queue_fraud_flags_tenantId_idx" ON "seller_queue_fraud_flags"("tenantId");
-- CreateIndex
CREATE INDEX "seller_queue_fraud_flags_unitId_idx" ON "seller_queue_fraud_flags"("unitId");
-- CreateIndex
CREATE INDEX "seller_queue_fraud_flags_sellerId_idx" ON "seller_queue_fraud_flags"("sellerId");
-- CreateIndex
CREATE INDEX "seller_queue_fraud_flags_status_idx" ON "seller_queue_fraud_flags"("status");
-- CreateIndex
CREATE INDEX "seller_queue_fraud_flags_createdAt_idx" ON "seller_queue_fraud_flags"("createdAt");
-- AddForeignKey
ALTER TABLE "seller_queue_entries" ADD CONSTRAINT "seller_queue_entries_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "seller_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "seller_queue_customer_arrivals" ADD CONSTRAINT "seller_queue_customer_arrivals_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "seller_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "seller_queue_attendances" ADD CONSTRAINT "seller_queue_attendances_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "seller_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "seller_queue_attendances" ADD CONSTRAINT "seller_queue_attendances_arrivalId_fkey" FOREIGN KEY ("arrivalId") REFERENCES "seller_queue_customer_arrivals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "seller_queue_events" ADD CONSTRAINT "seller_queue_events_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "seller_queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
