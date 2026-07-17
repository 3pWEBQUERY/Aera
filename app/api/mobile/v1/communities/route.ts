import { getTranslations } from "next-intl/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { grantEntitlement } from "@/lib/entitlements";
import { writeAudit } from "@/lib/audit";
import { slugify } from "@/lib/utils";
import { nameStatus } from "@/lib/tenant-name";
import { isValidCategory } from "@/lib/categories";
import { normalizeLocale } from "@/i18n/locales";
import {
  SPACE_BLUEPRINTS,
  DEFAULT_SPACE_TYPES,
  blueprintFor,
  type SpaceCatalogType,
} from "@/lib/space-catalog";
import { jsonError, jsonOk, parseJsonBody, requireMobileAuth } from "@/lib/mobile/api";

// POST /api/mobile/v1/communities → { slug }
// Legt eine neue Community für den eingeloggten Nutzer an (Owner-Membership,
// Free-Default-Tier, Spaces, Levels-, Regel- und Badge-Seeds).
// Spiegel von app/actions/community.ts#createCommunityAction — bei Änderungen
// synchron halten. Unterschiede: JSON-Body statt FormData, `locale` kommt aus
// dem Body (Default "de") statt aus dem Cookie, `category` zusätzlich (nur
// gültige Keys aus lib/categories.ts), Antwort { slug } statt Redirect.
// Fehlercodes: 409 name_taken / address_taken, 400 validation.

const bodySchema = z.object({
  // Grenzen wie createCommunitySchema (lib/validation.ts).
  name: z.string().min(2).max(60),
  tagline: z.string().max(140).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(60).optional(),
  primaryColor: z.string().max(20).optional(),
  accentColor: z.string().max(20).optional(),
  membershipName: z.string().max(60).optional(),
  visibility: z.enum(["PUBLIC", "MEMBERS"]).optional(),
  spaces: z.array(z.string()).max(SPACE_BLUEPRINTS.length * 2).optional(),
  locale: z.string().max(10).optional(),
});

// Spiegel von app/actions/community.ts#safeColor.
const HEX = /^#[0-9a-fA-F]{6}$/;
function safeColor(value: unknown, fallback: string): string {
  const v = String(value ?? "").trim();
  return HEX.test(v) ? v.toLowerCase() : fallback;
}

// Spiegel von app/actions/community.ts#selectedSpaceTypes (JSON-Parsing entfällt,
// der Body liefert bereits ein String-Array).
function selectedSpaceTypes(raw: string[] | undefined): SpaceCatalogType[] {
  const valid = (raw ?? []).filter((t) => !!blueprintFor(t)) as SpaceCatalogType[];
  const unique = Array.from(new Set(valid));
  return unique.length ? unique : [...DEFAULT_SPACE_TYPES];
}

// Spiegel von app/actions/community.ts#uniqueSlug.
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

export async function POST(req: Request) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const parsed = await parseJsonBody(req, bodySchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  const name = body.name.trim();
  const status = await nameStatus(name);
  if (status === "taken") {
    return jsonError("name_taken", "This community name is already taken.", 409);
  }
  if (status !== "available") {
    return jsonError("validation", "name: Must be between 2 and 60 characters.", 400);
  }

  const slug = await uniqueSlug(name);
  if (!slug) return jsonError("address_taken", "This community address is already taken.", 409);

  // Seed-Texte in der Sprache des Erstellers (Body-`locale`, validiert gegen
  // SUPPORTED_LOCALES, Fallback "de" — die Plattform-Default-Sprache).
  const locale = normalizeLocale(body.locale);
  const tOnb = await getTranslations({ locale, namespace: "onboarding" });
  const tName = await getTranslations({ locale, namespace: "onboarding.spaces" });
  const tSeed = await getTranslations({ locale, namespace: "seed" });

  const tagline = (body.tagline ?? "").trim() || null;
  const description = (body.description ?? "").trim() || null;
  const category = body.category && isValidCategory(body.category) ? body.category : null;
  const primaryColor = safeColor(body.primaryColor, "#6d28d9");
  const accentColor = safeColor(body.accentColor, "#ec4899");
  const access = body.visibility === "MEMBERS" ? "MEMBERS" : "PUBLIC";
  const membershipName = (body.membershipName ?? "").trim() || tOnb("defaultMembership");
  const tierSlug = slugify(membershipName) || "mitglied";
  const entitlementKey = `tier:${tierSlug}`;

  const types = selectedSpaceTypes(body.spaces);
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
      name,
      slug,
      tagline,
      description,
      ...(category ? { category } : {}),
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
    metadata: { slug, via: "mobile" },
  });

  return jsonOk({ slug }, 201);
}
