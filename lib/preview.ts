import "server-only";
import { cookies } from "next/headers";
import { parseLayout, type Audience, type LayoutConfig } from "./layout";

/**
 * Live page-builder preview. While a staff member edits the layout, the editor
 * writes the current (unsaved) config to a short-lived cookie; the community
 * layout & home page read it here and render as if it were already saved — but
 * only for staff, so it can never leak to real visitors.
 */
export interface PreviewOverride {
  name?: string;
  logoUrl?: string | null;
  primaryColor?: string;
  description?: string | null;
  audience?: Audience;
  config: LayoutConfig;
}

const AUDIENCES = ["PUBLIC", "FREE", "PAID"] as const;

export function previewCookieName(slug: string): string {
  return `aera_preview_${slug}`;
}

export async function readPreviewOverride(
  slug: string,
  isStaff: boolean,
): Promise<PreviewOverride | null> {
  if (!isStaff) return null;
  const store = await cookies();
  const raw = store.get(previewCookieName(slug))?.value;
  if (!raw) return null;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }

  const config = parseLayout({
    sectionsByAudience: data.sectionsByAudience,
    nav: data.nav,
    header: data.header,
  });
  const audience = AUDIENCES.includes(data.audience as Audience)
    ? (data.audience as Audience)
    : undefined;

  return {
    name: typeof data.name === "string" ? data.name : undefined,
    logoUrl:
      typeof data.logoUrl === "string" ? data.logoUrl : data.logoUrl === null ? null : undefined,
    primaryColor: typeof data.primaryColor === "string" ? data.primaryColor : undefined,
    description: typeof data.description === "string" ? data.description : undefined,
    audience,
    config,
  };
}
