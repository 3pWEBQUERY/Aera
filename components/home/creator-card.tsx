import Link from "next/link";

export interface CreatorCardData {
  slug: string;
  name: string;
  tagline: string | null;
  coverUrl: string | null;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  memberCount: number;
}

function CoverArt({ c }: { c: CreatorCardData }) {
  if (c.coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={c.coverUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
      />
    );
  }
  if (c.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={c.logoUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
      />
    );
  }
  return (
    <div
      className="absolute inset-0 flex items-center justify-center transition duration-300 group-hover:scale-[1.04]"
      style={{ backgroundColor: c.primaryColor }}
    >
      <span className="text-4xl font-black text-white/90">
        {c.name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

/** Large discovery card: square cover art + name + tagline (carousel item). */
export function CreatorCard({ c }: { c: CreatorCardData }) {
  return (
    <Link
      href={`/c/${c.slug}`}
      className="group block w-44 shrink-0 focus-visible:outline-none sm:w-48"
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-[#161613]/10 transition duration-300 group-hover:-translate-y-1 group-hover:border-[#161613]/30 group-focus-visible:ring-2 group-focus-visible:ring-[#161613]/25">
        <CoverArt c={c} />
      </div>
      <p className="mt-2.5 truncate text-sm font-semibold text-[#161613]">
        {c.name}
      </p>
      {c.tagline && (
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[#161613]/55">
          {c.tagline}
        </p>
      )}
    </Link>
  );
}

/** Compact list row: avatar + name + tagline (used in dense sections). */
export function CreatorRow({ c }: { c: CreatorCardData }) {
  return (
    <Link
      href={`/c/${c.slug}`}
      className="group flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-[#161613]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25"
    >
      {c.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
      ) : (
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
          style={{ backgroundColor: c.primaryColor }}
        >
          {c.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[#161613]">
          {c.name}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-[#161613]/55">
          {c.tagline ?? `${c.memberCount} Mitglieder`}
        </span>
      </span>
    </Link>
  );
}
