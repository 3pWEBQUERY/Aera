import { ImageResponse } from "next/og";
import { getPublicProfile } from "@/lib/profile";
import { profileUrlLabel } from "@/lib/url";

/**
 * Die Karte, die in WhatsApp, Slack und auf X unter dem Link erscheint.
 *
 * Sie wird gezeichnet, nicht fotografiert: Name, Handle und die Farben des
 * gewählten Themes. Damit sieht eine geteilte Aeli-Seite überall nach dieser
 * einen Seite aus — und nicht nach einem grauen Standardbild, wie es Link-in-
 * Bio-Dienste sonst ausliefern.
 *
 * `next/og` rendert ohne Browser und ohne Netzwerk. Deshalb steht hier auch
 * kein Avatar: der läge auf einem fremden Host, und ein Bild, das beim Laden
 * hängt, kostet die ganze Karte.
 */

export const alt = "Aeli-Seite";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage({
  params,
}: {
  params: { handle: string };
}) {
  const profile = await getPublicProfile(params.handle);

  const bg = profile?.theme.bg ?? "#08080b";
  const fg = profile?.theme.fg ?? "#f6f5f1";
  const accent = profile?.theme.accent ?? "#c9f24d";
  const name = profile?.displayName ?? "Aeli";
  const bio = profile?.bio ?? "Eine Seite, alle Links.";
  const handle = profile ? profileUrlLabel(profile.handle) : "aeli.so";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: bg,
          color: fg,
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        {/* Ein weicher Farbfleck oben rechts — dieselbe Geste wie der
            Hintergrund der echten Seite, nur eingefroren. */}
        <div
          style={{
            position: "absolute",
            top: -240,
            right: -160,
            width: 700,
            height: 700,
            borderRadius: 9999,
            background: accent,
            opacity: 0.22,
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, opacity: 0.65 }}>
          <div style={{ width: 14, height: 14, borderRadius: 9999, background: accent, display: "flex" }} />
          {handle}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 92, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
            {name.slice(0, 42)}
          </div>
          <div style={{ fontSize: 34, opacity: 0.7, lineHeight: 1.35 }}>{bio.slice(0, 120)}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, opacity: 0.5 }}>
          erstellt mit aeli
          <div style={{ width: 9, height: 9, borderRadius: 9999, background: accent, display: "flex" }} />
        </div>
      </div>
    ),
    size,
  );
}
