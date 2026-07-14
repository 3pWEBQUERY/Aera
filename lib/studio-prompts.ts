/**
 * Server-side prompt presets for the Image AI Studio one-click tools.
 * Kept out of the client so the presets can't be tampered with and stay
 * consistent across locales (the model output language doesn't matter here —
 * these ops return images).
 */

export type StudioTool = "create" | "edit" | "remove-bg" | "enhance";

export const STUDIO_PRESETS: Record<"remove-bg" | "enhance", string> = {
  "remove-bg":
    "Remove the background from this image completely. Keep the main subject " +
    "pixel-perfect and untouched, preserve fine edges (hair, fur, semi-transparent " +
    "areas) and output a PNG with a fully transparent background. Do not add " +
    "shadows, borders, text or any new elements.",
  enhance:
    "Enhance this image: increase sharpness and fine detail, reduce noise and " +
    "compression artifacts, correct exposure and white balance, and improve " +
    "overall clarity. Keep the composition, subject, colors and style exactly " +
    "the same — no new elements, no crops, no text.",
};

/** Compose the final prompt sent to Gemini for a studio operation. */
export function studioPrompt(tool: StudioTool, userPrompt: string): string {
  switch (tool) {
    case "remove-bg":
      return STUDIO_PRESETS["remove-bg"];
    case "enhance":
      return STUDIO_PRESETS.enhance;
    case "edit":
      return (
        `Edit the provided image. Apply exactly this change and keep everything ` +
        `else identical:\n\n${userPrompt}`
      );
    case "create":
      return userPrompt;
  }
}
