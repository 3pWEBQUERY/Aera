/**
 * Rahmen aller Space-Seiten.
 *
 * Feed-Seiten setzen `data-wide` auf ihre Wurzel: dort steht neben dem Feed
 * noch die Seitenleiste, und der Beitrag selbst soll trotzdem so breit sein
 * wie auf der Startseite. Statt einer zweiten Layout-Datei weitet `has-[]`
 * den Rahmen genau dann, wenn eine solche Seite darin steckt.
 */
export default function SpaceSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 has-[[data-wide]]:max-w-[calc(var(--feed-width)+var(--feed-aside)+3rem)] sm:px-6">
      {children}
    </div>
  );
}
