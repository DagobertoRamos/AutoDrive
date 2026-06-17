-- AutoDrive — F&I Master (aditivo). Mapeamento de campos por provedor.
-- Só adiciona a coluna JSON; não altera dados existentes.

-- AlterTable
ALTER TABLE "finance_providers" ADD COLUMN "fieldMappings" JSONB;
