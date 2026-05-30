CREATE TABLE "ModelingWorkLog" (
  "id" TEXT NOT NULL,
  "modelingTaskId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "projectTaskId" TEXT NOT NULL,
  "modelerId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "stopReason" TEXT NOT NULL,
  "stoppedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ModelingWorkLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModelingWorkLog_modelingTaskId_idx" ON "ModelingWorkLog"("modelingTaskId");
CREATE INDEX "ModelingWorkLog_projectId_idx" ON "ModelingWorkLog"("projectId");
CREATE INDEX "ModelingWorkLog_modelerId_idx" ON "ModelingWorkLog"("modelerId");
CREATE INDEX "ModelingWorkLog_startedAt_idx" ON "ModelingWorkLog"("startedAt");

CREATE TABLE "ModelingAssignmentHistory" (
  "id" TEXT NOT NULL,
  "modelingTaskId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "projectTaskId" TEXT NOT NULL,
  "assignmentType" TEXT NOT NULL,
  "fromModelerId" TEXT,
  "toModelerId" TEXT,
  "fromOutsourceVendorId" TEXT,
  "toOutsourceVendorId" TEXT,
  "changedBy" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ModelingAssignmentHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModelingAssignmentHistory_modelingTaskId_idx" ON "ModelingAssignmentHistory"("modelingTaskId");
CREATE INDEX "ModelingAssignmentHistory_projectId_idx" ON "ModelingAssignmentHistory"("projectId");
CREATE INDEX "ModelingAssignmentHistory_fromModelerId_idx" ON "ModelingAssignmentHistory"("fromModelerId");
CREATE INDEX "ModelingAssignmentHistory_toModelerId_idx" ON "ModelingAssignmentHistory"("toModelerId");
CREATE INDEX "ModelingAssignmentHistory_toOutsourceVendorId_idx" ON "ModelingAssignmentHistory"("toOutsourceVendorId");
CREATE INDEX "ModelingAssignmentHistory_createdAt_idx" ON "ModelingAssignmentHistory"("createdAt");
