CREATE TABLE "FinanceProjectFact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actualDevelopmentCost" DOUBLE PRECISION,
    "totalOrderQuantity" INTEGER,
    "actualSales" INTEGER,
    "channelSampleQuantity" INTEGER,
    "displayBoxQuantity" INTEGER,
    "displayBoxUnitPrice" DOUBLE PRECISION,
    "notes" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceProjectFact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceProjectFact_projectId_key" ON "FinanceProjectFact"("projectId");
CREATE INDEX "FinanceProjectFact_updatedAt_idx" ON "FinanceProjectFact"("updatedAt");
CREATE INDEX "FinanceProjectFact_updatedByUserId_idx" ON "FinanceProjectFact"("updatedByUserId");
