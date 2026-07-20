import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Parser-based allowlist sanitizer (sanitize-html) for creator-authored blog
 * HTML — regex sanitizers are bypassable via entities/nesting, a real parser
 * is not. Output is rendered with dangerouslySetInnerHTML, so this is the
 * trust boundary for stored rich text.
 */
export function sanitizeRichHtml(input: string): string {
  if (!input) return "";
  const cleaned = sanitizeHtml(input, {
    allowedTags: [
      "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "strike",
      "h2", "h3", "ul", "ol", "li", "blockquote", "a",
      "img", "video", "figure", "figcaption", "span", "div",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "data-file"],
      img: ["src", "alt", "width", "height"],
      video: ["src", "controls", "poster", "preload"],
    },
    // http(s) + same-origin paths for links/media; no javascript:/data:.
    allowedSchemes: ["http", "https"],
    allowedSchemesAppliedToAttributes: ["href", "src", "poster"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
    disallowedTagsMode: "discard",
  });
  return trimRichHtml(cleaned);
}

/**
 * Strip empty leading/trailing blocks the contentEditable editor leaves behind
 * (its seed <p><br></p> and any blank lines the author pressed at the end), so
 * a post doesn't render a large gap of empty paragraphs before whatever follows.
 */
export function trimRichHtml(input: string): string {
  if (!input) return "";
  let html = input.trim();
  const lead = /^\s*<(p|h2|h3|blockquote|div)>(?:\s|&nbsp;|<br\s*\/?>)*<\/\1>\s*/i;
  const trail = /\s*<(p|h2|h3|blockquote|div)>(?:\s|&nbsp;|<br\s*\/?>)*<\/\1>\s*$/i;
  let prev = "";
  while (html !== prev) {
    prev = html;
    html = html.replace(lead, "").replace(trail, "");
  }
  return html.trim();
}

/** Best-effort plain-text extraction for excerpts, search and indexing. */
export function htmlToPlainText(input: string): string {
  if (!input) return "";
  return input
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|h2|h3|li|blockquote|figcaption|br)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}
