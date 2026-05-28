CREATE TABLE "PermissionRole" (
    "id" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "projectSchedule" BOOLEAN NOT NULL DEFAULT false,
    "productGuide" BOOLEAN NOT NULL DEFAULT false,
    "modelingSchedule" BOOLEAN NOT NULL DEFAULT false,
    "userData" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT '启用',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PermissionRole_roleName_key" ON "PermissionRole"("roleName");
CREATE INDEX "PermissionRole_status_idx" ON "PermissionRole"("status");
