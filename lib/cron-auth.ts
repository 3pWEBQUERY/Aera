import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "./env";

const MIN_CRON_SECRET_LENGTH = 32;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  return match?.[1] ?? null;
}

export function cronJson(
  body: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      ...Object.fromEntries(new Headers(extraHeaders)),
    },
  });
}

/**
 * Authenticate a scheduler request without ever accepting secrets in URLs.
 *
 * A short or missing configured secret disables every cron endpoint. Hashing
 * both values before timingSafeEqual keeps the comparison length-independent.
 */
export function authorizeCronRequest(req: Request): NextResponse | null {
  const configured = env.CRON_SECRET;
  if (configured.length < MIN_CRON_SECRET_LENGTH) {
    return cronJson({ error: "cron-disabled" }, 503);
  }

  // Explicitly reject the legacy query parameter so it cannot accidentally be
  // copied back into scheduler URLs and leaked through access logs/history.
  if (new URL(req.url).searchParams.has("secret")) {
    return cronJson({ error: "unauthorized" }, 401);
  }

  const provided = bearerToken(req);
  if (!provided || !timingSafeEqual(digest(provided), digest(configured))) {
    return cronJson({ error: "unauthorized" }, 401);
  }
  return null;
}

export function cronMethodNotAllowed(): NextResponse {
  return cronJson({ error: "method-not-allowed" }, 405, { Allow: "POST" });
}
