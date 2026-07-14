import "server-only";
import type { StoryGroup } from "@/components/community/story-viewer";

interface StoryRowLike {
  id: string;
  imageUrl: string | null;
  videoUrl: string | null;
  caption: string | null;
  authorId: string;
  author: { name: string; avatarUrl: string | null };
}

/**
 * Merge stories into per-creator reels (Instagram-style). Rows must arrive
 * newest-first; each creator's items are returned oldest-first, and creators
 * are ordered by their most recent story.
 */
export function groupStoriesByAuthor(rows: StoryRowLike[]): StoryGroup[] {
  const map = new Map<string, StoryGroup>();
  for (const r of rows) {
    let grp = map.get(r.authorId);
    if (!grp) {
      grp = { authorName: r.author.name, authorAvatar: r.author.avatarUrl, items: [] };
      map.set(r.authorId, grp);
    }
    grp.items.push({ id: r.id, imageUrl: r.imageUrl, videoUrl: r.videoUrl, caption: r.caption });
  }
  for (const g of map.values()) g.items.reverse();
  return [...map.values()];
}
