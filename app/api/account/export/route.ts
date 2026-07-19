import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createUserExport,
  DATA_EXPORT_SCHEMA_VERSION,
} from "@/lib/data-export";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = createUserExport({ userId: user.id });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(result.stream, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="aera-account-${stamp}.json"`,
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Aera-Export-Schema": DATA_EXPORT_SCHEMA_VERSION,
    },
  });
}

