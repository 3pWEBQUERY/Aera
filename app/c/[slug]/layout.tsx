import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCommunityContext } from "@/lib/guards";
import { canAccess } from "@/lib/entitlements";
import { MobileCommunityNav } from "@/components/community/mobile-nav";
import { CommunitySidebar, type SidebarItem } from "@/components/community/sidebar";
import { AnnouncementBanner } from "@/components/community/announcement-banner";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { activeAnnouncements, isAnnouncementsOnly } from "@/lib/space-settings";
import { ButtonLink } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/dashboard/icons";
import { unreadNotificationCount } from "@/lib/notifications";
import { getTranslations } from "next-intl/server";
import { parseLayout, resolveNavHref, NAV_TYPE_ICON } from "@/lib/layout";
import { readPreviewOverride } from "@/lib/preview";
import type { Metadata } from "next";

/** Space type → nav icon (matches the mobile SpaceNav mapping). */
const spaceTypeIcon: Record<string, IconName> = {
  FEED: "feed",
  FORUM: "forum",
  COURSE: "courses",
  SHOP: "products",
  NEWSLETTER: "newsletter",
  EVENTS: "events",
  BLOG: "blog",
  KNOWLEDGE: "knowledge",
  GALLERY: "gallery",
  VIDEOS: "videos",
  CHAT: "chat",
  PODCAST: "podcast",
  LINKS: "link",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { name: true, tagline: true, description: true },
  });
  if (!tenant) return {};
  const description =
    tenant.tagline ?? tenant.description ?? `Community von ${tenant.name}`;
  return {
    title: tenant.name,
    description,
    openGraph: { title: tenant.name, description },
  };
}

export default async function CommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const community = await getCommunityContext(slug);
  if (!community) notFound();
  const { tenant, user, ctx } = community;
  const tn = await getTranslations("community.nav");

  const spaceRows = await prisma.space.findMany({
    where: { tenantId: tenant.id, isArchived: false },
    orderBy: { sortOrder: "asc" },
  });
  // Banner-only and ad spaces stay out of the navigation entirely.
  const spaces = spaceRows
    .filter((s) => s.type !== "ADS" && !isAnnouncementsOnly(s.settings))
    .map((s) => ({
      slug: s.slug,
      name: s.name,
      type: s.type,
      locked: !canAccess(s, ctx),
    }));

  const isMember = ctx.membership?.status === "ACTIVE";

  // Creator anywhere on the platform (own tenant or staff role) → the sidebar
  // shows the member/creator view switcher.
  const [ownTenants, staffRoles] = user
    ? await Promise.all([
        prisma.tenant.count({ where: { ownerId: user.id } }),
        prisma.membership.count({
          where: { userId: user.id, role: { in: ["OWNER", "ADMIN", "MODERATOR"] } },
        }),
      ])
    : [0, 0];
  const isCreator = ownTenants > 0 || staffRoles > 0;

  // Chat spaces are a communication feature and always surface in the nav —
  // they are not subject to the content-space cap below.
  const chatSpaces = spaces.filter((s) => s.type === "CHAT");
  const contentSpaces = spaces.filter((s) => s.type !== "CHAT");

  // Live preview overrides (staff only, while editing) fall back to saved data.
  const preview = await readPreviewOverride(slug, ctx.isStaff);
  const savedLayout = parseLayout((tenant as unknown as { layout?: unknown }).layout ?? null);
  const customNav = (preview ? preview.config : savedLayout).nav;
  const displayName = preview?.name ?? tenant.name;
  const displayLogo = preview?.logoUrl !== undefined ? preview.logoUrl : tenant.logoUrl;
  const displayColor = preview?.primaryColor ?? tenant.primaryColor;

  const autoItems: SidebarItem[] = [
    { href: `/c/${slug}`, label: tn("home"), icon: "home", exact: true },
    ...contentSpaces.slice(0, 5).map((s) => ({
      href: `/c/${slug}/s/${s.slug}`,
      label: s.name,
      icon: spaceTypeIcon[s.type] ?? "spaces",
    })),
    ...chatSpaces.map((s) => ({
      href: `/c/${slug}/s/${s.slug}`,
      label: s.name,
      icon: "chat" as const,
    })),
    ...(isMember
      ? [{ href: `/c/${slug}/library`, label: tn("library"), icon: "gallery" as const }]
      : []),
    { href: `/c/${slug}/members`, label: tn("members"), icon: "members" },
    { href: `/c/${slug}/join`, label: tn("membership"), icon: "tiers" },
  ];

  const spaceTypeBySlug = new Map(spaceRows.map((s) => [s.slug, s.type]));
  const configuredItems: SidebarItem[] =
    customNav.length > 0
      ? customNav.map((item) => ({
          href: resolveNavHref(item, slug),
          label: item.label,
          icon:
            item.type === "SPACE" && item.value
              ? spaceTypeIcon[spaceTypeBySlug.get(item.value) ?? ""] ?? "spaces"
              : NAV_TYPE_ICON[item.type],
          exact: item.type === "HOME",
          recent: item.type === "RECENTLY_VISITED",
        }))
      : autoItems;

  // Platform entry point: Discover always comes first, above the community nav.
  const sidebarItems: SidebarItem[] = [
    { href: "/home", label: tn("discover"), icon: "search", exact: true },
    ...configuredItems,
  ];

  const unreadCount = user ? await unreadNotificationCount(tenant.id, user.id) : 0;
  const t = await getTranslations("community");

  // Active announcement banners from all spaces, newest first.
  const announcements = spaceRows
    .flatMap((s) => activeAnnouncements(s.settings))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div
      className="flex min-h-screen bg-[#f4f1ea]"
      style={
        {
          "--brand": displayColor,
          "--brand-accent": tenant.accentColor,
        } as React.CSSProperties
      }
    >
      {/* Full-height collapsible sidebar (desktop). */}
      <CommunitySidebar
        items={sidebarItems}
        currentCreator={{
          slug,
          name: displayName,
          logoUrl: displayLogo ?? null,
          color: displayColor,
        }}
        user={user ? { name: user.name, avatarUrl: user.avatarUrl } : null}
        slug={slug}
        isStaff={ctx.isStaff}
        isCreator={isCreator}
        loginHref={`/login?next=${encodeURIComponent(`/c/${slug}`)}`}
      />

      {/* Content column: banner · header · page. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {user && !user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}
        <AnnouncementBanner announcements={announcements} />

        {/* Sticky top bar: creator logo (left) · join CTA (right). */}
        <header className="sticky top-0 z-40 border-b border-[#161613]/10 bg-[#f4f1ea]/90 backdrop-blur">
          <div className="flex w-full items-center gap-4 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <MobileCommunityNav slug={slug} name={displayName} spaces={spaces} />
              <Link
                href={`/c/${slug}`}
                className="flex min-w-0 items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
              >
                {displayLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={displayLogo}
                    alt={displayName}
                    className="h-8 w-8 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-white"
                    style={{ background: displayColor }}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="display-serif truncate text-lg text-[#161613]">
                  {displayName}
                </span>
              </Link>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Link
                href={`/c/${slug}/search`}
                aria-label={t("searchAria")}
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-black/5 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
              >
                <Icon name="search" size={18} />
              </Link>
              {user && (
                <Link
                  href={`/c/${slug}/notifications`}
                  aria-label={
                    unreadCount > 0
                      ? t("notificationsAriaUnread", { count: unreadCount })
                      : t("notificationsAria")
                  }
                  className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-black/5 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                >
                  <Icon name="bell" size={18} />
                  {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-bold leading-none text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Link>
              )}
              {!isMember && (
                <ButtonLink
                  href={`/c/${slug}/join`}
                  size="sm"
                  variant="brand"
                  className="rounded-full"
                >
                  {t("join")}
                </ButtonLink>
              )}
            </div>
          </div>
        </header>

        {/* Pages control their own containers so the home hero can bleed
            edge-to-edge like the reference design. */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
