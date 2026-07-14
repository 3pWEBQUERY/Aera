"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  createBookingSlotAction,
  deleteBookingSlotAction,
  type ActionState,
} from "@/app/actions/booking";
import { Sheet } from "./sheet";
import { Icon } from "./icons";
import { Input, Label } from "@/components/ui/field";
import { Pill, FormError, EmptyState } from "@/components/ui/misc";

export interface BookingSlotRow {
  id: string;
  title: string;
  startsAt: string;
  durationMin: number;
  priceCents: number;
  capacity: number;
  reservedCount: number;
}

interface SpaceInfo {
  id: string;
  slug: string;
  name: string;
}

const initial: ActionState = {};

export function BookingManager({
  slug,
  space,
  slots,
}: {
  slug: string;
  space: SpaceInfo;
  slots: BookingSlotRow[];
}) {
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const t = useTranslations("dashboard.booking");

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{space.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => {
            setNonce((n) => n + 1);
            setOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
        >
          <Icon name="plus" size={18} />
          {t("create")}
        </button>
      </div>

      {slots.length === 0 ? (
        <EmptyState icon="clock" title={t("emptyTitle")} hint={t("emptyHint")} />
      ) : (
        <div className="space-y-3">
          {slots.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{s.title}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {new Date(s.startsAt).toLocaleString()} · {s.durationMin} min
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Pill className="bg-slate-100 text-slate-600">
                  {t("seats", { taken: s.reservedCount, cap: s.capacity })}
                </Pill>
                <span className="text-sm font-semibold text-slate-900">
                  {s.priceCents === 0 ? t("free") : (s.priceCents / 100).toFixed(2) + " €"}
                </span>
                <form action={deleteBookingSlotAction}>
                  <input type="hidden" name="tenant" value={slug} />
                  <input type="hidden" name="slotId" value={s.id} />
                  <input type="hidden" name="spaceSlug" value={space.slug} />
                  <button
                    type="submit"
                    aria-label={t("delete")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("createTitle")}
        subtitle={space.name}
        icon="clock"
      >
        <SlotForm key={nonce} slug={slug} space={space} onDone={() => setOpen(false)} />
      </Sheet>
    </div>
  );
}

function SlotForm({
  slug,
  space,
  onDone,
}: {
  slug: string;
  space: SpaceInfo;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(createBookingSlotAction, initial);
  const t = useTranslations("dashboard.booking");
  const [priceEur, setPriceEur] = useState("");
  const priceCents = Math.max(0, Math.round(parseFloat(priceEur.replace(",", ".")) * 100) || 0);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="spaceId" value={space.id} />
      <input type="hidden" name="priceCents" value={priceCents} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
          <FormError message={state.error} />
          <div>
            <Label htmlFor="bk-title">{t("titleLabel")}</Label>
            <Input id="bk-title" name="title" required placeholder={t("titlePlaceholder")} className="text-base" />
          </div>
          <div>
            <Label htmlFor="bk-start">{t("startsAtLabel")}</Label>
            <Input id="bk-start" name="startsAt" type="datetime-local" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bk-dur">{t("durationLabel")}</Label>
              <Input id="bk-dur" name="durationMin" type="number" min={5} step={5} defaultValue={30} />
            </div>
            <div>
              <Label htmlFor="bk-cap">{t("capacityLabel")}</Label>
              <Input id="bk-cap" name="capacity" type="number" min={1} step={1} defaultValue={1} />
            </div>
          </div>
          <div>
            <Label htmlFor="bk-price">{t("priceLabel")}</Label>
            <Input
              id="bk-price"
              inputMode="decimal"
              value={priceEur}
              onChange={(e) => setPriceEur(e.target.value)}
              placeholder="0,00"
            />
            <p className="mt-1 text-xs text-slate-400">{t("priceHint")}</p>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? t("saving") : t("create")}
        </button>
      </div>
    </form>
  );
}
