ALTER TABLE "PointsLedger" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "PointsLedger_dedupeKey_key" ON "PointsLedger"("dedupeKey");
