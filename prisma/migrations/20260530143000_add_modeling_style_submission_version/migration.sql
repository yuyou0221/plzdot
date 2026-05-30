ALTER TABLE "ModelingTask"
ADD COLUMN "styleSubmissionBatchId" TEXT,
ADD COLUMN "styleSubmissionVersion" INTEGER,
ADD COLUMN "styleSubmissionSubmittedAt" TIMESTAMP(3),
ADD COLUMN "styleSubmissionSubmittedBy" TEXT;

CREATE INDEX "ModelingTask_projectId_styleSubmissionBatchId_idx" ON "ModelingTask"("projectId", "styleSubmissionBatchId");
CREATE INDEX "ModelingTask_projectId_styleSubmissionVersion_idx" ON "ModelingTask"("projectId", "styleSubmissionVersion");
