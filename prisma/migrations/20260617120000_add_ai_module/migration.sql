-- AutoDrive — Módulo de IA controlada (aditivo). Novas tabelas/enums.
-- NÃO altera tabelas existentes. Segredos do provedor ficam cifrados.

-- CreateEnum
CREATE TYPE "DocumentProcessingStatus" AS ENUM ('uploaded', 'processing', 'text_extracted', 'requires_ocr', 'ai_processed', 'failed', 'unsupported', 'corrupted', 'protected', 'too_large');
CREATE TYPE "AiProviderKind" AS ENUM ('GEMINI', 'OPENAI', 'ANTHROPIC', 'CUSTOM');
CREATE TYPE "AiEnvironment" AS ENUM ('SANDBOX', 'PRODUCAO');

-- CreateTable
CREATE TABLE "document_processing_jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "documentId" TEXT,
    "sourceModule" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "status" "DocumentProcessingStatus" NOT NULL DEFAULT 'uploaded',
    "extractedText" TEXT,
    "aiSummary" TEXT,
    "errorMessage" TEXT,
    "providerUsed" TEXT,
    "createdByUserId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "document_processing_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "document_processing_jobs_tenantId_idx" ON "document_processing_jobs"("tenantId");
CREATE INDEX "document_processing_jobs_documentId_idx" ON "document_processing_jobs"("documentId");
CREATE INDEX "document_processing_jobs_status_idx" ON "document_processing_jobs"("status");

CREATE TABLE "ai_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "AiProviderKind" NOT NULL DEFAULT 'CUSTOM',
    "model" TEXT,
    "authType" TEXT,
    "secretsEncrypted" TEXT,
    "maskedHints" JSONB,
    "baseUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "environment" "AiEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "maxTokensPerRequest" INTEGER,
    "dailyLimit" INTEGER,
    "monthlyLimit" INTEGER,
    "timeoutMs" INTEGER,
    "allowPdf" BOOLEAN NOT NULL DEFAULT false,
    "allowImage" BOOLEAN NOT NULL DEFAULT false,
    "allowReports" BOOLEAN NOT NULL DEFAULT false,
    "allowHelpChat" BOOLEAN NOT NULL DEFAULT false,
    "allowDocAnalysis" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_providers_code_key" ON "ai_providers"("code");

CREATE TABLE "ai_instructions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "title" TEXT NOT NULL,
    "area" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_instructions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_instructions_tenantId_idx" ON "ai_instructions"("tenantId");
CREATE INDEX "ai_instructions_scope_idx" ON "ai_instructions"("scope");

CREATE TABLE "ai_instruction_versions" (
    "id" TEXT NOT NULL,
    "instructionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "scope" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_instruction_versions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_instruction_versions_instructionId_idx" ON "ai_instruction_versions"("instructionId");

CREATE TABLE "ai_knowledge_base" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'manual_text',
    "sourceDocumentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_knowledge_base_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_knowledge_base_tenantId_idx" ON "ai_knowledge_base"("tenantId");
CREATE INDEX "ai_knowledge_base_scope_idx" ON "ai_knowledge_base"("scope");

CREATE TABLE "ai_knowledge_chunks" (
    "id" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "tenantId" TEXT,
    "chunkText" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "embedding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_knowledge_chunks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_knowledge_chunks_knowledgeBaseId_idx" ON "ai_knowledge_chunks"("knowledgeBaseId");
CREATE INDEX "ai_knowledge_chunks_tenantId_idx" ON "ai_knowledge_chunks"("tenantId");

CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "providerId" TEXT,
    "feature" TEXT NOT NULL,
    "promptSummary" TEXT,
    "tokenInput" INTEGER,
    "tokenOutput" INTEGER,
    "costEstimate" DECIMAL(12,6),
    "status" TEXT NOT NULL DEFAULT 'OK',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_usage_logs_tenantId_idx" ON "ai_usage_logs"("tenantId");
CREATE INDEX "ai_usage_logs_userId_idx" ON "ai_usage_logs"("userId");
CREATE INDEX "ai_usage_logs_providerId_idx" ON "ai_usage_logs"("providerId");
CREATE INDEX "ai_usage_logs_createdAt_idx" ON "ai_usage_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "ai_instruction_versions" ADD CONSTRAINT "ai_instruction_versions_instructionId_fkey" FOREIGN KEY ("instructionId") REFERENCES "ai_instructions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "ai_knowledge_base"("id") ON DELETE CASCADE ON UPDATE CASCADE;
