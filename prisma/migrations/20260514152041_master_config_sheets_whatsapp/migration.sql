-- AlterTable
ALTER TABLE "google_sheet_configs" ADD COLUMN     "columnMapping" JSONB,
ADD COLUMN     "dedupeField" TEXT DEFAULT 'negotiation',
ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "google_sheet_tabs" ADD COLUMN     "gid" TEXT,
ADD COLUMN     "monthReference" TEXT,
ADD COLUMN     "sortOrder" INTEGER DEFAULT 0;
