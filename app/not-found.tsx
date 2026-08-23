import Link from "next/link";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

/**
 * 404 with a rotating full-bleed backdrop.
 *
 * `connection()` opts this out of prerendering, so the random pick happens per
 * request and every reload shows a different scene. Without it Next would bake
 * one image into the static shell at build time.
 */
interface Backdrop {
  /** Basename in /public/404 — two widths are shipped per scene. */
  file: string;
  /** Average colour, painted before the image decodes (never a white flash). */
  tone: string;
  /** 24px inline preview that blurs up while the real file loads. */
  lqip: string;
  /**
   * Per-scene scrim. One strength cannot serve both a night painting and a
   * sunlit field: too little and the headline drowns on the bright scene, too
   * much and the dark ones turn to mud. The diagonal keeps the darkening on
   * the text column so the artwork stays intact on the right.
   */
  scrim: string;
}

const vignette =
  "linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.42) 100%)";

const BACKDROPS: Backdrop[] = [
  {
    file: "404-1",
    tone: "#333562",
    scrim: `linear-gradient(105deg, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.42) 42%, rgba(0,0,0,0) 82%), ${vignette}`,
    lqip: "data:image/webp;base64,UklGRmwAAABXRUJQVlA4IGAAAAAQBACdASoYABAAPt1apkyopSOiMAgBEBuJZACw7CHfGQLOB5BMa0c+gAD+7D+MLeBGEVIEHzGJknx6s3YTT18INFvhE+AUsBTevuFIWFVnYcJoEwDIt0/lbwOYmsLNgAA=",
  },
  {
    file: "404-2",
    tone: "#7a8644",
    // The sunlit field is by far the brightest — it needs the most cover.
    scrim: `linear-gradient(105deg, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.58) 42%, rgba(0,0,0,0) 88%), ${vignette}`,
    lqip: "data:image/webp;base64,UklGRlgAAABXRUJQVlA4IEwAAABwAwCdASoYAA4APt1cp0yopSOiMAgBEBuJQBWABDi8FAoitAAA/lv4XLI2I0k0wmqRJ5/NuRaZcdMfxncsYeRZAJcwiWxB3GOxoAAA",
  },
  {
    file: "404-3",
    tone: "#062e66",
    // Already a night scene; a heavy scrim would only kill the blue.
    scrim: `linear-gradient(105deg, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.20) 42%, rgba(0,0,0,0) 68%), ${vignette}`,
    lqip: "data:image/webp;base64,UklGRnQAAABXRUJQVlA4IGgAAAAwBACdASoYABAAPt1cpkyopSOiMAgBEBuJZgCdMoMYAEmgyWj77Jy0FAAA/vDV7FtOeAejSzrpU361tFb8MFOLcKYRGE/cU+asG0D7dAkWtEJGqJBNECctFlqWxaQY/6b8C7zYGRAAAA==",
  },
];

export default async function NotFound() {
  await connection();
  const t = await getTranslations("ui.frontend.notFound");
  const backdrop = BACKDROPS[Math.floor(Math.random() * BACKDROPS.length)]!;

  return (
    <main
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden"
      style={{ backgroundColor: backdrop.tone }}
    >
      {/* Backdrop: blurred preview underneath, full image fading in on top. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 scale-110 bg-cover bg-center blur-xl"
        style={{ backgroundImage: `url("${backdrop.lqip}")` }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/404/${backdrop.file}-1920.webp`}
        srcSet={`/404/${backdrop.file}-1280.webp 1280w, /404/${backdrop.file}-1920.webp 1920w`}
        sizes="100vw"
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        decoding="async"
        className="backdrop-in absolute inset-0 -z-10 h-full w-full object-cover object-[50%_60%]"
      />

      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{ backgroundImage: backdrop.scrim }}
      />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10 sm:px-10 sm:py-14">
        <Link
          href="/"
          aria-label="Aera"
          className="w-fit rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Aera" width={104} height={28} className="h-7 w-auto opacity-90" />
        </Link>

        <div className="flex flex-1 items-center">
          <div className="max-w-xl">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.35em] text-white/55">
              404
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.45)] sm:text-5xl md:text-6xl">
              {t("title")}
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-white/75 sm:text-lg sm:leading-8">
              {t("text")}
            </p>
            <Link
              href="/"
              className="group mt-9 inline-flex items-center gap-2.5 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 shadow-lg shadow-black/25 transition hover:bg-white/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
            >
              {t("home")}
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
