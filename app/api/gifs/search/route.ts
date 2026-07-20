import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * GIF search proxy for the rich-text composer.
 *
 * The provider API key never reaches the browser: the picker calls this route,
 * which forwards the query to Tenor (preferred) or Giphy using a server-side
 * env var. Set exactly one of:
 *   - TENOR_API_KEY   (Google Tenor, free — https://tenor.com/developer/keyregistration)
 *   - GIPHY_API_KEY   (Giphy, free — https://developers.giphy.com/)
 * When neither is set the route responds { configured: false } so the UI can
 * show a hint instead of failing.
 */

export const runtime = "nodejs";

type GifResult = { id: string; url: string; preview: string };

const LIMIT = 24;

function jsonError(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function fetchTenor(key: string, q: string): Promise<GifResult[]> {
  const base = q.trim()
    ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q.trim())}`
    : `https://tenor.googleapis.com/v2/featured?`;
  const url =
    `${base}${base.endsWith("?") ? "" : "&"}` +
    `key=${encodeURIComponent(key)}&client_key=aera&limit=${LIMIT}` +
    `&media_filter=gif,tinygif&contentfilter=medium`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`tenor ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{
      id: string;
      media_formats?: {
        gif?: { url?: string };
        tinygif?: { url?: string };
      };
    }>;
  };
  return (data.results ?? [])
    .map((r) => ({
      id: r.id,
      url: r.media_formats?.gif?.url ?? "",
      preview: r.media_formats?.tinygif?.url ?? r.media_formats?.gif?.url ?? "",
    }))
    .filter((g) => g.url && g.preview);
}

async function fetchGiphy(key: string, q: string): Promise<GifResult[]> {
  const endpoint = q.trim() ? "search" : "trending";
  const qs = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
  const url =
    `https://api.giphy.com/v1/gifs/${endpoint}?api_key=${encodeURIComponent(key)}` +
    `&limit=${LIMIT}&rating=pg-13${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`giphy ${res.status}`);
  const data = (await res.json()) as {
    data?: Array<{
      id: string;
      images?: {
        fixed_height?: { url?: string };
        fixed_height_small?: { url?: string };
      };
    }>;
  };
  return (data.data ?? [])
    .map((r) => ({
      id: r.id,
      url: r.images?.fixed_height?.url ?? "",
      preview: r.images?.fixed_height_small?.url ?? r.images?.fixed_height?.url ?? "",
    }))
    .filter((g) => g.url && g.preview);
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, { error: "Unauthorized" });

  const tenorKey = process.env.TENOR_API_KEY?.trim();
  const giphyKey = process.env.GIPHY_API_KEY?.trim();
  if (!tenorKey && !giphyKey) {
    return NextResponse.json(
      { configured: false, results: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const q = new URL(req.url).searchParams.get("q")?.slice(0, 100) ?? "";
  try {
    const provider = tenorKey ? "tenor" : "giphy";
    const results = tenorKey
      ? await fetchTenor(tenorKey, q)
      : await fetchGiphy(giphyKey!, q);
    return NextResponse.json(
      { configured: true, provider, results },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch {
    return jsonError(502, { error: "gif_provider_error", results: [] });
  }
}
