import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/guards";
import {
  listConversations,
  getConversation,
  renameConversation,
  setArchived,
  deleteConversation,
} from "@/lib/assistant";

// GET  /api/dashboard/assistant/conversations?slug=&kind=CHAT|IMAGE  → list
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400 });
  const kindParam = url.searchParams.get("kind");
  const kind = kindParam === "IMAGE" ? "IMAGE" : kindParam === "CHAT" ? "CHAT" : undefined;
  const { tenant, user } = await requireTenantAdmin(slug);
  const conversations = await listConversations(tenant.id, user.id, kind);
  return NextResponse.json({ conversations });
}

// POST { slug, action: "get"|"rename"|"archive"|"unarchive"|"delete", id, title? }
export async function POST(req: Request) {
  let body: { slug?: string; action?: string; id?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const slug = String(body.slug ?? "");
  const action = String(body.action ?? "");
  const id = String(body.id ?? "");
  if (!slug || !action || !id) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const { tenant, user } = await requireTenantAdmin(slug);

  switch (action) {
    case "get": {
      const conversation = await getConversation(tenant.id, user.id, id);
      if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ conversation });
    }
    case "rename":
      await renameConversation(tenant.id, user.id, id, String(body.title ?? ""));
      return NextResponse.json({ ok: true });
    case "archive":
      await setArchived(tenant.id, user.id, id, true);
      return NextResponse.json({ ok: true });
    case "unarchive":
      await setArchived(tenant.id, user.id, id, false);
      return NextResponse.json({ ok: true });
    case "delete":
      await deleteConversation(tenant.id, user.id, id);
      return NextResponse.json({ ok: true });
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
