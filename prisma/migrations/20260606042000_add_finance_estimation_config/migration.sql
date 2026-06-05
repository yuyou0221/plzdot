CREATE TABLE "FinanceEstimationConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "discountRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "salesByLevel" JSONB NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceEstimationConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceEstimationConfig_name_key" ON "FinanceEstimationConfig"("name");
CREATE INDEX "FinanceEstimationConfig_updatedAt_idx" ON "FinanceEstimationConfig"("updatedAt");
