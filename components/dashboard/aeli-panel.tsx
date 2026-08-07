"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import {
  createAeliPageAction,
  issueAeliLinkCodeAction,
  linkAeliPageAction,
  unlinkAeliPageAction,
  type AeliFormState,
} from "@/app/actions/aeli";
import { normalizeHandle } from "@/lib/aeli-handle";
import { Icon } from "@/components/dashboard/icons";
import { Pill } from "@/components/ui/misc";
import { Input, Label } from "@/components/ui/field";
import type { AeliConnection, AeliPageSummary } from "@/lib/aeli";

/**
 * Die Aeli-Verbindung im Integrationen-Reiter.
 *
 * Der Kern der Bedienung ist eine Tatsache, die man erklären muss, bevor
 * irgendein Knopf Sinn ergibt: **es gibt kein zweites Konto.** Aera und Aeli
 * teilen sich die Anmeldung. „Verknüpfen" heißt deshalb nicht „zwei Konten
 * zusammenführen", sondern „diese Bio-Seite zeigt auf diese Community".
 *
 * Genau ein Zustand ist gleichzeitig sichtbar — keine Auswahl aus vier
 * Möglichkeiten, sondern der nächste Schritt:
 *
 *   keine Seite   -> Handle sichern
 *   nicht verknüpft -> verknüpfen
 *   verknüpft     -> ansehen, bearbeiten, lösen
 *   woanders verknüpft -> hierher holen
 *
 * Der Verbindungscode steht darunter und ausgeklappt nur auf Wunsch: er ist der
 * Sonderfall für eine Aeli-Seite unter einer anderen E-Mail, und wer ihn nicht
 * braucht, soll ihn nicht erklärt bekommen.
 */

const EMPTY: AeliFormState = {};

export function AeliPanel({
  slug,
  tenantName,
  connection,
  pageUrl,
  studioUrl,
  handleSuffix,
  suggestedHandle,
}: {
  slug: string;
  tenantName: string;
  connection: AeliConnection;
  /** Adresse der eigenen Seite — leer, wenn es noch keine gibt. */
  pageUrl: string | null;
  studioUrl: string;
  handleSuffix: string;
  suggestedHandle: string;
}) {
  const t = useTranslations("dashboard.settings.aeli");
  const { own, foreign } = connection;
  const linkedHere = own?.linkedTenantId != null && own.linkedTenantName === tenantName;

  return (
    <section className="mt-6 border-t border-slate-100 pt-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-slate-900">
            {t("heading")}
            <span className="text-xs font-normal text-slate-400">aeli.so</span>
          </p>
          <p className="mt-0.5 max-w-xl text-sm text-slate-500">
            {t.rich("desc", {
              example: `deinname.${handleSuffix}`,
              strong: (chunks) => (
                <span className="font-medium text-slate-700">{chunks}</span>
              ),
            })}
          </p>
        </div>
        {own ? (
          linkedHere ? (
            <Pill className="shrink-0 bg-green-100 text-green-700">{t("stateLinked")}</Pill>
          ) : (
            <Pill className="shrink-0 bg-amber-100 text-amber-700">{t("stateUnlinked")}</Pill>
          )
        ) : (
          <Pill className="shrink-0 bg-slate-100 text-slate-500">{t("stateNoPage")}</Pill>
        )}
      </header>

      <div className="mt-5">
        {!own ? (
          <CreateForm slug={slug} suffix={handleSuffix} suggested={suggestedHandle} />
        ) : (
          <OwnPage
            slug={slug}
            page={own}
            linkedHere={linkedHere}
            tenantName={tenantName}
            pageUrl={pageUrl ?? ""}
            studioUrl={studioUrl}
            suffix={handleSuffix}
          />
        )}
      </div>

      {foreign.length > 0 && (
        <ForeignPages slug={slug} pages={foreign} suffix={handleSuffix} />
      )}

      <LinkCode slug={slug} studioUrl={studioUrl} />
    </section>
  );
}

// ---------------------------------------------------------------------------

function Submit({ label, busy }: { label: string; busy?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 shrink-0 items-center rounded-lg bg-[var(--action)] px-4 text-sm font-semibold text-[var(--action-fg)] transition-colors hover:bg-[var(--action-hover)] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
    >
      {pending ? (busy ?? "…") : label}
    </button>
  );
}

/**
 * Handle sichern — ohne Umweg über aeli.so.
 *
 * Das Konto besteht bereits, es fehlt nur die Adresse. Die Verfügbarkeit wird
 * beim Tippen geprüft; die Wahrheit sagt trotzdem erst der Unique-Index beim
 * Speichern, und der Server behandelt „inzwischen weg" als normalen Fall.
 */
function CreateForm({
  slug,
  suffix,
  suggested,
}: {
  slug: string;
  suffix: string;
  suggested: string;
}) {
  const t = useTranslations("dashboard.settings.aeli");
  const [state, action] = useActionState(createAeliPageAction, EMPTY);
  const [handle, setHandle] = useState(suggested);
  const [free, setFree] = useState<boolean | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    if (handle.length < 3) {
      setFree(null);
      return;
    }
    const token = ++latest.current;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/aeli/handle?h=${encodeURIComponent(handle)}`);
        const data = (await response.json()) as { available?: boolean };
        if (token === latest.current) setFree(Boolean(data.available));
      } catch {
        if (token === latest.current) setFree(null);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [handle]);

  const error = state.fieldErrors?.handle ?? state.error;

  return (
    <form action={action} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <input type="hidden" name="tenant" value={slug} />

      <Label htmlFor="aeli-handle">{t("claimLabel")}</Label>
      <p className="-mt-1 mb-3 text-sm text-slate-500">
        {t("claimHint")}
      </p>

      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-56 flex-1">
          <div className="flex items-center rounded-lg border border-slate-300 bg-white pr-3 focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand-ring)]">
            <input
              id="aeli-handle"
              name="handle"
              value={handle}
              onChange={(event) => setHandle(normalizeHandle(event.target.value))}
              maxLength={30}
              autoComplete="off"
              spellCheck={false}
              placeholder="deinname"
              aria-invalid={Boolean(error)}
              aria-describedby="aeli-handle-note"
              className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 text-sm outline-none"
            />
            <span className="shrink-0 text-sm text-slate-400">.{suffix}</span>
            {free !== null && (
              <span className="ml-2 shrink-0" aria-hidden>
                <Icon
                  name={free ? "check" : "alert"}
                  size={15}
                  className={free ? "text-green-600" : "text-amber-500"}
                />
              </span>
            )}
          </div>
        </div>
        <Submit label={t("claimSubmit")} busy={t("claimSubmitBusy")} />
      </div>

      <p
        id="aeli-handle-note"
        role={error ? "alert" : undefined}
        className={`mt-2 text-xs ${error ? "text-red-600" : free ? "text-green-700" : "text-slate-500"}`}
      >
        {error ??
          (free === true ? t("handleFree") : free === false ? t("handleTaken") : t("handleRules"))}
      </p>

      {state.notice && (
        <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{state.notice}</p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------

function OwnPage({
  slug,
  page,
  linkedHere,
  tenantName,
  pageUrl,
  studioUrl,
  suffix,
}: {
  slug: string;
  page: AeliPageSummary;
  linkedHere: boolean;
  tenantName: string;
  pageUrl: string;
  studioUrl: string;
  suffix: string;
}) {
  const t = useTranslations("dashboard.settings.aeli");
  const elsewhere = page.linkedTenantId != null && !linkedHere;

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <PageAvatar url={page.avatarUrl} name={page.displayName} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {page.handle}.{suffix}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            {page.status === "PUBLISHED" ? (
              <>
                <span aria-hidden className="size-1.5 rounded-full bg-green-500" />
                {t("published")}
              </>
            ) : (
              <>
                <span aria-hidden className="size-1.5 rounded-full bg-slate-300" />
                {t("draft")}
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {page.status === "PUBLISHED" && (
            <a
              href={pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300"
            >
              {t("view")}
            </a>
          )}
          <a
            href={studioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300"
          >
            {t("edit")}
          </a>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        {linkedHere ? (
          <>
            <p className="min-w-0 flex-1 text-sm text-slate-600">
              {t.rich("linkedHere", {
                community: tenantName,
                strong: (chunks) => (
                  <span className="font-medium text-slate-900">{chunks}</span>
                ),
              })}
            </p>
            <form action={unlinkAeliPageAction}>
              <input type="hidden" name="tenant" value={slug} />
              <input type="hidden" name="profileId" value={page.id} />
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-slate-500 transition-colors hover:text-red-600"
              >
                {t("unlink")}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 text-sm text-slate-600">
              {elsewhere ? (
                t.rich("linkedElsewhere", {
                  community: page.linkedTenantName ?? "",
                  strong: (chunks) => (
                    <span className="font-medium text-slate-900">{chunks}</span>
                  ),
                })
              ) : (
                t("notLinked")
              )}
            </p>
            <form action={linkAeliPageAction}>
              <input type="hidden" name="tenant" value={slug} />
              <Submit
                label={elsewhere ? t("switch", { community: tenantName }) : t("link")}
              />
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Der Anfangsbuchstabe ist der Normalfall, das Bild die Zugabe.
 *
 * Es kommt aus Aelis Bucket und wird von dort ueber eine andere App
 * ausgeliefert — es kann fehlen, geloescht sein oder (in der Entwicklung) an
 * Aeras Content-Security-Policy scheitern. Ein zerbrochenes Bildsymbol waere
 * dann die schlechteste aller Antworten.
 */
function PageAvatar({ url, name }: { url: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-900 text-sm font-semibold text-white">
      {url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------

/**
 * Fremde Seiten, die auf diese Community zeigen.
 *
 * Steht nur da, wenn es welche gibt — und dann nicht als Nebensatz: wer auf die
 * eigene Community verweist, gehört sichtbar gemacht, samt der Möglichkeit, es
 * zu beenden.
 */
function ForeignPages({
  slug,
  pages,
  suffix,
}: {
  slug: string;
  pages: AeliPageSummary[];
  suffix: string;
}) {
  const t = useTranslations("dashboard.settings.aeli");
  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-medium text-slate-900">{t("foreignHeading")}</p>
      <p className="mt-0.5 text-sm text-slate-500">
        {t("foreignDesc")}
      </p>
      <ul className="mt-3 divide-y divide-slate-100">
        {pages.map((page) => (
          <li key={page.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-800">
                {page.handle}.{suffix}
              </p>
              <p className="truncate text-xs text-slate-400">{page.ownerEmail}</p>
            </div>
            <form action={unlinkAeliPageAction}>
              <input type="hidden" name="tenant" value={slug} />
              <input type="hidden" name="profileId" value={page.id} />
              <button
                type="submit"
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-red-600"
              >
                {t("disconnect")}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Der Sonderfall: eine Aeli-Seite, die unter einer ANDEREN E-Mail angelegt
 * wurde. Zwei getrennte Identitäten, von denen keine allein entscheiden darf,
 * dass sie zusammengehören — also stellt die Community eine befristete
 * Erlaubnis aus, und die Seite löst sie drüben ein.
 */
function LinkCode({ slug, studioUrl }: { slug: string; studioUrl: string }) {
  const t = useTranslations("dashboard.settings.aeli");
  const [state, action] = useActionState(issueAeliLinkCodeAction, EMPTY);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        {/* Ein Chevron, gedreht — das Icon-Set hat bewusst nur eins. */}
        <Icon
          name="chevron"
          size={14}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
        {t("otherAccount")}
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-sm text-slate-600">{t("otherAccountDesc")}</p>

          {state.error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}

          {state.code ? (
            <div className="mt-3">
              <Label htmlFor="aeli-code">{t("codeLabel")}</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="aeli-code"
                  readOnly
                  value={state.code}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-56 flex-1 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(state.code!);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    } catch {
                      /* Ohne Berechtigung bleibt das Feld zum Markieren. */
                    }
                  }}
                  className="inline-flex h-10 shrink-0 items-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300"
                >
                  {copied ? t("copied") : t("copy")}
                </button>
                <a
                  href={`${studioUrl}/einstellungen`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 shrink-0 items-center rounded-lg bg-[var(--action)] px-4 text-sm font-semibold text-[var(--action-fg)] transition-colors hover:bg-[var(--action-hover)]"
                >
                  {t("toStudio")}
                </a>
              </div>
            </div>
          ) : (
            <form action={action} className="mt-3">
              <input type="hidden" name="tenant" value={slug} />
              <Submit label={t("codeCreate")} busy={t("codeCreateBusy")} />
            </form>
          )}
        </div>
      )}
    </div>
  );
}
