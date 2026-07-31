import { MobileLiveStudio } from "@/components/studio/mobile-live-studio";

/**
 * Das Studio fuer die iOS-App.
 *
 * Senden heisst WebRTC (WHIP), und den Stack gibt es auf dem Telefon nur im
 * WebView. Diese Seite ist genau dafuer da: eine schmale Buehne ohne
 * Seiten-Chrome, die dieselbe Handshake-Logik benutzt wie das Browser-Studio
 * im Dashboard (`lib/whip.ts`). Die App legt ihre Chrome darum herum —
 * Kopfzeile, Chat, Beenden.
 *
 * Angemeldet wird ueber das Bearer-Token der Mobile-API: die App schiebt es
 * zusammen mit dem Community-Slug vor dem Laden ins Fenster
 * (`window.__aeraStudio`). Es steht damit weder in der Adresse noch in einem
 * Server-Log.
 */
export const metadata = { robots: { index: false, follow: false } };

export default async function LiveStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  return <MobileLiveStudio sessionId={session ?? ""} />;
}
