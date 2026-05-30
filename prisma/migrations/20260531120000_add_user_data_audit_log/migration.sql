-- CreateTable
CREATE TABLE "UserDataAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "actorLoginName" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "result" TEXT NOT NULL,
    "summary" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDataAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserDataAuditLog_actorUserId_idx" ON "UserDataAuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "UserDataAuditLog_action_idx" ON "UserDataAuditLog"("action");

-- CreateIndex
CREATE INDEX "UserDataAuditLog_result_idx" ON "UserDataAuditLog"("result");

-- CreateIndex
CREATE INDEX "UserDataAuditLog_createdAt_idx" ON "UserDataAuditLog"("createdAt");
