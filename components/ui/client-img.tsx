"use client";

import type { ImgHTMLAttributes } from "react";

/**
 * Ein `<img>`, das als Client-Komponente gerendert wird.
 *
 * Wozu: React schickt für jedes nicht-lazy `<img>` einer Server-Komponente
 * einen Preload-Hinweis mit dem RSC-Payload — auch wenn das Element gar nicht
 * angezeigt wird. Die Root-`not-found.tsx` steckt als Fallback im Payload
 * jeder Seite; ihr Hintergrundbild wurde deshalb überall mit hoher Priorität
 * vorgeladen. Als Client-Komponente erscheint das Bild nur noch als Referenz
 * im Payload; vorgeladen wird es erst, wenn die 404-Seite wirklich rendert.
 */
export function ClientImg(props: ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- alt kommt über props
  return <img {...props} />;
}
