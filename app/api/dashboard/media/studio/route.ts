import { NextResponse } from "next/server";
import { tenantHasFeature } from "@/lib/plan";
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
import { isAllowedImage } from "@/lib/storage";
import { storageAllows } from "@/lib/storage-quota";
import { magicBytesMatch, MAX_IMAGE_BYTES } from "@/lib/upload-policy";
import {
  persistVerifiedBufferUpload,
  StorageQuotaExceededError,
} from "@/lib/secure-upload";

interface InputImage {
  mimeType: string;
  data: string; // base64, no data: prefix
}

// Base64 inflates ~33%, so ~7 MB of base64 ≈ 5 MB binary (our image cap).
const MAX_B64_LEN = 7 * 1024 * 1024;
// Fallback token cost when the model omits usage metadata (image output ≈ 1290).
const IMAGE_FALLBACK_TOKENS = 1290;

const TOOLS: StudioTool[] = ["create", "edit", "remove-bg", "enhance"];

/** Store a verified base64 image through the same quota/scanning path as uploads. */
async function persistImage(
  tenantId: string,
  ownerId: string,
  mimeType: string,
  data: string,
): Promise<{ id: string; url: string }> {
  const bytes = Buffer.from(data, "base64");
  return persistVerifiedBufferUpload({
    tenantId,
    ownerId,
    purpose: "studio-image",
    contentType: mimeType,
    bytes,
    visibility: "PUBLIC",
  });
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
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 === 1) {
    return { error: "unsupported-image" };
  }
  const bytes = Buffer.from(data, "base64");
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { error: "image-too-large" };
  }
  if (!magicBytesMatch(mimeType, bytes.subarray(0, 4096))) {
    return { error: "unsupported-image" };
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
  // Package gate — the /media/studio page is gated, this endpoint must be too.
  if (!(await tenantHasFeature(tenant.id, "mediaStudio"))) {
    return NextResponse.json({ error: "plan_upgrade_required" }, { status: 402 });
  }

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
    try {
      const saved = await persistImage(tenant.id, user.id, image.mimeType, image.data);
      return NextResponse.json({ images: [saved] });
    } catch (error) {
      if (error instanceof StorageQuotaExceededError) {
        return NextResponse.json(
          { error: "storage-full", storageFull: true },
          { status: 413 },
        );
      }
      console.error("Studio image persistence failed:", error);
      return NextResponse.json({ error: "persist-failed" }, { status: 500 });
    }
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
    if (e instanceof StorageQuotaExceededError) {
      return NextResponse.json(
        { error: "storage-full", storageFull: true },
        { status: 413 },
      );
    }
    console.error("Generated studio image persistence failed:", e);
    return NextResponse.json({ error: "persist-failed" }, { status: 500 });
  }
}
