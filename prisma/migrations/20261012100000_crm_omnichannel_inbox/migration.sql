-- CRM omnichannel — Gateway de Entrada (registro bruto) + Caixa de Entrada (conversas).
-- Somente ADIÇÕES: nada é removido nem alterado de forma destrutiva.

-- 1) webhook_inbox vira o registro bruto universal de eventos recebidos.
ALTER TABLE "webhook_inbox" ADD COLUMN IF NOT EXISTS "kind" TEXT;
ALTER TABLE "webhook_inbox" ADD COLUMN IF NOT EXISTS "channelRef" TEXT;
ALTER TABLE "webhook_inbox" ADD COLUMN IF NOT EXISTS "unitId" TEXT;
ALTER TABLE "webhook_inbox" ADD COLUMN IF NOT EXISTS "payload" JSONB;
ALTER TABLE "webhook_inbox" ADD COLUMN IF NOT EXISTS "correlationId" TEXT;
ALTER TABLE "webhook_inbox" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "webhook_inbox" ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3);
ALTER TABLE "webhook_inbox" ADD COLUMN IF NOT EXISTS "resultRef" TEXT;
CREATE INDEX IF NOT EXISTS "webhook_inbox_status_nextAttemptAt_idx" ON "webhook_inbox"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "webhook_inbox_tenantId_kind_receivedAt_idx" ON "webhook_inbox"("tenantId", "kind", "receivedAt");

-- 2) Conversas e mensagens (Caixa de Entrada omnichannel).
CREATE TABLE IF NOT EXISTS "conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "channel" TEXT NOT NULL,
    "accountRef" TEXT NOT NULL,
    "externalContactId" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "customerId" TEXT,
    "leadId" TEXT,
    "vehicleId" TEXT,
    "assignedToUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_tenantId_channel_accountRef_externalContactId_key" ON "conversations"("tenantId", "channel", "accountRef", "externalContactId");
CREATE INDEX IF NOT EXISTS "conversations_tenantId_status_lastMessageAt_idx" ON "conversations"("tenantId", "status", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "conversations_tenantId_assignedToUserId_lastMessageAt_idx" ON "conversations"("tenantId", "assignedToUserId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "conversations_leadId_idx" ON "conversations"("leadId");

CREATE TABLE IF NOT EXISTS "conversation_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "authorUserId" TEXT,
    "authorName" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_messages_tenantId_externalMessageId_key" ON "conversation_messages"("tenantId", "externalMessageId");
CREATE INDEX IF NOT EXISTS "conversation_messages_conversationId_sentAt_idx" ON "conversation_messages"("conversationId", "sentAt");
DO $$ BEGIN
  ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
