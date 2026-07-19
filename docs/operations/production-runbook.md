# Aera Produktions-Runbook

Dieses Runbook beschreibt den minimalen Betriebsstandard für den Livebetrieb.
Ein erfolgreiches Deployment allein ist noch keine Freigabe: Datenbank,
Objektspeicher, Redis, Malware-Scanner, Jobs und Backups müssen gemeinsam grün
sein.

## Zielwerte

| Bereich | Ziel |
|---|---|
| PostgreSQL RPO | höchstens 24 Stunden Datenverlust; Ziel nach Launch: 1 Stunde |
| PostgreSQL RTO | Wiederherstellung innerhalb von 4 Stunden |
| Objekt-Uploads RPO | Versionierung aktiv; keine dauerhafte Löschung unter 30 Tagen |
| App-Verfügbarkeit | Alarm nach zwei fehlgeschlagenen Checks innerhalb von 5 Minuten |
| Cron | jeder Job startet mindestens einmal innerhalb von 12 Minuten |
| Restore-Drill | monatlich sowie vor großen Schema-/Billing-Änderungen |

RPO und RTO sind Betriebsziele, keine Behauptung. Sie gelten erst als erreicht,
wenn der erste dokumentierte Restore-Drill sie bestätigt hat.

## Health und Alarmierung

- `GET /api/health/live` prüft nur, ob der Next.js-Prozess antwortet. Railway
  verwendet diesen Endpunkt zum Aktivieren eines neuen Deployments. Ungültige
  Produktionskonfiguration blockiert bereits `prestart`; kurzzeitige Ausfälle
  von Redis, S3 oder ClamAV blockieren deshalb nicht zusätzlich den Rollout.
- `GET /api/health` beziehungsweise `/api/health/ready` prüft Konfiguration,
  ausstehende Migrationen, PostgreSQL, Redis, privaten S3-Speicher und ClamAV.
  In Produktion bedeutet jede fehlende Pflichtabhängigkeit `503`. Dieser
  Endpunkt wird durch den kontinuierlichen externen Monitor geprüft.
- `GET /api/cron/status` verlangt
  `Authorization: Bearer <CRON_SECRET>`. Er liefert nur aggregierte Backlogs und
  persistierte Job-Heartbeats. Ein fehlgeschlagener, nie gestarteter oder älter
  als zwölf Minuten gewordener Fünf-Minuten-Job ergibt `503`; für das tägliche
  Datenbankbackup gilt ein 26-Stunden-Fenster.

Für alle drei Checks wird ein externer Monitor außerhalb des Railway-Projekts
eingerichtet. Der Cron-Monitor muss benutzerdefinierte Authorization-Header
unterstützen. Zusätzlich werden Railway-Logs an ein dauerhaftes Logziel
weitergeleitet und auf folgende JSON-Ereignisse alarmiert:

- unbehandelte Server-/Request-Fehler,
- wiederholte Redis- oder Datenbankfehler,
- `cron.job.failed` und Lease-Konflikte,
- Stripe-Webhook-Fehler beziehungsweise wachsender Inbox-Backlog,
- fehlgeschlagene oder überfällige Backups.

Jeder Alarm braucht eine verantwortliche Person, einen zweiten Kontakt und
einen getesteten Benachrichtigungskanal. Secrets, URLs mit Zugangsdaten und
Bearer-Tokens werden nie in Tickets oder Chat kopiert.

## Cron auf Railway

Der Cron-Service verwendet `railway.cron.toml` als Custom Config Path und läuft
alle fünf Minuten. `CRON_TARGET_URL` zeigt direkt auf die generierte
HTTPS-Domain des Web-Service. Im Web-Service muss dafür unter **Public
Networking** zuerst eine Railway-Domain generiert sein. Im Cron-Service wird
die dort angezeigte konkrete `https://…up.railway.app`-URL eingetragen und als
staged change deployt. Alternativ ist
`https://${{Aera.RAILWAY_PUBLIC_DOMAIN}}` möglich, wenn der Web-Service exakt
`Aera` heißt und die Variablenvorschau auf eine `*.up.railway.app`-Domain
auflöst. Keine Wildcard- oder Cron-Service-Domain verwenden. So hängt der
Runner nicht von DNS oder Weiterleitungen der Custom Domain ab. `CRON_SECRET`
muss in beiden Services identisch sein.

```text
CRON_TARGET_URL=https://<generierte-Aera-Domain>.up.railway.app
CRON_SECRET=${{Aera.CRON_SECRET}}
```

Beide Services müssen im selben Projekt und Environment liegen. Nicht die
eigene generierte Domain des Cron-Service und nicht die unpräfixierte
`${{RAILWAY_PUBLIC_DOMAIN}}` verwenden: Beide zeigen zurück auf den
kurzlebigen Cron-Container statt auf die Web-App.

Nach dem ersten Lauf prüfen:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$CRON_TARGET_URL/api/cron/status"
```

Der Runner beendet sich bei einem Jobfehler mit einem Fehlercode. Parallel dazu
bleibt der Zustand in `CronJobHeartbeat` sichtbar, selbst wenn ein Container
anschließend neu gestartet wird.

Bei einem Netzwerkfehler protokolliert der Runner ausschließlich die sichere
Ziel-Origin sowie Kategorie und Fehlercode. `dns/ENOTFOUND` bedeutet meist eine
falsche oder nicht aufgelöste Zielvariable, `connection/ECONNREFUSED` einen
fehlenden Listener, `timeout/*` eine Zeitüberschreitung und `tls/*` ein
Zertifikatsproblem. Nur transiente Netzwerkfehler werden einmal kurz
wiederholt; Konfigurations-, TLS-, Redirect- und Abbruchfehler nicht.

## PostgreSQL-Backups

Es werden zwei voneinander unabhängige Ebenen verwendet:

1. Im [`Backups`-Tab des Railway-Postgres-Service](https://docs.railway.com/volumes/backups)
   tägliche, wöchentliche und
   monatliche Volume-Backups aktivieren. Zusätzlich
   [Point-in-Time-Recovery](https://docs.railway.com/volumes/point-in-time-recovery)
   einschalten, sobald der verwendete Plan es anbietet. Railway stellt einen
   PITR-Restore als neuen Schwester-Service bereit; die Quelle bleibt dabei
   unverändert.
2. Täglich ein verschlüsseltes logisches Backup in einen separaten
   S3-kompatiblen Account oder Bucket außerhalb des primären Railway-Projekts
   schreiben. Der App-Upload-Bucket ist kein unabhängiges Backupziel.

Der Backup-Job braucht PostgreSQL-Clienttools (`pg_dump`, `pg_restore`) und
[`age`](https://age-encryption.org/). Beispiel:

```bash
export AERA_ENVIRONMENT=production
export BACKUP_AGE_RECIPIENT='age1…'
export BACKUP_S3_ENDPOINT='https://…'
export BACKUP_S3_REGION='auto'
export BACKUP_S3_BUCKET='aera-postgres-backups'
export BACKUP_S3_ACCESS_KEY_ID='…'
export BACKUP_S3_SECRET_ACCESS_KEY='…'
npm run db:backup -- --retention-days 30
```

Für Railway ist dafür `railway.backup.toml` plus `Dockerfile.backup`
vorbereitet. Einen dritten Service aus demselben Repository anlegen und als
Custom Config Path `/railway.backup.toml` setzen. Der Job läuft täglich um
02:17 UTC, enthält einen PostgreSQL-17-Client sowie `age` und beendet sich nach
dem Upload. `DATABASE_URL` wird als Referenz auf Postgres gesetzt; alle
`BACKUP_*`-Werte gehören nur in diesen Service. Im unabhängigen Bucket bleiben
Object Lock/Versionierung und eine Lifecycle-Retention von mindestens 30 Tagen
aktiv.

Das Script erstellt einen konsistenten Custom-Format-Dump, validiert ihn mit
`pg_restore --list`, verschlüsselt ihn, erzeugt SHA-256 und Manifest und lädt
alle drei Dateien ins unabhängige Ziel. Nach Erfolg schreibt es den
`database-backup`-Heartbeat; dieser wird über `/api/cron/status` überwacht. Im
Produktionsmodus schlägt es ohne
Verschlüsselung und ohne unabhängiges Ziel fehl. `BACKUP_ALLOW_LOCAL_ONLY=true`
ist ausschließlich für ein Volume erlaubt, das nachweislich extern und
versionsgeschützt repliziert wird.

Railway-Volume-Backups allein reichen nicht als einzige Kopie: sie lassen sich
nur im selben Projekt/Environment wiederherstellen und werden beim Löschen des
Volumes mitgelöscht. Deshalb bleibt der verschlüsselte logische Offsite-Dump
Pflicht.

Die `age`-Identität liegt nicht in Railway und nicht im Backup-Bucket. Sie wird
in einem Firmen-Passwortmanager sowie als versiegelte Offline-Kopie bei einer
zweiten verantwortlichen Person hinterlegt. Schlüsselrotation erfolgt erst,
nachdem ein mit dem neuen Schlüssel erstelltes Backup erfolgreich restored
wurde. Alte Schlüssel bleiben mindestens so lange verfügbar wie die längste
Backup-Retention.

## Restore-Drill

Nie direkt in die Live-Datenbank restoren. Eine leere, isolierte Datenbank mit
einem Namen wie `aera_restore_202607` anlegen, Netzwerkzugriff begrenzen und
anschließend ausführen:

```bash
export RESTORE_DATABASE_URL='postgresql://…/aera_restore_202607'
export RESTORE_DRILL_CONFIRM='aera_restore_202607'
export BACKUP_AGE_IDENTITY_FILE='/sicherer/pfad/aera-backup-key.txt'
npm run db:restore-drill -- --backup /sicherer/pfad/aera-….dump.age
```

Das Script verweigert identische Quell-/Zielverbindungen, nicht eindeutig als
Restore/Drill/Test/CI markierte Datenbanknamen, fehlende Bestätigung und falsche
Checksummen. Nach dem technischen Restore werden mindestens diese Prüfungen
dokumentiert:

1. Migrationen und Tabellenzahl plausibel, `npm run db:rls` gegen das Ziel grün.
2. Stichproben für Tenants, Memberships, Orders und Stripe-Inbox nur als
   aggregierte Zähler; keine personenbezogenen Daten exportieren.
3. App temporär gegen das Restore-Ziel starten und Login, Community-Read und
   einen read-only Adminpfad prüfen. Keine E-Mails, Webhooks oder Zahlungen
   senden; externe Schlüssel im Drill nicht setzen.
4. Dauer bis zur Betriebsbereitschaft notieren und mit RTO/RPO vergleichen.
5. Restore-Datenbank nach Freigabe über das Provider-Dashboard löschen.

## Objektspeicher

- Der Upload-Bucket bleibt privat; Public ACLs sind verboten.
- Bucket-Versionierung und eine 30-tägige Schutzfrist für alte Versionen
  aktivieren. Lifecycle-Regeln erst nach einem Lösch-/Restore-Test einschalten.
- Inventar beziehungsweise Objektzahl und Gesamtgröße täglich erfassen.
- Quartalsweise eine zufällige Datei aus einer alten Version in einen isolierten
  Pfad wiederherstellen und über den autorisierten Media-Proxy prüfen.
- S3-Zugangsschlüssel getrennt für App und Backup verwenden und regelmäßig
  rotieren.

## Deployment und Rollback

1. CI muss Lint, Typecheck, Tests, Build, Migration/RLS-Smokes und den
   Production-Dependency-Audit bestehen.
2. Vor Schemaänderungen ein frisches Backup samt erfolgreicher Prüfliste
   abwarten.
3. Railway führt `npm run db:predeploy` vor dem neuen App-Release aus.
4. Nach dem Deploy `/api/health/ready`, `/api/cron/status`, Login und einen
   Stripe-Testmodus-Checkout prüfen.
5. Bei einem Appfehler auf das vorherige Image zurückrollen. Datenbankmigrationen
   werden nicht blind rückwärts ausgeführt; additive/expand-contract-Migrationen
   halten das vorherige Image während des Rollbacks kompatibel.

## Incident-Kurzablauf

1. Auswirkung und Beginn festhalten, Schreibpfade bei Datenintegritätsrisiko
   stoppen.
2. Railway-Release-ID, strukturierte Fehler und betroffenen Dienst sichern.
3. Bei Stripe zuerst Checkout blockieren, Webhook-Inbox aber weiter annehmen.
4. Bei Datenverlust keine Live-Experimente: neues Restore-Ziel aus dem letzten
   verifizierten Backup erstellen und Zeit/RPO bestimmen.
5. Nach Stabilisierung Ursache, Datenkorrektur, Kundenkommunikation und konkrete
   Prävention dokumentieren.
