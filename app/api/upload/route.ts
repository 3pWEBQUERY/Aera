import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { roleAtLeast } from "@/lib/tenant";
import {
  uploadObject,
  isAllowedImage,
  isAllowedVideo,
  isAllowedAudio,
  extensionFor,
} from "@/lib/storage";
import { storageAllows, formatStorage } from "@/lib/storage-quota";

const MAX_IMAGE = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO = 512 * 1024 * 1024; // 512 MB
const MAX_AUDIO = 256 * 1024 * 1024; // 256 MB

/**
 * Allowlist of upload purposes and the visibility their objects get.
 * PUBLIC: branding/covers that render on public pages.
 * MEMBERS: gated content (paid galleries, course/space videos) — the media
 * proxy enforces access for anything non-PUBLIC.
 */
const PURPOSE_VISIBILITY: Record<string, "PUBLIC" | "MEMBERS"> = {
  avatar: "PUBLIC",
  logo: "PUBLIC",
  cover: "PUBLIC",
  "blog-cover": "PUBLIC",
  "blog-image": "PUBLIC",
  "blog-video": "PUBLIC",
  "feed-image": "PUBLIC",
  story: "PUBLIC",
  "story-video": "PUBLIC",
  planner: "MEMBERS",
  "event-cover": "PUBLIC",
  "course-cover": "PUBLIC",
  "product-cover": "PUBLIC",
  announcement: "PUBLIC",
  "community-cover": "PUBLIC",
  "tier-cover": "PUBLIC",
  gallery: "MEMBERS",
  "space-video": "MEMBERS",
  "course-video": "MEMBERS",
  "podcast-cover": "PUBLIC",
  "podcast-audio": "MEMBERS",
  "ad-media": "PUBLIC",
  "studio-image": "PUBLIC",
  // Direct uploads into the media library (creator storage).
  library: "PUBLIC",
};

export async function POST(req: Request) {
  const t = await getTranslations("uiMigration.dashboard");
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const slug = String(form.get("tenant") || "");
  const purpose = String(form.get("purpose") || "avatar");
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: t("noFile") }, { status: 400 });
  }

  const visibility = PURPOSE_VISIBILITY[purpose];
  if (!visibility) {
    return NextResponse.json({ error: t("invalidUploadPurpose") }, { status: 400 });
  }

  const isImage = isAllowedImage(file.type);
  const isVideo = isAllowedVideo(file.type);
  const isAudio = isAllowedAudio(file.type);
  if (!isImage && !isVideo && !isAudio) {
    return NextResponse.json(
      { error: t("unsupportedMedia") },
      { status: 400 },
    );
  }
  const max = isVideo ? MAX_VIDEO : isAudio ? MAX_AUDIO : MAX_IMAGE;
  if (file.size > max) {
    return NextResponse.json(
      {
        error: isVideo
          ? t("videoTooLarge")
          : isAudio
            ? t("audioTooLarge")
            : t("imageTooLarge"),
      },
      { status: 400 },
    );
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  // Own avatar: any active member may upload. Everything else is admin-only.
  const memberAllowed =
    purpose === "avatar" && membership?.status === "ACTIVE";
  if (!memberAllowed && (!membership || !roleAtLeast(membership.role, "ADMIN"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Plan storage quota — every upload counts against the tenant's bucket space.
  const quota = await storageAllows(tenant.id, file.size);
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: `Speicher voll: ${formatStorage(quota.usedBytes)} von ${formatStorage(quota.limitBytes)} belegt. Lösche Medien oder upgrade dein Paket.`,
        storageFull: true,
      },
      { status: 413 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const key = `tenants/${tenant.id}/${purpose}/${randomUUID()}.${extensionFor(file.type)}`;

  let url: string;
  try {
    url = await uploadObject({ key, body: bytes, contentType: file.type });
  } catch (e) {
    return NextResponse.json(
      { error: `Upload fehlgeschlagen: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  await prisma.storageObject.create({
    data: {
      tenantId: tenant.id,
      ownerId: user.id,
      key,
      url,
      purpose,
      contentType: file.type,
      sizeBytes: file.size,
      visibility,
    },
  });

  return NextResponse.json({ url });
}
