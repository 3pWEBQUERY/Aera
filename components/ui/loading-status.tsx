import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Huelle fuer Lade-Skelette (loading.tsx).
 *
 * Die grauen Flaechen sind fuer Screenreader bedeutungslos und bleiben
 * versteckt; angesagt wird ein kurzes „Wird geladen …“ (role="status").
 * `aria-busy` markiert den Bereich, bis der echte Inhalt ihn ersetzt.
 */
export function LoadingStatus({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations("ui.state");
  return (
    <div aria-busy="true" className={className}>
      <p role="status" className="sr-only">
        {t("loading")}
      </p>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        {children}
      </div>
    </div>
  );
}

/** Skelett fuer Community-Unterseiten (Mitglieder, Bibliothek, Suche …). */
export function CommunityColumnSkeleton({ className }: { className?: string }) {
  return (
    <LoadingStatus className={cn("mx-auto w-full max-w-3xl px-4 py-8 sm:px-6", className)}>
      <div className="space-y-5">
        <div className="h-8 w-48 rounded-xl bg-[#161613]/10" />
        <div className="h-40 rounded-2xl border border-[#161613]/10 bg-white/60" />
        <div className="h-40 rounded-2xl border border-[#161613]/10 bg-white/60" />
        <div className="h-40 rounded-2xl border border-[#161613]/10 bg-white/60" />
      </div>
    </LoadingStatus>
  );
}
