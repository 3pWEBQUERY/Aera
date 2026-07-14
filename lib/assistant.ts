import "server-only";
import { randomUUID } from "crypto";
import prisma from "./prisma";
import { uniqueChildSlug } from "./slug";
import { writeAudit } from "./audit";
import { geminiRawMetered, aiLanguageInstruction, type GeminiContent, type GeminiPart, type GeminiTool } from "./ai";
import { formatPrice } from "./utils";
import { uploadObject, isAllowedImage, extensionFor } from "./storage";
import {
  releaseCreditReservation,
  reserveCredit,
  settleCreditReservation,
} from "./credits";

/** A reference image supplied with a chat turn (base64, no data: prefix). */
export interface AssistantImageInput {
  mimeType: string;
  data: string;
}
const MAX_CHAT_IMAGES = 4;

/** Store a base64 image as a tenant StorageObject and return its stable URL. */
async function persistAssistantImage(
  tenantId: string,
  ownerId: string,
  mimeType: string,
  data: string,
): Promise<string> {
  const bytes = Buffer.from(data, "base64");
  const key = `tenants/${tenantId}/assistant-image/${randomUUID()}.${extensionFor(mimeType)}`;
  const url = await uploadObject({ key, body: bytes, contentType: mimeType });
  await prisma.storageObject.create({
    data: {
      tenantId,
      ownerId,
      key,
      url,
      purpose: "assistant-image",
      contentType: mimeType,
      sizeBytes: bytes.length,
      visibility: "PUBLIC",
    },
  });
  return url;
}

/** History text for the model: unwrap JSON user messages that carry attachments. */
function modelText(content: string): string {
  try {
    const o = JSON.parse(content) as { text?: string; attachments?: unknown };
    if (o && typeof o === "object" && Array.isArray(o.attachments)) {
      return typeof o.text === "string" && o.text ? o.text : "[Bild angehängt]";
    }
  } catch {
    /* plain-text message */
  }
  return content;
}

const SPACE_TYPES = [
  "FEED", "FORUM", "COURSE", "SHOP", "NEWSLETTER", "EVENTS", "BLOG", "KNOWLEDGE", "GALLERY", "VIDEOS", "CHAT", "PODCAST", "LINKS", "ADS", "LIVE", "REQUESTS", "BOOKING", "STORIES", "TIPS", "CALENDAR",
] as const;
const VISIBILITIES = ["PUBLIC", "MEMBERS", "PAID"] as const;

const SYSTEM =
  "Du bist der AI-Assistent im Creator-Dashboard einer Community-Plattform (Spaces, " +
  "Mitgliedschaften, Produkte, Events, Chat). Antworte klar und freundlich. " +
  "Nutze Werkzeuge nur, wenn sie für die Aufgabe nötig sind:\n" +
  "- get_stats: aktuelle Kennzahlen der Community.\n" +
  "- list_spaces: vorhandene Spaces auflisten.\n" +
  "- create_space: einen neuen Space anlegen (nur wenn der Nutzer das klar möchte).\n" +
  "Fasse Ergebnisse kurz zusammen. Bei Aktionen bestätige, was du getan hast.";

const TOOLS: GeminiTool[] = [
  {
    functionDeclarations: [
      {
        name: "get_stats",
        description:
          "Liefert aktuelle Kennzahlen der Community: Mitglieder, aktive Beiträge, Produkte, Spaces, Umsatz (bezahlte Bestellungen) und Top-Mitglieder.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "list_spaces",
        description: "Listet alle Spaces der Community mit Name, Slug, Typ und Sichtbarkeit.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "create_space",
        description: "Erstellt einen neuen Space in der Community.",
        parameters: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Anzeigename des Space" },
            type: {
              type: "STRING",
              description: "Space-Typ",
              enum: [...SPACE_TYPES],
            },
            visibility: {
              type: "STRING",
              description: "Sichtbarkeit (Standard: MEMBERS)",
              enum: [...VISIBILITIES],
            },
          },
          required: ["name", "type"],
        },
      },
    ],
  },
];

// ---------------------------------------------------------------- Tool executor
async function execTool(
  tenant: { id: string; slug: string },
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: Record<string, unknown>; label: string | null }> {
  if (name === "get_stats") {
    const [members, activeMembers, posts, products, spaces, revenue, top] = await Promise.all([
      prisma.membership.count({ where: { tenantId: tenant.id } }),
      prisma.membership.count({ where: { tenantId: tenant.id, status: "ACTIVE" } }),
      prisma.post.count({ where: { tenantId: tenant.id, isPublished: true } }),
      prisma.product.count({ where: { tenantId: tenant.id } }),
      prisma.space.count({ where: { tenantId: tenant.id, isArchived: false } }),
      prisma.order.aggregate({ where: { tenantId: tenant.id, status: "PAID" }, _sum: { amountCents: true } }),
      prisma.memberStats.findMany({
        where: { tenantId: tenant.id, points: { gt: 0 } },
        orderBy: { points: "desc" },
        take: 3,
        include: { user: { select: { name: true } } },
      }),
    ]);
    const revenueCents = revenue._sum.amountCents ?? 0;
    return {
      label: "Kennzahlen abgerufen",
      result: {
        members,
        activeMembers,
        publishedPosts: posts,
        products,
        spaces,
        revenue: formatPrice(revenueCents),
        topMembers: top.map((t) => ({ name: t.user.name, points: t.points })),
      },
    };
  }

  if (name === "list_spaces") {
    const rows = await prisma.space.findMany({
      where: { tenantId: tenant.id, isArchived: false },
      orderBy: { sortOrder: "asc" },
      select: { name: true, slug: true, type: true, visibility: true },
    });
    return { label: "Spaces aufgelistet", result: { spaces: rows } };
  }

  if (name === "create_space") {
    const rawName = String(args.name ?? "").trim().slice(0, 60);
    const type = String(args.type ?? "").toUpperCase();
    const visibility = String(args.visibility ?? "MEMBERS").toUpperCase();
    if (rawName.length < 2) return { label: null, result: { error: "Name zu kurz." } };
    if (!(SPACE_TYPES as readonly string[]).includes(type)) {
      return { label: null, result: { error: `Ungültiger Typ. Erlaubt: ${SPACE_TYPES.join(", ")}` } };
    }
    const vis = (VISIBILITIES as readonly string[]).includes(visibility) ? visibility : "MEMBERS";
    const slug = await uniqueChildSlug("space", tenant.id, rawName);
    const space = await prisma.space.create({
      data: {
        tenantId: tenant.id,
        name: rawName,
        slug,
        type: type as (typeof SPACE_TYPES)[number],
        visibility: vis as (typeof VISIBILITIES)[number],
        sortOrder: await prisma.space.count({ where: { tenantId: tenant.id } }),
      },
    });
    await writeAudit({
      tenantId: tenant.id,
      action: "space.create.assistant",
      targetType: "Space",
      targetId: space.id,
    });
    return {
      label: `Space „${rawName}" erstellt`,
      result: { ok: true, name: rawName, slug, type, visibility: vis, url: `/dashboard/${tenant.slug}/spaces/${slug}` },
    };
  }

  return { label: null, result: { error: "Unbekanntes Werkzeug." } };
}

// ---------------------------------------------------------------- Conversations
export type ConversationKind = "CHAT" | "IMAGE";

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  title: string;
  archived: boolean;
  updatedAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: { id: string; role: "user" | "assistant"; content: string }[];
}

function normalizeKind(value: string): ConversationKind {
  return value === "IMAGE" ? "IMAGE" : "CHAT";
}

export async function listConversations(
  tenantId: string,
  userId: string,
  kind?: ConversationKind,
): Promise<ConversationSummary[]> {
  const rows = await prisma.assistantConversation.findMany({
    where: { tenantId, userId, ...(kind ? { kind } : {}) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, kind: true, title: true, archived: true, updatedAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: normalizeKind(r.kind),
    title: r.title,
    archived: r.archived,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getConversation(
  tenantId: string,
  userId: string,
  id: string,
): Promise<ConversationDetail | null> {
  const c = await prisma.assistantConversation.findFirst({
    where: { id, tenantId, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!c) return null;
  return {
    id: c.id,
    kind: normalizeKind(c.kind),
    title: c.title,
    archived: c.archived,
    updatedAt: c.updatedAt.toISOString(),
    messages: c.messages.map((m) => ({
      id: m.id,
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  };
}

// ---------------------------------------------------------------- Image turns
/**
 * Persist one image-generation turn into an IMAGE conversation (creating the
 * conversation on first use). Message content is JSON so the client can render
 * the prompt, the attached reference images and the generated results.
 */
export async function appendImageTurn(
  tenant: { id: string },
  userId: string,
  conversationId: string | null,
  turn: {
    prompt: string;
    attachments: string[]; // reference-image URLs
    images: string[]; // generated-image URLs
    text: string;
  },
): Promise<{ conversationId: string; title: string }> {
  let convo = conversationId
    ? await prisma.assistantConversation.findFirst({
        where: { id: conversationId, tenantId: tenant.id, userId, kind: "IMAGE" },
      })
    : null;
  if (!convo) {
    const title = turn.prompt.trim().slice(0, 48) || "Neues Bild";
    convo = await prisma.assistantConversation.create({
      data: { tenantId: tenant.id, userId, kind: "IMAGE", title },
    });
  }

  await prisma.assistantMessage.create({
    data: {
      conversationId: convo.id,
      role: "user",
      content: JSON.stringify({ prompt: turn.prompt, attachments: turn.attachments }),
    },
  });
  await prisma.assistantMessage.create({
    data: {
      conversationId: convo.id,
      role: "assistant",
      content: JSON.stringify({ images: turn.images, text: turn.text }),
    },
  });
  await prisma.assistantConversation.update({
    where: { id: convo.id },
    data: { updatedAt: new Date() },
  });

  return { conversationId: convo.id, title: convo.title };
}

export async function renameConversation(tenantId: string, userId: string, id: string, title: string) {
  await prisma.assistantConversation.updateMany({
    where: { id, tenantId, userId },
    data: { title: title.trim().slice(0, 80) || "Neuer Chat" },
  });
}

export async function setArchived(tenantId: string, userId: string, id: string, archived: boolean) {
  await prisma.assistantConversation.updateMany({
    where: { id, tenantId, userId },
    data: { archived },
  });
}

export async function deleteConversation(tenantId: string, userId: string, id: string) {
  await prisma.assistantConversation.deleteMany({ where: { id, tenantId, userId } });
}

// ---------------------------------------------------------------- Chat turn
export interface AssistantTurn {
  conversationId: string;
  title: string;
  reply: string;
  actions: string[];
  outOfCredits?: boolean;
}

const OUT_OF_CREDITS_REPLY =
  "Dein Credit-Guthaben ist aufgebraucht. Öffne oben rechts „Credits“, um ein Paket zu kaufen " +
  "oder auf ein größeres Paket zu wechseln — danach kann ich sofort weitermachen.";

export async function runAssistantTurn(
  tenant: { id: string; slug: string },
  userId: string,
  conversationId: string | null,
  userMessage: string,
  locale = "de",
  images: AssistantImageInput[] = [],
): Promise<AssistantTurn> {
  const text = userMessage.trim().slice(0, 4000);
  const refImages = images
    .filter((im) => isAllowedImage(im.mimeType) && !!im.data)
    .slice(0, MAX_CHAT_IMAGES);

  // Ensure a conversation exists (title derived from the first message).
  let convo = conversationId
    ? await prisma.assistantConversation.findFirst({
        where: { id: conversationId, tenantId: tenant.id, userId, kind: "CHAT" },
      })
    : null;
  if (!convo) {
    convo = await prisma.assistantConversation.create({
      data: { tenantId: tenant.id, userId, kind: "CHAT", title: text.slice(0, 48) || "Neuer Chat" },
    });
  }

  // Persist reference images first so the reloaded thread can show them, then
  // store the user message (JSON when it carries attachments).
  const attachmentUrls: string[] = [];
  for (const im of refImages) {
    attachmentUrls.push(await persistAssistantImage(tenant.id, userId, im.mimeType, im.data));
  }
  await prisma.assistantMessage.create({
    data: {
      conversationId: convo.id,
      role: "user",
      content:
        attachmentUrls.length > 0
          ? JSON.stringify({ text, attachments: attachmentUrls })
          : text,
    },
  });

  // Build history for the model.
  const history = await prisma.assistantMessage.findMany({
    where: { conversationId: convo.id },
    orderBy: { createdAt: "asc" },
    take: 30,
  });
  const contents: GeminiContent[] = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: modelText(m.content) }],
  }));

  // Attach the current turn's reference images (base64 in memory) to the last
  // user message so the model can actually see them this turn.
  if (refImages.length > 0) {
    for (let i = contents.length - 1; i >= 0; i--) {
      if (contents[i].role === "user") {
        contents[i] = {
          role: "user",
          parts: [
            ...refImages.map((im) => ({ inlineData: { mimeType: im.mimeType, data: im.data } })),
            { text: text || "Bitte berücksichtige die angehängten Bilder." },
          ],
        };
        break;
      }
    }
  }

  // Tool loop.
  const actions: string[] = [];
  let reply = "Ich konnte gerade keine Antwort erzeugen. Bitte versuche es erneut.";
  let outOfCredits = false;
  for (let i = 0; i < 5; i++) {
    const reservation = await reserveCredit({
      tenantId: tenant.id,
      userId,
      conversationId: convo.id,
    });
    if (!reservation) {
      outOfCredits = true;
      reply = OUT_OF_CREDITS_REPLY;
      break;
    }

    let metered: Awaited<ReturnType<typeof geminiRawMetered>>;
    try {
      metered = await geminiRawMetered(contents, {
        tools: TOOLS,
        system: `${SYSTEM}\n${aiLanguageInstruction(locale)}`,
        maxTokens: 1024,
      });
      await settleCreditReservation({
        reservation,
        promptTokens: metered.usage.promptTokens,
        outputTokens: metered.usage.outputTokens,
        totalTokens: metered.usage.totalTokens,
      });
    } catch (error) {
      await releaseCreditReservation(reservation);
      throw error;
    }

    const { content: out } = metered;
    if (!out) break;
    const calls = (out.parts ?? []).filter((p) => p.functionCall);
    if (calls.length === 0) {
      const t = (out.parts ?? []).map((p) => p.text ?? "").join("").trim();
      if (t) reply = t;
      break;
    }
    contents.push({ role: "model", parts: out.parts });
    const responseParts: GeminiPart[] = [];
    for (const c of calls) {
      const fn = c.functionCall!;
      const { result, label } = await execTool(tenant, fn.name, fn.args ?? {});
      if (label) actions.push(label);
      responseParts.push({ functionResponse: { name: fn.name, response: result } });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  await prisma.assistantMessage.create({
    data: { conversationId: convo.id, role: "assistant", content: reply },
  });
  await prisma.assistantConversation.update({
    where: { id: convo.id },
    data: { updatedAt: new Date() },
  });

  return {
    conversationId: convo.id,
    title: convo.title,
    reply,
    actions,
    ...(outOfCredits ? { outOfCredits: true } : {}),
  };
}
