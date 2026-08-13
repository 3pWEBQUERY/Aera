"use client";

import { Sha256 } from "@aws-crypto/sha256-browser";
import { beginUpload, type UploadHandle } from "./upload-progress";

export class UploadError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

async function sha256Base64(file: File): Promise<string> {
  const hash = new Sha256();
  const reader = file.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  const digest = await hash.digest();
  return btoa(String.fromCharCode(...digest));
}

function xhrUpload(input: {
  method: "POST" | "PUT";
  url: string;
  body: XMLHttpRequestBodyInit;
  headers?: Record<string, string>;
  onProgress?: (percent: number) => void;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(input.method, input.url);
    for (const [name, value] of Object.entries(input.headers ?? {})) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        input.onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new UploadError("Upload connection failed"));
    xhr.onabort = () => reject(new UploadError("Upload canceled"));
    xhr.send(input.body);
  });
}

function errorFromJson(json: unknown, fallback: string): string {
  return typeof json === "object" && json !== null && "error" in json
    ? String((json as { error: unknown }).error || fallback)
    : fallback;
}

async function bufferedFallback(input: {
  file: File;
  tenant: string;
  purpose: string;
  onProgress?: (percent: number) => void;
}): Promise<string> {
  const form = new FormData();
  form.set("file", input.file);
  form.set("tenant", input.tenant);
  form.set("purpose", input.purpose);
  const result = await xhrUpload({
    method: "POST",
    url: "/api/upload",
    body: form,
    onProgress: input.onProgress,
  });
  const json = JSON.parse(result.body || "{}") as { url?: string; error?: string };
  if (result.status < 200 || result.status >= 300 || !json.url) {
    throw new UploadError(json.error ?? "Upload failed", result.status);
  }
  return json.url;
}

/**
 * Secure browser upload: streaming SHA-256 → quota reservation → signed PUT →
 * server-side size/checksum/magic-byte/malware verification → published URL.
 */
export async function uploadMediaFile(input: {
  file: File;
  tenant: string;
  purpose: string;
  onProgress?: (percent: number) => void;
  /** Setzt die Anzeige unten rechts aus — fuer Uploads im Hintergrund. */
  silent?: boolean;
}): Promise<string> {
  // Jeder Upload der App laeuft hier durch, deshalb steht die Anmeldung an
  // der Fortschrittsanzeige hier und nicht in den einzelnen Oberflaechen.
  const job = input.silent ? null : beginUpload(input.file);
  try {
    return await runUpload(input, job);
  } catch (error) {
    job?.fail(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Upload fuer den Blog der Plattform (Admin-Bereich).
 *
 * Bewusst der einfache, einstufige Weg: die Datei geht als Formular an
 * /api/admin/blog-media, der Server prueft sie und legt sie ab. Der mehrstufige
 * Weg darueber existiert wegen der Speicherkontingente einer Community — die
 * Plattform hat keins, also gibt es hier auch nichts zu reservieren.
 *
 * Die Fortschrittsanzeige ist dieselbe, damit ein Upload im Admin-Bereich sich
 * nicht anders anfuehlt als einer im Dashboard.
 */
export async function uploadPlatformBlogFile(file: File): Promise<string> {
  const job = beginUpload(file);
  try {
    const form = new FormData();
    form.set("file", file);
    job.setPhase("uploading");
    const result = await xhrUpload({
      method: "POST",
      url: "/api/admin/blog-media",
      body: form,
      onProgress: (percent) => job.setPercent(percent),
    });
    const json = JSON.parse(result.body || "{}") as { url?: string; error?: string };
    if (result.status < 200 || result.status >= 300 || !json.url) {
      throw new UploadError(json.error ?? "Upload fehlgeschlagen", result.status);
    }
    job.done();
    return json.url;
  } catch (error) {
    job.fail(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function runUpload(
  input: {
    file: File;
    tenant: string;
    purpose: string;
    onProgress?: (percent: number) => void;
  },
  job: UploadHandle | null,
): Promise<string> {
  const report = (percent: number) => {
    job?.setPercent(percent);
    input.onProgress?.(percent);
  };
  job?.setPhase("preparing");
  const checksumSha256 = await sha256Base64(input.file);
  const initiation = await fetch("/api/upload/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant: input.tenant,
      purpose: input.purpose,
      contentType: input.file.type,
      sizeBytes: input.file.size,
      checksumSha256,
    }),
  });
  const initJson = (await initiation.json().catch(() => ({}))) as
    | { direct: false; error?: string }
    | {
        direct: true;
        reservationId: string;
        uploadUrl: string;
        headers: Record<string, string>;
        error?: string;
      };
  if (!initiation.ok) {
    throw new UploadError(
      errorFromJson(initJson, "Upload could not be started"),
      initiation.status,
    );
  }
  if (!initJson.direct) {
    const url = await bufferedFallback({ ...input, onProgress: report });
    job?.done();
    return url;
  }
  job?.setPhase("uploading");

  const put = await xhrUpload({
    method: "PUT",
    url: initJson.uploadUrl,
    body: input.file,
    headers: initJson.headers,
    onProgress: report,
  });
  if (put.status < 200 || put.status >= 300) {
    throw new UploadError("Object storage rejected the upload", put.status);
  }
  report(100);
  // Der Server prueft jetzt Groesse, Pruefsumme, Dateisignatur und Schadcode.
  // Bei grossen Dateien dauert das sichtbar lange — ohne eigene Stufe saehe
  // die Anzeige aus, als haenge sie bei 100 %.
  job?.setPhase("verifying");

  const completion = await fetch("/api/upload/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant: input.tenant,
      reservationId: initJson.reservationId,
    }),
  });
  const completeJson = (await completion.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };
  if (!completion.ok || !completeJson.url) {
    throw new UploadError(
      completeJson.error ?? "Uploaded file did not pass verification",
      completion.status,
    );
  }
  job?.done();
  return completeJson.url;
}
