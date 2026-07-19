import { LegalShell } from "@/components/marketing/legal-shell";

export const metadata = {
  title: "Datenschutz",
  description: "Datenschutzerklärung für die Nutzung von Aera.so.",
};

export default function DatenschutzPage() {
  return (
    <LegalShell
      eyebrow="Rechtliches"
      title="Datenschutzerklärung"
      updated="Stand: Juli 2026"
    >
      <section>
        <h2>1. Verantwortlicher</h2>
        <p className="mt-3">
          Alexander Sulschani, Schaffhauserstrasse 6, 8180 Bülach, Schweiz
          <br />
          E-Mail: <a href="mailto:contact@aera.so">contact@aera.so</a>
        </p>
      </section>

      <section>
        <h2>2. Überblick über die Verarbeitungen</h2>
        <p className="mt-3">
          Aera.so ist eine Community-Plattform. Wir verarbeiten
          personenbezogene Daten, um Konten bereitzustellen, Communities zu
          betreiben, Zahlungen abzuwickeln, Newsletter zuzustellen und die
          Plattform abzusichern. Es gilt der Grundsatz der Datenminimierung —
          wir erheben nur, was für den jeweiligen Zweck erforderlich ist.
        </p>
        <p className="mt-3">
          Als Verantwortlicher mit Sitz in der Schweiz unterliegen wir dem
          Schweizer Datenschutzgesetz (revDSG). Soweit wir Daten von Personen
          in der EU/im EWR verarbeiten, gilt zusätzlich die DSGVO (Art. 3
          Abs. 2 DSGVO); die in dieser Erklärung genannten Rechtsgrundlagen
          beziehen sich auf die DSGVO und gelten sinngemäß auch nach revDSG.
        </p>
      </section>

      <section>
        <h2>3. Konto und Community-Nutzung</h2>
        <p className="mt-3">
          Bei der Registrierung verarbeiten wir Name, E-Mail-Adresse und ein
          kryptografisch gehashtes Passwort (Art. 6 Abs. 1 lit. b DSGVO —
          Vertragserfüllung). Innerhalb einer Community verarbeiten wir die
          von dir erstellten Inhalte (Beiträge, Kommentare, Nachrichten),
          deine Mitgliedschaften sowie Aktivitätsdaten wie Punkte und
          Kursfortschritte. Jede Community ist technisch von allen anderen
          getrennt; Community-Betreiber sehen nur die Daten ihrer eigenen
          Community.
        </p>
        <p className="mt-3">
          Zur Kontosicherheit speichern wir zusätzlich den Status der
          E-Mail-Bestätigung sowie — falls du die Zwei-Faktor-Authentisierung
          aktivierst — ein 2FA-Geheimnis (Art. 6 Abs. 1 lit. b und f DSGVO).
          Trittst du einer Community über einen Empfehlungslink bei, speichern
          wir, welches Mitglied dich geworben hat, um Empfehlungsprämien
          korrekt zuzuordnen (Art. 6 Abs. 1 lit. b DSGVO).
        </p>
      </section>

      <section>
        <h2>4. Zahlungsabwicklung (Stripe)</h2>
        <p className="mt-3">
          Kostenpflichtige Leistungen werden über Stripe Payments Europe,
          Ltd. (Irland) abgewickelt (Art. 6 Abs. 1 lit. b DSGVO).
          Zahlungsdaten wie Kartennummern werden direkt von Stripe erhoben
          und nicht auf unseren Servern gespeichert. Stripe kann Daten in die
          USA übermitteln; hierfür bestehen EU-Standardvertragsklauseln bzw.
          eine Zertifizierung nach dem EU-US Data Privacy Framework. Details:{" "}
          <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
            stripe.com/privacy
          </a>
        </p>
      </section>

      <section>
        <h2>5. E-Mails und Newsletter (Resend)</h2>
        <p className="mt-3">
          Transaktionale E-Mails (z. B. Passwort-Reset, E-Mail-Bestätigung)
          und Community-Newsletter versenden wir über den Dienstleister
          Resend, Inc. (USA). Community-Newsletter erhältst du nur, wenn du
          hierfür eine separate, freiwillige Einwilligung erteilt und deine
          E-Mail-Adresse bestätigt hast (Art. 6 Abs. 1 lit. a DSGVO). Die
          Einwilligung ist nicht vorausgewählt, nicht an die Kontoeröffnung
          gekoppelt und jederzeit im Konto oder über den Abmeldelink jeder
          Nachricht widerrufbar. Der Widerruf wirkt für die Zukunft und lässt
          die vorherige Verarbeitung unberührt.
        </p>
        <p className="mt-3">
          Zur Zustellung und Missbrauchsvermeidung verarbeiten wir Versand-,
          Zustell-, Abmelde-, Bounce- und Beschwerdeereignisse. Dauerhafte
          Sperreinträge für abgemeldete oder unzustellbare Adressen werden nur
          aufbewahrt, soweit dies erforderlich ist, um weitere Sendungen zu
          verhindern. Für Übermittlungen in die USA werden die jeweils
          erforderlichen Garantien nach Schweizer Datenschutzrecht und, soweit
          anwendbar, der DSGVO vereinbart.
        </p>
      </section>

      <section>
        <h2>6. KI-Funktionen (Google Gemini)</h2>
        <p className="mt-3">
          Für den KI-Assistenten und Empfehlungen nutzen wir Google Gemini
          (Google Ireland Ltd. / Google LLC, USA). Verarbeitet werden dabei
          ausschließlich Inhalte der jeweiligen Community (z. B. Beiträge und
          Kurstitel), niemals Inhalte anderer Communities. Rechtsgrundlage
          ist Art. 6 Abs. 1 lit. b bzw. f DSGVO. Für Drittlandübermittlungen
          bestehen EU-Standardvertragsklauseln.
        </p>
        <p className="mt-3">
          Zusätzlich prüfen wir neu veröffentlichte Beiträge und Kommentare
          automatisiert auf Spam, Betrugsmuster und beleidigende Inhalte —
          teils durch eigene Heuristiken, teils durch Google Gemini. Auffällige
          Inhalte werden lediglich zur Prüfung markiert und dem
          Moderationsteam der Community angezeigt; eine automatische Löschung
          oder Sperrung findet nicht statt, die Entscheidung trifft immer ein
          Mensch (Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse an einer
          sicheren Plattform; keine automatisierte Entscheidung i. S. d.
          Art. 22 DSGVO). Markierungen werden mit dem geprüften Inhalt
          gespeichert und gelöscht, wenn der Inhalt gelöscht wird.
        </p>
      </section>

      <section>
        <h2>7. Hosting und Infrastruktur</h2>
        <p className="mt-3">
          Anwendung und Datenbank werden bei Railway Corp. (USA) betrieben;
          Uploads liegen in einem privat konfigurierten S3-kompatiblen
          Objektspeicher. Der konkrete Speicherstandort richtet sich nach der
          für den Produktivbetrieb gewählten Bucket-Region. Rechtsgrundlage
          ist Art. 6 Abs. 1 lit. b und f DSGVO. Für Empfänger in Staaten ohne
          anerkannt angemessenes Datenschutzniveau werden die erforderlichen
          vertraglichen und technischen Garantien eingesetzt. Server-Logs (IP-Adresse,
          Zeitstempel, aufgerufene Ressource) werden zur Absicherung des
          Betriebs kurzzeitig verarbeitet. Sicherheitsrelevante Aktionen
          (z. B. Anmeldungen, Rollenänderungen, Zahlungs-Ereignisse) werden
          zudem in internen Audit-Protokollen festgehalten (Art. 6 Abs. 1
          lit. f DSGVO — Nachvollziehbarkeit und Missbrauchsabwehr).
        </p>
      </section>

      <section>
        <h2>8. Cookies und lokale Speicherung</h2>
        <p className="mt-3">
          Wir verwenden ausschließlich technisch notwendige Cookies: ein
          Sitzungs-Cookie für den Login sowie ein Cookie für deine
          Spracheinstellung (Art. 6 Abs. 1 lit. f DSGVO, § 25 Abs. 2 TDDDG).
          Tracking- oder Werbe-Cookies setzen wir nicht ein; ein
          Cookie-Banner ist daher nicht erforderlich.
        </p>
      </section>

      <section>
        <h2>9. Push-Benachrichtigungen</h2>
        <p className="mt-3">
          Optional kannst du Push-Benachrichtigungen aktivieren. Dabei wird
          eine Geräte-Subscription gespeichert (Art. 6 Abs. 1 lit. a DSGVO —
          Einwilligung). Du kannst Push jederzeit in deinem Konto oder im
          Browser deaktivieren; die Subscription wird dann gelöscht.
        </p>
      </section>

      <section>
        <h2>10. Speicherdauer und Löschung</h2>
        <p className="mt-3">
          Kontodaten speichern wir für die Dauer der Kontoexistenz.
          Nach Löschung des Kontos oder einer Community werden
          personenbezogene Daten gelöscht, soweit keine gesetzlichen
          Aufbewahrungspflichten (z. B. Art. 958f OR — 10 Jahre für
          Buchungsbelege; bzw. §§ 147 AO, 257 HGB, soweit deutsches
          Steuerrecht anwendbar ist) entgegenstehen. Daten, die wegen einer
          Aufbewahrungspflicht nicht sofort gelöscht werden dürfen, werden für
          andere Zwecke gesperrt. Offene Zahlungen, Rückbuchungen,
          Sicherheitsvorfälle und Rechtsansprüche können ebenfalls eine
          begrenzte weitere Speicherung erfordern.
        </p>
        <p className="mt-3">
          Angemeldete Nutzer können ihre bereitgestellten Daten in einem
          strukturierten, maschinenlesbaren Format exportieren und die
          Kontolöschung im Konto anstoßen. Creator können zusätzlich ihre
          Community-Daten im Dashboard exportieren. Dateiinhalte werden bei
          Löschungen über einen nachverfolgbaren Hintergrundprozess aus dem
          Objektspeicher entfernt; fehlgeschlagene Löschungen werden erneut
          versucht und abgeglichen.
        </p>
      </section>

      <section>
        <h2>11. Deine Rechte</h2>
        <p className="mt-3">
          Du hast nach der DSGVO (bzw. sinngemäß nach dem Schweizer revDSG)
          insbesondere das Recht auf:
        </p>
        <ul className="mt-3">
          <li>Auskunft (Art. 15), Berichtigung (Art. 16) und Löschung (Art. 17),</li>
          <li>Einschränkung der Verarbeitung (Art. 18),</li>
          <li>Datenübertragbarkeit (Art. 20),</li>
          <li>Widerspruch gegen Verarbeitungen auf Basis berechtigter Interessen (Art. 21),</li>
          <li>Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft (Art. 7 Abs. 3),</li>
          <li>
            Beschwerde bei einer Datenschutz-Aufsichtsbehörde (Art. 77); in
            der Schweiz ist dies der Eidgenössische Datenschutz- und
            Öffentlichkeitsbeauftragte (EDÖB).
          </li>
        </ul>
        <p className="mt-3">
          Wende dich dazu an{" "}
          <a href="mailto:contact@aera.so">contact@aera.so</a>.
          Auskunftsanfragen beantworten wir grundsätzlich kostenlos und nach
          verlässlicher Identitätsprüfung innerhalb der gesetzlichen Fristen;
          nach Schweizer Recht in der Regel innerhalb von 30 Tagen.
        </p>
      </section>

      <section>
        <h2>12. Verantwortlichkeit der Community-Betreiber</h2>
        <p className="mt-3">
          Soweit Creator innerhalb ihrer Community personenbezogene Daten
          ihrer Mitglieder für eigene Zwecke verarbeiten (z. B. eigene
          Newsletter-Segmente oder Angebote), sind sie für diese Zwecke selbst
          verantwortlich. Soweit wir Daten ausschließlich nach dokumentierten
          Weisungen eines Creators verarbeiten, handeln wir als
          Auftragsverarbeiter. Für plattformeigene Zwecke wie Kontosicherheit,
          Abrechnung und Missbrauchsabwehr bleiben wir eigenständig
          verantwortlich. Die konkrete Rollenverteilung richtet sich nach dem
          jeweiligen Verarbeitungsvorgang und den ergänzenden Vereinbarungen.
        </p>
      </section>
    </LegalShell>
  );
}
