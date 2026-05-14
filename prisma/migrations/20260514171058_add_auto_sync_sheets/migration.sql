-- CreateEnum
CREATE TYPE "AutoSyncMode" AS ENUM ('SIMULATION', 'REAL');

-- CreateEnum
CREATE TYPE "AutoSyncStatus" AS ENUM ('ATIVO', 'PAUSADO', 'ERRO', 'RODANDO', 'AGUARDANDO');

-- CreateEnum
CREATE TYPE "AutoSyncJobStatus" AS ENUM ('RUNNING', 'SUCCESS', 'ERROR', 'SKIPPED', 'LOCKED');

-- CreateEnum
CREATE TYPE "AutoSyncTriggerType" AS ENUM ('AUTO', 'MANUAL', 'SIMULATION');

-- CreateEnum
CREATE TYPE "AutoSyncAction" AS ENUM ('APENAS_BAIXAR', 'IMPORTAR_PENDENCIAS', 'IMPORTAR_E_ALERTAR', 'IMPORTAR_E_NOTIFICAR_GERENTE', 'IMPORTAR_E_NOTIFICAR_TODOS');

-- CreateTable
CREATE TABLE "google_sheets_auto_sync_configs" (
    "id" TEXT NOT NULL,
    "importerId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" "AutoSyncMode" NOT NULL DEFAULT 'SIMULATION',
    "frequencyMinutes" INTEGER NOT NULL DEFAULT 30,
    "allowedDays" JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
    "startTime" TEXT NOT NULL DEFAULT '08:00',
    "endTime" TEXT NOT NULL DEFAULT '18:00',
    "selectedTabs" JSONB,
    "actionAfterDownload" "AutoSyncAction" NOT NULL DEFAULT 'IMPORTAR_PENDENCIAS',
    "notifyOnNewRecords" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnError" BOOLEAN NOT NULL DEFAULT true,
    "errorNotifyTarget" TEXT,
    "maxRowsPerRun" INTEGER NOT NULL DEFAULT 500,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 120,
    "status" "AutoSyncStatus" NOT NULL DEFAULT 'PAUSADO',
    "isRunning" BOOLEAN NOT NULL DEFAULT false,
    "lockUntil" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_sheets_auto_sync_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_sheets_auto_sync_jobs" (
    "id" TEXT NOT NULL,
    "importerId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "status" "AutoSyncJobStatus" NOT NULL DEFAULT 'RUNNING',
    "triggerType" "AutoSyncTriggerType" NOT NULL DEFAULT 'AUTO',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "rowsIgnored" INTEGER NOT NULL DEFAULT 0,
    "rowsError" INTEGER NOT NULL DEFAULT 0,
    "sheetsRead" JSONB,
    "sheetsNotFound" JSONB,
    "errors" JSONB,
    "summary" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_sheets_auto_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_sheets_auto_sync_configs_importerId_key" ON "google_sheets_auto_sync_configs"("importerId");

-- CreateIndex
CREATE INDEX "google_sheets_auto_sync_jobs_importerId_createdAt_idx" ON "google_sheets_auto_sync_jobs"("importerId", "createdAt");

-- CreateIndex
CREATE INDEX "google_sheets_auto_sync_jobs_configId_createdAt_idx" ON "google_sheets_auto_sync_jobs"("configId", "createdAt");

-- CreateIndex
CREATE INDEX "google_sheets_auto_sync_jobs_status_idx" ON "google_sheets_auto_sync_jobs"("status");

-- AddForeignKey
ALTER TABLE "google_sheets_auto_sync_configs" ADD CONSTRAINT "google_sheets_auto_sync_configs_importerId_fkey" FOREIGN KEY ("importerId") REFERENCES "google_sheet_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_sheets_auto_sync_jobs" ADD CONSTRAINT "google_sheets_auto_sync_jobs_configId_fkey" FOREIGN KEY ("configId") REFERENCES "google_sheets_auto_sync_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_sheets_auto_sync_jobs" ADD CONSTRAINT "google_sheets_auto_sync_jobs_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
