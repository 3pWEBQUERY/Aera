import type { Metadata } from "next";
import { PublicProfileView, profileMetadata } from "@/components/page/public-profile";

/**
 * `{handle}.aeli.so/{karte}` — derselbe Stapel, andere Karte im Bild.
 *
 * Es ist bewusst dieselbe Seite und keine eigene: ein Tiefenlink soll auf den
 * Stapel führen, nicht aus ihm heraus. Wer „Shop" öffnet, kann von dort
 * weiterwischen — und findet den Rest, statt in einer Sackgasse zu stehen.
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
  params: Promise<{ handle: string; card: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { handle, card } = await params;
  return <PublicProfileView handle={handle} card={card} query={await searchParams} />;
}
