"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateIdentityAction, updateSocialsAction, updateThemeAction } from "@/app/actions/profile";
import { updateCardThemeAction } from "@/app/actions/cards";
import { EMPTY_STATE } from "@/lib/action-state";
import {
  THEME_PRESETS,
  resolveTheme,
  themeFingerprint,
  type AeliTheme,
  type Backdrop,
  type Background,
  type TextTone,
} from "@/lib/themes";
import { SOCIAL_PLATFORMS, type SocialLink } from "@/lib/socials";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { BackgroundEditor } from "./background-editor";
import { ImageUpload } from "./image-upload";
import { PreviewStage } from "./preview-stage";
import { ButtonStylePicker, CornerPicker, FontPicker } from "./shape-pickers";
import { ThemeThumbnail } from "./theme-thumbnail";
import type { PageData } from "@/components/page/types";

/**
 * Design und Identität mit sofortiger Vorschau.
 *
 * Der ganze Bereich ist eine Client-Komponente, weil die Vorschau die noch
 * nicht gespeicherten Werte zeigen soll. Ein Preset auszuprobieren, dann zu
 * speichern, dann zu sehen, dass es doch nicht passt — das ist die Schleife,
 * die Gestaltung mühsam macht.
 *
 * Aufgeteilt in Reiter statt gestapelte Kästen. Der Grund ist nicht Platz,
 * sondern Aufmerksamkeit: wer den Hintergrund baut, arbeitet an einer Sache
 * und will nicht an fünf gleich aussehenden Zeilen vorbeiscrollen. Rechts
 * bleibt dabei immer dieselbe Bühne stehen.
 */

const TABS = [
  { key: "look", label: "Look" },
  { key: "hintergrund", label: "Hintergrund" },
  { key: "form", label: "Form & Schrift" },
  { key: "profil", label: "Profil" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const BACKDROPS: { key: Backdrop; label: string; hint: string }[] = [
  { key: "none", label: "Ruhig", hint: "Nichts darüber." },
  { key: "aurora", label: "Aurora", hint: "Weiche Lichter, langsam in Bewegung." },
  { key: "mesh", label: "Farbfelder", hint: "Drei Farbwolken, unbewegt." },
  { key: "rings", label: "Ringe", hint: "Konzentrische Linien." },
  { key: "grain", label: "Korn", hint: "Feines Filmrauschen." },
];

/**
 * Wofür das Design gilt.
 *
 * Zwei Fälle, und der Unterschied ist keine Kleinigkeit: „Seite" ändert das,
 * was alle Karten erben; „Karte" überschreibt es für genau eine. Wer beides
 * verwechselt, färbt entweder zu viel oder zu wenig um — deshalb steht der
 * Geltungsbereich in der Adresse, in der Reiterleiste und noch einmal über
 * dem Speichern-Knopf.
 */
export type DesignScope =
  | { kind: "page" }
  | { kind: "card"; cardId: string; cardTitle: string; ownTheme: boolean };

export function DesignStudio({
  page,
  scope,
  initialTheme,
  identity,
  socials,
  published,
  publicUrl,
  publicUrlLabel,
}: {
  page: PageData;
  scope: DesignScope;
  initialTheme: AeliTheme;
  identity: { displayName: string; bio: string; avatarUrl: string; bannerUrl: string };
  socials: SocialLink[];
  published: boolean;
  publicUrl: string;
  publicUrlLabel: string;
}) {
  const [tab, setTab] = useState<TabKey>("look");
  const [theme, setTheme] = useState<AeliTheme>(initialTheme);
  // Für eine Karte: hat sie ein eigenes Design, oder folgt sie der Seite?
  // Der Schalter steuert nur, WAS gespeichert wird — die Regler darunter
  // bleiben bedienbar, damit man sehen kann, worauf man sich einlässt.
  const [own, setOwn] = useState(scope.kind === "card" ? scope.ownTheme : true);
  const [draft, setDraft] = useState(identity);
  const [links, setLinks] = useState<Record<string, string>>(() =>
    Object.fromEntries(socials.map((social) => [social.platform, social.url])),
  );

  const resolved = useMemo(() => resolveTheme(theme), [theme]);

  const preview = useMemo<PageData>(
    () => ({
      ...page,
      // In der Vorschau gilt der Entwurf nur für die Karte, an der gearbeitet
      // wird — bei „Seite" für alle, die kein eigenes Design haben.
      cards: page.cards.map((card) =>
        scope.kind === "page"
          ? card.ownTheme
            ? card
            : { ...card, theme: resolved }
          : card.id === scope.cardId
            ? { ...card, theme: own ? resolved : page.theme }
            : card,
      ),
      displayName: draft.displayName || page.displayName,
      bio: draft.bio || null,
      avatarUrl: draft.avatarUrl || null,
      bannerUrl: draft.bannerUrl || null,
      socials: SOCIAL_PLATFORMS.flatMap((platform) =>
        links[platform.key] ? [{ platform: platform.key, url: links[platform.key]! }] : [],
      ),
    }),
    [page, draft, resolved, links, scope, own],
  );

  // Nur ein Hinweis in der Bühne, kein Verhalten: ein Vergleich mit dem
  // gespeicherten Stand ist genauer als ein „hat schon mal getippt"-Merker.
  // Über den Fingerabdruck, nicht über `JSON.stringify` — sonst zählte auch
  // die Schlüsselreihenfolge, und der Hinweis bliebe nach dem ersten Speichern
  // für immer stehen.
  const dirty =
    themeFingerprint(theme) !== themeFingerprint(initialTheme) ||
    JSON.stringify(draft) !== JSON.stringify(identity);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] xl:gap-10">
      <div className="min-w-0 max-w-2xl">
        <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              onClick={() => setTab(entry.key)}
              className={`relative shrink-0 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                tab === entry.key ? "text-chalk" : "text-ash hover:text-chalk"
              }`}
            >
              {entry.label}
              {tab === entry.key && (
                <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-signal" />
              )}
            </button>
          ))}
        </div>

        {scope.kind === "card" && (
          <label className="mb-5 flex items-start gap-3 rounded-xl border border-line bg-ink-2 p-3.5">
            <input
              type="checkbox"
              checked={own}
              onChange={(event) => setOwn(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-signal)]"
            />
            <span className="text-sm">
              <span className="font-medium text-chalk">
                Eigenes Design für „{scope.cardTitle}“
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ash">
                {own
                  ? "Diese Karte hat ihr eigenes Aussehen. Änderungen am Design der Seite lassen sie unberührt."
                  : "Diese Karte folgt dem Design der Seite. Häkchen setzen, um sie davon zu lösen."}
              </span>
            </span>
          </label>
        )}

        {tab === "look" && (
          <ThemeForm theme={theme} scope={scope} own={own} onChange={setTheme}>
            <Section
              title="Ausgangspunkt"
              hint="Acht Handschriften. Jede setzt Farbe, Schrift, Form und Stimmung zusammen — danach kannst du alles einzeln nachziehen."
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {THEME_PRESETS.map((preset) => {
                  const selected = theme.preset === preset.key;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      // Ein Presetwechsel setzt das Feintuning zurück. Sonst
                      // trägt „Neon" noch die runden Ecken von „Perle", und das
                      // Ergebnis ist keins von beidem.
                      onClick={() => setTheme({ preset: preset.key })}
                      aria-pressed={selected}
                      aria-label={`Look ${preset.label} — ${preset.hint}`}
                      className={`group overflow-hidden rounded-xl border text-left transition-all ${
                        selected ? "border-signal ring-2 ring-signal/30" : "border-line hover:border-ash/50"
                      }`}
                    >
                      <ThemeThumbnail theme={{ preset: preset.key }} className="w-full" />
                      <span className="block px-2.5 py-2">
                        <span className="block text-xs font-medium text-chalk">{preset.label}</span>
                        <span className="mt-0.5 block text-[0.68rem] leading-snug text-ash">
                          {preset.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title="Akzentfarbe" hint="Die eine Farbe, die alles Klickbare trägt.">
              <AccentPicker theme={theme} onChange={setTheme} accent={resolved.accent} />
            </Section>

            <Section title="Stimmung" hint="Was über dem Hintergrund liegt.">
              <div className="flex flex-wrap gap-2">
                {BACKDROPS.map((entry) => {
                  const active = (theme.backdrop ?? resolved.effectiveBackdrop) === entry.key;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => setTheme({ ...theme, backdrop: entry.key })}
                      aria-pressed={active}
                      title={entry.hint}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        active ? "border-signal text-chalk" : "border-line text-ash hover:text-chalk"
                      }`}
                    >
                      {entry.label}
                    </button>
                  );
                })}
              </div>
            </Section>
          </ThemeForm>
        )}

        {tab === "hintergrund" && (
          <ThemeForm theme={theme} scope={scope} own={own} onChange={setTheme}>
            <Section
              title="Hintergrund"
              hint="Nimm den Look, eine eigene Farbe, einen selbstgebauten Verlauf — oder dein Foto."
            >
              <BackgroundEditor
                background={theme.background ?? { kind: "preset" }}
                textTone={theme.textTone ?? "auto"}
                onChange={(background: Background) => setTheme({ ...theme, background })}
                onToneChange={(textTone: TextTone) => setTheme({ ...theme, textTone })}
              />
            </Section>
          </ThemeForm>
        )}

        {tab === "form" && (
          <ThemeForm theme={theme} scope={scope} own={own} onChange={setTheme}>
            <Section title="Knopfform" hint="Wie ein Link aussieht — das häufigste Element der Seite.">
              <ButtonStylePicker
                value={theme.buttonStyle ?? resolved.effectiveButtonStyle}
                accent={resolved.accent}
                fg={resolved.fg}
                surface={resolved.surface}
                border={resolved.border}
                radius={resolved.radius}
                background={resolved.backgroundCss}
                onChange={(buttonStyle) => setTheme({ ...theme, buttonStyle })}
              />
            </Section>

            <Section title="Ecken" hint="Gilt für Knöpfe, Karten und Bilder gleichermaßen.">
              <CornerPicker
                value={theme.corner ?? resolved.corner}
                accent={resolved.accent}
                onChange={(corner) => setTheme({ ...theme, corner })}
              />
            </Section>

            <Section title="Schrift" hint="Systemschriften — kein Nachladen, kein Textsprung.">
              <FontPicker
                value={theme.fontPair ?? resolved.fontPair}
                onChange={(fontPair) => setTheme({ ...theme, fontPair })}
              />
            </Section>
          </ThemeForm>
        )}

        {tab === "profil" && (
          <div className="space-y-8">
            <IdentityForm draft={draft} onChange={setDraft} />
            <SocialsForm links={links} onChange={setLinks} />
          </div>
        )}
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start">
        <PreviewStage
          page={preview}
          url={publicUrl}
          urlLabel={publicUrlLabel}
          published={published}
          dirty={dirty}
        />
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-chalk">{title}</h2>
      <p className="mt-1 mb-4 max-w-lg text-xs leading-relaxed text-ash">{hint}</p>
      {children}
    </section>
  );
}

/**
 * Die Klammer um alle Theme-Reiter.
 *
 * Ein Formular, ein verstecktes Feld, ein Speichern-Knopf — egal welcher Reiter
 * gerade offen ist. Das komplette Theme geht mit, nicht nur der sichtbare Teil:
 * wer im Look-Reiter etwas ändert und im Hintergrund-Reiter speichert, erwartet
 * beides gespeichert.
 */
function ThemeForm({
  theme,
  scope,
  own,
  children,
}: {
  theme: AeliTheme;
  scope: DesignScope;
  /** Nur bei einer Karte: eigenes Design an? Aus heißt „leer speichern". */
  own: boolean;
  onChange: (theme: AeliTheme) => void;
  children: React.ReactNode;
}) {
  const forCard = scope.kind === "card";
  const [state, action] = useActionState(
    forCard ? updateCardThemeAction : updateThemeAction,
    EMPTY_STATE,
  );

  return (
    <form action={action} className="space-y-8">
      {forCard && <input type="hidden" name="cardId" value={scope.cardId} />}
      {/* Ein leeres Feld ist die Ansage „wie die Seite". Deshalb `value=""`
          und nicht etwa das Feld weglassen: weggelassen hieße für die Action
          „nichts geschickt", und das ist ein anderer Fall als „ausdrücklich
          nichts". */}
      <input type="hidden" name="theme" value={forCard && !own ? "" : JSON.stringify(theme)} />
      {children}
      <SaveRow
        notice={state.notice}
        error={state.error}
        label={forCard ? `Für „${scope.cardTitle}“ übernehmen` : "Look übernehmen"}
      />
    </form>
  );
}

function AccentPicker({
  theme,
  accent,
  onChange,
}: {
  theme: AeliTheme;
  accent: string;
  onChange: (theme: AeliTheme) => void;
}) {
  const swatches = ["#7c6bff", "#39ff6a", "#e0407a", "#ff6b1a", "#d8c48b", "#e0301e", "#1ea7a0", "#f5f5f3"];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => onChange({ ...theme, accent: swatch })}
            aria-label={`Akzentfarbe ${swatch}`}
            aria-pressed={accent.toLowerCase() === swatch}
            className={`size-8 rounded-full border transition-transform hover:scale-110 ${
              accent.toLowerCase() === swatch ? "border-signal ring-2 ring-signal/40" : "border-line"
            }`}
            style={{ background: swatch }}
          />
        ))}
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-ash transition-colors hover:text-chalk">
          <input
            type="color"
            value={accent}
            onChange={(event) => onChange({ ...theme, accent: event.target.value })}
            className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          Eigene
        </label>
        {theme.accent && (
          <button
            type="button"
            onClick={() => onChange({ ...theme, accent: undefined })}
            className="rounded px-2 py-1 text-xs text-ash transition-colors hover:text-chalk"
          >
            Zurücksetzen
          </button>
        )}
      </div>
      <p className="text-xs text-ash">
        Die Schriftfarbe auf dem Knopf wird berechnet, nicht gewählt — auf Gelb
        steht dann Schwarz statt unlesbarem Weiß.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function IdentityForm({
  draft,
  onChange,
}: {
  draft: { displayName: string; bio: string; avatarUrl: string; bannerUrl: string };
  onChange: (value: typeof draft) => void;
}) {
  const [state, action] = useActionState(updateIdentityAction, EMPTY_STATE);

  return (
    <form action={action} className="space-y-5">
      <Section title="Wer bist du?" hint="Steht oben auf der Seite — das Erste, was jemand sieht.">
        <div className="space-y-4">
          <Field id="displayName" label="Anzeigename" error={state.fieldErrors?.displayName}>
            <Input
              id="displayName"
              name="displayName"
              value={draft.displayName}
              onChange={(event) => onChange({ ...draft, displayName: event.target.value })}
              maxLength={80}
            />
          </Field>

          <Field
            id="bio"
            label="Kurztext"
            optional
            hint="Zwei Zeilen reichen. Wer hier drei Absätze liest, klickt keinen Link mehr."
          >
            <Textarea
              id="bio"
              name="bio"
              value={draft.bio}
              onChange={(event) => onChange({ ...draft, bio: event.target.value })}
              maxLength={400}
              rows={3}
              aria-describedby="bio-note"
            />
          </Field>

          {/* Hochgeladen wird sofort, gespeichert erst mit dem Knopf darunter:
              so sieht man das neue Bild rechts in der Bühne und kann es noch
              einmal wechseln, bevor es auf der echten Seite steht. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <ImageUpload
              name="avatarUrl"
              label="Profilbild"
              hint="Ziehen, einfügen oder auswählen. Wird auf 512 × 512 gebracht."
              purpose="avatar"
              shape="circle"
              value={draft.avatarUrl}
              onChange={(url) => onChange({ ...draft, avatarUrl: url })}
            />
            <ImageUpload
              name="bannerUrl"
              label="Titelbild"
              hint="Liegt hinter dem Profilbild. Quer, mindestens 1600 px breit."
              purpose="banner"
              shape="wide"
              value={draft.bannerUrl}
              onChange={(url) => onChange({ ...draft, bannerUrl: url })}
            />
          </div>
        </div>
      </Section>

      <SaveRow notice={state.notice} error={state.error} label="Speichern" />
    </form>
  );
}

function SocialsForm({
  links,
  onChange,
}: {
  links: Record<string, string>;
  onChange: (links: Record<string, string>) => void;
}) {
  const [state, action] = useActionState(updateSocialsAction, EMPTY_STATE);

  return (
    <form action={action} className="space-y-4">
      <Section
        title="Deine Profile"
        hint="Erscheinen als Icon-Reihe im Kopf — und überall dort, wo du eine Social-Zeile einbaust. Leeres Feld heißt: wird entfernt."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL_PLATFORMS.map((platform) => {
            const name = `social:${platform.key}`;
            const error = state.fieldErrors?.[name];
            return (
              <div key={platform.key} className="space-y-1">
                <label htmlFor={name} className="text-xs font-medium text-ash">
                  {platform.label}
                </label>
                <input
                  id={name}
                  name={name}
                  value={links[platform.key] ?? ""}
                  onChange={(event) => onChange({ ...links, [platform.key]: event.target.value })}
                  placeholder={platform.placeholder}
                  inputMode="url"
                  aria-invalid={Boolean(error)}
                  className={`w-full rounded-lg border bg-ink px-3 py-2 text-sm text-chalk placeholder:text-ash/60 focus:outline-none ${
                    error ? "border-ember" : "border-line focus:border-signal"
                  }`}
                />
                {error && (
                  <p role="alert" className="text-xs text-ember">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <SaveRow notice={state.notice} error={state.error} label="Profile speichern" />
    </form>
  );
}

// ---------------------------------------------------------------------------

function SaveRow({ label, notice, error }: { label: string; notice?: string; error?: string }) {
  const { pending } = useFormStatus();
  return (
    // Der Speichern-Knopf bleibt am unteren Rand stehen, solange man scrollt.
    // Bei einem Bereich, in dem man lange herumprobiert, ist der Weg zurück
    // nach oben sonst die letzte Hürde vor dem Speichern.
    <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-xl border border-line bg-ink-2/95 px-3 py-2.5 shadow-[0_18px_40px_-24px_rgb(0_0_0/0.9)] backdrop-blur-xl">
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "…" : label}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-ember">
          {error}
        </span>
      ) : notice ? (
        <span className="text-xs text-signal">{notice}</span>
      ) : (
        <span className="text-xs text-ash">Änderungen sind erst nach dem Speichern öffentlich.</span>
      )}
    </div>
  );
}
