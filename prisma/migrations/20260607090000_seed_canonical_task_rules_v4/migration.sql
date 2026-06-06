-- Seed the canonical 31 schedule task rules used by official schedule calculations.
-- Earlier migrations seeded the P0 defaults, then deactivated non-canonical sources.
-- Fresh databases need the official v4 snapshot before task fact events can auto-create ProjectTask rows.

INSERT INTO "TaskRule" (
  "id",
  "taskNo",
  "taskName",
  "milestoneType",
  "standardWorkdays",
  "predecessorRule",
  "routeCondition",
  "needThreeViewCondition",
  "startFinishRule",
  "isActive",
  "sourceVersion",
  "createdAt",
  "updatedAt"
)
SELECT
  'task-rule-v4-' || lpad(base_rule."taskNo"::text, 3, '0') AS "id",
  base_rule."taskNo",
  base_rule."taskName",
  base_rule."milestoneType",
  base_rule."standardWorkdays",
  base_rule."predecessorRule",
  base_rule."routeCondition",
  base_rule."needThreeViewCondition",
  base_rule."startFinishRule",
  TRUE AS "isActive",
  U&'\4EFB\52A1\89C4\5219v4' AS "sourceVersion",
  CURRENT_TIMESTAMP AS "createdAt",
  CURRENT_TIMESTAMP AS "updatedAt"
FROM "TaskRule" AS base_rule
WHERE base_rule."taskNo" BETWEEN 1 AND 31
  AND base_rule."sourceVersion" = 'p0-default-task-rules-20260531'
ON CONFLICT ("taskNo", "sourceVersion") DO UPDATE SET
  "taskName" = EXCLUDED."taskName",
  "milestoneType" = EXCLUDED."milestoneType",
  "standardWorkdays" = EXCLUDED."standardWorkdays",
  "predecessorRule" = EXCLUDED."predecessorRule",
  "routeCondition" = EXCLUDED."routeCondition",
  "needThreeViewCondition" = EXCLUDED."needThreeViewCondition",
  "startFinishRule" = EXCLUDED."startFinishRule",
  "isActive" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "TaskRule"
SET "isActive" = FALSE
WHERE "taskNo" BETWEEN 1 AND 31
  AND "sourceVersion" IS DISTINCT FROM U&'\4EFB\52A1\89C4\5219v4';
