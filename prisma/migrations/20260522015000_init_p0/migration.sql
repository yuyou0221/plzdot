-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teamType" TEXT NOT NULL,
    "parentTeamId" TEXT,
    "leaderUserId" TEXT,
    "specialtyTags" JSONB,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT '启用',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teamId" TEXT,
    "roleTitle" TEXT,
    "userType" TEXT NOT NULL DEFAULT '内部',
    "isModeler" BOOLEAN NOT NULL DEFAULT false,
    "weeklyCapacityStyles" INTEGER,
    "status" TEXT NOT NULL DEFAULT '启用',
    "contactInfo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelerCapabilityTag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tagName" TEXT NOT NULL,
    "tagType" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ModelerCapabilityTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutsourceVendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactInfo" TEXT,
    "specialtyTags" JSONB,
    "stableCapacity" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT '启用',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutsourceVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "projectCode" TEXT,
    "projectName" TEXT NOT NULL,
    "ipName" TEXT,
    "licensorName" TEXT,
    "productType" TEXT,
    "styleCount" INTEGER,
    "projectLevel" TEXT,
    "routeType" TEXT,
    "needThreeView" BOOLEAN,
    "plannedLaunchDate" DATE NOT NULL,
    "projectStartDate" DATE,
    "projectTeamId" TEXT,
    "projectOwnerId" TEXT,
    "artOwnerId" TEXT,
    "currentStage" TEXT,
    "status" TEXT NOT NULL DEFAULT '进行中',
    "sourceImportId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskRule" (
    "id" TEXT NOT NULL,
    "taskNo" INTEGER NOT NULL,
    "taskName" TEXT NOT NULL,
    "milestoneType" TEXT NOT NULL,
    "standardWorkdays" INTEGER,
    "predecessorRule" JSONB,
    "routeCondition" TEXT,
    "needThreeViewCondition" BOOLEAN,
    "startFinishRule" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskRuleId" TEXT,
    "taskNo" INTEGER NOT NULL,
    "taskName" TEXT NOT NULL,
    "milestoneType" TEXT NOT NULL,
    "ownerId" TEXT,
    "collaboratorIds" JSONB,
    "plannedStartDate" DATE,
    "plannedFinishDate" DATE,
    "actualStartDate" DATE,
    "actualFinishDate" DATE,
    "expectedFinishDate" DATE,
    "status" TEXT NOT NULL DEFAULT '未开始',
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" TEXT,
    "progressNote" TEXT,
    "lastUpdatedAt" TIMESTAMP(3),
    "lastUpdatedBy" TEXT,
    "sourceImportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressUpdate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectTaskId" TEXT NOT NULL,
    "updateType" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "note" TEXT,
    "updatedBy" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImport" (
    "id" TEXT NOT NULL,
    "importType" TEXT NOT NULL,
    "sourceFileName" TEXT,
    "sourceFilePath" TEXT,
    "sheetName" TEXT,
    "rowCount" INTEGER,
    "importStatus" TEXT NOT NULL,
    "errorMessage" TEXT,
    "importedBy" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawMetadata" JSONB,

    CONSTRAINT "DataImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleRun" (
    "id" TEXT NOT NULL,
    "runName" TEXT,
    "runType" TEXT NOT NULL,
    "sourceImportId" TEXT,
    "scriptName" TEXT NOT NULL,
    "scriptVersion" TEXT,
    "inputSnapshot" JSONB,
    "outputFilePath" TEXT,
    "runStatus" TEXT NOT NULL,
    "errorMessage" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "ScheduleRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleProjectResult" (
    "id" TEXT NOT NULL,
    "scheduleRunId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "plannedLaunchDate" DATE NOT NULL,
    "forecastLaunchDate" DATE,
    "delayDays" INTEGER,
    "riskLevel" TEXT NOT NULL DEFAULT '正常',
    "currentStage" TEXT,
    "currentTaskId" TEXT,
    "currentTaskName" TEXT,
    "riskMessage" TEXT,
    "projectProgressPercent" INTEGER,
    "blockedTaskCount" INTEGER,
    "staleTaskCount" INTEGER,
    "missingExpectedFinishCount" INTEGER,
    "rawResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleProjectResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleTaskResult" (
    "id" TEXT NOT NULL,
    "scheduleRunId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectTaskId" TEXT NOT NULL,
    "taskNo" INTEGER NOT NULL,
    "taskName" TEXT NOT NULL,
    "milestoneType" TEXT NOT NULL,
    "plannedStartDate" DATE,
    "plannedFinishDate" DATE,
    "forecastStartDate" DATE,
    "forecastFinishDate" DATE,
    "expectedFinishDate" DATE,
    "taskActionType" TEXT,
    "displayStatus" TEXT,
    "delayDays" INTEGER,
    "remainingSafeDays" INTEGER,
    "recoverableByDate" DATE,
    "isRecoverable" BOOLEAN,
    "blockingPredecessorNames" JSONB,
    "riskLevel" TEXT NOT NULL DEFAULT '正常',
    "riskMessage" TEXT,
    "rawResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleTaskResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelingTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectTaskId" TEXT NOT NULL,
    "styleCode" TEXT NOT NULL,
    "styleName" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "originalArtStatus" TEXT NOT NULL DEFAULT '未过审',
    "originalArtApprovedDate" DATE,
    "difficulty" TEXT NOT NULL,
    "estimatedWorkdays" INTEGER NOT NULL,
    "modelerId" TEXT,
    "assignmentOwnerId" TEXT,
    "isOutsourced" BOOLEAN NOT NULL DEFAULT false,
    "outsourceVendorId" TEXT,
    "stableOutsourceCapacity" BOOLEAN,
    "plannedStartDate" DATE,
    "plannedFinishDate" DATE,
    "actualStartDate" DATE,
    "actualFinishDate" DATE,
    "actualWorkdays" INTEGER,
    "remainingWorkdays" INTEGER,
    "status" TEXT NOT NULL DEFAULT '未分配',
    "reviewRound" INTEGER,
    "lastFeedbackAt" TIMESTAMP(3),
    "blockedSince" TIMESTAMP(3),
    "blockedDays" INTEGER,
    "blockType" TEXT,
    "affectsProjectSchedule" BOOLEAN NOT NULL DEFAULT true,
    "lastUpdatedAt" TIMESTAMP(3),
    "lastUpdatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelingFeedback" (
    "id" TEXT NOT NULL,
    "modelingTaskId" TEXT NOT NULL,
    "feedbackType" TEXT NOT NULL,
    "roundNo" INTEGER NOT NULL,
    "feedbackByUserId" TEXT,
    "feedbackByName" TEXT,
    "feedbackAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT '普通',
    "attachmentUrl" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT '待处理',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelingFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectModelingProgress" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectTaskId" TEXT NOT NULL,
    "totalRequiredStyles" INTEGER NOT NULL,
    "approvedStyles" INTEGER NOT NULL,
    "inProgressStyles" INTEGER NOT NULL,
    "submittedStyles" INTEGER NOT NULL,
    "outsourcedStyles" INTEGER NOT NULL,
    "unassignedStyles" INTEGER NOT NULL,
    "progressPercent" INTEGER NOT NULL,
    "projectedAllApprovedDate" DATE,
    "canWritebackProjectTask" BOOLEAN NOT NULL DEFAULT false,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectModelingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTask" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "projectId" TEXT,
    "projectTaskId" TEXT,
    "modelingTaskId" TEXT,
    "scheduleTaskResultId" TEXT,
    "taskTitle" TEXT NOT NULL,
    "taskGroup" TEXT NOT NULL,
    "weekStartDate" DATE,
    "month" TEXT,
    "ownerId" TEXT,
    "priority" TEXT,
    "expectedFinishDate" DATE,
    "forecastDeadline" DATE,
    "riskLevel" TEXT NOT NULL DEFAULT '正常',
    "riskMessage" TEXT,
    "status" TEXT NOT NULL DEFAULT '待确认',
    "actionRequired" TEXT,
    "createdFromRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCard" (
    "id" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "visualStatus" TEXT NOT NULL DEFAULT 'normal',
    "riskLevel" TEXT NOT NULL DEFAULT '正常',
    "laneType" TEXT NOT NULL,
    "laneKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "draggable" BOOLEAN NOT NULL DEFAULT true,
    "lockedReason" TEXT,
    "lastRenderedFromRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleAdjustment" (
    "id" TEXT NOT NULL,
    "taskCardId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "adjustmentType" TEXT NOT NULL,
    "changedField" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "reason" TEXT,
    "requiresSimulation" BOOLEAN NOT NULL DEFAULT false,
    "affectsFinance" BOOLEAN,
    "affectsReview" BOOLEAN,
    "status" TEXT NOT NULL DEFAULT '草稿',
    "createdBy" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleSimulation" (
    "id" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "baseScheduleRunId" TEXT,
    "simulationRunId" TEXT,
    "impactSummary" TEXT,
    "impactedProjectIds" JSONB,
    "impactedTaskIds" JSONB,
    "oldForecastLaunchDate" DATE,
    "newForecastLaunchDate" DATE,
    "launchDateDeltaDays" INTEGER,
    "riskLevelBefore" TEXT,
    "riskLevelAfter" TEXT,
    "rawSimulationResult" JSONB,
    "status" TEXT NOT NULL DEFAULT '待确认',
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleSimulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDragLog" (
    "id" TEXT NOT NULL,
    "taskCardId" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromLaneType" TEXT,
    "fromLaneKey" TEXT,
    "fromSortOrder" INTEGER,
    "toLaneType" TEXT,
    "toLaneKey" TEXT,
    "toSortOrder" INTEGER,
    "changedField" TEXT,
    "fromValue" TEXT,
    "toValue" TEXT,
    "adjustmentId" TEXT,
    "simulationId" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "dragReason" TEXT,
    "draggedBy" TEXT,
    "draggedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDragLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "projectId" TEXT,
    "projectTaskId" TEXT,
    "modelingTaskId" TEXT,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "triggerRule" TEXT,
    "triggerValue" JSONB,
    "status" TEXT NOT NULL DEFAULT '未处理',
    "ownerId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedNote" TEXT,
    "createdFromRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Team_teamType_idx" ON "Team"("teamType");

-- CreateIndex
CREATE INDEX "Team_status_idx" ON "Team"("status");

-- CreateIndex
CREATE INDEX "User_teamId_idx" ON "User"("teamId");

-- CreateIndex
CREATE INDEX "User_isModeler_idx" ON "User"("isModeler");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "ModelerCapabilityTag_userId_idx" ON "ModelerCapabilityTag"("userId");

-- CreateIndex
CREATE INDEX "ModelerCapabilityTag_tagName_idx" ON "ModelerCapabilityTag"("tagName");

-- CreateIndex
CREATE INDEX "OutsourceVendor_status_idx" ON "OutsourceVendor"("status");

-- CreateIndex
CREATE INDEX "Project_projectName_idx" ON "Project"("projectName");

-- CreateIndex
CREATE INDEX "Project_plannedLaunchDate_idx" ON "Project"("plannedLaunchDate");

-- CreateIndex
CREATE INDEX "Project_projectTeamId_idx" ON "Project"("projectTeamId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "TaskRule_milestoneType_idx" ON "TaskRule"("milestoneType");

-- CreateIndex
CREATE INDEX "TaskRule_isActive_idx" ON "TaskRule"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TaskRule_taskNo_sourceVersion_key" ON "TaskRule"("taskNo", "sourceVersion");

-- CreateIndex
CREATE INDEX "ProjectTask_projectId_taskNo_idx" ON "ProjectTask"("projectId", "taskNo");

-- CreateIndex
CREATE INDEX "ProjectTask_status_idx" ON "ProjectTask"("status");

-- CreateIndex
CREATE INDEX "ProjectTask_milestoneType_idx" ON "ProjectTask"("milestoneType");

-- CreateIndex
CREATE INDEX "ProjectTask_ownerId_idx" ON "ProjectTask"("ownerId");

-- CreateIndex
CREATE INDEX "ProgressUpdate_projectId_idx" ON "ProgressUpdate"("projectId");

-- CreateIndex
CREATE INDEX "ProgressUpdate_projectTaskId_idx" ON "ProgressUpdate"("projectTaskId");

-- CreateIndex
CREATE INDEX "ProgressUpdate_createdAt_idx" ON "ProgressUpdate"("createdAt");

-- CreateIndex
CREATE INDEX "DataImport_importType_idx" ON "DataImport"("importType");

-- CreateIndex
CREATE INDEX "DataImport_importedAt_idx" ON "DataImport"("importedAt");

-- CreateIndex
CREATE INDEX "ScheduleRun_runType_idx" ON "ScheduleRun"("runType");

-- CreateIndex
CREATE INDEX "ScheduleRun_calculatedAt_idx" ON "ScheduleRun"("calculatedAt");

-- CreateIndex
CREATE INDEX "ScheduleRun_runStatus_idx" ON "ScheduleRun"("runStatus");

-- CreateIndex
CREATE INDEX "ScheduleProjectResult_scheduleRunId_projectId_idx" ON "ScheduleProjectResult"("scheduleRunId", "projectId");

-- CreateIndex
CREATE INDEX "ScheduleProjectResult_projectId_idx" ON "ScheduleProjectResult"("projectId");

-- CreateIndex
CREATE INDEX "ScheduleProjectResult_riskLevel_idx" ON "ScheduleProjectResult"("riskLevel");

-- CreateIndex
CREATE INDEX "ScheduleTaskResult_scheduleRunId_projectTaskId_idx" ON "ScheduleTaskResult"("scheduleRunId", "projectTaskId");

-- CreateIndex
CREATE INDEX "ScheduleTaskResult_projectId_taskNo_idx" ON "ScheduleTaskResult"("projectId", "taskNo");

-- CreateIndex
CREATE INDEX "ScheduleTaskResult_milestoneType_idx" ON "ScheduleTaskResult"("milestoneType");

-- CreateIndex
CREATE INDEX "ScheduleTaskResult_riskLevel_idx" ON "ScheduleTaskResult"("riskLevel");

-- CreateIndex
CREATE INDEX "ModelingTask_projectId_idx" ON "ModelingTask"("projectId");

-- CreateIndex
CREATE INDEX "ModelingTask_projectTaskId_idx" ON "ModelingTask"("projectTaskId");

-- CreateIndex
CREATE INDEX "ModelingTask_modelerId_status_idx" ON "ModelingTask"("modelerId", "status");

-- CreateIndex
CREATE INDEX "ModelingTask_status_idx" ON "ModelingTask"("status");

-- CreateIndex
CREATE INDEX "ModelingTask_isOutsourced_idx" ON "ModelingTask"("isOutsourced");

-- CreateIndex
CREATE INDEX "ModelingFeedback_modelingTaskId_idx" ON "ModelingFeedback"("modelingTaskId");

-- CreateIndex
CREATE INDEX "ModelingFeedback_feedbackAt_idx" ON "ModelingFeedback"("feedbackAt");

-- CreateIndex
CREATE INDEX "ModelingFeedback_status_idx" ON "ModelingFeedback"("status");

-- CreateIndex
CREATE INDEX "ProjectModelingProgress_projectId_idx" ON "ProjectModelingProgress"("projectId");

-- CreateIndex
CREATE INDEX "ProjectModelingProgress_projectTaskId_idx" ON "ProjectModelingProgress"("projectTaskId");

-- CreateIndex
CREATE INDEX "WorkTask_projectId_idx" ON "WorkTask"("projectId");

-- CreateIndex
CREATE INDEX "WorkTask_ownerId_idx" ON "WorkTask"("ownerId");

-- CreateIndex
CREATE INDEX "WorkTask_weekStartDate_idx" ON "WorkTask"("weekStartDate");

-- CreateIndex
CREATE INDEX "WorkTask_month_idx" ON "WorkTask"("month");

-- CreateIndex
CREATE INDEX "WorkTask_status_idx" ON "WorkTask"("status");

-- CreateIndex
CREATE INDEX "TaskCard_cardType_laneType_laneKey_idx" ON "TaskCard"("cardType", "laneType", "laneKey");

-- CreateIndex
CREATE INDEX "TaskCard_entityType_entityId_idx" ON "TaskCard"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "TaskCard_projectId_idx" ON "TaskCard"("projectId");

-- CreateIndex
CREATE INDEX "ScheduleAdjustment_taskCardId_idx" ON "ScheduleAdjustment"("taskCardId");

-- CreateIndex
CREATE INDEX "ScheduleAdjustment_entityType_entityId_idx" ON "ScheduleAdjustment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ScheduleAdjustment_status_idx" ON "ScheduleAdjustment"("status");

-- CreateIndex
CREATE INDEX "ScheduleSimulation_adjustmentId_idx" ON "ScheduleSimulation"("adjustmentId");

-- CreateIndex
CREATE INDEX "ScheduleSimulation_status_idx" ON "ScheduleSimulation"("status");

-- CreateIndex
CREATE INDEX "TaskDragLog_taskCardId_idx" ON "TaskDragLog"("taskCardId");

-- CreateIndex
CREATE INDEX "TaskDragLog_entityType_entityId_idx" ON "TaskDragLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "TaskDragLog_createdAt_idx" ON "TaskDragLog"("createdAt");

-- CreateIndex
CREATE INDEX "Alert_status_severity_idx" ON "Alert"("status", "severity");

-- CreateIndex
CREATE INDEX "Alert_projectId_idx" ON "Alert"("projectId");

-- CreateIndex
CREATE INDEX "Alert_projectTaskId_idx" ON "Alert"("projectTaskId");

-- CreateIndex
CREATE INDEX "Alert_modelingTaskId_idx" ON "Alert"("modelingTaskId");

-- CreateIndex
CREATE INDEX "Alert_userId_idx" ON "Alert"("userId");
