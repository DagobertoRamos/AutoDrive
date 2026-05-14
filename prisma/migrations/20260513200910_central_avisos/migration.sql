-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PENDENCIA_RESOLVIDA';
ALTER TYPE "NotificationType" ADD VALUE 'PENDENCIA_NAO_RESOLVIDA';
ALTER TYPE "NotificationType" ADD VALUE 'ESCALONAMENTO';
ALTER TYPE "NotificationType" ADD VALUE 'ERRO_ENVIO';

-- AlterTable
ALTER TABLE "pendencies" ADD COLUMN     "assignedUserId" TEXT,
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalatedByUserId" TEXT,
ADD COLUMN     "originModule" TEXT,
ADD COLUMN     "originRecordId" TEXT,
ADD COLUMN     "reopenedAt" TIMESTAMP(3),
ADD COLUMN     "severity" TEXT,
ADD COLUMN     "slaDeadline" TIMESTAMP(3),
ADD COLUMN     "slaMinutes" INTEGER,
ADD COLUMN     "validatedAt" TIMESTAMP(3),
ADD COLUMN     "validatedByUserId" TEXT;

-- CreateTable
CREATE TABLE "notification_rules" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT NOT NULL,
    "conditionType" TEXT NOT NULL,
    "conditionConfig" JSONB,
    "priority" TEXT NOT NULL DEFAULT 'MEDIA',
    "severity" TEXT NOT NULL DEFAULT 'MEDIA',
    "slaMinutes" INTEGER,
    "channels" TEXT[],
    "targetRoles" TEXT[],
    "escalationRoles" TEXT[],
    "escalationAfterMinutes" INTEGER,
    "maxPerDay" INTEGER NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobile_devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceName" TEXT,
    "appVersion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_rules_scope_isActive_idx" ON "notification_rules"("scope", "isActive");

-- CreateIndex
CREATE INDEX "notification_rules_tenantId_idx" ON "notification_rules"("tenantId");

-- CreateIndex
CREATE INDEX "notification_rules_module_idx" ON "notification_rules"("module");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_devices_deviceToken_key" ON "mobile_devices"("deviceToken");

-- CreateIndex
CREATE INDEX "mobile_devices_userId_isActive_idx" ON "mobile_devices"("userId", "isActive");

-- CreateIndex
CREATE INDEX "mobile_devices_deviceToken_idx" ON "mobile_devices"("deviceToken");

-- CreateIndex
CREATE INDEX "pendencies_assignedUserId_idx" ON "pendencies"("assignedUserId");

-- CreateIndex
CREATE INDEX "pendencies_slaDeadline_idx" ON "pendencies"("slaDeadline");

-- CreateIndex
CREATE INDEX "pendencies_originModule_originRecordId_idx" ON "pendencies"("originModule", "originRecordId");

-- AddForeignKey
ALTER TABLE "pendencies" ADD CONSTRAINT "pendencies_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendencies" ADD CONSTRAINT "pendencies_validatedByUserId_fkey" FOREIGN KEY ("validatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendencies" ADD CONSTRAINT "pendencies_escalatedByUserId_fkey" FOREIGN KEY ("escalatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_devices" ADD CONSTRAINT "mobile_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
