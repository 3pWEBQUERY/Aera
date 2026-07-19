import { NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { requireTenantAdmin } from "@/lib/guards";
import { features } from "@/lib/env";
import { isAllowedImage } from "@/lib/storage";
import { runAssistantTurn, type AssistantImageInput } from "@/lib/assistant";
import { magicBytesMatch, MAX_IMAGE_BYTES } from "@/lib/upload-policy";
import { storageAllows } from "@/lib/storage-quota";
import { StorageQuotaExceededError } from "@/lib/secure-upload";

const MAX_IMAGES = 4;
// Base64 inflates ~33%, so ~7 MB of base64 ≈ 5 MB binary (our image cap).
const MAX_B64_LEN = 7 * 1024 * 1024;

// POST { slug, conversationId?, message, images?: [{ mimeType, data }] }
//   → { conversationId, title, reply, actions }
export async function POST(req: Request) {
  let body: {
    slug?: string;
    conversationId?: string;
    message?: string;
    images?: AssistantImageInput[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const slug = String(body.slug ?? "");
  if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400 });

  const { tenant, user } = await requireTenantAdmin(slug);
  if (!features.gemini) return NextResponse.json({ error: "gemini-off" }, { status: 400 });

  const message = String(body.message ?? "").trim();

  // Validate & normalize reference images.
  const rawImages = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];
  const images: AssistantImageInput[] = [];
  for (const im of rawImages) {
    const mimeType = String(im?.mimeType ?? "");
    const data = String(im?.data ?? "");
    if (!isAllowedImage(mimeType)) {
      return NextResponse.json({ error: "Nur Bilder (JPG, PNG, WebP, GIF) erlaubt." }, { status: 400 });
    }
    if (!data || data.length > MAX_B64_LEN) {
      return NextResponse.json({ error: "Ein Bild ist zu groß (max. 5 MB)." }, { status: 400 });
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 === 1) {
      return NextResponse.json({ error: "Ungültige Bilddaten." }, { status: 400 });
    }
    const bytes = Buffer.from(data, "base64");
    if (bytes.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Ein Bild ist zu groß (max. 5 MB)." }, { status: 400 });
    }
    if (!magicBytesMatch(mimeType, bytes.subarray(0, 4096))) {
      return NextResponse.json(
        { error: "Bildtyp und Bildinhalt stimmen nicht überein." },
        { status: 400 },
      );
    }
    images.push({ mimeType, data });
  }

  if (!message && images.length === 0) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  const uploadBytes = images.reduce(
    (sum, image) => sum + Buffer.from(image.data, "base64").length,
    0,
  );
  if (uploadBytes > 0) {
    const quota = await storageAllows(tenant.id, uploadBytes);
    if (!quota.ok) {
      return NextResponse.json(
        { error: "storage-full", storageFull: true },
        { status: 413 },
      );
    }
  }

  const locale = await getLocale();
  try {
    const turn = await runAssistantTurn(
      { id: tenant.id, slug },
      user.id,
      body.conversationId ? String(body.conversationId) : null,
      message,
      locale,
      images,
    );
    return NextResponse.json(turn);
  } catch (error) {
    if (error instanceof StorageQuotaExceededError) {
      return NextResponse.json(
        { error: "storage-full", storageFull: true },
        { status: 413 },
      );
    }
    console.error("Assistant chat turn failed:", error);
    return NextResponse.json({ error: "assistant-unavailable" }, { status: 500 });
  }
}
