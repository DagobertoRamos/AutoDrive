-- Arquivos privados (negociações, F&I, financeiro, documentos) no Google Drive.
-- A chave lógica que o sistema já guarda (blob://...) continua a mesma: esta
-- tabela diz que o conteúdo dela está no Drive.
CREATE TABLE "drive_files" (
    "key" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "tenantId" TEXT,
    "mimeType" TEXT,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "drive_files_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "drive_files_tenantId_idx" ON "drive_files"("tenantId");
