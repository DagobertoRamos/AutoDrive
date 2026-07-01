-- Central de Pendências: logs de envio de push + defaults por tipo.
-- Migration ADITIVA e segura (não altera/apaga dados existentes).

-- CreateTable
CREATE TABLE "pendency_notification_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "pendencyId" TEXT NOT NULL,
    "userId" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pendency_notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pendency_notification_logs_pendencyId_idx" ON "pendency_notification_logs"("pendencyId");

-- CreateIndex
CREATE INDEX "pendency_notification_logs_tenantId_idx" ON "pendency_notification_logs"("tenantId");

-- AddForeignKey
ALTER TABLE "pendency_notification_logs" ADD CONSTRAINT "pendency_notification_logs_pendencyId_fkey" FOREIGN KEY ("pendencyId") REFERENCES "pendencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
