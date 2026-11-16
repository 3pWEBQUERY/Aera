import { CommunityColumnSkeleton } from "@/components/ui/loading-status";

/**
 * Skelett nur fuer diese Unterseite. Bewusst nicht mehr eine Ebene hoeher
 * unter /c/[slug]: dort streamte es vor jedem notFound() — ein fehlender
 * Space, Beitrag oder eine fehlende Seite antwortete dann mit 200 statt 404.
 * Diese Seite kennt kein eigenes 404 (die Community prueft das Layout).
 */
export default function Loading() {
  return <CommunityColumnSkeleton />;
}
