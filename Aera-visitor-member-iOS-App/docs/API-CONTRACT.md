# Aera Mobile API — Verbindlicher Vertrag (v1)

Dieser Vertrag ist die **einzige Quelle der Wahrheit** für Backend (`app/api/mobile/v1/**`) und iOS-App. Beide Seiten implementieren exakt diese Shapes. Feldnamen sind camelCase, Datumswerte ISO-8601-Strings (UTC), Preise in Cents (Int), Währung lowercase ISO (`"eur"`).

Basis-URL: `{APP_URL}/api/mobile/v1`

## Konventionen

- Auth: `Authorization: Bearer <JWT>` — dasselbe HS256-JWT wie das Web-Session-Cookie (`{ userId, sessionVersion }`, signiert mit `AUTH_SECRET`, 30 Tage). Ausgestellt von `/auth/login` bzw. `/auth/signup`. Validierung wie `lib/session.ts` inkl. `sessionVersion`-Abgleich.
- Fehlerformat immer: `{ "error": { "code": string, "message": string } }` mit passendem HTTP-Status (400/401/403/404/409/429/500).
  Wichtige Codes: `invalid_credentials`, `totp_required`, `email_already_registered`, `rate_limited`, `not_member`, `payment_required`, `banned`, `not_found`, `validation`, `iap_invalid`, `iap_product_mismatch`, `physical_not_supported`.
- Alle Antworten `Cache-Control: no-store`.
- Listen: `{ "data": [...], "nextCursor": string|null }` wo paginiert (cursor = ID). `?limit=` default 30, max 100.
- Gated Content: gesperrte Felder (`body`, `bodyHtml`, `imageUrl`, `videoUrl`, `url`) werden **serverseitig genullt**, nie nur clientseitig versteckt. Zusätzlich `locked: true` + `teaserUrl` + `unlock`-Objekt (siehe unten).

### Shared Shapes

```ts
User { id, name, email, avatarUrl: string|null, emailVerified: boolean, totpEnabled: boolean }

CommunityCard {
  slug, name, tagline: string|null, logoUrl: string|null, coverUrl: string|null,
  primaryColor, accentColor,            // Hex, z.B. "#6d28d9"
  category: string|null,                // Key, z.B. "kurse"
  categoryLabel: string|null,           // Anzeige-Label, z.B. "Kurse & Lernen"
  memberCount: number, isMember: boolean
}

Viewer {
  isMember: boolean, role: "OWNER"|"ADMIN"|"MODERATOR"|"MEMBER"|null,
  isStaff: boolean, status: "ACTIVE"|"PENDING"|"BANNED"|null,
  tier: { id, name, slug }|null, points: number, levelName: string|null,
  hasPaidEntitlement: boolean, unreadNotifications: number
}

SpaceSummary {
  slug, name, type: SpaceType, icon: string|null,
  visibility: "PUBLIC"|"MEMBERS"|"PAID", accessible: boolean, sortOrder: number
}
// SpaceType: FEED FORUM BLOG VIDEOS PODCAST GALLERY COURSE SHOP EVENTS
//            NEWSLETTER KNOWLEDGE LINKS LIVE CHAT REQUESTS BOOKING STORIES
//            TIPS CALENDAR  (ADS wird nie als Space geliefert)

Author { userId, name, avatarUrl: string|null, role: Role|null }

Unlock {                                  // wie ein gesperrtes Objekt freigeschaltet wird
  priceCents: number, currency: string,
  appleProductId: string|null,            // null => auf iOS nicht kaufbar (Hinweis zeigen)
  kind: "post"|"media"|"media-item"|"product"|"request"|"booking",
  refId: string
}

Post {
  id, spaceSlug, spaceType: SpaceType,
  title: string|null, body: string|null, bodyHtml: string|null,
  imageUrl: string|null, videoUrl: string|null, teaserUrl: string|null,
  isPinned: boolean, publishedAt: string,
  author: Author,
  likeCount: number, likedByMe: boolean, commentCount: number,
  locked: boolean, unlock: Unlock|null,
  score: number|null, myVote: "UP"|"DOWN"|null    // nur FORUM, sonst null
}

Comment { id, postId, parentId: string|null, body, createdAt, author: Author,
          score: number, myVote: "UP"|"DOWN"|null, children: Comment[] }

Tier {
  id, name, slug, description: string|null, benefits: string[],   // description zeilenweise gesplittet
  coverUrl: string|null, priceCents, currency,
  interval: "FREE"|"MONTH"|"YEAR"|"ONE_TIME",
  isRecommended: boolean, isDefault: boolean, memberCount: number,
  appleProductId: string|null, isCurrent: boolean
}

Product {
  id, name, slug, description: string|null, coverUrl: string|null, images: string[],
  priceCents, currency, type: "DIGITAL"|"PHYSICAL"|"BUNDLE"|"COURSE_ACCESS"|"TIER_GRANT",
  requiresShipping: boolean, inStock: boolean, owned: boolean,
  downloadUrl: string|null,               // nur wenn owned
  appleProductId: string|null             // null bei PHYSICAL => iapAvailable false
}

Course {
  id, title, slug, description: string|null, coverUrl: string|null,
  format: "ONLINE"|"OFFLINE", videoUrl: string|null, streamUrl: string|null,
  location: string|null, address: string|null, startsAt: string|null,
  accessible: boolean, progress: { completed: number, total: number },
  lessons: Lesson[]
}
Lesson { id, title, slug, content: string|null, videoUrl: string|null,
         durationSec: number|null, sortOrder: number, isPreview: boolean,
         unlocked: boolean, daysUntilUnlock: number|null, completed: boolean }

Event { id, title, slug, description: string|null, coverUrl: string|null,
        startsAt, endsAt: string|null, location: string|null, isOnline: boolean,
        meetingUrl: string|null,          // nur für Mitglieder mit Zugriff
        capacity: number|null, rsvpCount: number, myRsvp: boolean, accessible: boolean }

Notification { id, type: "POST_COMMENT"|"COMMENT_REPLY"|"REACTION",
               message, href: string|null, actor: Author|null, createdAt, readAt: string|null }

MemberCard { userId, name, avatarUrl: string|null, role: Role, tierName: string|null,
             points: number, levelName: string|null, joinedAt }

Order { id, description, amountCents, currency, status: "PENDING"|"PAID"|"REFUNDED"|"FAILED",
        createdAt, productName: string|null, downloadUrl: string|null }
```

## Endpunkte

### Auth (kein Token nötig außer angegeben)

| Route | Body / Query | Antwort |
|---|---|---|
| `POST /auth/signup` | `{ name, email, password }` | `{ token, user: User }` — Rate-Limit 5/h/IP |
| `POST /auth/login` | `{ email, password, totp? }` | `{ token, user: User }`; bei aktivem TOTP ohne/mit falschem Code: **401** `totp_required` |
| `POST /auth/password-reset` | `{ email }` | `{ ok: true }` (immer, keine Enumeration) |
| `GET /auth/me` 🔒 | — | `{ user: User, memberships: MembershipHome[] }` |
| `PATCH /auth/profile` 🔒 | `{ name?, avatarUrl? }` | `{ user: User }` |
| `POST /auth/change-password` 🔒 | `{ currentPassword, newPassword }` | `{ token }` (neues JWT, alte Sessions invalidiert) |
| `POST /auth/avatar` 🔒 | multipart `file` (+ `tenant` slug einer Mitgliedschaft) | `{ url }` |

```ts
MembershipHome { community: CommunityCard, tier: {name, slug, priceCents, interval}|null,
                 role: Role, points: number, levelName: string|null, joinedAt,
                 subscription: { status, currentPeriodEnd: string|null,
                                 cancelAtPeriodEnd: boolean, isApple: boolean }|null }
```

### Discover (Token optional — personalisiert wenn vorhanden)

- `GET /discover` → `{ categories: { key, label }[], myCommunities: CommunityCard[], popular: CommunityCard[], newest: CommunityCard[] }`
- `GET /discover/search?q=&category=` → `{ data: CommunityCard[] }`
- `GET /communities/cards?slugs=a,b,c` → `{ data: CommunityCard[] }` — Token optional, **max 20 Slugs** (mehr → 400 `validation`), Antwort in der Reihenfolge der angefragten Slugs; unbekannte Slugs werden still übersprungen (für „Zuletzt besucht": Client speichert Slugs lokal).

### Home-Feed (Token optional)

- `GET /home?tab=home|members&cursor=&limit=` → `{ data: HomeItem[], nextCursor: string|null }`
  - Aggregierter Content-Feed **über Tenants hinweg**, absteigend nach `publishedAt` (Keyset über `publishedAt`+`id`, `cursor` = Post-ID des letzten Items; unbekannter Cursor → 400 `validation`). `limit` Default **20**, max **50**.
  - Quellen: veröffentlichte Posts (`isPublished`, `publishedAt <= now`) aus Spaces der Typen `FEED`, `FORUM`, `BLOG`, `VIDEOS`, `PODCAST` (keine archivierten Spaces, keine Banner-Container).
  - `tab=home` (Default): alle Tenants, Token optional. `tab=members`: nur Tenants mit **ACTIVE**-Membership des Users — ohne Token → **401** `unauthorized`; ohne Mitgliedschaften → leere Liste.
  - Gating pro Tenant wie in der Community-API: nicht zugänglicher Space (Visibility/Entitlement, Gäste sehen nur `PUBLIC`) oder Pay-per-Post ⇒ `post.locked: true` + `body`/`bodyHtml`/`imageUrl`/`videoUrl` **serverseitig genullt** + `teaserUrl`. `unlock` ist nur bei Pay-per-Post gesetzt (Space-gesperrte freie Posts sind nicht einzeln kaufbar → `unlock: null`, Beitritt nötig).
  - `post.score`/`post.myVote` wie überall nur bei `spaceType: "FORUM"`, sonst `null`; `readingMinutes` im Home-Feed immer `null` (kein Blog-Listing-Modus).

```ts
HomeItem { community: CommunityCard, post: Post }
```

### Explore (Token optional — personalisiert wenn vorhanden)

- `GET /explore` → `{ trending: { key, label }[], forYou: CommunityCard[], popularWeek: CommunityCard[] }`
  - `trending`: Kategorien sortiert nach Community-Anzahl, **max 8**.
  - `forYou` (**max 12**): eingeloggt → Communities aus den Kategorien der eigenen ACTIVE-Mitgliedschaften, **ohne** eigene Communities, sortiert nach `memberCount`. Ausgeloggt oder keine passenden Kategorien/Treffer → beliebteste Communities.
  - `popularWeek` (**max 12**): meiste neue Mitglieder der letzten 7 Tage (`Membership.joinedAt`), bei weniger als 12 Treffern per `memberCount` aufgefüllt.

### Community (Token optional; gated je nach Viewer)

- `GET /c/{slug}` → `{ community: CommunityCard & { description }, viewer: Viewer, spaces: SpaceSummary[], announcement: { id, message, bgColor, textColor, href: string|null }|null }`
- `POST /c/{slug}/join-free` 🔒 → tritt Default-/Free-Tier bei → `{ viewer: Viewer }`; 409 `payment_required` wenn kein Free-Tier existiert, 403 `banned`.
- `GET /c/{slug}/tiers` → `{ data: Tier[] }`
- `POST /c/{slug}/membership/cancel` 🔒 → `{ ok }` — nur für nicht-Apple-Abos (Stripe→Web-Hinweis via 409 `manage_on_web`); Apple-Abos werden über iOS-Abo-Verwaltung gekündigt.
- `GET /c/{slug}/space/{spaceSlug}?q=&tab=&cursor=&page=` → `{ space: SpaceSummary & { description, settings }, content: Content }` — 403 `not_member` / `payment_required` wenn Space nicht zugänglich (mit `space` trotzdem geliefert für Paywall-UI). `page` wird nur von BLOG ausgewertet (seitenbasiertes Paging), `cursor` von FEED/FORUM/VIDEOS/PODCAST.

`Content` ist eine tagged union über `space.type`:

```ts
FEED|VIDEOS|PODCAST → { kind:"posts", posts: Post[], canPost: boolean, nextCursor }
FORUM      → { kind:"forum", posts: Post[], canPost: boolean, tab:"top"|"new", nextCursor }
BLOG       → { kind:"blog", posts: Post[], page, totalPages }   // body genullt, readingMinutes pro Post via bodyChars/1000 → im Post-Objekt Feld readingMinutes: number|null
GALLERY    → { kind:"gallery", packages: [{ id, title, description, coverUrl, priceCents, currency,
               owned, availableUntil: string|null, unlock: Unlock|null,
               items: [{ id, type:"IMAGE"|"VIDEO", url: string|null, thumbUrl: string|null,
                         locked, isPreview, unlock: Unlock|null }] }] }
COURSE     → { kind:"courses", courses: Course[] }
SHOP       → { kind:"shop", products: Product[] }
EVENTS     → { kind:"events", upcoming: Event[], past: Event[] }
NEWSLETTER → { kind:"newsletter", campaigns: [{ id, subject, preheader: string|null, bodyHtml, sentAt }] }
KNOWLEDGE  → { kind:"knowledge", articles: [{ id, title, slug, excerpt, bodyHtml: string|null, locked, updatedAt }] }
LINKS      → { kind:"links", links: [{ label, url, description: string|null }] }
LIVE       → { kind:"live", sessions: [{ id, title, description, status:"SCHEDULED"|"LIVE"|"ENDED",
               scheduledAt: string|null, streamUrl: string|null, replayUrl: string|null, accessible: boolean }] }
CHAT       → { kind:"chat", conversations: [Conversation] }
REQUESTS   → { kind:"requests", requests: [{ id, title, body, status:"OPEN"|"ACCEPTED"|"PRICED"|"FULFILLED"|"DECLINED",
               score, myVote: "UP"|"DOWN"|null, priceCents: number|null, unlock: Unlock|null,
               author: Author, createdAt }], canCreate: boolean }
BOOKING    → { kind:"booking", slots: [{ id, title, description, startsAt, durationMin, capacity,
               spotsLeft, priceCents, currency, unlock: Unlock|null, myReservation: "PENDING"|"CONFIRMED"|null }] }
STORIES    → { kind:"stories", groups: [{ author: Author, stories: [{ id, mediaUrl, mediaType:"IMAGE"|"VIDEO", createdAt, expiresAt }] }] }
TIPS       → { kind:"tips", goal: { title, targetCents, raisedCents }|null,
               presets: [{ amountCents, appleProductId: string|null }],
               tips: [{ id, amountCents, message: string|null, author: Author|null, createdAt }] }
CALENDAR   → { kind:"calendar", items: [{ kind:"event"|"live"|"post", date, title, subtitle: string|null,
               spaceSlug: string|null, refId }] }
```

### Posts & Engagement 🔒 (außer GET)

- `GET /c/{slug}/posts/{postId}` → `{ post: Post, comments: Comment[] }` (Kommentare verschachtelt, gated Post → Felder genullt + `locked`)
- `POST /c/{slug}/posts` `{ spaceSlug, title?, body }` → `{ post: Post }`
- `POST /c/{slug}/comments` `{ postId, body, parentId? }` → `{ comment: Comment }`
- `POST /c/{slug}/reactions/toggle` `{ postId }` → `{ liked: boolean, likeCount: number }`
- `POST /c/{slug}/vote` `{ targetType: "post"|"comment", targetId, postId, dir: "UP"|"DOWN" }` → `{ score, myVote }`
- `POST /c/{slug}/events/{eventId}/rsvp` → `{ going: boolean, rsvpCount: number }`
- `POST /c/{slug}/lessons/{lessonId}/complete` → `{ completed: true, progress: { completed, total } }`
- `POST /c/{slug}/requests` `{ title, body }` → Request-Objekt
- `POST /c/{slug}/requests/{id}/vote` `{ dir }` → `{ score, myVote }`
- `POST /c/{slug}/booking/{slotId}/reserve` → `{ status: "CONFIRMED" }` — **nur freie Slots** (bezahlt → IAP-Flow)

### Chat & Live 🔒

```ts
Conversation { id, type:"GROUP"|"DIRECT", title, avatarUrl: string|null,
               lastMessage: { body, createdAt, author: Author }|null, spaceSlug: string|null }
ChatMessage { id, body, createdAt, author: Author, mine: boolean }
```

- `GET /c/{slug}/chat` → `{ conversations: Conversation[] }`
- `GET /c/{slug}/chat/{conversationId}?after={messageId}` → `{ messages: ChatMessage[] }` (Polling, aufsteigend)
- `POST /c/{slug}/chat/{conversationId}` `{ body }` → `{ message: ChatMessage }`
- `POST /c/{slug}/chat/direct` `{ userId }` → `{ conversation: Conversation }`
- `GET /c/{slug}/live/{sessionId}?after=` → `{ session, messages: ChatMessage[] }`
- `POST /c/{slug}/live/{sessionId}` `{ body }` → `{ message: ChatMessage }`

### Member-Bereich 🔒

- `GET /c/{slug}/leaderboard` → `{ top: [{ rank, member: MemberCard }], me: { rank: number|null, points, levelName }|null }`
- `GET /c/{slug}/members?cursor=` → `{ data: MemberCard[], nextCursor, inviteUrl: string|null }`
- `GET /c/{slug}/library` → `{ packages: [GalleryPackage owned], orders: Order[] }`
- `GET /c/{slug}/search?q=` → `{ posts: Post[], courses: [...], events: Event[], products: Product[], knowledge: [...] }` (je max 10, kompakte Shapes wie oben)
- `GET /c/{slug}/notifications` → `{ data: Notification[] }` — markiert **danach** alle als gelesen
- `GET /me/orders` → `{ data: Order[] }` (über alle Tenants, mit `communityName`)

### Apple In-App-Purchases

**Prinzip:** iOS kauft via StoreKit 2 → sendet die **JWS-signierte Transaktion** an den Server → Server verifiziert die Signaturkette (x5c gegen Apple Root CA, `lib/apple-iap.ts`), prüft `bundleId == APPLE_BUNDLE_ID` und Produkt-Mapping → vergibt Membership/Entitlement/Order **identisch zum Stripe-Webhook-Pfad**. Idempotent über `transactionId`.

- `POST /iap/validate` 🔒
  Body: `{ tenantSlug, jws, kind: "tier"|"product"|"post"|"media"|"media-item"|"tip"|"request"|"booking", refId, }`
  Antwort: `{ ok: true, viewer: Viewer }` bzw. 400 `iap_invalid` / `iap_product_mismatch`.
  - `kind:"tier"` → Membership ACTIVE + Subscription (mit `appleOriginalTransactionId`) + Entitlement `TIER` + Punkte + Referral, wie Stripe-`tier`.
  - Bei `kind:"tier"` ist `refId` optional (leer/fehlend erlaubt, z. B. Restore auf neuem Gerät): der Server leitet das Tier aus der `productId` der verifizierten Transaktion ab — explizites `MembershipTier.appleProductId`-Match, sonst Abo-Pool-Produkt → Tier mit exakt passendem `priceCents` + Intervall im Tenant; bei 0 oder >1 Treffern → 400 `iap_product_mismatch`. Für alle anderen kinds bleibt `refId` Pflicht.
  - andere kinds → `Order(PAID, appleTransactionId)` + `grantEntitlement(PURCHASE)` + typspezifische Effekte (Request→FULFILLED, Booking→CONFIRMED, Tip→PAID).
- `POST /iap/apple-notifications` — **kein** Bearer; App Store Server Notifications V2 (`{ signedPayload }`). Verifiziert JWS, verarbeitet `DID_RENEW`, `EXPIRED`, `DID_CHANGE_RENEWAL_STATUS`, `REFUND`, `GRACE_PERIOD_EXPIRED` → synct `Subscription.status`/Entitlement wie `customer.subscription.updated`/`charge.refunded`.

**Produkt-Mapping** (`lib/apple-products.ts`):
1. Explizit: `MembershipTier.appleProductId` / `Product.appleProductId` (neue nullable Spalten).
2. Preis-Pool-Fallback für One-Time-Unlocks (Posts, Medien, Requests, Booking): Konsumierbare Produkte `aera.unlock.{cents}` für cents ∈ {99, 199, 299, 499, 799, 999, 1499, 1999, 2999, 4999, 9999}; exakter Match, sonst `appleProductId: null`.
3. Tips: `aera.tip.{cents}` für cents ∈ {100, 300, 500, 1000, 2500, 5000}.
4. Abos-Pool: `aera.sub.month.{cents}` / `aera.sub.year.{cents}` für cents ∈ {299, 499, 799, 999, 1499, 1999, 2999, 4999} — nur wenn kein explizites Mapping.
5. `PHYSICAL`-Produkte: nie IAP (`appleProductId: null`), iOS zeigt „Auf der Website verfügbar" ohne Kauf-Button/Preis-Link.

**Schema-Migration** (`prisma/migrations/…_apple_iap/migration.sql` + schema.prisma):
`MembershipTier.appleProductId String?`, `Product.appleProductId String?`, `Order.appleTransactionId String? @unique`, `Subscription.appleOriginalTransactionId String? @unique`.

**Env:** `APPLE_BUNDLE_ID` (z.B. `so.aera.app`), optional `APPLE_IAP_ALLOW_SANDBOX=1`.

### Studio (Creator-Verwaltung) 🔒 Rolle ≥ ADMIN

Alle Routen unter `/api/mobile/v1/studio/**` verlangen Bearer-Auth **und** eine
Membership mit Rolle ≥ `ADMIN` im jeweiligen Tenant, sonst **403**
`not_authorized`. Einzige Ausnahme (wie die Web-Moderations-Guards):
`DELETE …/posts/{postId}` ist ab `MODERATOR` erlaubt. Unbekannter Slug →
**404** `not_found`. Rollenwechsel und das Bepreisen von Requests bleiben dem
Web-Dashboard vorbehalten.

```ts
StudioPost { id, title: string|null, body,            // Klartext, serverseitig auf 200 Zeichen gekürzt
             imageUrl: string|null, videoUrl: string|null,
             spaceSlug, spaceName, spaceType: SpaceType,
             publishedAt,                             // bei geplanten Posts = geplanter Go-live
             isScheduled: boolean,                    // true = wartet auf Cron /api/cron/posts
             isPinned: boolean, likeCount: number, commentCount: number }

StudioMember { userId, name, email, avatarUrl: string|null, role: Role,
               status: "ACTIVE"|"PENDING"|"BANNED", tierName: string|null,
               points: number, joinedAt }

// Request-Shape der Community-API + author.email; unlock ist im Studio immer
// null (Staff kauft nicht), myVote ist die eigene Stimme des Staff-Users.
StudioRequest { id, title, body, status: "OPEN"|"ACCEPTED"|"PRICED"|"FULFILLED"|"DECLINED",
                score, myVote: "UP"|"DOWN"|null, priceCents: number|null, unlock: null,
                author: { userId, name, email, avatarUrl: string|null, role: Role|null },
                createdAt }

StudioOrder { id, description, productName: string|null,
              customer: { name, email },
              amountCents, currency, status: "PENDING"|"PAID"|"REFUNDED"|"FAILED",
              fulfilled: boolean, requiresShipping: boolean,
              shippingDetails: { name: string|null,
                                 address: { line1, line2, city, state, postalCode,
                                            country }|null   // alle Felder string|null
                               }|null,                       // nur Name/Adresse, nie Telefon o.Ä.
              createdAt }
```

**Übersicht**

- `GET /studio` → `{ communities: [{ community: CommunityCard, role: "OWNER"|"ADMIN"|"MODERATOR", memberCount, pendingMembers, revenueCents30d }] }` — alle Tenants, in denen der User OWNER/ADMIN/MODERATOR ist (sortiert nach Beitritt). `memberCount` = aktive Mitglieder, `revenueCents30d` = Summe `Order(PAID, nicht erstattet)` der letzten 30 Tage. MODERATOR-Tenants erscheinen hier, dürfen aber nur die Moderations-Endpoints aufrufen.
- `GET /studio/{slug}/overview` → `{ stats: { members, activeMembers, pendingMembers, posts30d, comments30d, revenueCents30d, revenueCentsTotal, currency, subscribers }, recentActivity: [{ kind: "member_joined"|"comment"|"order"|"request", title, subtitle: string|null, createdAt }] }` — `members` = alle Memberships (inkl. PENDING/BANNED), `activeMembers`/`pendingMembers` nach Status; Umsatz = `Order(PAID, nicht erstattet)`; `subscribers` = aktive Subscriptions; `currency` = Währung der letzten bezahlten Order (Fallback `"eur"`). `recentActivity` max. 15 Einträge, absteigend nach `createdAt` (member_joined: title=Name, subtitle=Tier-Name|null · comment: title=Autor, subtitle=Text-Auszug · order: title=Beschreibung, subtitle=Käufer · request: title=Titel, subtitle=Autor).

**Posts**

- `GET /studio/{slug}/posts?filter=scheduled|published&cursor=&limit=` → `{ data: StudioPost[], nextCursor: string|null }` — `scheduled` = wartet auf den Cron (aufsteigend nach Go-live), `published` = live (absteigend nach `publishedAt`), ohne Filter alle Posts (absteigend).
- `POST /studio/{slug}/posts` `{ spaceSlug, title? (≤160), body (1–20000), imageUrl?, videoUrl?, publishedAt? }` → `StudioPost` — `publishedAt` als ISO-Datum **in der Zukunft** ⇒ geplanter Post (`isScheduled: true`, veröffentlicht vom bestehenden Cron `/api/cron/posts`); fehlend/vergangen ⇒ sofort live. Ungültiges Datum → 400 `validation`. Unbekannter `spaceSlug` → 404. `imageUrl`/`videoUrl` müssen **eigene** Upload-URLs sein (beginnend mit `/api/media/` oder `/uploads/`, typischerweise aus `POST /studio/{slug}/upload`) — sonst 400 `validation`.
- `DELETE /studio/{slug}/posts/{postId}` → `{ ok: true }` — Rolle ≥ **MODERATOR**; entfernt Post + Suchindex-Eintrag (wie Web-Moderation).
- `POST /studio/{slug}/posts/{postId}/pin` → `{ isPinned: boolean }` — Toggle.

**Upload**

- `POST /studio/{slug}/upload` — multipart `file` + `purpose` ∈ `"post-image" | "post-video" | "story"` → `{ url }` (relative Media-Proxy-URL, direkt in `imageUrl`/`videoUrl`/`mediaUrl` verwendbar).
  - Spiegelt den Web-Upload (`app/api/upload`): MIME-Allowlists (Bilder: jpeg/png/webp/gif/avif, max **5 MB**; Videos: mp4/webm/ogv/mov/mkv/m4v, max **512 MB**), Plan-Speicher-Quota, Storage-Key-Schema `tenants/{tenantId}/{purpose}/{uuid}.{ext}`, `StorageObject`-Eintrag.
  - Purpose-/Visibility-Mapping wie die Web-Purpose-Map: `post-image` → `feed-image` (PUBLIC, nur Bilder), `post-video` → `space-video` (MEMBERS — Media-Proxy gated, nur Videos), `story` → `story` (Bild) bzw. `story-video` (Video), beide PUBLIC.
  - Fehler: falscher/fehlender `purpose`/`file`/MIME-Typ/zu groß → 400 `validation`; Speicher-Quota erschöpft → **413** `storage_full`; Storage-Fehler → 500 `upload_failed`.

**Stories**

- `POST /studio/{slug}/stories` `{ mediaUrl, mediaType: "IMAGE"|"VIDEO", caption? (≤280) }` → `{ id, mediaUrl, mediaType, createdAt, expiresAt }` — Story-Item-Shape wie im `STORIES`-Space-Content der Community-API.
  - Persistenz exakt wie die Web-Dashboard-Action (`createStoryAction`): sofort live (`publishAt = now`), Ablauf nach **24 h** (`expiresAt = publishAt + 24h`); Sichtbarkeit ergibt sich wie im Web aus dem Ziel-Space.
  - Ziel-Space = **erster `STORIES`-Space** des Tenants; existiert keiner → **409** `no_stories_space`.
  - `mediaUrl` muss eine eigene Upload-URL sein (`/api/media/…` oder `/uploads/…`, aus `POST /studio/{slug}/upload` mit `purpose: "story"`) — sonst 400 `validation`.

**Mitglieder**

- `GET /studio/{slug}/members?status=&q=&cursor=&limit=` → `{ data: StudioMember[], nextCursor: string|null }` — `status` ∈ ACTIVE|PENDING|BANNED (optional), `q` sucht in Name/E-Mail (case-insensitive), aufsteigend nach `joinedAt`. Cursor = interne Membership-ID aus `nextCursor`.
- `POST /studio/{slug}/members/{userId}` `{ action: "approve"|"ban"|"unban" }` → `{ member: StudioMember }` — approve: PENDING→ACTIVE (sonst 400 `validation`), ban: →BANNED, unban: BANNED→ACTIVE (sonst 400). Guards wie im Web: OWNER nicht änderbar und eigene Membership tabu → je **403** `not_authorized`. Rollenwechsel gibt es mobil nicht.

**Requests (Wünsche)**

- `GET /studio/{slug}/requests?status=` → `{ data: StudioRequest[] }` — alle Requests inkl. DECLINED (max. 100), sortiert wie im Web (score desc, createdAt desc); `status` ∈ OPEN|ACCEPTED|PRICED|FULFILLED|DECLINED (optional).
- `POST /studio/{slug}/requests/{requestId}` `{ action: "accept"|"decline"|"fulfill" }` → `StudioRequest` (aktualisiert) — accept→ACCEPTED, decline→DECLINED, fulfill→FULFILLED. Bepreisen (PRICED) nur im Web.

**Bestellungen**

- `GET /studio/{slug}/orders?status=&cursor=&limit=` → `{ data: StudioOrder[], nextCursor: string|null }` — absteigend nach `createdAt`; `status` ∈ PENDING|PAID|REFUNDED|FAILED (optional). `requiresShipping` kommt vom Produkt; `shippingDetails` enthält ausschließlich Name + Adressfelder.
- `POST /studio/{slug}/orders/{orderId}/fulfill` → `{ fulfilled: true }` — markiert die Bestellung als erfüllt/versendet (idempotent, Status bleibt unverändert).

**Events**

- `POST /studio/{slug}/events` `{ spaceSlug?, title (2–120), description? (≤2000), startsAt (ISO), endsAt? (ISO), location? (≤160), isOnline?: boolean (Default false), meetingUrl? (URL), capacity?: number }` → `Event` (Shape wie Community-API; frisch angelegt: `rsvpCount: 0, myRsvp: false, accessible: true`). Space-Ermittlung wie im Web-Dashboard: expliziter EVENTS-Space per `spaceSlug` (unbekannt → 404), sonst erster EVENTS-Space, sonst wird automatisch ein „Events“-Space (MEMBERS) angelegt. Ungültige Daten → 400 `validation`.
- `DELETE /studio/{slug}/events/{eventId}` → `{ ok: true }` — entfernt Event + Suchindex-Eintrag.
