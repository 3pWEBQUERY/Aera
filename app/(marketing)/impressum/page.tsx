import { LegalShell } from "@/components/marketing/legal-shell";

export const metadata = {
  title: "Impressum",
  description: "Impressum und Anbieterkennzeichnung von Aera.so.",
};

/**
 * WICHTIG: Die Platzhalter in eckigen Klammern müssen vor dem Launch durch
 * die echten Betreiberdaten ersetzt werden. Diese Seite ist eine Vorlage
 * und ersetzt keine Rechtsberatung.
 */
export default function ImpressumPage() {
  return (
    <LegalShell eyebrow="Rechtliches" title="Impressum" updated="Stand: Juli 2026">
      <section>
        <h2>
          Anbieterkennzeichnung — Angaben gemäß Art. 3 Abs. 1 lit. s UWG
          (Schweiz) und § 5 DDG (Deutschland)
        </h2>
        <p className="mt-3">
          Alexander Sulschani
          <br />
          Aera.so
          <br />
          Schaffhauserstrasse 6
          <br />
          8180 Bülach
          <br />
          Schweiz
        </p>
      </section>

      <section>
        <h2>Kontakt</h2>
        <p className="mt-3">
          E-Mail: <a href="mailto:contact@aera.so">contact@aera.so</a>
          <br />
          Telefon: +41 76 542 44 82
        </p>
      </section>

      <section>
        <h2>Unternehmens-Identifikationsnummer / Umsatzsteuer-ID</h2>
        <p className="mt-3">
          UID (Schweiz): wurde beantragt (wird in Kürze eingetragen)
          <br />
          USt-IdNr. (EU, sofern registriert): wurde beantragt (wird in Kürze
          eingetragen)
        </p>
      </section>

      <section>
        <h2>Verantwortlich für den Inhalt</h2>
        <p className="mt-3">
          Alexander Sulschani, Anschrift wie oben (für Angebote in Deutschland:
          Verantwortlicher i. S. d. § 18 Abs. 2 MStV).
        </p>
      </section>

      <section>
        <h2>Inhalte der Communities</h2>
        <p className="mt-3">
          Aera.so ist eine Plattform, auf der Creator eigene Communities
          betreiben. Für Inhalte, die von Creators oder Mitgliedern innerhalb
          einer Community veröffentlicht werden, ist die jeweilige
          Urheberin bzw. der jeweilige Urheber verantwortlich. Hinweise auf
          rechtswidrige Inhalte nehmen wir unter{" "}
          <a href="mailto:contact@aera.so">contact@aera.so</a> entgegen und
          entfernen diese nach Prüfung umgehend.
        </p>
      </section>

      <section>
        <h2>Streitbeilegung</h2>
        <p className="mt-3">
          Wir sind nicht bereit und nicht verpflichtet, an
          Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
          teilzunehmen.
        </p>
      </section>
    </LegalShell>
  );
}
