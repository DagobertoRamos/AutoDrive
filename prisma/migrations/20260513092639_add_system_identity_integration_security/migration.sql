-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TenantStatus" ADD VALUE 'INADIMPLENTE';
ALTER TYPE "TenantStatus" ADD VALUE 'PAUSADO';

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMonthly" DECIMAL(10,2),
    "priceYearly" DECIMAL(10,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxUsers" INTEGER NOT NULL DEFAULT 10,
    "maxVehicles" INTEGER NOT NULL DEFAULT 100,
    "maxUnits" INTEGER NOT NULL DEFAULT 1,
    "maxStorageMb" INTEGER NOT NULL DEFAULT 1024,
    "whatsappMonthly" INTEGER NOT NULL DEFAULT 1000,
    "emailMonthly" INTEGER NOT NULL DEFAULT 5000,
    "trialDays" INTEGER NOT NULL DEFAULT 14,
    "allowWhiteLabel" BOOLEAN NOT NULL DEFAULT false,
    "allowCustomDomain" BOOLEAN NOT NULL DEFAULT false,
    "allowGoogleSheets" BOOLEAN NOT NULL DEFAULT true,
    "allowAdvancedReports" BOOLEAN NOT NULL DEFAULT false,
    "allowApiAccess" BOOLEAN NOT NULL DEFAULT false,
    "modules" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPct" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_feature_flags" (
    "tenantId" TEXT NOT NULL,
    "flagKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tenant_feature_flags_pkey" PRIMARY KEY ("tenantId","flagKey")
);

-- CreateTable
CREATE TABLE "maintenance_modes" (
    "id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "scopeId" TEXT,
    "allowedRoles" TEXT[],
    "activatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_notices" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "targetType" TEXT NOT NULL DEFAULT 'ALL',
    "targetId" TEXT,
    "displayType" TEXT NOT NULL DEFAULT 'BELL',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "required" BOOLEAN NOT NULL DEFAULT false,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "actionUrl" TEXT,
    "actionLabel" TEXT,
    "createdBy" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_notice_reads" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "internal_notice_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impersonation_sessions" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetTenantId" TEXT,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_identity" (
    "id" TEXT NOT NULL,
    "systemName" TEXT NOT NULL DEFAULT 'AutoDrive',
    "systemSlogan" TEXT,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#166534',
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "footerText" TEXT,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "supportUrl" TEXT,
    "termsUrl" TEXT,
    "privacyUrl" TEXT,
    "customDomain" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "apiUrl" TEXT,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "token" TEXT,
    "username" TEXT,
    "webhookSecret" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN NOT NULL DEFAULT false,
    "lastTestMsg" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_policies" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "scopeId" TEXT,
    "minPasswordLength" INTEGER NOT NULL DEFAULT 8,
    "requireUppercase" BOOLEAN NOT NULL DEFAULT true,
    "requireNumber" BOOLEAN NOT NULL DEFAULT true,
    "requireSpecialChar" BOOLEAN NOT NULL DEFAULT false,
    "passwordExpiryDays" INTEGER NOT NULL DEFAULT 0,
    "sessionMaxAgeSecs" INTEGER NOT NULL DEFAULT 28800,
    "inactivityTimeoutSecs" INTEGER NOT NULL DEFAULT 0,
    "maxActiveSessions" INTEGER NOT NULL DEFAULT 5,
    "maxLoginAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockoutDurationMins" INTEGER NOT NULL DEFAULT 15,
    "require2FA" BOOLEAN NOT NULL DEFAULT false,
    "require2FAForMaster" BOOLEAN NOT NULL DEFAULT true,
    "masterIpAllowlist" TEXT[],
    "dataRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "plans_active_idx" ON "plans"("active");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "tenant_feature_flags_flagKey_idx" ON "tenant_feature_flags"("flagKey");

-- CreateIndex
CREATE INDEX "maintenance_modes_active_idx" ON "maintenance_modes"("active");

-- CreateIndex
CREATE INDEX "internal_notices_active_idx" ON "internal_notices"("active");

-- CreateIndex
CREATE INDEX "internal_notices_targetType_targetId_idx" ON "internal_notices"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "internal_notice_reads_noticeId_idx" ON "internal_notice_reads"("noticeId");

-- CreateIndex
CREATE INDEX "internal_notice_reads_userId_idx" ON "internal_notice_reads"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "internal_notice_reads_noticeId_userId_key" ON "internal_notice_reads"("noticeId", "userId");

-- CreateIndex
CREATE INDEX "impersonation_sessions_masterId_idx" ON "impersonation_sessions"("masterId");

-- CreateIndex
CREATE INDEX "impersonation_sessions_targetUserId_idx" ON "impersonation_sessions"("targetUserId");

-- CreateIndex
CREATE INDEX "impersonation_sessions_startedAt_idx" ON "impersonation_sessions"("startedAt");

-- CreateIndex
CREATE INDEX "integration_credentials_service_idx" ON "integration_credentials"("service");

-- CreateIndex
CREATE INDEX "integration_credentials_active_idx" ON "integration_credentials"("active");

-- CreateIndex
CREATE UNIQUE INDEX "security_policies_scope_scopeId_key" ON "security_policies"("scope", "scopeId");

-- AddForeignKey
ALTER TABLE "tenant_feature_flags" ADD CONSTRAINT "tenant_feature_flags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_feature_flags" ADD CONSTRAINT "tenant_feature_flags_flagKey_fkey" FOREIGN KEY ("flagKey") REFERENCES "feature_flags"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_notice_reads" ADD CONSTRAINT "internal_notice_reads_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "internal_notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
