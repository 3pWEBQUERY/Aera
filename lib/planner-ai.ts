import "server-only";
import { aiLanguageInstruction } from "./ai";
import type { ContentPlanType } from "@/app/generated/prisma/client";

export interface PlannerAiInput {
  type: ContentPlanType;
  brief?: string;
  title?: string;
  description?: string;
  locale: string;
}

export interface PlannerAiResult {
  title: string;
  description: string;
  checklist: string[];
  tips: string[];
  timingHint: string;
}

const TYPE_LABEL: Record<ContentPlanType, string> = {
  POST: "a social/community post",
  VIDEO: "a video",
  STREAM: "a live stream",
  STORY: "an ephemeral story",
  NEWSLETTER: "an email newsletter",
  EVENT: "an event",
  PRODUCT_DROP: "a product drop / release",
  OTHER: "a piece of content",
};

/** Build the Gemini system + user prompt for planning a piece of content. */
export function buildPlannerPrompt(input: PlannerAiInput): {
  system: string;
  userText: string;
} {
  const system =
    "You are a content-planning assistant for online creators. Given an idea, " +
    "produce a focused, actionable plan. Respond with STRICT JSON only — no " +
    "markdown, no prose around it — using exactly this shape: " +
    '{"title": string, "description": string, "checklist": string[], "tips": string[], "timingHint": string}. ' +
    "checklist = 4-8 short production steps. tips = 2-4 concrete ideas to make it " +
    "perform better. timingHint = one sentence on the best time/cadence to publish. " +
    aiLanguageInstruction(input.locale);

  const lines = [`Content type: ${TYPE_LABEL[input.type]}.`];
  if (input.title?.trim()) lines.push(`Working title: ${input.title.trim()}`);
  if (input.description?.trim()) lines.push(`Notes so far: ${input.description.trim()}`);
  if (input.brief?.trim()) lines.push(`Idea / brief: ${input.brief.trim()}`);
  lines.push("Plan this content.");

  return { system, userText: lines.join("\n") };
}

/** Best-effort parse of the model's JSON reply into a planner result. */
export function parsePlannerJson(text: string): PlannerAiResult {
  const fallback: PlannerAiResult = {
    title: "",
    description: text.trim().slice(0, 2000),
    checklist: [],
    tips: [],
    timingHint: "",
  };
  if (!text.trim()) return { ...fallback, description: "" };

  // Strip code fences and isolate the outermost JSON object.
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return fallback;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return fallback;
  }

  const strArray = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 12)
      : [];

  return {
    title: typeof obj.title === "string" ? obj.title.trim().slice(0, 160) : "",
    description: typeof obj.description === "string" ? obj.description.trim().slice(0, 2000) : "",
    checklist: strArray(obj.checklist),
    tips: strArray(obj.tips),
    timingHint: typeof obj.timingHint === "string" ? obj.timingHint.trim().slice(0, 400) : "",
  };
}
