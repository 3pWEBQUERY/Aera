-- Plattform-Admins koennen das Paket einer Community direkt setzen. Diese
-- Vergabe ist weder von Stripe noch von einem Promo-Code gedeckt und braucht
-- deshalb eine eigene Herkunft: MANUAL wird — wie FREE und PROMO — lokal
-- aufgefuellt und laeuft nie von selbst ab.
--
-- ADD VALUE laeuft ab PostgreSQL 12 auch innerhalb einer Transaktion, solange
-- der neue Wert in derselben Transaktion nicht verwendet wird. Diese Migration
-- fuegt ihn nur hinzu.
ALTER TYPE "CreatorPlanSource" ADD VALUE IF NOT EXISTS 'MANUAL';
