-- Sprache für E-Mails an diese Person. Bewusst ohne Spalten-Grant an
-- aera_app (siehe scripts/rls-config.ts, COLUMN_PRIVILEGES.User): gelesen und
-- geschrieben wird sie nur über den privilegierten Client (Registrierung,
-- Sprachwähler, Mailversand).
ALTER TABLE "User" ADD COLUMN "locale" TEXT;
