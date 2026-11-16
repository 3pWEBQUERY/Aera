"use client";

import { useTranslations } from "next-intl";
import { removeFlaggedContentAction } from "@/app/actions/moderation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useConfirmedSubmit } from "@/components/ui/use-confirmed-submit";

/**
 * „Inhalt entfernen“ löscht den Beitrag bzw. Kommentar endgültig — deshalb
 * erst nach einer Rückfrage, die den Auszug noch einmal zeigt.
 */
export function RemoveFlagButton({
  slug,
  flagId,
  refType,
  excerpt,
}: {
  slug: string;
  flagId: string;
  refType: "Post" | "Comment";
  excerpt: string;
}) {
  const t = useTranslations("dashboard.moderation");
  const [confirm, confirmDialog] = useConfirm();
  const confirmSubmit = useConfirmedSubmit(confirm);
  return (
    <form
      action={removeFlaggedContentAction}
      onSubmit={(e) =>
        confirmSubmit(e, {
          title: refType === "Post" ? t("removeTitlePost") : t("removeTitleComment"),
          body: t("removeBody", { excerpt: excerpt.slice(0, 140) }),
          confirmLabel: t("removeContent"),
          tone: "danger",
        })
      }
    >
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="id" value={flagId} />
      <button
        type="submit"
        className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
      >
        {t("removeContent")}
      </button>
      {confirmDialog}
    </form>
  );
}
