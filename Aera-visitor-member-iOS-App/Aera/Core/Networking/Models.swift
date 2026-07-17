import Foundation
import UIKit

// MARK: - Basis-Enums

enum Role: String, Codable, Hashable, Sendable {
    case owner = "OWNER"
    case admin = "ADMIN"
    case moderator = "MODERATOR"
    case member = "MEMBER"
}

enum MemberStatus: String, Decodable, Hashable, Sendable {
    case active = "ACTIVE"
    case pending = "PENDING"
    case banned = "BANNED"
}

enum SpaceVisibility: String, Decodable, Hashable, Sendable {
    case `public` = "PUBLIC"
    case members = "MEMBERS"
    case paid = "PAID"
}

enum VoteDirection: String, Codable, Hashable, Sendable {
    case up = "UP"
    case down = "DOWN"
}

/// Ziel einer Abstimmung (`POST /c/{slug}/vote`).
enum VoteTargetType: String, Encodable, Hashable, Sendable {
    case post
    case comment
}

enum TierInterval: String, Decodable, Hashable, Sendable {
    case free = "FREE"
    case month = "MONTH"
    case year = "YEAR"
    case oneTime = "ONE_TIME"
}

enum ProductType: String, Decodable, Hashable, Sendable {
    case digital = "DIGITAL"
    case physical = "PHYSICAL"
    case bundle = "BUNDLE"
    case courseAccess = "COURSE_ACCESS"
    case tierGrant = "TIER_GRANT"
}

enum OrderStatus: String, Decodable, Hashable, Sendable {
    case pending = "PENDING"
    case paid = "PAID"
    case refunded = "REFUNDED"
    case failed = "FAILED"
}

enum MediaType: String, Decodable, Hashable, Sendable {
    case image = "IMAGE"
    case video = "VIDEO"
}

enum CourseFormat: String, Decodable, Hashable, Sendable {
    case online = "ONLINE"
    case offline = "OFFLINE"
}

enum ConversationType: String, Decodable, Hashable, Sendable {
    case group = "GROUP"
    case direct = "DIRECT"
}

enum NotificationType: String, Decodable, Hashable, Sendable {
    case postComment = "POST_COMMENT"
    case commentReply = "COMMENT_REPLY"
    case reaction = "REACTION"
}

enum ForumTab: String, Decodable, Hashable, Sendable {
    case top
    case new
}

enum ReservationStatus: String, Decodable, Hashable, Sendable {
    case pending = "PENDING"
    case confirmed = "CONFIRMED"
}

// MARK: - SpaceType

/// Alle Space-Typen des Vertrags (`ADS` wird nie als Space geliefert).
enum SpaceType: String, Decodable, Hashable, Sendable, CaseIterable {
    case feed = "FEED"
    case forum = "FORUM"
    case blog = "BLOG"
    case videos = "VIDEOS"
    case podcast = "PODCAST"
    case gallery = "GALLERY"
    case course = "COURSE"
    case shop = "SHOP"
    case events = "EVENTS"
    case newsletter = "NEWSLETTER"
    case knowledge = "KNOWLEDGE"
    case links = "LINKS"
    case live = "LIVE"
    case chat = "CHAT"
    case requests = "REQUESTS"
    case booking = "BOOKING"
    case stories = "STORIES"
    case tips = "TIPS"
    case calendar = "CALENDAR"

    /// SF-Symbol-Mapping nach DESIGN.md §4.
    var symbolName: String {
        switch self {
        case .feed: "square.text.square"
        case .forum: "bubble.left.and.bubble.right"
        case .blog: "text.book.closed"
        case .videos: "play.rectangle"
        case .podcast: "waveform"
        case .gallery: "photo.on.rectangle.angled"
        case .course: "graduationcap"
        case .shop: "bag"
        case .events: "calendar"
        case .newsletter: "envelope.open"
        case .knowledge: "books.vertical"
        case .links: "link"
        case .live: "dot.radiowaves.left.and.right"
        case .chat: "message"
        case .requests: "lightbulb"
        case .booking: "clock.badge.checkmark"
        case .stories:
            UIImage(systemName: "circle.dashed.rectangle.portrait") != nil
                ? "circle.dashed.rectangle.portrait"
                : "rectangle.portrait.on.rectangle.portrait"
        case .tips: "heart"
        case .calendar: "calendar.day.timeline.left"
        }
    }
}

// MARK: - Unlock / IAP

/// Wie ein gesperrtes Objekt freigeschaltet wird.
struct Unlock: Decodable, Hashable, Sendable {
    enum Kind: String, Decodable, Hashable, Sendable {
        case post
        case media
        case mediaItem = "media-item"
        case product
        case request
        case booking
    }

    var priceCents: Int
    var currency: String
    /// `nil` → auf iOS nicht kaufbar (Hinweis „Auf der Website verfügbar" zeigen).
    var appleProductId: String?
    var kind: Kind
    var refId: String

    /// Zugehöriger `kind`-Wert für `POST /iap/validate`.
    var iapKind: IAPPurchaseKind {
        switch kind {
        case .post: .post
        case .media: .media
        case .mediaItem: .mediaItem
        case .product: .product
        case .request: .request
        case .booking: .booking
        }
    }
}

/// `kind`-Parameter für `POST /iap/validate`.
enum IAPPurchaseKind: String, Codable, Hashable, Sendable {
    case tier
    case product
    case post
    case media
    case mediaItem = "media-item"
    case tip
    case request
    case booking
}

// MARK: - Shared Shapes

struct User: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    var email: String
    var avatarUrl: String?
    var emailVerified: Bool
    var totpEnabled: Bool
}

struct CommunityCard: Decodable, Hashable, Sendable, Identifiable {
    var slug: String
    var name: String
    var tagline: String?
    var logoUrl: String?
    var coverUrl: String?
    /// Hex, z. B. `"#6d28d9"`.
    var primaryColor: String
    var accentColor: String
    var category: String?
    /// Anzeige-Label der Kategorie (z. B. "Kurse & Lernen"); `category` ist der Key.
    var categoryLabel: String?
    var memberCount: Int
    var isMember: Bool

    var id: String { slug }
}

/// `CommunityCard` + `description` (aus `GET /c/{slug}`).
struct CommunityDetail: Decodable, Hashable, Sendable, Identifiable {
    var slug: String
    var name: String
    var tagline: String?
    var logoUrl: String?
    var coverUrl: String?
    var primaryColor: String
    var accentColor: String
    var category: String?
    var memberCount: Int
    var isMember: Bool
    var description: String?

    var id: String { slug }

    var card: CommunityCard {
        CommunityCard(
            slug: slug, name: name, tagline: tagline, logoUrl: logoUrl,
            coverUrl: coverUrl, primaryColor: primaryColor, accentColor: accentColor,
            category: category, memberCount: memberCount, isMember: isMember
        )
    }
}

struct Viewer: Decodable, Hashable, Sendable {
    struct TierRef: Decodable, Hashable, Sendable {
        var id: String
        var name: String
        var slug: String
    }

    var isMember: Bool
    var role: Role?
    var isStaff: Bool
    var status: MemberStatus?
    var tier: TierRef?
    var points: Int
    var levelName: String?
    var hasPaidEntitlement: Bool
    var unreadNotifications: Int
}

struct SpaceSummary: Decodable, Hashable, Sendable, Identifiable {
    var slug: String
    var name: String
    var type: SpaceType
    var icon: String?
    var visibility: SpaceVisibility
    var accessible: Bool
    var sortOrder: Int

    var id: String { slug }
}

/// `SpaceSummary` + `description`/`settings` (aus `GET /c/{slug}/space/{spaceSlug}`).
struct SpaceDetail: Decodable, Hashable, Sendable, Identifiable {
    var slug: String
    var name: String
    var type: SpaceType
    var icon: String?
    var visibility: SpaceVisibility
    var accessible: Bool
    var sortOrder: Int
    var description: String?
    var settings: JSONValue?

    var id: String { slug }

    var summary: SpaceSummary {
        SpaceSummary(
            slug: slug, name: name, type: type, icon: icon,
            visibility: visibility, accessible: accessible, sortOrder: sortOrder
        )
    }
}

struct Author: Decodable, Hashable, Sendable, Identifiable {
    var userId: String
    var name: String
    var avatarUrl: String?
    var role: Role?

    var id: String { userId }
}

struct Post: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var spaceSlug: String
    var spaceType: SpaceType
    var title: String?
    var body: String?
    var bodyHtml: String?
    var imageUrl: String?
    var videoUrl: String?
    var teaserUrl: String?
    var isPinned: Bool
    var publishedAt: Date
    var author: Author
    var likeCount: Int
    var likedByMe: Bool
    var commentCount: Int
    var locked: Bool
    var unlock: Unlock?
    /// Nur FORUM, sonst `nil`.
    var score: Int?
    /// Nur FORUM, sonst `nil`.
    var myVote: VoteDirection?
    /// Nur BLOG: geschätzte Lesezeit in Minuten.
    var readingMinutes: Int?
}

struct Comment: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var postId: String
    var parentId: String?
    var body: String
    var createdAt: Date
    var author: Author
    var score: Int
    var myVote: VoteDirection?
    var children: [Comment]
}

struct Tier: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    var slug: String
    var description: String?
    /// `description` zeilenweise gesplittet.
    var benefits: [String]
    var coverUrl: String?
    var priceCents: Int
    var currency: String
    var interval: TierInterval
    var isRecommended: Bool
    var isDefault: Bool
    var memberCount: Int
    var appleProductId: String?
    var isCurrent: Bool
}

struct Product: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    var slug: String
    var description: String?
    var coverUrl: String?
    var images: [String]
    var priceCents: Int
    var currency: String
    var type: ProductType
    var requiresShipping: Bool
    var inStock: Bool
    var owned: Bool
    /// Nur wenn `owned`.
    var downloadUrl: String?
    /// `nil` bei PHYSICAL → kein IAP möglich.
    var appleProductId: String?
}

struct CourseProgress: Decodable, Hashable, Sendable {
    var completed: Int
    var total: Int
}

struct Course: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var slug: String
    var description: String?
    var coverUrl: String?
    var format: CourseFormat
    var videoUrl: String?
    var streamUrl: String?
    var location: String?
    var address: String?
    var startsAt: Date?
    var accessible: Bool
    var progress: CourseProgress
    var lessons: [Lesson]
}

struct Lesson: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var slug: String
    var content: String?
    var videoUrl: String?
    var durationSec: Int?
    var sortOrder: Int
    var isPreview: Bool
    var unlocked: Bool
    var daysUntilUnlock: Int?
    var completed: Bool
}

struct Event: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var slug: String
    var description: String?
    var coverUrl: String?
    var startsAt: Date
    var endsAt: Date?
    var location: String?
    var isOnline: Bool
    /// Nur für Mitglieder mit Zugriff.
    var meetingUrl: String?
    var capacity: Int?
    var rsvpCount: Int
    var myRsvp: Bool
    var accessible: Bool
}

/// Benachrichtigung (im Vertrag „Notification"; hier `AppNotification`,
/// um `Foundation.Notification` nicht zu verschatten).
struct AppNotification: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var type: NotificationType
    var message: String
    var href: String?
    var actor: Author?
    var createdAt: Date
    var readAt: Date?
}

struct MemberCard: Decodable, Hashable, Sendable, Identifiable {
    var userId: String
    var name: String
    var avatarUrl: String?
    var role: Role
    var tierName: String?
    var points: Int
    var levelName: String?
    var joinedAt: Date

    var id: String { userId }
}

struct Order: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var description: String
    var amountCents: Int
    var currency: String
    var status: OrderStatus
    var createdAt: Date
    var productName: String?
    var downloadUrl: String?
    /// Nur bei `GET /me/orders` (über alle Tenants).
    var communityName: String?
}

struct MembershipHome: Decodable, Hashable, Sendable, Identifiable {
    struct TierSummary: Decodable, Hashable, Sendable {
        var name: String
        var slug: String
        var priceCents: Int
        var interval: TierInterval
    }

    struct SubscriptionInfo: Decodable, Hashable, Sendable {
        var status: String
        var currentPeriodEnd: Date?
        var cancelAtPeriodEnd: Bool
        var isApple: Bool
    }

    var community: CommunityCard
    var tier: TierSummary?
    var role: Role
    var points: Int
    var levelName: String?
    var joinedAt: Date
    var subscription: SubscriptionInfo?

    var id: String { community.slug }
}

struct Conversation: Decodable, Hashable, Sendable, Identifiable {
    struct LastMessage: Decodable, Hashable, Sendable {
        var body: String
        var createdAt: Date
        var author: Author
    }

    var id: String
    var type: ConversationType
    var title: String
    var avatarUrl: String?
    var lastMessage: LastMessage?
    var spaceSlug: String?
}

struct ChatMessage: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var body: String
    var createdAt: Date
    var author: Author
    var mine: Bool
}

struct Announcement: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var message: String
    var bgColor: String
    var textColor: String
    var href: String?
}

// MARK: - JSONValue (untypisierte Space-Settings)

/// Untypisierter JSON-Wert (für `SpaceDetail.settings`).
enum JSONValue: Decodable, Hashable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Kein gültiger JSON-Wert."
            )
        }
    }

    subscript(key: String) -> JSONValue? {
        if case .object(let object) = self { return object[key] }
        return nil
    }

    var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    var doubleValue: Double? {
        if case .number(let value) = self { return value }
        return nil
    }

    var intValue: Int? {
        if case .number(let value) = self { return Int(value) }
        return nil
    }

    var boolValue: Bool? {
        if case .bool(let value) = self { return value }
        return nil
    }
}

// MARK: - Response-Envelopes

struct AuthResponse: Decodable, Sendable {
    var token: String
    var user: User
}

struct MeResponse: Decodable, Sendable {
    var user: User
    var memberships: [MembershipHome]
}

/// Discover-Kategorie: `key` für Filter-Queries, `label` für die Anzeige.
/// Decodiert tolerant: sowohl `{ "key": "kurse", "label": "Kurse & Lernen" }`
/// (aktuelles Backend) als auch nackte Strings `"kurse"` (älteres Backend).
struct DiscoverCategory: Decodable, Hashable, Sendable, Identifiable {
    var key: String
    var label: String

    var id: String { key }

    private enum CodingKeys: String, CodingKey {
        case key
        case label
    }

    init(from decoder: Decoder) throws {
        if let container = try? decoder.container(keyedBy: CodingKeys.self),
           let decodedKey = try? container.decode(String.self, forKey: .key) {
            key = decodedKey
            label = (try? container.decode(String.self, forKey: .label)) ?? decodedKey.capitalized
        } else {
            let raw = try decoder.singleValueContainer().decode(String.self)
            key = raw
            label = raw.capitalized
        }
    }
}

/// „Themen entdecken"-Kachel (Kategorie mit Community-Anzahl).
struct DiscoverTopic: Decodable, Hashable, Sendable, Identifiable {
    var key: String
    var label: String
    var count: Int

    var id: String { key }
}

/// „Top-Kreative"-Reihe je Kategorie.
struct DiscoverCreatorRow: Decodable, Hashable, Sendable, Identifiable {
    var key: String
    var label: String
    var communities: [CommunityCard]

    var id: String { key }
}

struct DiscoverResponse: Decodable, Hashable, Sendable {
    var categories: [DiscoverCategory]
    var myCommunities: [CommunityCard]
    var popular: [CommunityCard]
    var newest: [CommunityCard]
    // Optional: ältere Backends liefern diese Sektionen noch nicht.
    var topics: [DiscoverTopic]?
    var topCreators: [DiscoverCreatorRow]?
    /// `true`, wenn der eingeloggte Nutzer bereits eine Community besitzt
    /// (Creator-CTA ausblenden). Ohne Token bzw. bei älteren Backends `nil`/`false`.
    var ownsCommunity: Bool?
}

struct CommunityResponse: Decodable, Hashable, Sendable {
    var community: CommunityDetail
    var viewer: Viewer
    var spaces: [SpaceSummary]
    var announcement: Announcement?
}

struct SpaceResponse: Decodable, Sendable {
    var space: SpaceDetail
    var content: SpaceContent
}

/// Payload eines 403 (`not_member`/`payment_required`) von
/// `GET /c/{slug}/space/{spaceSlug}` — der Server liefert `space` trotzdem
/// für die Paywall-UI. Dekodierbar über `APIError.decodeDetails(GatedSpacePayload.self)`.
struct GatedSpacePayload: Decodable, Sendable {
    var space: SpaceDetail
}

struct PostDetailResponse: Decodable, Hashable, Sendable {
    var post: Post
    var comments: [Comment]
}

struct ReactionResponse: Decodable, Hashable, Sendable {
    var liked: Bool
    var likeCount: Int
}

struct VoteResponse: Decodable, Hashable, Sendable {
    var score: Int
    var myVote: VoteDirection?
}

struct RSVPResponse: Decodable, Hashable, Sendable {
    var going: Bool
    var rsvpCount: Int
}

struct LessonCompletionResponse: Decodable, Hashable, Sendable {
    var completed: Bool
    var progress: CourseProgress
}

struct LiveSessionResponse: Decodable, Hashable, Sendable {
    var session: LiveSession
    var messages: [ChatMessage]
}

struct LeaderboardResponse: Decodable, Hashable, Sendable {
    struct Entry: Decodable, Hashable, Sendable, Identifiable {
        var rank: Int
        var member: MemberCard

        var id: String { member.userId }
    }

    struct MyRank: Decodable, Hashable, Sendable {
        var rank: Int?
        var points: Int
        var levelName: String?
    }

    var top: [Entry]
    var me: MyRank?
}

struct MembersResponse: Decodable, Hashable, Sendable {
    var data: [MemberCard]
    var nextCursor: String?
    var inviteUrl: String?
}

struct LibraryResponse: Decodable, Hashable, Sendable {
    var packages: [GalleryPackage]
    var orders: [Order]
}

struct CommunitySearchResponse: Decodable, Hashable, Sendable {
    var posts: [Post]
    var courses: [Course]
    var events: [Event]
    var products: [Product]
    var knowledge: [KnowledgeArticle]
}

struct IAPValidateResponse: Decodable, Hashable, Sendable {
    var ok: Bool
    var viewer: Viewer
}

/// Generische Listenantwort `{ data, nextCursor? }`.
struct DataResponse<Item: Decodable>: Decodable {
    var data: [Item]
    var nextCursor: String?
}

// MARK: - Studio (Creator-Verwaltung)

/// Eintrag aus `GET /studio`: Community mit Staff-Rolle und Kennzahlen.
struct StudioCommunity: Decodable, Hashable, Sendable, Identifiable {
    var community: CommunityCard
    var role: Role
    /// Aktive Mitglieder.
    var memberCount: Int
    var pendingMembers: Int
    /// Summe `Order(PAID, nicht erstattet)` der letzten 30 Tage.
    var revenueCents30d: Int

    var id: String { community.slug }
}

/// Kennzahlen aus `GET /studio/{slug}/overview`.
struct StudioStats: Decodable, Hashable, Sendable {
    /// Alle Memberships (inkl. PENDING/BANNED).
    var members: Int
    var activeMembers: Int
    var pendingMembers: Int
    var posts30d: Int
    var comments30d: Int
    var revenueCents30d: Int
    var revenueCentsTotal: Int
    /// Währung der letzten bezahlten Order (Fallback `"eur"`).
    var currency: String
    /// Aktive Subscriptions.
    var subscribers: Int
}

/// Eintrag in `recentActivity` (max. 15, absteigend nach `createdAt`).
struct StudioActivity: Decodable, Hashable, Sendable {
    enum Kind: String, Decodable, Hashable, Sendable {
        case memberJoined = "member_joined"
        case comment
        case order
        case request
    }

    var kind: Kind
    var title: String
    var subtitle: String?
    var createdAt: Date
}

struct StudioOverview: Decodable, Hashable, Sendable {
    var stats: StudioStats
    var recentActivity: [StudioActivity]
}

/// Beitrag in der Studio-Verwaltung (`GET /studio/{slug}/posts`).
struct StudioPost: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String?
    /// Klartext, serverseitig auf 200 Zeichen gekürzt.
    var body: String
    var spaceSlug: String
    var spaceName: String
    var spaceType: SpaceType
    /// Bei geplanten Posts der geplante Go-live.
    var publishedAt: Date
    /// `true` = wartet auf den Cron (`/api/cron/posts`).
    var isScheduled: Bool
    var isPinned: Bool
    var likeCount: Int
    var commentCount: Int
}

/// Filter für `GET /studio/{slug}/posts`.
enum StudioPostFilter: String, Hashable, Sendable {
    case scheduled
    case published
}

/// Mitglied in der Verwaltungssicht (inkl. E-Mail und Status).
struct StudioMember: Decodable, Hashable, Sendable, Identifiable {
    var userId: String
    var name: String
    var email: String
    var avatarUrl: String?
    var role: Role
    var status: MemberStatus
    var tierName: String?
    var points: Int
    var joinedAt: Date

    var id: String { userId }
}

/// Aktion für `POST /studio/{slug}/members/{userId}`.
enum StudioMemberAction: String, Encodable, Hashable, Sendable {
    case approve
    case ban
    case unban
}

/// Request-Shape der Community-API + `author.email`; `unlock` ist im Studio
/// immer `null` und wird deshalb nicht dekodiert.
struct StudioRequest: Decodable, Hashable, Sendable, Identifiable {
    struct RequestAuthor: Decodable, Hashable, Sendable {
        var userId: String
        var name: String
        var email: String
        var avatarUrl: String?
        var role: Role?
    }

    var id: String
    var title: String
    var body: String
    var status: RequestStatus
    var score: Int
    /// Eigene Stimme des Staff-Users.
    var myVote: VoteDirection?
    var priceCents: Int?
    var author: RequestAuthor
    var createdAt: Date
}

/// Aktion für `POST /studio/{slug}/requests/{requestId}`.
/// Bepreisen (PRICED) bleibt dem Web-Dashboard vorbehalten.
enum StudioRequestAction: String, Encodable, Hashable, Sendable {
    case accept
    case decline
    case fulfill
}

/// Verkauf des Tenants (`GET /studio/{slug}/orders`).
struct StudioOrder: Decodable, Hashable, Sendable, Identifiable {
    struct Customer: Decodable, Hashable, Sendable {
        var name: String
        var email: String
    }

    /// Nur Name + Adresse (sanitisiertes Stripe-`shipping_details`).
    struct ShippingDetails: Decodable, Hashable, Sendable {
        struct Address: Decodable, Hashable, Sendable {
            var line1: String?
            var line2: String?
            var city: String?
            var state: String?
            var postalCode: String?
            var country: String?
        }

        var name: String?
        var address: Address?
    }

    var id: String
    var description: String
    var productName: String?
    var customer: Customer
    var amountCents: Int
    var currency: String
    var status: OrderStatus
    var fulfilled: Bool
    var requiresShipping: Bool
    var shippingDetails: ShippingDetails?
    var createdAt: Date
}

struct StudioCommunitiesResponse: Decodable, Sendable {
    var communities: [StudioCommunity]
}
