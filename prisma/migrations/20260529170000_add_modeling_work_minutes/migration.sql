-- Add minute-level work tracking for modeling styles.
ALTER TABLE "ModelingTask"
  ADD COLUMN "actualWorkMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "activeWorkStartedAt" TIMESTAMP(3);
