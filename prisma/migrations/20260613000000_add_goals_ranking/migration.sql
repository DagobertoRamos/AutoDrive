-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('SALES_EXCHANGE', 'PURCHASE', 'RETURN', 'DOCUMENTATION', 'EXTENDED_WARRANTY', 'SERVICE');

-- CreateEnum
CREATE TYPE "GoalScope" AS ENUM ('USER', 'UNIT', 'TENANT', 'GLOBAL');

-- CreateEnum
CREATE TYPE "GoalPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ATIVA', 'INATIVA', 'ARQUIVADA');

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "unitId" TEXT,
    "userId" TEXT,
    "type" "GoalType" NOT NULL,
    "scope" "GoalScope" NOT NULL,
    "period" "GoalPeriod" NOT NULL,
    "title" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "targetValue" DECIMAL(14,2) NOT NULL,
    "measureUnit" TEXT NOT NULL DEFAULT 'QTD',
    "progressive" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" "GoalStatus" NOT NULL DEFAULT 'ATIVA',
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_levels" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "targetValue" DECIMAL(14,2) NOT NULL,
    "label" TEXT,
    "reward" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goal_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_progress" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "tenantId" TEXT,
    "unitId" TEXT,
    "userId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "achievedValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "percent" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "currentLevel" INTEGER NOT NULL DEFAULT 0,
    "reachedAt" TIMESTAMP(3),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goal_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL DEFAULT 'Padrão',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "weightSale" INTEGER NOT NULL DEFAULT 100,
    "weightPurchase" INTEGER NOT NULL DEFAULT 40,
    "weightReturn" INTEGER NOT NULL DEFAULT 25,
    "weightDocumentation" INTEGER NOT NULL DEFAULT 20,
    "weightWarranty" INTEGER NOT NULL DEFAULT 30,
    "weightService" INTEGER NOT NULL DEFAULT 20,
    "weightOverduePendency" INTEGER NOT NULL DEFAULT -15,
    "weightCanceledSale" INTEGER NOT NULL DEFAULT -50,
    "weightLateDocument" INTEGER NOT NULL DEFAULT -10,
    "tiebreakers" JSONB,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ranking_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_scores" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT,
    "tenantId" TEXT,
    "unitId" TEXT,
    "userId" TEXT NOT NULL,
    "period" "GoalPeriod" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "returns" INTEGER NOT NULL DEFAULT 0,
    "documentations" INTEGER NOT NULL DEFAULT 0,
    "warranties" INTEGER NOT NULL DEFAULT 0,
    "services" INTEGER NOT NULL DEFAULT 0,
    "overduePendencies" INTEGER NOT NULL DEFAULT 0,
    "canceledSales" INTEGER NOT NULL DEFAULT 0,
    "lateDocuments" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "qualityScore" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "rankGeneral" INTEGER,
    "rankUnit" INTEGER,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ranking_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goals_tenantId_idx" ON "goals"("tenantId");

-- CreateIndex
CREATE INDEX "goals_unitId_idx" ON "goals"("unitId");

-- CreateIndex
CREATE INDEX "goals_userId_idx" ON "goals"("userId");

-- CreateIndex
CREATE INDEX "goals_type_scope_period_idx" ON "goals"("type", "scope", "period");

-- CreateIndex
CREATE INDEX "goals_status_idx" ON "goals"("status");

-- CreateIndex
CREATE INDEX "goals_startDate_endDate_idx" ON "goals"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "goal_levels_goalId_idx" ON "goal_levels"("goalId");

-- CreateIndex
CREATE UNIQUE INDEX "goal_levels_goalId_level_key" ON "goal_levels"("goalId", "level");

-- CreateIndex
CREATE INDEX "goal_progress_goalId_idx" ON "goal_progress"("goalId");

-- CreateIndex
CREATE INDEX "goal_progress_tenantId_idx" ON "goal_progress"("tenantId");

-- CreateIndex
CREATE INDEX "goal_progress_userId_idx" ON "goal_progress"("userId");

-- CreateIndex
CREATE INDEX "goal_progress_unitId_idx" ON "goal_progress"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "goal_progress_goalId_periodStart_key" ON "goal_progress"("goalId", "periodStart");

-- CreateIndex
CREATE INDEX "ranking_rules_tenantId_idx" ON "ranking_rules"("tenantId");

-- CreateIndex
CREATE INDEX "ranking_scores_tenantId_idx" ON "ranking_scores"("tenantId");

-- CreateIndex
CREATE INDEX "ranking_scores_unitId_idx" ON "ranking_scores"("unitId");

-- CreateIndex
CREATE INDEX "ranking_scores_userId_idx" ON "ranking_scores"("userId");

-- CreateIndex
CREATE INDEX "ranking_scores_periodStart_periodEnd_idx" ON "ranking_scores"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_scores_tenantId_userId_periodStart_periodEnd_key" ON "ranking_scores"("tenantId", "userId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_levels" ADD CONSTRAINT "goal_levels_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_progress" ADD CONSTRAINT "goal_progress_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_rules" ADD CONSTRAINT "ranking_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_scores" ADD CONSTRAINT "ranking_scores_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ranking_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_scores" ADD CONSTRAINT "ranking_scores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_scores" ADD CONSTRAINT "ranking_scores_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_scores" ADD CONSTRAINT "ranking_scores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

