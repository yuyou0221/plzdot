ALTER TABLE "Project" ADD COLUMN "modelingOwnerId" TEXT;

CREATE INDEX "Project_modelingOwnerId_idx" ON "Project"("modelingOwnerId");
