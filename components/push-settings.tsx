"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/** Base64-URL → Uint8Array (applicationServerKey-Format). */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "unsupported" | "loading" | "off" | "on" | "denied";

const CTA_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold " +
  "text-white transition-colors duration-200 bg-[var(--brand)] hover:bg-[var(--brand-hover)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Push-Benachrichtigungen aktivieren/deaktivieren (Mitgliedskonto).
 * Registriert den Service Worker und verwaltet die PushManager-Subscription.
 */
export function PushSettings({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("account");

  useEffect(() => {
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !vapidPublicKey
      ) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "on" : "off");
      } catch {
        setState("unsupported");
      }
    })();
  }, [vapidPublicKey]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("save failed");
      setState("on");
    } catch {
      setError(t("pushEnableFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setError(t("pushDisableFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <p className="text-sm text-[#161613]/50">{t("pushChecking")}</p>;
  }
  if (state === "unsupported") {
    return (
      <p className="text-sm text-[#161613]/50">
        {t("pushUnsupported")}
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p className="text-sm text-[#161613]/50">
        {t("pushDenied")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#161613]/60">
        {t("pushDesc")}
      </p>
      {state === "on" ? (
        <button
          type="button"
          onClick={disable}
          disabled={busy}
          className="rounded-full border border-[#161613]/15 px-5 py-2.5 text-sm font-semibold text-[#161613]/70 transition hover:bg-[#161613]/5 disabled:opacity-50"
        >
          {busy ? t("pushDeactivating") : t("pushDisable")}
        </button>
      ) : (
        <button type="button" onClick={enable} disabled={busy} className={CTA_CLASS}>
          {busy ? t("pushActivating") : t("pushEnable")}
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
