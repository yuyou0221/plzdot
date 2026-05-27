-- Extend user data into the platform people/org master data model while
-- keeping legacy columns for existing scheduling modules.
ALTER TABLE "User" ADD COLUMN "departmentTeamId" TEXT;
ALTER TABLE "User" ADD COLUMN "projectGroupTeamId" TEXT;
ALTER TABLE "User" ADD COLUMN "businessRoles" JSONB;
ALTER TABLE "User" ADD COLUMN "weeklyAvailableWorkdays" INTEGER;
ALTER TABLE "User" ADD COLUMN "isSchedulable" BOOLEAN NOT NULL DEFAULT true;

UPDATE "User"
SET
  "departmentTeamId" = COALESCE("departmentTeamId", "teamId"),
  "businessRoles" = CASE
    WHEN "businessRoles" IS NOT NULL THEN "businessRoles"
    WHEN "roleTitle" IS NOT NULL AND btrim("roleTitle") <> '' THEN jsonb_build_array("roleTitle")
    ELSE '[]'::jsonb
  END,
  "weeklyAvailableWorkdays" = COALESCE("weeklyAvailableWorkdays", "weeklyCapacityStyles");

ALTER TABLE "OutsourceVendor" ADD COLUMN "vendorType" TEXT;

CREATE TABLE "UserAvailabilityBlock" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "blockType" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "workdayCount" INTEGER,
  "status" TEXT NOT NULL DEFAULT '启用',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserAvailabilityBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "User_departmentTeamId_idx" ON "User"("departmentTeamId");
CREATE INDEX "User_projectGroupTeamId_idx" ON "User"("projectGroupTeamId");
CREATE INDEX "User_isSchedulable_idx" ON "User"("isSchedulable");
CREATE INDEX "UserAvailabilityBlock_userId_idx" ON "UserAvailabilityBlock"("userId");
CREATE INDEX "UserAvailabilityBlock_startDate_endDate_idx" ON "UserAvailabilityBlock"("startDate", "endDate");
CREATE INDEX "UserAvailabilityBlock_status_idx" ON "UserAvailabilityBlock"("status");
