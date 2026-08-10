import type { Metadata } from "next";
import { PublicProfileView, profileMetadata } from "@/components/page/public-profile";

/**
 * `{handle}.aeli.so` — der Stapel, erste Karte.
 *
 * Die Umsetzung liegt in `components/page/public-profile.tsx`, weil es zwei
 * Adressen für dieselbe Seite gibt: mit und ohne Karte. Zwei Routen, ein
 * Renderer — sonst laufen sie auseinander, und zwar an genau der Stelle, an
 * der es niemand merkt.
 */

/**
 * Dynamisch, und zwar aus zwei konkreten Gründen: die Seite liest
 * `Accept-Language` (damit ein englischsprachiger Besucher „Subscribe“ statt
 * „Eintragen“ sieht) und bei gesetzter Schranke das Freischalt-Cookie. Beides
 * ist pro Besucher verschieden, also gibt es keine gemeinsame Fassung, die man
 * cachen könnte.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  return profileMetadata((await params).handle);
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { handle } = await params;
  return <PublicProfileView handle={handle} query={await searchParams} />;
}
