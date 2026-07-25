-- Support-Tickets von Besuchern und Mitgliedern an das Plattform-Team.
-- Ohne tenantId: Support laeuft gegen die Plattform, nicht gegen eine
-- Community. Die Tabellen bleiben damit ausserhalb der Tenant-RLS.
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

CREATE TABLE "SupportTicket" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT,
  "email"         TEXT NOT NULL,
  "name"          TEXT,
  "subject"       TEXT NOT NULL,
  "status"        "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportMessage" (
  "id"            TEXT NOT NULL,
  "ticketId"      TEXT NOT NULL,
  "fromStaff"     BOOLEAN NOT NULL DEFAULT false,
  "authorId"      TEXT,
  "body"          TEXT NOT NULL,
  "readByStaffAt" TIMESTAMP(3),
  "readByUserAt"  TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicket_status_lastMessageAt_idx" ON "SupportTicket"("status", "lastMessageAt");
CREATE INDEX "SupportTicket_userId_lastMessageAt_idx" ON "SupportTicket"("userId", "lastMessageAt");
CREATE INDEX "SupportTicket_email_idx" ON "SupportTicket"("email");
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");
-- Traegt die Badge-Abfrage "wie viele ungelesene fuer uns".
CREATE INDEX "SupportMessage_fromStaff_readByStaffAt_idx" ON "SupportMessage"("fromStaff", "readByStaffAt");

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aera_app') THEN
    REVOKE ALL ON TABLE "SupportTicket" FROM aera_app;
    REVOKE ALL ON TABLE "SupportMessage" FROM aera_app;
  END IF;
END $$;
