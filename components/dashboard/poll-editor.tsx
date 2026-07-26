"use client";

import type { useTranslations } from "next-intl";
import { Icon } from "./icons";

/**
 * Umfrage-Editor fuer die Composer.
 *
 * Liegt hier und nicht im Forum-Manager, weil zwei Composer ihn brauchen:
 * "Thema erstellen" im Forum und "Beitrag schreiben" im Blog. Der Uebersetzer
 * kommt als Prop, damit jeder Composer seine eigenen Texte behaelt — die
 * Schluessel heissen ueberall gleich (pollTitle, pollRemove, …).
 */
export function PollEditor({
  t,
  question,
  setQuestion,
  options,
  setOptions,
  multiple,
  setMultiple,
  onRemove,
}: {
  t: ReturnType<typeof useTranslations>;
  question: string;
  setQuestion: (v: string) => void;
  options: string[];
  setOptions: (v: string[]) => void;
  multiple: boolean;
  setMultiple: (v: boolean) => void;
  onRemove: () => void;
}) {
  const canAdd = options.length < 10;
  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      {/* Presence of this input tells the action a poll was authored. */}
      <input type="hidden" name="hasPoll" value="1" />
      <div className="mb-3 flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Icon name="gamification" size={15} className="text-violet-500" />
          {t("pollTitle")}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-medium text-slate-400 transition hover:text-red-600"
        >
          {t("pollRemove")}
        </button>
      </div>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        name="pollQuestion"
        placeholder={t("pollQuestionPlaceholder")}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
      />
      <div className="mt-2.5 space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-400">
              {i + 1}
            </span>
            <input
              value={opt}
              onChange={(e) => setOptions(options.map((o, idx) => (idx === i ? e.target.value : o)))}
              name="pollOption"
              placeholder={t("pollOptionPlaceholder")}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                aria-label={t("pollRemove")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {canAdd ? (
          <button
            type="button"
            onClick={() => setOptions([...options, ""])}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 transition hover:text-violet-700"
          >
            <Icon name="plus" size={14} />
            {t("pollAddOption")}
          </button>
        ) : (
          <span />
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            name="pollMultiple"
            checked={multiple}
            onChange={(e) => setMultiple(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
          />
          {t("pollMultipleLabel")}
        </label>
      </div>
    </div>
  );
}
