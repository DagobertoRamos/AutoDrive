-- AlterTable
ALTER TABLE "managers" ADD COLUMN     "positionId" TEXT;

-- AlterTable
ALTER TABLE "sellers" ADD COLUMN     "positionId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "positionId" TEXT;

-- CreateIndex
CREATE INDEX "managers_positionId_idx" ON "managers"("positionId");

-- CreateIndex
CREATE INDEX "sellers_positionId_idx" ON "sellers"("positionId");

-- CreateIndex
CREATE INDEX "users_positionId_idx" ON "users"("positionId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managers" ADD CONSTRAINT "managers_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
