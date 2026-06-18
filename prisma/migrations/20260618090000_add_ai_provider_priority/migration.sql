-- AutoDrive — IA: prioridade do provedor (failover). Aditivo.
ALTER TABLE "ai_providers" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100;
