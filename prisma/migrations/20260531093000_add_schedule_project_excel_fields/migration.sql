ALTER TABLE "Project" ADD COLUMN "productLine" TEXT;
ALTER TABLE "Project" ADD COLUMN "retailPrice" TEXT;
ALTER TABLE "Project" ADD COLUMN "modelingOwnerId" TEXT;
ALTER TABLE "Project" ADD COLUMN "subsidiary" TEXT;
ALTER TABLE "Project" ADD COLUMN "royaltyRate" TEXT;

CREATE INDEX "Project_modelingOwnerId_idx" ON "Project"("modelingOwnerId");
