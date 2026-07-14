"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/guards";
import { grantEntitlement } from "@/lib/entitlements";
import { createCommunitySchema } from "@/lib/validation";
import { slugify } from "@/lib/utils";
import { nameStatus } from "@/lib/tenant-name";
import { writeAudit } from "@/lib/audit";
import { getErrorTranslator, zodError } from "@/lib/action-errors";
import {
  SPACE_BLUEPRINTS,
  DEFAULT_SPACE_TYPES,
  blueprintFor,
  type SpaceCatalogType,
} from "@/lib/space-catalog";

const HEX = /^#[0-9a-fA-F]{6}$/;
function safeColor(value: unknown, fallback: string): string {
  const v = String(value ?? "").trim();
  return HEX.test(v) ? v.toLowerCase() : fallback;
}

function selectedSpaceTypes(raw: unknown): SpaceCatalogType[] {
  let list: string[] = [];
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    if (Array.isArray(parsed)) list = parsed.map(String);
  } catch {
    list = [];
  }
  const valid = list.filter((t) => !!blueprintFor(t)) as SpaceCatalogType[];
  const unique = Array.from(new Set(valid));
  return unique.length ? unique : [...DEFAULT_SPACE_TYPES];
}

export interface CommunityState {
  error?: string;
}

async function uniqueSlug(base: string): Promise<string | null> {
  const root = slugify(base);
  const reserved = new Set(["app", "www", "dashboard", "api", "admin", "login", "signup", "start", "c"]);
  for (let i = 0; i < 25; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    if (reserved.has(candidate)) continue;
    const exists = await prisma.tenant.findUnique({ where: { slug: candidate } });
    if (!exists) return candidate;
  }
  return null;
}

export async function createCommunityAction(
  _prev: CommunityState,
  formData: FormData,
): Promise<CommunityState> {
  const user = await requireUser("/start");
  const t = await getErrorTranslator();
  const parsed = createCommunitySchema.safeParse({
    name: formData.get("name"),
    slug: slugify(String(formData.get("slug") || formData.get("name") || "")),
    tagline: formData.get("tagline") ?? "",
  });
  if (!parsed.success) {
    return { error: zodError(t, parsed) };
  }

  if ((await nameStatus(parsed.data.name)) === "taken") {
    return { error: t("siteNameTaken") };
  }

  const slug = await uniqueSlug(parsed.data.slug);
  if (!slug) return { error: t("addressTaken") };

  // Seed the new community in the creator's chosen UI language.
  const tOnb = await getTranslations("onboarding");
  const tName = await getTranslations("onboarding.spaces");
  const tSeed = await getTranslations("seed");

  const description = String(formData.get("description") || "").trim() || null;
  const primaryColor = safeColor(formData.get("primaryColor"), "#6d28d9");
  const accentColor = safeColor(formData.get("accentColor"), "#ec4899");
  const access = String(formData.get("visibility") || "PUBLIC") === "MEMBERS" ? "MEMBERS" : "PUBLIC";
  const membershipName = String(formData.get("membershipName") || "").trim() || tOnb("defaultMembership");
  const tierSlug = slugify(membershipName) || "mitglied";
  const entitlementKey = `tier:${tierSlug}`;

  const types = selectedSpaceTypes(formData.get("spaces"));
  const spaceData = SPACE_BLUEPRINTS.filter((b) => types.includes(b.type)).map((b, i) => ({
    name: tName(`${b.type}.name`),
    slug: b.slug,
    type: b.type,
    description: tSeed(`spaceDesc.${b.type}`),
    visibility: access === "MEMBERS" && b.visibility === "PUBLIC" ? ("MEMBERS" as const) : b.visibility,
    sortOrder: i,
  }));

  const tenant = await prisma.tenant.create({
    data: {
      name: parsed.data.name,
      slug,
      tagline: parsed.data.tagline || null,
      description,
      primaryColor,
      accentColor,
      ownerId: user.id,
      memberships: {
        create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
      },
      tiers: {
        create: {
          name: membershipName,
          slug: tierSlug,
          description: tSeed("tierDescription"),
          priceCents: 0,
          interval: "FREE",
          entitlementKey,
          isDefault: true,
          isPublic: true,
          sortOrder: 0,
        },
      },
      spaces: {
        create: spaceData,
      },
      levels: {
        create: [
          { name: tSeed("levels.l0"), minPoints: 0, sortOrder: 0 },
          { name: tSeed("levels.l1"), minPoints: 100, sortOrder: 1 },
          { name: tSeed("levels.l2"), minPoints: 500, sortOrder: 2 },
          { name: tSeed("levels.l3"), minPoints: 1500, sortOrder: 3 },
        ],
      },
      rules: {
        create: [
          { name: tSeed("rules.postCreated"), trigger: "POST_CREATED", points: 10 },
          { name: tSeed("rules.commentCreated"), trigger: "COMMENT_CREATED", points: 5 },
          { name: tSeed("rules.reactionGiven"), trigger: "REACTION_GIVEN", points: 2, maxPerDay: 20 },
          { name: tSeed("rules.dailyLogin"), trigger: "DAILY_LOGIN", points: 5, maxPerDay: 1 },
          { name: tSeed("rules.lessonCompleted"), trigger: "LESSON_COMPLETED", points: 20 },
          { name: tSeed("rules.eventRsvp"), trigger: "EVENT_RSVP", points: 10 },
          { name: tSeed("rules.purchase"), trigger: "PURCHASE", points: 50 },
        ],
      },
      badges: {
        create: [
          { name: tSeed("badges.firstPost.name"), description: tSeed("badges.firstPost.description"), criteria: { type: "posts", threshold: 1 } },
          { name: tSeed("badges.writer.name"), description: tSeed("badges.writer.description"), criteria: { type: "posts", threshold: 10 } },
          { name: tSeed("badges.points100.name"), description: tSeed("badges.points100.description"), criteria: { type: "points", threshold: 100 } },
        ],
      },
    },
  });

  await grantEntitlement({
    tenantId: tenant.id,
    userId: user.id,
    key: entitlementKey,
    source: "ROLE",
  });
  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "tenant.create",
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: { slug },
  });

  redirect(`/dashboard/${slug}`);
}
