import { ImageResponse } from "next/og";
import prisma from "@/lib/prisma";

/**
 * Dynamisches Open-Graph-Bild pro Community: Markenfarbe, Initiale/Logo,
 * Name und Tagline — macht geteilte Links (Slack, X, WhatsApp) ansehnlich.
 */

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Community auf Aera";

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { name: true, tagline: true, primaryColor: true, logoUrl: true },
  });

  const name = tenant?.name ?? "Aera";
  const tagline = tenant?.tagline ?? "Community, Mitgliedschaften & Kurse";
  const color = tenant?.primaryColor ?? "#6d28d9";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: `linear-gradient(135deg, ${color} 0%, #161613 100%)`,
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 120,
            height: 120,
            borderRadius: 32,
            background: "rgba(255,255,255,0.15)",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 64,
            fontWeight: 700,
          }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>
            {name.slice(0, 40)}
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 32,
              opacity: 0.85,
              lineHeight: 1.3,
            }}
          >
            {tagline.slice(0, 90)}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, opacity: 0.7 }}>
          Community · aera.so
        </div>
      </div>
    ),
    size,
  );
}
