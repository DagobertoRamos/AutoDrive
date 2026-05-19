-- AlterTable: adiciona flag para processar negociações automaticamente no auto-sync
ALTER TABLE "google_sheets_auto_sync_configs"
  ADD COLUMN IF NOT EXISTS "processDeals" BOOLEAN NOT NULL DEFAULT false;
