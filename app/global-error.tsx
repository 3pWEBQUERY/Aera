"use client";

import { useSyncExternalStore } from "react";

/**
 * Letzte Fehlergrenze: greift nur, wenn das Root-Layout selbst scheitert.
 *
 * Dann gibt es weder next-intl noch globale Styles — diese Datei bringt ihr
 * eigenes Dokument mit. Die Texte stehen deshalb hier (abgeleitet aus
 * ui.state.* und ui.frontend.notFound.home), und die Sprache kommt aus dem
 * NEXT_LOCALE-Cookie bzw. dem Browser. Auf dem Server ist beides nicht
 * zuverlaessig lesbar; dort und bis zur Hydration steht der Text neutral auf
 * Deutsch und Englisch.
 */
type Copy = { title: string; text: string; reload: string; home: string };

const COPY: Record<string, Copy> = {
  de: { title: "Die Seite konnte nicht geladen werden", text: "Versuch es in einem Moment noch einmal.", reload: "Neu laden", home: "Zur Startseite" },
  en: { title: "This page couldn't be loaded", text: "Try again in a moment.", reload: "Reload", home: "Back to the home page" },
  da: { title: "Siden kunne ikke indlæses", text: "Prøv igen om et øjeblik.", reload: "Genindlæs", home: "Tilbage til forsiden" },
  es: { title: "No se ha podido cargar la página", text: "Vuelve a intentarlo en un momento.", reload: "Volver a cargar", home: "Volver al inicio" },
  fr: { title: "La page n'a pas pu être chargée", text: "Réessayez dans un instant.", reload: "Recharger", home: "Retour à l'accueil" },
  it: { title: "Impossibile caricare la pagina", text: "Riprova tra un momento.", reload: "Ricarica", home: "Torna alla home" },
  ja: { title: "ページを読み込めませんでした", text: "しばらくしてからもう一度お試しください。", reload: "再読み込み", home: "ホームに戻る" },
  ko: { title: "페이지를 불러올 수 없습니다", text: "잠시 후 다시 시도해 주세요.", reload: "새로고침", home: "홈으로 돌아가기" },
  nb: { title: "Siden kunne ikke lastes inn", text: "Prøv igjen om et øyeblikk.", reload: "Last inn på nytt", home: "Tilbake til forsiden" },
  nl: { title: "De pagina kon niet worden geladen", text: "Probeer het zo nog eens.", reload: "Opnieuw laden", home: "Terug naar de startpagina" },
  pl: { title: "Nie udało się wczytać strony", text: "Spróbuj ponownie za chwilę.", reload: "Wczytaj ponownie", home: "Powrót na stronę główną" },
  "pt-BR": { title: "Não foi possível carregar a página", text: "Tente de novo em instantes.", reload: "Recarregar", home: "Voltar ao início" },
  ru: { title: "Не удалось загрузить страницу", text: "Попробуйте ещё раз через минуту.", reload: "Обновить", home: "Вернуться на главную" },
  sv: { title: "Sidan kunde inte laddas", text: "Försök igen om en stund.", reload: "Ladda om", home: "Tillbaka till startsidan" },
  uk: { title: "Не вдалося завантажити сторінку", text: "Спробуйте ще раз за хвилину.", reload: "Оновити", home: "Повернутися на головну" },
  "zh-Hans": { title: "页面无法加载", text: "请稍后再试。", reload: "重新加载", home: "返回首页" },
  "zh-Hant": { title: "無法載入頁面", text: "請稍後再試。", reload: "重新載入", home: "返回首頁" },
};

/** Regionalvarianten ohne eigene Texte hier. */
const ALIASES: Record<string, string> = {
  "en-GB": "en",
  "es-419": "es",
  pt: "pt-BR",
  no: "nb",
  nn: "nb",
  zh: "zh-Hans",
  "zh-CN": "zh-Hans",
  "zh-SG": "zh-Hans",
  "zh-TW": "zh-Hant",
  "zh-HK": "zh-Hant",
  "zh-MO": "zh-Hant",
};

function match(tag: string | undefined | null): string | null {
  if (!tag) return null;
  if (COPY[tag]) return tag;
  if (ALIASES[tag]) return ALIASES[tag]!;
  const base = tag.split("-")[0]!;
  return COPY[base] ? base : (ALIASES[base] ?? null);
}

function clientLocale(): string | null {
  const cookie = document.cookie
    .split("; ")
    .find((part) => part.startsWith("NEXT_LOCALE="))
    ?.slice("NEXT_LOCALE=".length);
  const fromCookie = match(cookie ? decodeURIComponent(cookie) : null);
  if (fromCookie) return fromCookie;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const found = match(tag);
    if (found) return found;
  }
  return "de";
}

const subscribe = () => () => {};

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  const locale = useSyncExternalStore(subscribe, clientLocale, () => null);
  const copy = locale ? COPY[locale]! : null;
  const de = COPY.de!;
  const en = COPY.en!;

  return (
    <html lang={locale ?? "de"}>
      <head>
        <title>{copy ? `${copy.title} — Aera` : `${de.title} · ${en.title} — Aera`}</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          boxSizing: "border-box",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <main
          style={{
            maxWidth: 420,
            width: "100%",
            padding: 32,
            boxSizing: "border-box",
            textAlign: "center",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 16,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Aera" width={88} height={24} style={{ height: 24, width: "auto", filter: "invert(1)" }} />
          <div role="alert">
            {copy ? (
              <>
                <h1 style={{ margin: "20px 0 0", fontSize: 20, fontWeight: 700 }}>{copy.title}</h1>
                <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: "#475569" }}>{copy.text}</p>
              </>
            ) : (
              <>
                <h1 style={{ margin: "20px 0 0", fontSize: 20, fontWeight: 700 }}>{de.title}</h1>
                <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: "#475569" }}>{de.text}</p>
                <p lang="en" style={{ margin: "16px 0 0", fontSize: 14, lineHeight: 1.6, color: "#475569" }}>
                  <strong style={{ color: "#0f172a" }}>{en.title}.</strong> {en.text}
                </p>
              </>
            )}
          </div>
          <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                border: "none",
                borderRadius: 12,
                background: "#0f172a",
                color: "#ffffff",
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {copy ? copy.reload : `${de.reload} · ${en.reload}`}
            </button>
            {/* Bewusst <a>: der Client-Router ist hier womoeglich selbst kaputt. */}
            <a href="/" style={{ color: "#334155", fontSize: 14, fontWeight: 600, padding: "10px 4px" }}>
              {copy ? copy.home : `${de.home} · ${en.home}`}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
