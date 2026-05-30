WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "projectId", "taskNo"
      ORDER BY
        ("actualFinishDate" IS NOT NULL) DESC,
        ("actualStartDate" IS NOT NULL) DESC,
        ("expectedFinishDate" IS NOT NULL) DESC,
        "updatedAt" DESC,
        "createdAt" ASC,
        "id" ASC
    ) AS "keepId",
    ROW_NUMBER() OVER (
      PARTITION BY "projectId", "taskNo"
      ORDER BY
        ("actualFinishDate" IS NOT NULL) DESC,
        ("actualStartDate" IS NOT NULL) DESC,
        ("expectedFinishDate" IS NOT NULL) DESC,
        "updatedAt" DESC,
        "createdAt" ASC,
        "id" ASC
    ) AS "rank"
  FROM "ProjectTask"
)
UPDATE "ProgressUpdate" target
SET "projectTaskId" = ranked."keepId"
FROM ranked
WHERE target."projectTaskId" = ranked."id"
  AND ranked."id" <> ranked."keepId";

WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "projectId", "taskNo"
      ORDER BY
        ("actualFinishDate" IS NOT NULL) DESC,
        ("actualStartDate" IS NOT NULL) DESC,
        ("expectedFinishDate" IS NOT NULL) DESC,
        "updatedAt" DESC,
        "createdAt" ASC,
        "id" ASC
    ) AS "keepId"
  FROM "ProjectTask"
)
UPDATE "ProjectTaskFactEventLog" target
SET "projectTaskId" = ranked."keepId"
FROM ranked
WHERE target."projectTaskId" = ranked."id"
  AND ranked."id" <> ranked."keepId";

WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "projectId", "taskNo"
      ORDER BY
        ("actualFinishDate" IS NOT NULL) DESC,
        ("actualStartDate" IS NOT NULL) DESC,
        ("expectedFinishDate" IS NOT NULL) DESC,
        "updatedAt" DESC,
        "createdAt" ASC,
        "id" ASC
    ) AS "keepId"
  FROM "ProjectTask"
)
UPDATE "ScheduleTaskResult" target
SET "projectTaskId" = ranked."keepId"
FROM ranked
WHERE target."projectTaskId" = ranked."id"
  AND ranked."id" <> ranked."keepId";

WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "projectId", "taskNo"
      ORDER BY
        ("actualFinishDate" IS NOT NULL) DESC,
        ("actualStartDate" IS NOT NULL) DESC,
        ("expectedFinishDate" IS NOT NULL) DESC,
        "updatedAt" DESC,
        "createdAt" ASC,
        "id" ASC
    ) AS "keepId"
  FROM "ProjectTask"
)
UPDATE "ModelingTask" target
SET "projectTaskId" = ranked."keepId"
FROM ranked
WHERE target."projectTaskId" = ranked."id"
  AND ranked."id" <> ranked."keepId";

WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "projectId", "taskNo"
      ORDER BY
        ("actualFinishDate" IS NOT NULL) DESC,
        ("actualStartDate" IS NOT NULL) DESC,
        ("expectedFinishDate" IS NOT NULL) DESC,
        "updatedAt" DESC,
        "createdAt" ASC,
        "id" ASC
    ) AS "keepId"
  FROM "ProjectTask"
)
UPDATE "ProjectModelingProgress" target
SET "projectTaskId" = ranked."keepId"
FROM ranked
WHERE target."projectTaskId" = ranked."id"
  AND ranked."id" <> ranked."keepId";

WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "projectId", "taskNo"
      ORDER BY
        ("actualFinishDate" IS NOT NULL) DESC,
        ("actualStartDate" IS NOT NULL) DESC,
        ("expectedFinishDate" IS NOT NULL) DESC,
        "updatedAt" DESC,
        "createdAt" ASC,
        "id" ASC
    ) AS "keepId"
  FROM "ProjectTask"
)
UPDATE "WorkTask" target
SET "projectTaskId" = ranked."keepId"
FROM ranked
WHERE target."projectTaskId" = ranked."id"
  AND ranked."id" <> ranked."keepId";

WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "projectId", "taskNo"
      ORDER BY
        ("actualFinishDate" IS NOT NULL) DESC,
        ("actualStartDate" IS NOT NULL) DESC,
        ("expectedFinishDate" IS NOT NULL) DESC,
        "updatedAt" DESC,
        "createdAt" ASC,
        "id" ASC
    ) AS "keepId"
  FROM "ProjectTask"
)
UPDATE "Alert" target
SET "projectTaskId" = ranked."keepId"
FROM ranked
WHERE target."projectTaskId" = ranked."id"
  AND ranked."id" <> ranked."keepId";

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "projectId", "taskNo"
      ORDER BY
        ("actualFinishDate" IS NOT NULL) DESC,
        ("actualStartDate" IS NOT NULL) DESC,
        ("expectedFinishDate" IS NOT NULL) DESC,
        "updatedAt" DESC,
        "createdAt" ASC,
        "id" ASC
    ) AS "rank"
  FROM "ProjectTask"
)
DELETE FROM "ProjectTask" target
USING ranked
WHERE target."id" = ranked."id"
  AND ranked."rank" > 1;

CREATE UNIQUE INDEX "ProjectTask_projectId_taskNo_key" ON "ProjectTask"("projectId", "taskNo");
