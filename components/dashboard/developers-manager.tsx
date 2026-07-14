"use client";

import { useActionState, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  createApiKeyAction,
  revokeApiKeyAction,
  createWebhookEndpointAction,
  toggleWebhookEndpointAction,
  deleteWebhookEndpointAction,
  type DeveloperState,
} from "@/app/actions/developers";
import { Icon } from "./icons";
import { Input, Label } from "@/components/ui/field";
import { Card, CardBody } from "@/components/ui/card";
import { Pill, FormError, EmptyState } from "@/components/ui/misc";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface DeliveryRow {
  id: string;
  event: string;
  ok: boolean;
  responseCode: number | null;
  error: string | null;
  createdAt: string;
}

export interface EndpointRow {
  id: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  deliveries: DeliveryRow[];
}

// Webhook event id → translation key in `dashboard.developers.events`.
const EVENT_KEYS: Record<string, string> = {
  "member.joined": "memberJoined",
  "order.paid": "orderPaid",
  "subscription.created": "subscriptionCreated",
  "subscription.canceled": "subscriptionCanceled",
};
const EVENT_IDS = Object.keys(EVENT_KEYS);

const initial: DeveloperState = {};

function useDateFmt() {
  const locale = useLocale();
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function DevelopersManager({
  slug,
  apiUrl,
  keys,
  endpoints,
}: {
  slug: string;
  /** Basis-URL der öffentlichen API, z. B. https://aera.so/api/v1 */
  apiUrl: string;
  keys: ApiKeyRow[];
  endpoints: EndpointRow[];
}) {
  return (
    <div className="space-y-10">
      <ApiKeysSection slug={slug} apiUrl={apiUrl} keys={keys} />
      <WebhooksSection slug={slug} endpoints={endpoints} />
    </div>
  );
}

// ------------------------------------------------------------- API-Keys
function ApiKeysSection({
  slug,
  apiUrl,
  keys,
}: {
  slug: string;
  apiUrl: string;
  keys: ApiKeyRow[];
}) {
  const [state, action, pending] = useActionState(createApiKeyAction, initial);
  const [copied, setCopied] = useState(false);
  const t = useTranslations("dashboard.developers");
  const dateFmt = useDateFmt();

  async function copyKey() {
    if (!state.createdKey) return;
    await navigator.clipboard.writeText(state.createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const codeCls = "rounded bg-slate-100 px-1.5 py-0.5 text-xs";
  return (
    <section>
      <h2 className="mb-1 text-lg font-bold text-slate-900">{t("apiKeysHeading")}</h2>
      <p className="mb-4 text-sm text-slate-500">
        {t.rich("apiKeysDesc", {
          members: `${apiUrl}/members`,
          orders: `${apiUrl}/orders`,
          subs: `${apiUrl}/subscriptions`,
          auth: "Authorization: Bearer <Key>",
          code: (c) => <code className={codeCls}>{c}</code>,
        })}
      </p>

      {/* Frisch erstellter Key — einmalige Anzeige. */}
      {state.createdKey && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">
            {t("newKeyTitle")}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-emerald-200">
              {state.createdKey}
            </code>
            <button
              type="button"
              onClick={copyKey}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {copied ? t("copied") : t("copy")}
            </button>
          </div>
        </div>
      )}

      <Card className="mb-4">
        <CardBody>
          <form action={action} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="tenant" value={slug} />
            <div className="min-w-56 flex-1">
              <Label htmlFor="key-name">{t("keyNameLabel")}</Label>
              <Input
                id="key-name"
                name="name"
                placeholder={t("keyNamePlaceholder")}
                required
                minLength={2}
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? t("creating") : t("createKey")}
            </button>
          </form>
          {state.error && <div className="mt-3"><FormError message={state.error} /></div>}
        </CardBody>
      </Card>

      {keys.length === 0 ? (
        <EmptyState
          title={t("keysEmptyTitle")}
          hint={t("keysEmptyHint")}
          icon="bolt"
        />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{k.name}</span>
                    {k.revokedAt ? (
                      <Pill className="bg-red-50 text-red-600">{t("keyRevoked")}</Pill>
                    ) : (
                      <Pill className="bg-emerald-50 text-emerald-700">{t("keyActive")}</Pill>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    <code>{k.prefix}</code> · {t("keyCreated", { date: dateFmt.format(new Date(k.createdAt)) })}
                    {k.lastUsedAt &&
                      ` · ${t("keyLastUsed", { date: dateFmt.format(new Date(k.lastUsedAt)) })}`}
                  </p>
                </div>
                {!k.revokedAt && (
                  <form action={revokeApiKeyAction}>
                    <input type="hidden" name="tenant" value={slug} />
                    <input type="hidden" name="id" value={k.id} />
                    <button
                      type="submit"
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                    >
                      {t("revoke")}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

// ------------------------------------------------------------- Webhooks
function WebhooksSection({
  slug,
  endpoints,
}: {
  slug: string;
  endpoints: EndpointRow[];
}) {
  const [state, action, pending] = useActionState(createWebhookEndpointAction, initial);
  const t = useTranslations("dashboard.developers");
  const tEvents = useTranslations("dashboard.developers.events");

  return (
    <section>
      <h2 className="mb-1 text-lg font-bold text-slate-900">{t("webhooksHeading")}</h2>
      <p className="mb-4 text-sm text-slate-500">
        {t.rich("webhooksDesc", {
          code: (c) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{c}</code>,
        })}
      </p>

      <Card className="mb-4">
        <CardBody>
          <form action={action} className="space-y-3">
            <input type="hidden" name="tenant" value={slug} />
            <div>
              <Label htmlFor="wh-url">{t("endpointUrlLabel")}</Label>
              <Input
                id="wh-url"
                name="url"
                type="url"
                placeholder="https://example.com/webhooks/aera"
                required
              />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {EVENT_IDS.map((event) => (
                <label key={event} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name={`event:${event}`}
                    defaultChecked={event === "member.joined"}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {tEvents(EVENT_KEYS[event])}
                  <code className="text-xs text-slate-400">{event}</code>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
              >
                {pending ? t("addingEndpoint") : t("addEndpoint")}
              </button>
              {state.ok && !state.error && (
                <span className="text-sm text-emerald-600">{t("endpointCreated")}</span>
              )}
            </div>
            {state.error && <FormError message={state.error} />}
          </form>
        </CardBody>
      </Card>

      {endpoints.length === 0 ? (
        <EmptyState
          title={t("webhooksEmptyTitle")}
          hint={t("webhooksEmptyHint")}
          icon="send"
        />
      ) : (
        <div className="space-y-4">
          {endpoints.map((ep) => (
            <EndpointCard key={ep.id} slug={slug} endpoint={ep} />
          ))}
        </div>
      )}
    </section>
  );
}

function EndpointCard({ slug, endpoint }: { slug: string; endpoint: EndpointRow }) {
  const [showSecret, setShowSecret] = useState(false);
  const t = useTranslations("dashboard.developers");
  const tEvents = useTranslations("dashboard.developers.events");
  const dateFmt = useDateFmt();

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-900">
                {endpoint.url}
              </span>
              {endpoint.isActive ? (
                <Pill className="bg-emerald-50 text-emerald-700">{t("endpointActive")}</Pill>
              ) : (
                <Pill className="bg-slate-100 text-slate-500">{t("endpointPaused")}</Pill>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {endpoint.events.map((e) => (EVENT_KEYS[e] ? tEvents(EVENT_KEYS[e]) : e)).join(" · ")}
            </p>
          </div>
          <form action={toggleWebhookEndpointAction}>
            <input type="hidden" name="tenant" value={slug} />
            <input type="hidden" name="id" value={endpoint.id} />
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              {endpoint.isActive ? t("pause") : t("activate")}
            </button>
          </form>
          <form action={deleteWebhookEndpointAction}>
            <input type="hidden" name="tenant" value={slug} />
            <input type="hidden" name="id" value={endpoint.id} />
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              {t("delete")}
            </button>
          </form>
        </div>

        {/* Signing-Secret */}
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="text-slate-400">{t("secretLabel")}</span>
          <code className="rounded bg-slate-100 px-2 py-1">
            {showSecret ? endpoint.secret : "whsec_••••••••••••"}
          </code>
          <button
            type="button"
            onClick={() => setShowSecret((s) => !s)}
            className="text-slate-400 transition hover:text-slate-700"
            aria-label={showSecret ? t("hideSecret") : t("showSecret")}
          >
            <Icon name={showSecret ? "eyeOff" : "eye"} size={14} />
          </button>
        </div>

        {/* Letzte Zustellungen */}
        {endpoint.deliveries.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-1.5 text-xs font-semibold text-slate-500">
              {t("recentDeliveries")}
            </p>
            <ul className="space-y-1">
              {endpoint.deliveries.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-xs">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${d.ok ? "bg-emerald-500" : "bg-red-500"}`}
                  />
                  <code className="text-slate-600">{d.event}</code>
                  <span className="text-slate-400">
                    {d.responseCode ?? "—"} · {dateFmt.format(new Date(d.createdAt))}
                  </span>
                  {d.error && <span className="truncate text-red-500">{d.error}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
