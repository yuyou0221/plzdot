-- Keep project task cards unique across schedule runs.
-- The page reads the latest schedule result; stale task cards from earlier runs must not remain visible.

WITH latest_successful_run AS (
  SELECT id
  FROM "ScheduleRun"
  WHERE "runStatus" = U&'\6210\529F'
  ORDER BY "calculatedAt" DESC
  LIMIT 1
)
DELETE FROM "TaskCard"
WHERE "cardType" = U&'\9879\76EE\4EFB\52A1\5361'
  AND "entityType" = 'project_task'
  AND (
    NOT EXISTS (SELECT 1 FROM latest_successful_run)
    OR "lastRenderedFromRunId" IS DISTINCT FROM (SELECT id FROM latest_successful_run)
  );

WITH ranked_project_task_cards AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "cardType", "entityType", "entityId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, id DESC
    ) AS row_number
  FROM "TaskCard"
  WHERE "cardType" = U&'\9879\76EE\4EFB\52A1\5361'
    AND "entityType" = 'project_task'
)
DELETE FROM "TaskCard"
WHERE id IN (
  SELECT id
  FROM ranked_project_task_cards
  WHERE row_number > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaskCard_project_task_entity_unique"
  ON "TaskCard" ("cardType", "entityType", "entityId")
  WHERE "cardType" = U&'\9879\76EE\4EFB\52A1\5361'
    AND "entityType" = 'project_task';
