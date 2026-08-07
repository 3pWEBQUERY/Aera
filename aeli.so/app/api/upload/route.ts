import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storageConfigured } from "@/lib/env";
import { imageKey, isImagePurpose, processImage, IMAGE_VARIANTS } from "@/lib/images";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { mediaUrl, putObject } from "@/lib/storage";

/**
 * Bild hochladen — Profilbild oder Titelbild.
 *
 * Die Datei läuft durch den Server, nicht per vorsignierter Adresse direkt in
 * den Bucket. Für ein Avatar ist das die richtige Reihenfolge: der Server ist
 * die einzige Stelle, die das Bild wirklich ANSEHEN und neu kodieren kann
 * (lib/images.ts). Ein Direkt-Upload würde die Originaldatei unverändert im
 * Bucket ablegen — mitsamt EXIF-Standort und allem, was sonst darin steht.
 *
 * Bei großen Videodateien wäre die Abwägung umgekehrt. Die gibt es hier nicht.
 */

export const runtime = "nodejs";

/** Etwas Luft über der größten erlaubten Variante, für den Multipart-Rahmen. */
const HARD_LIMIT = Math.max(...Object.values(IMAGE_VARIANTS).map((v) => v.maxBytes)) + 1024 * 1024;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!storageConfigured()) {
    return NextResponse.json(
      { error: "storage_unconfigured", message: "Der Bilderspeicher ist nicht eingerichtet." },
      { status: 503 },
    );
  }

  // Pro Konto, nicht pro IP: das Limit soll den Bucket vor einem Skript
  // schützen, nicht zwei Leute im selben Büro gegeneinander ausspielen.
  if (!rateLimit(`upload:${user.id}`, 30, 10 * 60_000).ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Zu viele Uploads. Bitte kurz warten." },
      { status: 429 },
    );
  }
  // Zusätzlich eine weite Grenze auf die Herkunft, falls jemand mit vielen
  // Konten arbeitet.
  if (!rateLimit(`upload-ip:${clientIp(request.headers)}`, 120, 10 * 60_000).ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > HARD_LIMIT) {
    return NextResponse.json(
      { error: "too_large", message: "Die Datei ist zu groß." },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const purpose = String(form.get("purpose") ?? "");
  const file = form.get("file");
  if (!isImagePurpose(purpose) || !(file instanceof File)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const variant = IMAGE_VARIANTS[purpose];
  if (file.size > variant.maxBytes) {
    return NextResponse.json(
      {
        error: "too_large",
        message: `Höchstens ${Math.round(variant.maxBytes / (1024 * 1024))} MB, bitte.`,
      },
      { status: 413 },
    );
  }

  const result = await processImage(Buffer.from(await file.arrayBuffer()), purpose);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        message:
          result.error === "tooLarge"
            ? "Die Datei ist zu groß."
            : "Das sieht nicht nach einem Bild aus, das wir lesen können. JPEG, PNG, WebP, GIF oder HEIC funktionieren.",
      },
      { status: result.error === "tooLarge" ? 413 : 415 },
    );
  }

  const key = imageKey(user.id, purpose, result.hash, result.extension);

  try {
    await putObject({ key, body: result.body, contentType: result.contentType });
  } catch (error) {
    console.error("[aeli] Upload in den Bucket fehlgeschlagen:", error);
    return NextResponse.json(
      { error: "upload_failed", message: "Das Bild konnte nicht gespeichert werden." },
      { status: 502 },
    );
  }

  // Der Aufrufer bekommt die fertige Adresse und die Größe — Letztere nur,
  // damit das Studio zeigen kann, was die Umwandlung gebracht hat.
  return NextResponse.json({
    url: mediaUrl(key),
    key,
    bytes: result.bytes,
    originalBytes: file.size,
  });
}
