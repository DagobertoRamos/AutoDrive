-- Arquivos no Google Drive: o registro continua (links não mudam), os bytes
-- saem do banco. driveFileId preenchido = conteúdo no Drive e data NULL.
ALTER TABLE "vehicle_files" ADD COLUMN "driveFileId" TEXT;
ALTER TABLE "vehicle_files" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "evaluation_files" ADD COLUMN "driveFileId" TEXT;
ALTER TABLE "evaluation_files" ALTER COLUMN "data" DROP NOT NULL;
