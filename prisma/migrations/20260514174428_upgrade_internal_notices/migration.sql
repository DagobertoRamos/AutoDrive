-- AlterTable
ALTER TABLE "internal_notice_reads" ADD COLUMN     "clickedAt" TIMESTAMP(3),
ADD COLUMN     "displayedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "internal_notices" ADD COLUMN     "allowComments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "blockUntilRead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "displayChannels" JSONB NOT NULL DEFAULT '["BELL"]',
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "severity" TEXT NOT NULL DEFAULT 'INFO',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "targetRoles" JSONB,
ADD COLUMN     "targetTenants" JSONB,
ADD COLUMN     "targetUnits" JSONB,
ADD COLUMN     "targetUsers" JSONB,
ADD COLUMN     "updatedById" TEXT;

-- CreateTable
CREATE TABLE "internal_notice_logs" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "details" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_notice_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "internal_notice_logs_noticeId_createdAt_idx" ON "internal_notice_logs"("noticeId", "createdAt");

-- CreateIndex
CREATE INDEX "internal_notice_logs_action_idx" ON "internal_notice_logs"("action");

-- CreateIndex
CREATE INDEX "internal_notices_status_idx" ON "internal_notices"("status");

-- CreateIndex
CREATE INDEX "internal_notices_startsAt_endsAt_idx" ON "internal_notices"("startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "internal_notice_logs" ADD CONSTRAINT "internal_notice_logs_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "internal_notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
