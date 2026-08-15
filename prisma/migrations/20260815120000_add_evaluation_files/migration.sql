-- Armazenamento de anexos no banco (necessário em hospedagem serverless, onde
-- o filesystem é somente leitura). Migration ADITIVA: cria uma tabela nova e
-- não altera nem remove nada existente. Avaliações e anexos já gravados
-- continuam funcionando (seguem apontando para o storage local).

CREATE TABLE IF NOT EXISTS "evaluation_files" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT,
    "evaluationId" TEXT NOT NULL,
    "fileName"     TEXT NOT NULL,
    "mimeType"     TEXT NOT NULL,
    "fileSize"     INTEGER NOT NULL,
    "data"         BYTEA NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "evaluation_files_evaluationId_idx"
    ON "evaluation_files"("evaluationId");
