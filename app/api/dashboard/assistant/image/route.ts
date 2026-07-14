import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { features } from "@/lib/env";
import { geminiGenerateImage, aiLanguageInstruction } from "@/lib/ai";
import { appendImageTurn } from "@/lib/assistant";
import {
  releaseCreditReservation,
  reserveCredit,
  settleCreditReservation,
} from "@/lib/credits";
import { uploadObject, isAllowedImage, extensionFor } from "@/lib/storage";

interface InputImage {
  mimeType: string;
  data: string; // base64, no data: prefix
}

const MAX_INPUT_IMAGES = 4;
// Base64 inflates ~33%, so ~7 MB of base64 ≈ 5 MB binary (our image cap).
const MAX_B64_LEN = 7 * 1024 * 1024;
// Fallback token cost when the model omits usage metadata (image output ≈ 1290).
const IMAGE_FALLBACK_TOKENS = 1290;

/** Store a base64 image and return its stable URL (+ create a StorageObject). */
async function persistImage(
  tenantId: string,
  ownerId: string,
  mimeType: string,
  data: string,
): Promise<string> {
  const bytes = Buffer.from(data, "base64");
  const key = `tenants/${tenantId}/assistant-image/${randomUUID()}.${extensionFor(mimeType)}`;
  const url = await uploadObject({ key, body: bytes, contentType: mimeType });
  await prisma.storageObject.create({
    data: {
      tenantId,
      ownerId,
      key,
      url,
      purpose: "assistant-image",
      contentType: mimeType,
      sizeBytes: bytes.length,
      visibility: "PUBLIC",
    },
  });
  return url;
}

// POST { slug, conversationId?, prompt, images?: [{ mimeType, data }] }
//   → { conversationId, title, attachments: string[], images: [{ url }], text }
export async function POST(req: Request) {
  let body: {
    slug?: string;
    conversationId?: string;
    prompt?: string;
    images?: InputImage[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const slug = String(body.slug ?? "");
  if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400 });

  const { tenant, user } = await requireTenantAdmin(slug);
  if (!features.gemini) {
    return NextResponse.json({ error: "gemini-off" }, { status: 400 });
  }

  const prompt = String(body.prompt ?? "").trim().slice(0, 2000);

  // Validate & normalize reference images.
  const rawImages = Array.isArray(body.images) ? body.images.slice(0, MAX_INPUT_IMAGES) : [];
  const inputImages: InputImage[] = [];
  for (const im of rawImages) {
    const mimeType = String(im?.mimeType ?? "");
    const data = String(im?.data ?? "");
    if (!isAllowedImage(mimeType)) {
      return NextResponse.json({ error: "Nur Bilder (JPG, PNG, WebP, GIF) als Vorlage erlaubt." }, { status: 400 });
    }
    if (!data || data.length > MAX_B64_LEN) {
      return NextResponse.json({ error: "Ein Vorlagenbild ist zu groß (max. 5 MB)." }, { status: 400 });
    }
    inputImages.push({ mimeType, data });
  }

  if (!prompt && inputImages.length === 0) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  // Atomically lease one credit before spending anything at the provider.
  const reservation = await reserveCredit({
    tenantId: tenant.id,
    userId: user.id,
    conversationId: body.conversationId ? String(body.conversationId) : null,
    kind: "image_generation",
  });
  if (!reservation) {
    return NextResponse.json({ outOfCredits: true }, { status: 402 });
  }

  const locale = await getLocale();
  const imagePrompt = `${prompt || "Erzeuge ein passendes Bild."}\n\n${aiLanguageInstruction(locale)}`;
  let result: Awaited<ReturnType<typeof geminiGenerateImage>>;
  try {
    result = await geminiGenerateImage(imagePrompt, inputImages);
  } catch (error) {
    await releaseCreditReservation(reservation);
    throw error;
  }
  if (!result) {
    await releaseCreditReservation(reservation);
    return NextResponse.json({ error: "gemini-off" }, { status: 400 });
  }

  // Meter the call regardless of how many images came back.
  const totalTokens = result.usage.totalTokens > 0 ? result.usage.totalTokens : IMAGE_FALLBACK_TOKENS;
  await settleCreditReservation({
    reservation,
    promptTokens: result.usage.promptTokens,
    outputTokens: result.usage.outputTokens || totalTokens,
    totalTokens,
  });

  try {
    // Persist reference images (so the thread reloads with them) and results.
    const attachmentUrls: string[] = [];
    for (const im of inputImages) {
      attachmentUrls.push(await persistImage(tenant.id, user.id, im.mimeType, im.data));
    }
    const imageUrls: string[] = [];
    for (const img of result.images) {
      imageUrls.push(await persistImage(tenant.id, user.id, img.mimeType, img.data));
    }

    const text =
      result.images.length === 0
        ? result.text || "Es konnte kein Bild erzeugt werden. Formuliere die Anfrage bitte etwas anders."
        : result.text;

    const { conversationId, title } = await appendImageTurn(
      { id: tenant.id },
      user.id,
      body.conversationId ? String(body.conversationId) : null,
      { prompt, attachments: attachmentUrls, images: imageUrls, text },
    );

    return NextResponse.json({
      conversationId,
      title,
      attachments: attachmentUrls,
      images: imageUrls.map((url) => ({ url })),
      text,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Speichern fehlgeschlagen: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
