import "server-only";
import { unstable_cache } from "next/cache";
import prisma from "./prisma";
import { env, features } from "./env";
import { LOCALE_ENGLISH_NAMES, normalizeLocale } from "@/i18n/locales";

/**
 * Sprachanweisung für Gemini-Prompts: sorgt dafür, dass die KI in der aktiven
 * UI-Sprache antwortet (nicht fest auf Deutsch). Englischer Sprachname, weil
 * das Modell diese am zuverlässigsten befolgt.
 */
export function aiLanguageInstruction(locale: string): string {
  const name = LOCALE_ENGLISH_NAMES[normalizeLocale(locale)];
  return `Always respond in ${name}, regardless of the language of the provided context or data. Only reply in a different language if the user explicitly writes to you in that other language.`;
}

const STOP = new Set([
  "und","oder","der","die","das","ein","eine","mit","für","von","den","dem",
  "the","and","for","with","you","your","that","this","are","was","ist","auf",
  "im","in","zu","aus","ein","es","wir","ich","du","at","to","of","a","an","is",
]);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-zäöüß0-9]{3,}/g) ?? []).filter(
    (t) => !STOP.has(t),
  );
}

function keywordsOf(text: string): string {
  const counts = new Map<string, number>();
  for (const t of tokenize(text)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map((e) => e[0])
    .join(" ");
}

function cosine(a: number[], b: number[]): number {
  // Guard against mixed embedding dimensions (e.g. content indexed with a
  // different provider before the switch) — those are simply not comparable.
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/**
 * Embedding for semantic search. Prefers Google Gemini; falls back to OpenAI if
 * only that key is set. Returns null when no provider is configured.
 */
async function embed(text: string): Promise<number[] | null> {
  const input = text.slice(0, 8000);

  if (env.GEMINI_API_KEY) {
    try {
      const model = env.GEMINI_EMBED_MODEL;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: `models/${model}`,
            content: { parts: [{ text: input }] },
          }),
        },
      );
      if (res.ok) {
        const json = (await res.json()) as { embedding?: { values?: number[] } };
        const values = json.embedding?.values;
        if (values && values.length) return values;
      }
    } catch {
      /* fall through to OpenAI / null */
    }
  }

  if (env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: "text-embedding-3-small", input }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data: { embedding: number[] }[] };
        return json.data?.[0]?.embedding ?? null;
      }
    } catch {
      /* fall through */
    }
  }

  return null;
}

const ASSISTANT_SYSTEM =
  "Du bist der AI-Assistent für Community-Creator auf einer Plattform mit Spaces, " +
  "Mitgliedschaften, Produkten, Events und Chat. Hilf beim Schreiben von Beiträgen, " +
  "Beschreibungen, Willkommensnachrichten und Ideen. Antworte klar, freundlich und " +
  "standardmäßig auf Deutsch (außer der Nutzer schreibt in einer anderen Sprache). " +
  "Halte dich kurz und nutze bei Bedarf Absätze oder Aufzählungen.";

// ---------------------------------------------------------------- Raw / tools
export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  inlineData?: { mimeType: string; data: string };
}
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}
export interface GeminiTool {
  functionDeclarations: { name: string; description: string; parameters?: unknown }[];
}

/** Token usage returned by Gemini's `usageMetadata`. */
export interface GeminiUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Low-level generateContent call with optional tools (function calling). Returns
 * the model's content (which may contain functionCall parts) or null.
 */
export async function geminiRaw(
  contents: GeminiContent[],
  opts?: { tools?: GeminiTool[]; system?: string; maxTokens?: number },
): Promise<GeminiContent | null> {
  const out = await geminiRawMetered(contents, opts);
  return out.content;
}

/**
 * Same as {@link geminiRaw} but also returns the call's token usage so callers
 * can meter credit consumption. `content` is null when the model is
 * unavailable or the request fails.
 */
export async function geminiRawMetered(
  contents: GeminiContent[],
  opts?: { tools?: GeminiTool[]; system?: string; maxTokens?: number },
): Promise<{ content: GeminiContent | null; usage: GeminiUsage }> {
  const empty: GeminiUsage = { promptTokens: 0, outputTokens: 0, totalTokens: 0 };
  if (!env.GEMINI_API_KEY) return { content: null, usage: empty };
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(opts?.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
          contents,
          ...(opts?.tools ? { tools: opts.tools } : {}),
          generationConfig: { temperature: 0.4, maxOutputTokens: opts?.maxTokens ?? 1024 },
        }),
      },
    );
    if (!res.ok) return { content: null, usage: empty };
    const json = (await res.json()) as {
      candidates?: { content?: GeminiContent }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };
    const um = json.usageMetadata ?? {};
    const usage: GeminiUsage = {
      promptTokens: um.promptTokenCount ?? 0,
      outputTokens: um.candidatesTokenCount ?? 0,
      totalTokens:
        um.totalTokenCount ?? (um.promptTokenCount ?? 0) + (um.candidatesTokenCount ?? 0),
    };
    return { content: json.candidates?.[0]?.content ?? null, usage };
  } catch {
    return { content: null, usage: empty };
  }
}

/** Multi-turn chat via Gemini (GEMINI_MODEL). null when unavailable. */
export async function geminiChat(
  messages: { role: "user" | "model"; text: string }[],
  maxTokens = 1024,
  locale?: string,
): Promise<string | null> {
  if (!env.GEMINI_API_KEY) return null;
  const system = locale
    ? `${ASSISTANT_SYSTEM}\n${aiLanguageInstruction(locale)}`
    : ASSISTANT_SYSTEM;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.6 },
        }),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

/** Short text generation via Gemini (GEMINI_MODEL). null when unavailable. */
export async function geminiGenerate(prompt: string, maxTokens = 60): Promise<string | null> {
  if (!env.GEMINI_API_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5 },
        }),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Image gen
/** A single image returned by the model (base64 payload + its MIME type). */
export interface GeneratedImage {
  mimeType: string;
  data: string; // base64 (no data: prefix)
}

export interface ImageGenResult {
  images: GeneratedImage[];
  /** Optional caption / commentary the model returned alongside the image. */
  text: string;
  usage: GeminiUsage;
}

/**
 * Generate or edit images with the multimodal Gemini image model
 * (GEMINI_IMAGE_MODEL). Optional `inputImages` are passed as references the
 * model can edit or take inspiration from. Returns null when Gemini is not
 * configured; otherwise an (possibly empty) list of generated images plus token
 * usage so the caller can meter credits.
 */
export async function geminiGenerateImage(
  prompt: string,
  inputImages: { mimeType: string; data: string }[] = [],
): Promise<ImageGenResult | null> {
  if (!env.GEMINI_API_KEY) return null;
  const empty: GeminiUsage = { promptTokens: 0, outputTokens: 0, totalTokens: 0 };

  const parts: GeminiPart[] = [];
  for (const im of inputImages) {
    parts.push({ inlineData: { mimeType: im.mimeType, data: im.data } });
  }
  parts.push({ text: prompt });

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_IMAGE_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      },
    );
    if (!res.ok) return { images: [], text: "", usage: empty };
    const json = (await res.json()) as {
      candidates?: { content?: GeminiContent }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };
    const out = json.candidates?.[0]?.content;
    const images: GeneratedImage[] = [];
    let text = "";
    for (const p of out?.parts ?? []) {
      if (p.inlineData?.data) {
        images.push({
          mimeType: p.inlineData.mimeType || "image/png",
          data: p.inlineData.data,
        });
      } else if (p.text) {
        text += p.text;
      }
    }
    const um = json.usageMetadata ?? {};
    const usage: GeminiUsage = {
      promptTokens: um.promptTokenCount ?? 0,
      outputTokens: um.candidatesTokenCount ?? 0,
      totalTokens:
        um.totalTokenCount ?? (um.promptTokenCount ?? 0) + (um.candidatesTokenCount ?? 0),
    };
    return { images, text: text.trim(), usage };
  } catch {
    return { images: [], text: "", usage: empty };
  }
}

/** Index a tenant-scoped content item for retrieval & recommendations. */
export async function indexContent(input: {
  tenantId: string;
  sourceType: string;
  sourceId: string;
  title?: string;
  content: string;
}): Promise<void> {
  const text = `${input.title ?? ""} ${input.content}`.trim();
  const embedding = await embed(text);
  await prisma.aiContextChunk.upsert({
    where: {
      tenantId_sourceType_sourceId: {
        tenantId: input.tenantId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    },
    create: {
      tenantId: input.tenantId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      title: input.title,
      content: input.content.slice(0, 4000),
      keywords: keywordsOf(text),
      embedding: embedding ?? undefined,
    },
    update: {
      title: input.title,
      content: input.content.slice(0, 4000),
      keywords: keywordsOf(text),
      embedding: embedding ?? undefined,
    },
  });
}

export async function removeFromIndex(
  tenantId: string,
  sourceType: string,
  sourceId: string,
): Promise<void> {
  await prisma.aiContextChunk
    .delete({
      where: {
        tenantId_sourceType_sourceId: { tenantId, sourceType, sourceId },
      },
    })
    .catch(() => undefined);
}

export interface RecItem {
  refType: string;
  refId: string;
  score: number;
  reason: string;
}

/**
 * Build a personalized, tenant-isolated profile from the member's activity:
 * purchases, posts, comments and tier. Cross-tenant data is never read.
 */
async function userProfileText(
  tenantId: string,
  userId: string,
): Promise<string> {
  const [posts, comments, orders] = await Promise.all([
    prisma.post.findMany({
      where: { tenantId, authorId: userId },
      select: { title: true, body: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.comment.findMany({
      where: { tenantId, authorId: userId },
      select: { body: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.order.findMany({
      where: { tenantId, userId, status: "PAID" },
      select: { product: { select: { name: true, description: true } } },
    }),
  ]);
  return [
    ...posts.map((p) => `${p.title ?? ""} ${p.body}`),
    ...comments.map((c) => c.body),
    ...orders.map((o) => `${o.product?.name ?? ""} ${o.product?.description ?? ""}`),
  ].join(" ");
}

function keywordScore(profile: string[], candidate: string): number {
  if (profile.length === 0) return 0;
  const set = new Set(tokenize(candidate));
  let hits = 0;
  for (const t of profile) if (set.has(t)) hits++;
  return hits / profile.length;
}

/**
 * Read-only scoring of tenant content for a member. Uses embeddings when an
 * OpenAI key is configured, otherwise a transparent keyword model. No writes.
 */
export async function computeRecommendations(
  tenantId: string,
  userId: string,
  limit = 8,
): Promise<RecItem[]> {
  const profileText = await userProfileText(tenantId, userId);
  const profileTokens = tokenize(profileText);
  const profileEmbedding = profileTokens.length ? await embed(profileText) : null;

  const ownedProductIds = new Set(
    (
      await prisma.order.findMany({
        where: { tenantId, userId, status: "PAID", productId: { not: null } },
        select: { productId: true },
      })
    ).map((o) => o.productId as string),
  );

  const chunks = await prisma.aiContextChunk.findMany({
    where: { tenantId },
    take: 500,
  });

  const scored: RecItem[] = [];
  for (const ch of chunks) {
    if (ch.sourceType === "PRODUCT" && ownedProductIds.has(ch.sourceId)) continue;
    let score = 0;
    // Heuristic reason as a stable key (translated at render time via
    // community.render.recReason); the optional Gemini override replaces it
    // with free text.
    let reason = "popular";
    if (profileEmbedding && Array.isArray(ch.embedding)) {
      score = cosine(profileEmbedding, ch.embedding as number[]);
      reason = "interests";
    } else if (profileTokens.length) {
      score = keywordScore(profileTokens, `${ch.title ?? ""} ${ch.keywords}`);
      if (score > 0) reason = "activity";
    }
    scored.push({ refType: ch.sourceType, refId: ch.sourceId, score, reason });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit).filter((s) => s.score > 0);
  return top.length ? top : scored.slice(0, limit);
}

/**
 * Compute and persist recommendations (Recommendation table, tenant-scoped).
 */
export async function recommendForUser(
  tenantId: string,
  userId: string,
  limit = 8,
): Promise<RecItem[]> {
  const results = await computeRecommendations(tenantId, userId, limit);
  await prisma.recommendation.deleteMany({ where: { tenantId, userId } });
  if (results.length) {
    await prisma.recommendation.createMany({
      data: results.map((r) => ({
        tenantId,
        userId,
        refType: r.refType,
        refId: r.refId,
        score: r.score,
        reason: r.reason,
      })),
    });
  }
  return results;
}

export interface DisplayRec {
  type: string;
  href: string;
  title: string;
  reason: string;
}

/**
 * Resolve top recommendations into renderable items with titles & links.
 * Cached for 5 minutes per user — recommendations are expensive (profile
 * embedding + up to 500 context chunks) and must not run on every page view.
 */
export function displayRecommendations(
  tenantId: string,
  userId: string,
  slug: string,
  limit = 5,
  locale = "de",
): Promise<DisplayRec[]> {
  return unstable_cache(
    () => displayRecommendationsUncached(tenantId, userId, slug, limit, locale),
    ["recommendations", tenantId, userId, slug, String(limit), locale],
    { revalidate: 300 },
  )();
}

async function displayRecommendationsUncached(
  tenantId: string,
  userId: string,
  slug: string,
  limit = 5,
  locale = "de",
): Promise<DisplayRec[]> {
  const recs = await computeRecommendations(tenantId, userId, limit * 2);
  const out: DisplayRec[] = [];
  for (const r of recs) {
    if (out.length >= limit) break;
    if (r.refType === "PRODUCT") {
      const p = await prisma.product.findFirst({
        where: { id: r.refId, tenantId, isPublished: true },
        include: { space: true },
      });
      if (p)
        out.push({
          type: "product",
          href: p.space ? `/c/${slug}/s/${p.space.slug}` : `/c/${slug}`,
          title: p.name,
          reason: r.reason,
        });
    } else if (r.refType === "POST") {
      const p = await prisma.post.findFirst({
        where: { id: r.refId, tenantId },
        include: { space: true },
      });
      if (p)
        out.push({
          type: "post",
          href: `/c/${slug}/s/${p.space.slug}/${p.id}`,
          title: p.title ?? p.body.slice(0, 60),
          reason: r.reason,
        });
    } else if (r.refType === "EVENT") {
      const e = await prisma.event.findFirst({
        where: { id: r.refId, tenantId },
        include: { space: true },
      });
      if (e)
        out.push({
          type: "event",
          href: `/c/${slug}/s/${e.space.slug}`,
          title: e.title,
          reason: r.reason,
        });
    } else if (r.refType === "COURSE") {
      const c = await prisma.course.findFirst({
        where: { id: r.refId, tenantId },
        include: { space: true },
      });
      if (c)
        out.push({
          type: "course",
          href: `/c/${slug}/s/${c.space.slug}`,
          title: c.title,
          reason: r.reason,
        });
    }
  }

  // Personalise the "why" with Gemini (GEMINI_MODEL). Runs at most `limit` times
  // and is cached for 5 min by the caller; falls back to the heuristic reason.
  if (env.GEMINI_API_KEY && out.length > 0) {
    const languageName = LOCALE_ENGLISH_NAMES[normalizeLocale(locale)];
    const promptTypeLabel: Record<string, string> = {
      product: "product",
      post: "post",
      event: "event",
      course: "course",
    };
    await Promise.all(
      out.map(async (item) => {
        const phrase = await geminiGenerate(
          `A community member receives this recommendation: ${promptTypeLabel[item.type] ?? item.type} "${item.title}". ` +
            `Write a very short reason (maximum 6 words, no quotation marks, no punctuation at the end) why it might be interesting. ` +
            `Write it in ${languageName}.`,
          24,
        );
        if (phrase) item.reason = phrase.replace(/^["„»]|["“«.]+$/g, "").slice(0, 80);
      }),
    );
  }

  return out;
}
