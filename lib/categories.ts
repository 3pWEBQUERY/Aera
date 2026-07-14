import type { IconName } from "@/components/dashboard/icons";

/**
 * Fixed community categories. Stored as the `key` string in `Tenant.category`
 * so labels/gradients can evolve without data migrations.
 */
export interface CommunityCategory {
  key: string;
  label: string;
  icon: IconName;
  /** Tile gradient (from → to) for the discover page. */
  gradient: [string, string];
}

export const CATEGORIES: CommunityCategory[] = [
  { key: "podcast", label: "Podcasts & Sendungen", icon: "videos", gradient: ["#b91c1c", "#7f1d1d"] },
  { key: "kurse", label: "Kurse & Lernen", icon: "courses", gradient: ["#1d4ed8", "#1e3a8a"] },
  { key: "musik", label: "Musik", icon: "feed", gradient: ["#b45309", "#78350f"] },
  { key: "kunst", label: "Kunst & Design", icon: "branding", gradient: ["#0e7490", "#164e63"] },
  { key: "gaming", label: "Gaming", icon: "gamification", gradient: ["#7c3aed", "#4c1d95"] },
  { key: "lifestyle", label: "Lifestyle", icon: "sparkles", gradient: ["#047857", "#064e3b"] },
  { key: "fitness", label: "Fitness & Gesundheit", icon: "members", gradient: ["#dc2626", "#7f1d1d"] },
  { key: "business", label: "Business & Finanzen", icon: "payouts", gradient: ["#334155", "#0f172a"] },
  { key: "technologie", label: "Technologie", icon: "settings", gradient: ["#4338ca", "#312e81"] },
  { key: "schreiben", label: "Schreiben & Journalismus", icon: "blog", gradient: ["#be185d", "#831843"] },
  { key: "film", label: "Film & Video", icon: "gallery", gradient: ["#a16207", "#713f12"] },
  { key: "community", label: "Community & Soziales", icon: "forum", gradient: ["#be123c", "#881337"] },
];

const byKey = new Map(CATEGORIES.map((c) => [c.key, c]));

export function categoryByKey(key: string | null | undefined): CommunityCategory | null {
  return key ? (byKey.get(key) ?? null) : null;
}

export function isValidCategory(key: string): boolean {
  return byKey.has(key);
}
