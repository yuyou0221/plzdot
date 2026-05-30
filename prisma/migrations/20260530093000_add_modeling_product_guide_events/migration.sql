CREATE TABLE "ModelingProductGuideEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "sourceModule" TEXT NOT NULL DEFAULT 'modeling-schedule',
  "targetModule" TEXT NOT NULL DEFAULT 'product-guide',
  "projectId" TEXT NOT NULL,
  "projectTaskId" TEXT,
  "modelingTaskId" TEXT,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "generatedBy" TEXT,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ModelingProductGuideEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModelingProductGuideEvent_eventType_idx" ON "ModelingProductGuideEvent"("eventType");
CREATE INDEX "ModelingProductGuideEvent_projectId_idx" ON "ModelingProductGuideEvent"("projectId");
CREATE INDEX "ModelingProductGuideEvent_projectTaskId_idx" ON "ModelingProductGuideEvent"("projectTaskId");
CREATE INDEX "ModelingProductGuideEvent_modelingTaskId_idx" ON "ModelingProductGuideEvent"("modelingTaskId");
CREATE INDEX "ModelingProductGuideEvent_targetModule_status_idx" ON "ModelingProductGuideEvent"("targetModule", "status");
CREATE INDEX "ModelingProductGuideEvent_createdAt_idx" ON "ModelingProductGuideEvent"("createdAt");
