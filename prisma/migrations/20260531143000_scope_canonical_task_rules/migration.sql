-- Keep only the canonical 31 schedule task rules active.
-- Simulation and ad-hoc rule snapshots remain in history, but must not participate in official schedule calculations.

UPDATE "TaskRule"
SET "isActive" = FALSE
WHERE "taskNo" BETWEEN 1 AND 31
  AND "sourceVersion" IS DISTINCT FROM U&'\4EFB\52A1\89C4\5219v4';
