import { withdrawNewsletterConsentByToken } from "@/lib/marketing-consent";

/** Human GET requests never mutate state; scanners therefore cannot opt out. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const target = new URL(`/unsubscribe/${encodeURIComponent(token)}`, request.url);
  return Response.redirect(target, 303);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return new Response(null, { status: 400 });
  }
  const body = new URLSearchParams(await request.text());
  if (body.get("List-Unsubscribe") !== "One-Click") {
    return new Response(null, { status: 400 });
  }
  const { token } = await params;
  const ok = await withdrawNewsletterConsentByToken(token, "LIST_UNSUBSCRIBE_POST");
  return new Response(null, { status: ok ? 200 : 404 });
}
