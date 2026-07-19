import { LegalShell } from "@/components/marketing/legal-shell";

export const metadata = {
  title: "AGB",
  description: "Allgemeine Geschäftsbedingungen für die Nutzung von Aera.so.",
};

export default function AgbPage() {
  return (
    <LegalShell
      eyebrow="Rechtliches"
      title="Allgemeine Geschäftsbedingungen"
      updated="Stand: Juli 2026"
    >
      <section>
        <h2>1. Geltungsbereich und Anbieter</h2>
        <p className="mt-3">
          Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Nutzung
          der Plattform Aera.so (nachfolgend „Plattform“), betrieben von
          Alexander Sulschani, Schaffhauserstrasse 6, 8180 Bülach (nachfolgend
          „Anbieter“ oder „wir“). Abweichende Bedingungen der Nutzer finden
          keine Anwendung, es sei denn, wir stimmen ihrer Geltung ausdrücklich
          zu.
        </p>
      </section>

      <section>
        <h2>2. Leistungsbeschreibung</h2>
        <p className="mt-3">
          Aera.so ist eine Software-Plattform, auf der Creator eigene
          Online-Communities betreiben können — mit Beiträgen, Foren, Kursen,
          Events, Newslettern, Chat und dem Verkauf von Mitgliedschaften und
          digitalen Produkten. Wir stellen die technische Infrastruktur bereit;
          Vertragspartner der Community-Mitglieder für kostenpflichtige
          Inhalte ist der jeweilige Creator (siehe Ziffer 7).
        </p>
        <p className="mt-3">
          Die Plattform enthält KI-gestützte Funktionen (z. B. einen
          Assistenten für Textentwürfe, Empfehlungen sowie eine automatische
          Vorprüfung von Inhalten auf Regelverstöße). KI-generierte Ausgaben
          können fehlerhaft oder unvollständig sein; sie sind vor einer
          Veröffentlichung oder sonstigen Verwendung eigenverantwortlich zu
          prüfen. Automatische Inhalts-Markierungen führen nicht zu einer
          automatischen Löschung; die Entscheidung trifft der Creator bzw.
          dessen Moderationsteam.
        </p>
      </section>

      <section>
        <h2>3. Registrierung und Konto</h2>
        <p className="mt-3">
          Die Registrierung ist kostenlos und setzt ein Mindestalter von 16
          Jahren voraus. Die bei der Registrierung angegebenen Daten müssen
          wahrheitsgemäß sein. Zugangsdaten sind vertraulich zu behandeln;
          für Aktivitäten über das eigene Konto ist der Kontoinhaber
          verantwortlich, sofern er die Nutzung zu vertreten hat.
        </p>
      </section>

      <section>
        <h2>4. Kostenpflichtige Leistungen des Anbieters</h2>
        <p className="mt-3">
          Für Creator bieten wir kostenpflichtige Software-Pakete
          (Abonnements) und Credit-Pakete für den KI-Assistenten an. Preise
          und Leistungsumfang ergeben sich aus der jeweils aktuellen
          Preisseite. Abonnements verlängern sich automatisch um die gewählte
          Laufzeit, sofern sie nicht vor Ablauf gekündigt werden. Die
          Kündigung ist jederzeit zum Ende der laufenden Abrechnungsperiode
          möglich. Auf Umsätze der Creator über die Plattform erheben wir
          eine Plattformgebühr; deren Höhe wird im Dashboard ausgewiesen.
        </p>
      </section>

      <section>
        <h2>5. Zahlungsabwicklung</h2>
        <p className="mt-3">
          Die Zahlungsabwicklung erfolgt über den Zahlungsdienstleister Stripe
          (Stripe Payments Europe, Ltd., Irland). Für Auszahlungen an Creator
          nutzen wir Stripe Connect; hierfür gelten ergänzend die Bedingungen
          von Stripe, insbesondere das Stripe Connected Account Agreement.
        </p>
      </section>

      <section>
        <h2>6. Inhalte der Nutzer, Rechte und Pflichten</h2>
        <p className="mt-3">
          Nutzer behalten sämtliche Rechte an den von ihnen eingestellten
          Inhalten. Sie räumen uns die für den Betrieb der Plattform
          erforderlichen einfachen Nutzungsrechte ein (insbesondere
          Speicherung, technische Vervielfältigung und Zugänglichmachung
          innerhalb der jeweiligen Community). Unzulässig sind insbesondere:
        </p>
        <ul className="mt-3">
          <li>rechtswidrige, beleidigende oder jugendgefährdende Inhalte,</li>
          <li>Verletzungen von Urheber-, Marken- oder Persönlichkeitsrechten,</li>
          <li>Spam, Schadsoftware und irreführende Werbung,</li>
          <li>Eingriffe in die technische Integrität der Plattform.</li>
        </ul>
        <p className="mt-3">
          Wir dürfen Inhalte entfernen und Konten sperren, wenn konkrete
          Anhaltspunkte für einen Verstoß gegen diese AGB oder geltendes Recht
          vorliegen. Creator sind für die Moderation ihrer Community
          mitverantwortlich.
        </p>
      </section>

      <section>
        <h2>7. Verträge zwischen Creators und Mitgliedern</h2>
        <p className="mt-3">
          Kauft ein Mitglied eine Mitgliedschaft, einen Kurs, ein Event oder
          ein digitales Produkt innerhalb einer Community, kommt der Vertrag
          ausschließlich zwischen dem Mitglied und dem jeweiligen Creator
          zustande. Der Creator ist für die Erbringung der Leistung, die
          Erfüllung gesetzlicher Informationspflichten sowie für steuerliche
          Pflichten verantwortlich. Wir treten insoweit nur als technischer
          Dienstleister und Vermittler der Zahlungsabwicklung auf.
        </p>
      </section>

      <section>
        <h2>8. Widerrufsrecht</h2>
        <p className="mt-3">
          Verbrauchern steht ein gesetzliches Widerrufsrecht zu. Einzelheiten
          ergeben sich aus der <a href="/widerruf">Widerrufsbelehrung</a>.
          Bei digitalen Inhalten erlischt das Widerrufsrecht, wenn der
          Verbraucher ausdrücklich zugestimmt hat, dass vor Ablauf der
          Widerrufsfrist mit der Ausführung begonnen wird, und seine Kenntnis
          vom Erlöschen des Widerrufsrechts bestätigt hat.
        </p>
      </section>

      <section>
        <h2>9. Verfügbarkeit</h2>
        <p className="mt-3">
          Wir bemühen uns um eine hohe Verfügbarkeit der Plattform, schulden
          jedoch keine ununterbrochene Erreichbarkeit. Wartungsarbeiten,
          Weiterentwicklungen oder Störungen außerhalb unseres
          Einflussbereichs können zu vorübergehenden Einschränkungen führen.
        </p>
      </section>

      <section>
        <h2>10. Haftung</h2>
        <p className="mt-3">
          Wir haften unbeschränkt für Vorsatz und grobe Fahrlässigkeit sowie
          bei Verletzung von Leben, Körper und Gesundheit. Bei einfacher
          Fahrlässigkeit haften wir nur für die Verletzung wesentlicher
          Vertragspflichten (Kardinalpflichten), begrenzt auf den
          vertragstypischen, vorhersehbaren Schaden. Zwingende gesetzliche
          Haftungsvorschriften (einschließlich produkthaftungsrechtlicher
          Ansprüche) bleiben unberührt. Für Inhalte der Nutzer übernehmen wir
          keine Verantwortung.
        </p>
      </section>

      <section>
        <h2>11. Datenexport und Vertragsende</h2>
        <p className="mt-3">
          Creator können die Daten ihrer Community jederzeit über das
          Dashboard exportieren. Nach Vertragsende werden personenbezogene
          Daten gemäß unserer{" "}
          <a href="/datenschutz">Datenschutzerklärung</a> gelöscht, soweit
          keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
        </p>
      </section>

      <section>
        <h2>12. Änderungen dieser AGB</h2>
        <p className="mt-3">
          Wir können diese AGB mit Wirkung für die Zukunft anpassen, soweit
          dies wegen Rechtsänderungen, Sicherheitsanforderungen oder einer
          sachlich erforderlichen Weiterentwicklung der Plattform notwendig
          ist und das vertragliche Gleichgewicht nicht unangemessen zulasten
          der Nutzer verschoben wird. Über wesentliche Änderungen informieren
          wir vor ihrem Inkrafttreten. Soweit eine Änderung eine ausdrückliche
          Zustimmung erfordert, holen wir diese gesondert ein; bloßes
          Schweigen gilt dann nicht als Zustimmung.
        </p>
      </section>

      <section>
        <h2>13. Schlussbestimmungen</h2>
        <p className="mt-3">
          Es gilt schweizerisches Recht unter Ausschluss des UN-Kaufrechts
          und der Kollisionsnormen. Gegenüber Verbrauchern mit gewöhnlichem
          Aufenthalt in der EU oder im EWR gilt diese Rechtswahl nur, soweit
          ihnen dadurch nicht der Schutz zwingender
          Verbraucherschutzvorschriften ihres Aufenthaltsstaats entzogen
          wird. Sollten einzelne Bestimmungen unwirksam sein, bleibt die
          Wirksamkeit der übrigen Bestimmungen unberührt.
        </p>
      </section>
    </LegalShell>
  );
}
