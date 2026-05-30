ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "permissionLevel" INTEGER NOT NULL DEFAULT 9;

UPDATE "User"
SET "permissionLevel" = 0
WHERE "authRole" = 'admin';

CREATE INDEX IF NOT EXISTS "User_permissionLevel_idx" ON "User"("permissionLevel");
