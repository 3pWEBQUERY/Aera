import Link from "next/link";
import { publicStrings } from "@/lib/i18n";
import { appUrl } from "@/lib/url";

/**
 * Ein freier Handle ist keine Fehlermeldung, sondern ein Angebot.
 *
 * Wer hier landet, hat sich meist vertippt oder folgt einem alten Link — in
 * beiden Fällen ist die interessanteste Information, dass diese Adresse noch
 * zu haben ist.
 */
export default async function HandleNotFound() {
  const strings = await publicStrings();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span aria-hidden className="mb-8 flex items-baseline text-4xl font-semibold tracking-tight">
        aeli
        <span className="ml-[0.09em] size-[0.3em] rounded-full bg-signal" />
      </span>

      <h1 className="max-w-md text-2xl font-semibold tracking-tight text-balance">
        {strings.notFoundTitle}
      </h1>
      <p className="mt-3 max-w-sm text-sm text-ash">{strings.notFoundBody}</p>

      <Link
        href={appUrl("/signup")}
        className="mt-8 inline-flex h-12 items-center rounded-2xl bg-signal px-6 text-sm font-semibold text-ink transition-colors hover:bg-signal-deep"
      >
        {strings.notFoundCta}
      </Link>
    </main>
  );
}
