-- Ankündigungs-Spaces aus dem Onboarding: nur das Team postet.
-- Neue Communities bekommen das schon beim Anlegen (lib/space-catalog.ts).
-- Bestehende "ankuendigungen"-Feeds ohne eigene Einstellung ziehen nach; wer
-- Mitglieder dort posten lassen will, stellt es im Space auf "Alle Mitglieder".
UPDATE "Space"
SET "settings" = COALESCE("settings", '{}'::jsonb) || '{"postingPolicy": "team"}'::jsonb
WHERE "type" = 'FEED'
  AND "slug" = 'ankuendigungen'
  AND ("settings" IS NULL OR NOT ("settings" ? 'postingPolicy'));
