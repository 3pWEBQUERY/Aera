import type { AeliBlockType } from "@/app/generated/prisma/client";
import type { BlockConfig } from "@/lib/blocks";

/**
 * Ein Block, wie ihn der Editor sieht.
 *
 * Serialisierbar, weil er von einer Server- in eine Client-Komponente
 * gereicht wird: Zeitpunkte als ISO-String, `config` bereits geparst. Das
 * `Date`-Objekt aus Prisma überlebt die Grenze nicht.
 */
export interface StudioBlock {
  id: string;
  type: AeliBlockType;
  title: string | null;
  subtitle: string | null;
  href: string | null;
  mediaUrl: string | null;
  icon: string | null;
  config: BlockConfig;
  isVisible: boolean;
  startsAt: string | null;
  endsAt: string | null;
  clickCount: number;
}
