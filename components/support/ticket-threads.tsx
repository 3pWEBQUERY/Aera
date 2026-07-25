"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  replyTicketAction,
  replyStaffAction,
  setTicketStatusAction,
  type SupportState,
} from "@/app/actions/support";
import { Icon } from "@/components/dashboard/icons";
import { FormError } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { TicketView } from "@/lib/support";

const STATUS_TONE: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-700 ring-amber-200",
  ANSWERED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CLOSED: "bg-slate-100 text-slate-500 ring-slate-200",
};

/**
 * Ticket-Verläufe. Eine Komponente für beide Seiten: der Unterschied ist
 * ausschließlich, wer antwortet und was zusätzlich sichtbar ist — die
 * Darstellung eines Verlaufs ist dieselbe, und zwei Kopien würden auseinander
 * driften.
 */
export function TicketThreads({
  tickets,
  side,
  emptyCta,
}: {
  tickets: TicketView[];
  side: "user" | "staff";
  /** Nur auf der Mitglieder-Seite: Weg zum Kontaktformular. */
  emptyCta?: { href: string; label: string };
}) {
  const t = useTranslations("support");
  const locale = useLocale();
  const [openId, setOpenId] = useState<string | null>(tickets[0]?.id ?? null);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  if (tickets.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-14 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Icon name="messages" size={22} />
        </span>
        <p className="mt-4 font-semibold text-slate-800">{t(`empty.${side}.title`)}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{t(`empty.${side}.text`)}</p>
        {emptyCta && (
          <Link
            href={emptyCta.href}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {emptyCta.label}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => {
        const open = openId === ticket.id;
        return (
          <div
            key={ticket.id}
            className={cn(
              "overflow-hidden rounded-2xl border bg-white transition",
              ticket.unreadCount > 0 ? "border-[var(--brand-ring)]" : "border-slate-200",
            )}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : ticket.id)}
              aria-expanded={open}
              className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{ticket.subject}</span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                      STATUS_TONE[ticket.status],
                    )}
                  >
                    {t(`status.${ticket.status}`)}
                  </span>
                  {ticket.unreadCount > 0 && (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[11px] font-bold text-white">
                      {ticket.unreadCount}
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  {side === "staff" && (
                    <>
                      {ticket.name || ticket.email}
                      {ticket.isGuest && ` · ${t("guest")}`}
                      {" · "}
                    </>
                  )}
                  {t("messageCount", { count: ticket.messageCount })} · {fmt(ticket.lastMessageAt)}
                </span>
              </span>
              <Icon
                name="chevron"
                size={16}
                className={cn("mt-1 shrink-0 text-slate-300 transition-transform", open && "rotate-180")}
              />
            </button>

            {open && (
              <div className="border-t border-slate-100 bg-slate-50/60 p-4">
                <div className="space-y-3">
                  {ticket.messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6",
                        m.fromStaff
                          ? "bg-slate-900 text-white"
                          : "ml-auto bg-white text-slate-800 ring-1 ring-slate-200",
                      )}
                    >
                      <p className="whitespace-pre-line">{m.body}</p>
                      <p className={cn("mt-1.5 text-[11px]", m.fromStaff ? "text-white/50" : "text-slate-400")}>
                        {m.fromStaff ? t("fromTeam") : m.authorName || t("fromYou")} · {fmt(m.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>

                {ticket.status !== "CLOSED" || side === "staff" ? (
                  <ReplyForm ticketId={ticket.id} side={side} />
                ) : (
                  <p className="mt-4 rounded-xl bg-white px-4 py-3 text-center text-xs text-slate-400 ring-1 ring-slate-200">
                    {t("closedHint")}
                  </p>
                )}

                {side === "staff" && (
                  <form action={setTicketStatusAction} className="mt-2 flex justify-end gap-2">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={ticket.status === "CLOSED" ? "OPEN" : "CLOSED"}
                    />
                    <button className="text-xs font-medium text-slate-400 underline underline-offset-2 hover:text-slate-700">
                      {ticket.status === "CLOSED" ? t("reopen") : t("close")}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReplyForm({ ticketId, side }: { ticketId: string; side: "user" | "staff" }) {
  const t = useTranslations("support");
  const [state, action, pending] = useActionState(
    side === "staff" ? replyStaffAction : replyTicketAction,
    {} as SupportState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="mt-4 space-y-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormError message={state.error} />
      <textarea
        name="body"
        rows={3}
        required
        minLength={2}
        maxLength={5000}
        placeholder={t("replyPlaceholder")}
        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]"
      />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {side === "staff" && (
          <label className="mr-auto flex cursor-pointer items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" name="close" className="h-3.5 w-3.5 rounded border-slate-300" />
            {t("closeAfterReply")}
          </label>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? t("sending") : t("reply")}
        </button>
      </div>
    </form>
  );
}
