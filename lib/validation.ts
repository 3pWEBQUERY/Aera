import { z } from "zod";
import {
  isAllowedOneTimePriceCents,
  isAllowedSubscriptionPriceCents,
} from "@/lib/apple-products";

// Fehlermeldungen sind Keys aus dem `errors`-Namespace (messages/*.json) und
// werden in den Server-Actions via zodError() übersetzt.
export const signupSchema = z.object({
  name: z.string().min(2, "enterYourName").max(80),
  email: z.string().email("emailInvalid"),
  password: z.string().min(8, "min8chars"),
});

export const loginSchema = z.object({
  email: z.string().email("emailInvalid"),
  password: z.string().min(1, "passwordRequired"),
});

export const createCommunitySchema = z.object({
  name: z.string().min(2, "min2chars").max(60),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "slugChars"),
  tagline: z.string().max(140).optional().or(z.literal("")),
});

export const spaceSchema = z.object({
  name: z.string().min(2).max(60),
  type: z.enum([
    "FEED",
    "FORUM",
    "COURSE",
    "SHOP",
    "NEWSLETTER",
    "EVENTS",
    "BLOG",
    "KNOWLEDGE",
    "GALLERY",
    "VIDEOS",
    "CHAT",
    "PODCAST",
    "LINKS",
    "ADS",
    "LIVE",
    "REQUESTS",
    "BOOKING",
    "STORIES",
    "TIPS",
    "CALENDAR",
  ]),
  description: z.string().max(280).optional().or(z.literal("")),
  visibility: z.enum(["PUBLIC", "MEMBERS", "PAID"]),
  requiredEntitlementKey: z.string().optional().or(z.literal("")),
});

export const postSchema = z.object({
  title: z.string().max(140).optional().or(z.literal("")),
  body: z.string().min(1, "writeSomething").max(10000),
});

export const commentSchema = z.object({
  body: z.string().min(1).max(4000),
  parentId: z.string().optional().or(z.literal("")),
});

export const tierSchema = z
  .object({
    name: z.string().min(2).max(60),
    // Benefits list: one line per benefit, rendered on the join page.
    description: z
      .string()
      .max(3000, "benefitsMax")
      .optional()
      .or(z.literal("")),
    priceCents: z.coerce.number().int().min(0).max(10_000_00),
    interval: z.enum(["FREE", "MONTH", "YEAR"]),
  })
  // Apple-IAP-Konformität: bezahlte Abos (MONTH/YEAR mit Preis > 0) dürfen nur
  // feste Apple-Preispunkte verwenden. FREE-Tier (Preis 0) bleibt erlaubt.
  .refine(
    (v) =>
      !((v.interval === "MONTH" || v.interval === "YEAR") && v.priceCents > 0) ||
      isAllowedSubscriptionPriceCents(v.priceCents),
    { message: "priceNotAllowed", path: ["priceCents"] },
  );

export const productSchema = z
  .object({
    name: z.string().min(2).max(80),
    description: z.string().max(1000).optional().or(z.literal("")),
    priceCents: z.coerce.number().int().min(0).max(10_000_00),
    type: z.enum(["DIGITAL", "PHYSICAL", "BUNDLE", "COURSE_ACCESS", "TIER_GRANT"]),
    downloadUrl: z.string().url().optional().or(z.literal("")),
  })
  // Apple-IAP-Konformität: digitale Produkte (type != PHYSICAL, Preis > 0) dürfen
  // nur feste Apple-Preispunkte verwenden. PHYSICAL wird nur im Web verkauft →
  // freier Preis erlaubt. Kostenlose digitale Produkte (Preis 0) bleiben erlaubt.
  .refine(
    (v) =>
      v.type === "PHYSICAL" ||
      v.priceCents === 0 ||
      isAllowedOneTimePriceCents(v.priceCents),
    { message: "priceNotAllowed", path: ["priceCents"] },
  );

export const eventSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(2000).optional().or(z.literal("")),
  startsAt: z.string().min(1, "startTimeRequired"),
  location: z.string().max(160).optional().or(z.literal("")),
  isOnline: z.coerce.boolean().optional(),
  meetingUrl: z.string().url().optional().or(z.literal("")),
});

export const campaignSchema = z.object({
  subject: z.string().min(2).max(140),
  body: z.string().min(1).max(20000),
  segmentId: z.string().optional().or(z.literal("")),
});
