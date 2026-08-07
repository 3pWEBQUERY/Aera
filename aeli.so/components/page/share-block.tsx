"use client";

import { useState } from "react";
import type { PageMode } from "./types";

/**
 * QR-Code plus „Adresse kopieren“.
 *
 * Der Code kommt als Bild von `/api/qr/{handle}` — serverseitig gerendert, in
 * den Theme-Farben, und damit auch dann sichtbar, wenn JavaScript aus ist. Nur
 * der Kopierknopf braucht den Browser.
 *
 * Wo das zählt: auf einer Bühne, an einem Messestand, im Schaufenster. Genau
 * dort öffnet niemand einen Browser, um eine Adresse abzutippen.
 */
export function ShareBlock({
  title,
  url,
  handle,
  copyLabel,
  copiedLabel,
  mode,
  style,
}: {
  title: string;
  url: string;
  handle: string;
  copyLabel: string;
  copiedLabel: string;
  mode: PageMode;
  style?: React.CSSProperties;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (mode === "preview") return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ohne Zwischenablage-Berechtigung bleibt die Adresse darunter lesbar —
      // das ist der Rückfall, deshalb steht sie überhaupt dort.
    }
  }

  return (
    <section style={style} className="aeli-rise aeli-surface flex flex-col items-center gap-3 p-5">
      <h3 className="aeli-display text-sm font-semibold tracking-wide">{title}</h3>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/qr/${encodeURIComponent(handle)}`}
        alt={`QR-Code für ${url}`}
        width={168}
        height={168}
        className="rounded-[calc(var(--aeli-radius)*0.7)] bg-white p-2"
      />
      <button
        type="button"
        onClick={copy}
        className="text-xs font-medium underline-offset-4 hover:underline"
      >
        {copied ? copiedLabel : copyLabel} · {url.replace(/^https?:\/\//, "")}
      </button>
    </section>
  );
}
