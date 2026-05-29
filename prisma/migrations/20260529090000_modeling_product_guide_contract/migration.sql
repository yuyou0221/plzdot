ALTER TABLE "ModelingTask"
ADD COLUMN "sourceStyleId" TEXT,
ADD COLUMN "styleSequence" TEXT,
ADD COLUMN "isFirstModelingStyle" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "referenceImageUrls" JSONB;

CREATE INDEX "ModelingTask_projectId_projectTaskId_sourceStyleId_idx"
ON "ModelingTask"("projectId", "projectTaskId", "sourceStyleId");

CREATE INDEX "ModelingTask_projectId_projectTaskId_styleSequence_idx"
ON "ModelingTask"("projectId", "projectTaskId", "styleSequence");

CREATE INDEX "ModelingTask_projectId_isFirstModelingStyle_idx"
ON "ModelingTask"("projectId", "isFirstModelingStyle");
