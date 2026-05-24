ALTER TABLE "User"
ADD COLUMN "loginName" TEXT,
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "authRole" TEXT NOT NULL DEFAULT 'viewer',
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastLoginAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_loginName_key" ON "User"("loginName");
CREATE INDEX "User_loginName_idx" ON "User"("loginName");
CREATE INDEX "User_authRole_idx" ON "User"("authRole");
