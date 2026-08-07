"use client";

import { useState, useTransition } from "react";
import { publishAction, unpublishAction } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";

/**
 * Zustand und Schalter in einem Element.
 *
 * Die wichtigste Information im Studio ist, ob die Seite gerade im Netz steht.
 * Sie steht deshalb nicht als Hinweis irgendwo, sondern direkt auf dem Knopf,
 * der sie ändert — man kann den Zustand nicht übersehen, ohne die Handlung zu
 * übersehen.
 */
export function PublishBar({
  published,
  url,
  urlLabel,
}: {
  published: boolean;
  url: string;
  urlLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Ohne Berechtigung bleibt der Link daneben zum Anklicken. */
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-1.5 rounded-xl border border-line bg-ink-2 pl-3 sm:flex">
        <span
          aria-hidden
          className={`size-1.5 shrink-0 rounded-full ${published ? "bg-signal" : "bg-ash"}`}
        />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-[13rem] truncate py-2 text-xs text-ash transition-colors hover:text-chalk"
        >
          {urlLabel}
        </a>
        <button
          type="button"
          onClick={copy}
          className="rounded-r-xl border-l border-line px-2.5 py-2 text-xs font-medium text-ash transition-colors hover:text-chalk"
        >
          {copied ? "Kopiert" : "Kopieren"}
        </button>
      </div>

      {published ? (
        <Button
          tone="ghost"
          size="sm"
          disabled={pending}
          onClick={() => startTransition(() => unpublishAction())}
        >
          Offline nehmen
        </Button>
      ) : (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => startTransition(() => publishAction())}
        >
          {pending ? "…" : "Veröffentlichen"}
        </Button>
      )}
    </div>
  );
}
