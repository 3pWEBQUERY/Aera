-- Dauerhafte Stories: ohne Ablauf statt mit einem Datum in ferner Zukunft.
-- NULL heisst "laeuft nie ab"; bestehende Stories behalten ihren Ablauf.
ALTER TABLE "Story" ALTER COLUMN "expiresAt" DROP NOT NULL;
