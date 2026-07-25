-- Sprache des Absenders festhalten. Die Benachrichtigung soll in der Sprache
-- ankommen, in der uns jemand geschrieben hat — nicht in der des Admins, der
-- gerade antwortet. Bestehende Tickets bleiben NULL und fallen auf die
-- Standardsprache zurueck.
ALTER TABLE "SupportTicket" ADD COLUMN "locale" TEXT;
