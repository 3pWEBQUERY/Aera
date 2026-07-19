import { LegalShell } from "@/components/marketing/legal-shell";

export const metadata = {
  title: "Widerrufsbelehrung",
  description: "Widerrufsbelehrung für Verbraucher bei Aera.so.",
};

export default function WiderrufPage() {
  return (
    <LegalShell
      eyebrow="Rechtliches"
      title="Widerrufsbelehrung"
      updated="Stand: Juli 2026"
    >
      <section>
        <h2>Widerrufsrecht</h2>
        <p className="mt-3">
          Verbrauchern mit gewöhnlichem Aufenthalt in der EU oder im EWR
          steht nach dortigem zwingendem Verbraucherrecht das folgende
          Widerrufsrecht zu, soweit keine gesetzliche Ausnahme greift.
          Verbraucher ist jede natürliche Person, die ein Rechtsgeschäft zu
          Zwecken abschließt, die überwiegend weder ihrer gewerblichen noch
          ihrer selbständigen beruflichen Tätigkeit zugerechnet werden können.
        </p>
        <p className="mt-3">
          Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen
          diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn
          Tage. Bei Dienstleistungen beginnt die Frist mit dem
          Vertragsabschluss; bei Waren grundsätzlich mit dem Erhalt der Ware.
        </p>
        <p className="mt-3">
          Für Verträge, die unmittelbar mit Aera.so abgeschlossen wurden,
          müssen Sie uns zur Ausübung des Widerrufsrechts —
        </p>
        <p className="mt-3">
          Alexander Sulschani, Aera.so, Schaffhauserstrasse 6, 8180 Bülach,
          E-Mail: <a href="mailto:contact@aera.so">contact@aera.so</a>
        </p>
        <p className="mt-3">
          — mittels einer eindeutigen Erklärung (z. B. per E-Mail) über
          Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie
          können dafür das unten stehende Muster-Widerrufsformular verwenden,
          das jedoch nicht vorgeschrieben ist. Zur Wahrung der Widerrufsfrist
          reicht es aus, dass Sie die Mitteilung über die Ausübung des
          Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.
        </p>
      </section>

      <section>
        <h2>Folgen des Widerrufs</h2>
        <p className="mt-3">
          Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen,
          die wir von Ihnen erhalten haben, unverzüglich und spätestens
          binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die
          Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen
          ist. Für die Rückzahlung verwenden wir dasselbe Zahlungsmittel, das
          Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei
          denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in
          keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte
          berechnet.
        </p>
        <p className="mt-3">
          Haben Sie verlangt, dass die Dienstleistung während der
          Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen
          Betrag zu zahlen, der dem Anteil der bis zur Ausübung des
          Widerrufs bereits erbrachten Dienstleistungen im Vergleich zum
          Gesamtumfang der vertraglich vorgesehenen Dienstleistungen
          entspricht.
        </p>
      </section>

      <section>
        <h2>Erlöschen des Widerrufsrechts bei digitalen Inhalten</h2>
        <p className="mt-3">
          Bei Verträgen über die Lieferung von nicht auf einem körperlichen
          Datenträger befindlichen digitalen Inhalten (z. B. sofort
          freigeschaltete Kurse, digitale Produkte oder bezahlte Bereiche)
          erlischt das Widerrufsrecht, wenn wir mit der Ausführung des
          Vertrags begonnen haben, nachdem Sie ausdrücklich zugestimmt
          haben, dass wir vor Ablauf der Widerrufsfrist mit der Ausführung
          beginnen, und Sie Ihre Kenntnis davon bestätigt haben, dass Sie
          durch diese Zustimmung Ihr Widerrufsrecht verlieren.
        </p>
      </section>

      <section>
        <h2>Muster-Widerrufsformular</h2>
        <p className="mt-3">
          (Wenn Sie den Vertrag widerrufen wollen, füllen Sie bitte dieses
          Formular aus und senden Sie es zurück.)
        </p>
        <div className="mt-4 rounded-2xl border border-[#161613]/15 bg-white p-5">
          <p>
            An Alexander Sulschani, Aera.so, Schaffhauserstrasse 6, 8180 Bülach,
            E-Mail: <a href="mailto:contact@aera.so">contact@aera.so</a>
          </p>
          <p className="mt-3">
            Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*)
            abgeschlossenen Vertrag über den Kauf der folgenden Waren (*) /
            die Erbringung der folgenden Dienstleistung (*):
          </p>
          <p className="mt-3">
            — Bestellt am (*) / erhalten am (*):
            <br />
            — Name des/der Verbraucher(s):
            <br />
            — Anschrift des/der Verbraucher(s):
            <br />
            — Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf
            Papier):
            <br />— Datum:
          </p>
          <p className="mt-3">(*) Unzutreffendes streichen.</p>
        </div>
      </section>

      <section>
        <h2>Hinweis zu Käufen bei Creators</h2>
        <p className="mt-3">
          Bei Käufen innerhalb einer Community (Mitgliedschaften, Kurse,
          digitale Produkte) ist Ihr Vertragspartner der jeweilige Creator.
          Richten Sie Ihren Widerruf in diesem Fall an den Creator; wir
          unterstützen auf Wunsch bei der Kontaktaufnahme unter{" "}
          <a href="mailto:contact@aera.so">contact@aera.so</a>.
        </p>
        <p className="mt-3">
          Für Waren, Dienstleistungen oder digitale Inhalte eines Creators
          können je nach Angebot unterschiedliche Fristbeginne, Rücksendewege
          und gesetzliche Ausnahmen gelten. Maßgeblich sind die vor dem Kauf
          angezeigten Anbieter- und Vertragsinformationen des Creators.
        </p>
      </section>
    </LegalShell>
  );
}
