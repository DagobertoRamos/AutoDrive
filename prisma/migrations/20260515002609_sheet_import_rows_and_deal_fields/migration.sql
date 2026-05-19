-- DropIndex
DROP INDEX "pendencies_dealId_idx";

-- AlterTable
ALTER TABLE "sheet_import_rows" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "sheet_import_rows_configId_sheet_ext_idx" RENAME TO "sheet_import_rows_configId_sheetName_externalId_idx";
