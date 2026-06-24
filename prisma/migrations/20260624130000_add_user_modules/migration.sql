-- Liberação/remoção de módulos por colaborador (override por usuário).
CREATE TABLE IF NOT EXISTS "user_modules" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "allowed"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_modules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_modules_userId_moduleKey_key" ON "user_modules"("userId", "moduleKey");
CREATE INDEX IF NOT EXISTS "user_modules_userId_idx" ON "user_modules"("userId");

DO $$ BEGIN
  ALTER TABLE "user_modules"
    ADD CONSTRAINT "user_modules_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
