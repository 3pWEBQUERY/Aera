# Aera Legal- und Datenschutz-Launch-Checkliste

Stand: 20. Juli 2026

Diese Checkliste dokumentiert die technischen Nachweise und die verbleibenden
organisatorischen Freigaben. Sie ersetzt keine Rechtsberatung. Ein Punkt darf
erst als erledigt markiert werden, wenn der Nachweis im angegebenen System
abgelegt ist.

## Bereits technisch umgesetzt

- Registrierung und Einladungen verlangen eine nicht vorausgewählte Annahme
  der AGB sowie die Kenntnisnahme des Datenschutzhinweises. Dokument, Version,
  Quelle und Zeitpunkt werden in `LegalAcceptance` gespeichert.
- Wesentliche neue AGB-Versionen können bei der nächsten Anmeldung erneut
  bestätigt werden. Marketing-Einwilligungen werden davon unabhängig geführt.
- Newsletter haben ein separates, freiwilliges Opt-in mit Ereignisverlauf,
  Widerruf im Konto, Abmeldelink, RFC-8058-One-Click-Abmeldung sowie Bounce- und
  Complaint-Sperren. Bestehende Mitglieder werden nicht automatisch angemeldet.
- Sofort freigeschaltete entgeltliche digitale Inhalte verlangen eine eigene,
  nicht vorausgewählte Erklärung. Zeitpunkt und Textversion werden auf der
  Bestellung beziehungsweise Mitgliedschaft und in Stripe-Metadaten gesichert.
- Nutzer können ihre Daten als strukturiertes JSON exportieren und eine
  bestätigte Kontolöschung anstoßen. Creator können Community-Daten als JSON
  oder einzelne Datensätze als CSV exportieren.
- Konto- und Community-Löschungen laufen als wiederholbare Hintergrundjobs.
  Offene Zahlungen blockieren die Löschung, Stripe-Verträge werden geprüft,
  Objekte werden aus dem Storage entfernt und gesetzlich aufzubewahrende
  Finanzdaten werden von Live-Konten getrennt und pseudonymisiert gespeichert.

## Vor dem Livegang extern freigeben

### 1. Anbieter- und Vertragsrollen

- [ ] Eine auf Schweiz und die angebotenen EU/EWR-Märkte spezialisierte
  Rechtsberatung hat Impressum, AGB, Datenschutzinformation und
  Widerrufsbelehrung schriftlich freigegeben.
- [ ] Für jeden Verkaufstyp ist entschieden und dokumentiert, wer
  Vertragspartner und umsatzsteuerlicher Leistender ist: Aera oder der Creator.
- [ ] Die Stripe-Connect-Konfiguration, Checkout-Anzeige, Rechnungen,
  Zahlungsbelege und Rechtstexte verwenden dieselbe Rollenverteilung.
- [ ] Creator müssen vor ihrem ersten Verkauf vollständige Anbieterangaben,
  Rückgabe-/Widerrufskontakt und die in ihren Zielmärkten nötigen
  Steuerangaben hinterlegen. Die Angaben werden vor dem Kauf angezeigt.
- [ ] UID-/MWST-/USt-/OSS-Pflichten und die endgültigen Angaben im Impressum
  sind mit Treuhand beziehungsweise Steuerberatung geklärt.

### 2. Datenschutzorganisation

- [ ] Verzeichnis der Verarbeitungstätigkeiten, Löschkonzept,
  Berechtigungskonzept und Verfahren für Betroffenenanfragen sind intern
  freigegeben; zuständige Person und Vertretung sind benannt.
- [ ] Auftragsverarbeitungsvereinbarung für Creator sowie Verträge und
  Transfermechanismen mit Railway, dem produktiven Objektspeicher, Stripe,
  Resend und optionalen KI-/Push-Anbietern sind abgelegt.
- [ ] Die konkrete Railway-Region und Bucket-Region stimmen mit der
  Datenschutzinformation und dem Subprozessorenverzeichnis überein.
- [ ] Es ist rechtlich geklärt, ob ein EU-Vertreter nach Art. 27 DSGVO und/oder
  eine Datenschutz-Folgenabschätzung erforderlich ist.
- [ ] Eine echte Testanfrage für Export, Berichtigung, Widerspruch und Löschung
  wurde mit Identitätsprüfung und dokumentierter Frist durchgespielt.

### 3. Verbraucher- und E-Mail-Prozesse

- [ ] Kaufbestätigung und Vertragsinhalt werden dem Käufer auf einem
  dauerhaften Datenträger zugestellt; die Bestätigung enthält Anbieter,
  Leistung, Preis, Laufzeit/Kündigung und die abgegebene Erklärung zum
  sofortigen Leistungsbeginn.
- [ ] Der genaue Wortlaut und die Einordnung jedes Angebots als Ware,
  Dienstleistung oder digitaler Inhalt wurden geprüft. Insbesondere darf die
  Behandlung von Abonnements nicht pauschal aus der Behandlung eines
  Downloads abgeleitet werden.
- [ ] Resend sendet Bounce- und Complaint-Ereignisse signiert an
  `/api/resend/webhook`; das Signing-Secret liegt in Railway.
- [ ] Absenderidentität, SPF, DKIM und DMARC für die produktive Mail-Domain sind
  verifiziert; Abmeldung wurde mit Gmail, Outlook und Apple Mail getestet.

## Betriebsnachweise

- [ ] Alle Prisma-Migrationen und RLS-Regeln wurden in Produktion angewendet.
- [ ] Der Lifecycle-Cron läuft mindestens täglich und alarmiert bei
  `BLOCKED`-Jobs oder ausgeschöpften Objektlöschungen.
- [ ] Ein verschlüsseltes Backup wurde wiederhergestellt; danach wurden Export
  und Löschung erneut getestet.
- [ ] Der Zugriff auf Aufbewahrungsdatensätze ist in Produktion nachweislich
  auf die privilegierte Plattformverbindung begrenzt; der Lifecycle-Purge für
  abgelaufene Datensätze wird über seine Heartbeat-Zähler überwacht.
- [ ] Die Versionskonstanten für AGB, Datenschutz und Widerruf werden bei jeder
  materiellen Textänderung aktualisiert und im Release-Protokoll notiert.

## Referenzen

- Eidgenössischer Datenschutz- und Öffentlichkeitsbeauftragter (EDÖB):
  Anforderungen an Werbung und Einwilligung —
  https://www.edoeb.admin.ch/en/advertising-marketing
- EDÖB: Auskunftsrecht und Regelfrist von 30 Tagen —
  https://www.edoeb.admin.ch/en/right-to-information
- DSGVO, insbesondere Art. 7, 15, 20 und 21 —
  https://eur-lex.europa.eu/eli/reg/2016/679/oj
- EU-Verbraucherrechte-Richtlinie 2011/83/EU —
  https://eur-lex.europa.eu/eli/dir/2011/83/oj
