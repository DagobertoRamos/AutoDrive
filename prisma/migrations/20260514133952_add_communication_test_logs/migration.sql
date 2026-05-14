-- CreateTable
CREATE TABLE "communication_test_logs" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "errorDetails" TEXT,
    "responseMs" INTEGER,
    "messageId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_test_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communication_test_logs_channel_createdAt_idx" ON "communication_test_logs"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "communication_test_logs_triggeredBy_idx" ON "communication_test_logs"("triggeredBy");

-- CreateIndex
CREATE INDEX "communication_test_logs_success_idx" ON "communication_test_logs"("success");

-- AddForeignKey
ALTER TABLE "communication_test_logs" ADD CONSTRAINT "communication_test_logs_triggeredBy_fkey" FOREIGN KEY ("triggeredBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
