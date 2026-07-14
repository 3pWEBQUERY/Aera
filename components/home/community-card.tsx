import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

export interface CommunityCardData {
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  primaryColor: string;
  accentColor: string;
  memberCount: number;
  postCount: number;
}

/** Discover card: cover strip, floating logo, name, tagline, live stats. */
export function CommunityCard({ community: c }: { community: CommunityCardData }) {
  const t = useTranslations("discover");
  const nf = new Intl.NumberFormat(useLocale());
  return (
    <Link
      href={`/c/${c.slug}`}
      className="group block overflow-hidden rounded-2xl border border-[#161613]/10 bg-white transition duration-300 hover:-translate-y-1 hover:border-[#161613]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25"
    >
      <div className="relative aspect-[3/1] w-full overflow-hidden bg-[#161613]/5">
        {c.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.coverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: c.primaryColor }}
          />
        )}
      </div>
      <div className="relative px-4 pb-4">
        {/* Floating logo overlapping the cover. */}
        <div className="-mt-6 mb-2.5">
          {c.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.logoUrl}
              alt=""
              className="h-12 w-12 rounded-xl object-cover shadow-sm ring-2 ring-white"
            />
          ) : (
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white shadow-sm ring-2 ring-white"
              style={{ backgroundColor: c.primaryColor }}
            >
              {c.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <h3 className="display-serif truncate text-lg text-[#161613]">
          {c.name}
        </h3>
        {c.tagline && (
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-[#161613]/60">{c.tagline}</p>
        )}
        <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#161613]/45">
          {t("memberCount", { count: c.memberCount })}
          {c.postCount > 0 && (
            <>
              <span className="mx-1.5" aria-hidden>·</span>
              {nf.format(c.postCount)} {t("postsLabel")}
            </>
          )}
        </p>
      </div>
    </Link>
  );
}
