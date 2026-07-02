-- Add warranty duration in years. Existing warranties default to 1 year.
ALTER TABLE "warranties"
  ADD COLUMN IF NOT EXISTS "durationYears" INTEGER NOT NULL DEFAULT 1;
