CREATE TABLE "ProjectTaskFactEventLog" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "sourceModule" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "projectTaskId" TEXT,
  "taskNo" INTEGER NOT NULL,
  "taskKey" TEXT,
  "taskName" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "operatorId" TEXT,
  "operatorName" TEXT,
  "payload" JSONB NOT NULL,
  "processingStatus" TEXT NOT NULL,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectTaskFactEventLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectTaskFactEventLog_eventId_key" ON "ProjectTaskFactEventLog"("eventId");
CREATE INDEX "ProjectTaskFactEventLog_projectId_idx" ON "ProjectTaskFactEventLog"("projectId");
CREATE INDEX "ProjectTaskFactEventLog_projectTaskId_idx" ON "ProjectTaskFactEventLog"("projectTaskId");
CREATE INDEX "ProjectTaskFactEventLog_taskNo_idx" ON "ProjectTaskFactEventLog"("taskNo");
CREATE INDEX "ProjectTaskFactEventLog_eventType_idx" ON "ProjectTaskFactEventLog"("eventType");
CREATE INDEX "ProjectTaskFactEventLog_processingStatus_idx" ON "ProjectTaskFactEventLog"("processingStatus");
CREATE INDEX "ProjectTaskFactEventLog_createdAt_idx" ON "ProjectTaskFactEventLog"("createdAt");
