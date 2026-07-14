import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { features } from "@/lib/env";
import { geminiGenerateImage } from "@/lib/ai";
import { studioPrompt, type StudioTool } from "@/lib/studio-prompts";
import {
  getOrCreateWallet,
  walletBalance,
  releaseCreditReservation,
  reserveCredit,
  settleCreditReservation,
} from "@/lib/credits";
import { uploadObject, isAllowedImage, extensionFor } from "@/lib/storage";
import { storageAllows } from "@/lib/storage-quota";

interface InputImage {
  mimeType: string;
  data: string; // base64, no data: prefix
}

// Base64 inflates ~33%, so ~7 MB of base64 ≈ 5 MB binary (our image cap).
const MAX_B64_LEN = 7 * 1024 * 1024;
// Fallback token cost when the model omits usage metadata (image output ≈ 1290).
const IMAGE_FALLBACK_TOKENS = 1290;

const TOOLS: StudioTool[] = ["create", "edit", "remove-bg", "enhance"];

/** Store a base64 image as a studio result and return url + object id. */
async function persistImage(
  tenantId: string,
  ownerId: string,
  mimeType: string,
  data: string,
): Promise<{ id: string; url: string }> {
  const bytes = Buffer.from(data, "base64");
  const key = `tenants/${tenantId}/studio-image/${randomUUID()}.${extensionFor(mimeType)}`;
  const url = await uploadObject({ key, body: bytes, contentType: mimeType });
  const object = await prisma.storageObject.create({
    data: {
      tenantId,
      ownerId,
      key,
      url,
      purpose: "studio-image",
      contentType: mimeType,
      sizeBytes: bytes.length,
      visibility: "PUBLIC",
    },
  });
  return { id: object.id, url };
}

function readImage(raw: unknown): InputImage | { error: string } {
  const im = (raw ?? {}) as Partial<InputImage>;
  const mimeType = String(im.mimeType ?? "");
  const data = String(im.data ?? "");
  if (!isAllowedImage(mimeType)) {
    return { error: "unsupported-image" };
  }
  if (!data || data.length > MAX_B64_LEN) {
    return { error: "image-too-large" };
  }
  return { mimeType, data };
}

/**
 * Image AI Studio backend.
 *
 * POST { slug, op: "generate", tool, prompt?, image? }
 *   → Gemini (1 credit lease, metered like the assistant), result persisted as
 *     a `studio-image` StorageObject so it shows up in the media library.
 * POST { slug, op: "persist", image }
 *   → store a client-side result (resize/upload) without touching Gemini or
 *     credits.
 */
export async function POST(req: Request) {
  let body: {
    slug?: string;
    op?: string;
    tool?: string;
    prompt?: string;
    image?: InputImage;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }

  const slug = String(body.slug ?? "");
  if (!slug) return NextResponse.json({ error: "missing-slug" }, { status: 400 });
  const { tenant, user } = await requireTenantAdmin(slug);

  const op = String(body.op ?? "");

  // ---------------------------------------------- persist (no credits)
  if (op === "persist") {
    const image = readImage(body.image);
    if ("error" in image) {
      return NextResponse.json({ error: image.error }, { status: 400 });
    }
    // Base64 → binary size ≈ length * 3/4.
    const quota = await storageAllows(tenant.id, Math.ceil(image.data.length * 0.75));
    if (!quota.ok) {
      return NextResponse.json({ error: "storage-full", storageFull: true }, { status: 413 });
    }
    const saved = await persistImage(tenant.id, user.id, image.mimeType, image.data);
    return NextResponse.json({ images: [saved] });
  }

  // ---------------------------------------------- generate (Gemini)
  if (op !== "generate") {
    return NextResponse.json({ error: "bad-op" }, { status: 400 });
  }
  if (!features.gemini) {
    return NextResponse.json({ error: "gemini-off" }, { status: 400 });
  }

  const tool = String(body.tool ?? "") as StudioTool;
  if (!TOOLS.includes(tool)) {
    return NextResponse.json({ error: "bad-tool" }, { status: 400 });
  }

  const prompt = String(body.prompt ?? "").trim().slice(0, 2000);
  if ((tool === "create" || tool === "edit") && !prompt) {
    return NextResponse.json({ error: "empty-prompt" }, { status: 400 });
  }

  // The studio works on exactly one image for edit-style tools.
  let inputImages: InputImage[] = [];
  if (tool !== "create") {
    const image = readImage(body.image);
    if ("error" in image) {
      return NextResponse.json({ error: image.error }, { status: 400 });
    }
    inputImages = [image];
  }

  // Results are persisted to the bucket — refuse when the plan quota is full
  // (8 MB headroom for the generated image) before burning a credit.
  const quota = await storageAllows(tenant.id, 8 * 1024 * 1024);
  if (!quota.ok) {
    return NextResponse.json({ error: "storage-full", storageFull: true }, { status: 413 });
  }

  // Atomically lease one credit before spending anything at the provider.
  const reservation = await reserveCredit({
    tenantId: tenant.id,
    userId: user.id,
    conversationId: null,
    kind: "image_generation",
  });
  if (!reservation) {
    return NextResponse.json({ outOfCredits: true }, { status: 402 });
  }

  let result: Awaited<ReturnType<typeof geminiGenerateImage>>;
  try {
    result = await geminiGenerateImage(studioPrompt(tool, prompt), inputImages);
  } catch (error) {
    await releaseCreditReservation(reservation);
    throw error;
  }
  if (!result) {
    await releaseCreditReservation(reservation);
    return NextResponse.json({ error: "gemini-off" }, { status: 400 });
  }

  // Meter the call regardless of how many images came back.
  const totalTokens =
    result.usage.totalTokens > 0 ? result.usage.totalTokens : IMAGE_FALLBACK_TOKENS;
  await settleCreditReservation({
    reservation,
    promptTokens: result.usage.promptTokens,
    outputTokens: result.usage.outputTokens || totalTokens,
    totalTokens,
  });

  try {
    const images: { id: string; url: string }[] = [];
    for (const img of result.images) {
      images.push(await persistImage(tenant.id, user.id, img.mimeType, img.data));
    }
    const balance = walletBalance(await getOrCreateWallet(tenant.id));
    return NextResponse.json({
      images,
      text: result.text,
      noImage: images.length === 0,
      balance,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `persist-failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
