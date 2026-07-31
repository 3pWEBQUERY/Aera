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
///
/// Unbekannte Werte fallen auf `.unknown` zurück, statt den Decode zu
/// werfen: ein neuer Space-Typ auf dem Server darf niemals die ganze
/// Community-Antwort unlesbar machen. `SpaceContent` hält es mit
/// `.unsupported` genauso.
enum SpaceType: String, Decodable, Hashable, Sendable, CaseIterable {
    case feed = "FEED"
    case forum = "FORUM"
    case blog = "BLOG"
    case videos = "VIDEOS"
    case podcast = "PODCAST"
    case music = "MUSIC"
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
    /// Vom Server geliefert, dieser App-Version aber unbekannt.
    case unknown = "__unknown__"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = SpaceType(rawValue: raw) ?? .unknown
    }

    /// Anzeige-Name des Space-Typs (z. B. für die Space-Pill im Home-Feed).
    var displayName: String {
        switch self {
        case .feed: String(localized: "Feed")
        case .forum: String(localized: "Forum")
        case .blog: String(localized: "Blog")
        case .videos: String(localized: "Videos")
        case .podcast: String(localized: "Podcast")
        case .music: String(localized: "Musik")
        case .gallery: String(localized: "Galerie")
        case .course: String(localized: "Kurse")
        case .shop: String(localized: "Shop")
        case .events: String(localized: "Events")
        case .newsletter: String(localized: "Newsletter")
        case .knowledge: String(localized: "Wissen")
        case .links: String(localized: "Links")
        case .live: String(localized: "Live")
        case .chat: String(localized: "Chat")
        case .requests: String(localized: "Wünsche")
        case .booking: String(localized: "Termine")
        case .stories: String(localized: "Stories")
        case .tips: String(localized: "Unterstützen")
        case .calendar: String(localized: "Kalender")
        case .unknown: String(localized: "Bereich")
        }
    }

    /// SF-Symbol-Mapping nach DESIGN.md §4.
    var symbolName: String {
        switch self {
        case .feed: "square.text.square"
        case .forum: "bubble.left.and.bubble.right"
        case .blog: "text.book.closed"
        case .videos: "play.rectangle"
        case .podcast: "waveform"
        case .music: "music.note"
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
        case .unknown: "sparkles"
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

/// Art der Sperre. „members" verlangt eine Mitgliedschaft — das Titelbild
/// bleibt als Werbung sichtbar. „paid" wird einzeln verkauft; dort geht nur
/// das eigens gepflegte Vorschaubild mit.
enum PostLockKind: String, Decodable, Hashable, Sendable {
    case none
    case members
    case paid
}

struct Post: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var spaceSlug: String
    var spaceType: SpaceType
    var title: String?
    var body: String?
    var bodyHtml: String?
    var imageUrl: String?
    /// Alle Bilder des Beitrags; `imageUrl` ist das erste davon.
    var imageUrls: [String]
    var videoUrl: String?
    var teaserUrl: String?
    /// Titelplatte (Blog) samt Bildausschnitt.
    var coverUrl: String?
    var coverFocusX: Double
    var coverFocusY: Double
    var coverZoom: Double
    var isPinned: Bool
    var publishedAt: Date
    var author: Author
    var likeCount: Int
    var likedByMe: Bool
    var commentCount: Int
    var locked: Bool
    var lockKind: PostLockKind
    /// Bild, das bei gesperrten Beiträgen gezeigt (und verwischt) werden darf.
    var lockedPreviewUrl: String?
    var priceCents: Int
    var currency: String
    var unlock: Unlock?
    /// Nur FORUM, sonst `nil`.
    var score: Int?
    /// Nur FORUM, sonst `nil`.
    var myVote: VoteDirection?
    /// Nur BLOG: geschätzte Lesezeit in Minuten.
    var readingMinutes: Int?
    /// Umfrage am Beitrag — nur in der Einzelansicht gefüllt.
    var poll: Poll?
    var hideComments: Bool
    var closeComments: Bool
    var hideLikes: Bool

    private enum CodingKeys: String, CodingKey {
        case id, spaceSlug, spaceType, title, body, bodyHtml, imageUrl, imageUrls
        case videoUrl, teaserUrl, coverUrl, coverFocusX, coverFocusY, coverZoom
        case isPinned, publishedAt, author, likeCount, likedByMe, commentCount
        case locked, lockKind, lockedPreviewUrl, priceCents, currency, unlock
        case score, myVote, readingMinutes, poll
        case hideComments, closeComments, hideLikes
    }

    /// Die Felder jenseits des alten Vertrags werden weich dekodiert: eine
    /// App-Version, die vor dem passenden Server erscheint, soll trotzdem
    /// Beiträge zeigen können.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        spaceSlug = try c.decode(String.self, forKey: .spaceSlug)
        spaceType = try c.decode(SpaceType.self, forKey: .spaceType)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        body = try c.decodeIfPresent(String.self, forKey: .body)
        bodyHtml = try c.decodeIfPresent(String.self, forKey: .bodyHtml)
        imageUrl = try c.decodeIfPresent(String.self, forKey: .imageUrl)
        let urls = try c.decodeIfPresent([String].self, forKey: .imageUrls)
        imageUrls = urls ?? [imageUrl].compactMap { $0 }
        videoUrl = try c.decodeIfPresent(String.self, forKey: .videoUrl)
        teaserUrl = try c.decodeIfPresent(String.self, forKey: .teaserUrl)
        coverUrl = try c.decodeIfPresent(String.self, forKey: .coverUrl)
        coverFocusX = try c.decodeIfPresent(Double.self, forKey: .coverFocusX) ?? 50
        coverFocusY = try c.decodeIfPresent(Double.self, forKey: .coverFocusY) ?? 50
        coverZoom = try c.decodeIfPresent(Double.self, forKey: .coverZoom) ?? 100
        isPinned = try c.decode(Bool.self, forKey: .isPinned)
        publishedAt = try c.decode(Date.self, forKey: .publishedAt)
        author = try c.decode(Author.self, forKey: .author)
        likeCount = try c.decode(Int.self, forKey: .likeCount)
        likedByMe = try c.decode(Bool.self, forKey: .likedByMe)
        commentCount = try c.decode(Int.self, forKey: .commentCount)
        locked = try c.decode(Bool.self, forKey: .locked)
        priceCents = try c.decodeIfPresent(Int.self, forKey: .priceCents) ?? 0
        currency = try c.decodeIfPresent(String.self, forKey: .currency) ?? "chf"
        unlock = try c.decodeIfPresent(Unlock.self, forKey: .unlock)
        lockKind = try c.decodeIfPresent(PostLockKind.self, forKey: .lockKind)
            ?? (locked ? (priceCents > 0 ? .paid : .members) : PostLockKind.none)
        lockedPreviewUrl = try c.decodeIfPresent(String.self, forKey: .lockedPreviewUrl)
            ?? (locked ? teaserUrl : nil)
        score = try c.decodeIfPresent(Int.self, forKey: .score)
        myVote = try c.decodeIfPresent(VoteDirection.self, forKey: .myVote)
        readingMinutes = try c.decodeIfPresent(Int.self, forKey: .readingMinutes)
        poll = try c.decodeIfPresent(Poll.self, forKey: .poll)
        hideComments = try c.decodeIfPresent(Bool.self, forKey: .hideComments) ?? false
        closeComments = try c.decodeIfPresent(Bool.self, forKey: .closeComments) ?? false
        hideLikes = try c.decodeIfPresent(Bool.self, forKey: .hideLikes) ?? false
    }
}

/// Umfrage an einem Beitrag.
struct Poll: Decodable, Hashable, Sendable {
    var question: String
    /// Mehrfachauswahl erlaubt.
    var multiple: Bool
    var totalVotes: Int
    var options: [PollOption]
    var myVotes: [Int]

    var hasVoted: Bool { !myVotes.isEmpty }

    /// Anteil einer Option an allen Stimmen (0…1).
    func share(of option: PollOption) -> Double {
        guard totalVotes > 0 else { return 0 }
        return Double(option.votes) / Double(totalVotes)
    }
}

struct PollOption: Decodable, Hashable, Sendable, Identifiable {
    var index: Int
    var label: String
    var votes: Int

    var id: Int { index }
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
    var likeCount: Int
    var likedByMe: Bool
    var children: [Comment]

    private enum CodingKeys: String, CodingKey {
        case id, postId, parentId, body, createdAt, author, score, myVote
        case likeCount, likedByMe, children
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        postId = try c.decode(String.self, forKey: .postId)
        parentId = try c.decodeIfPresent(String.self, forKey: .parentId)
        body = try c.decode(String.self, forKey: .body)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        author = try c.decode(Author.self, forKey: .author)
        score = try c.decode(Int.self, forKey: .score)
        myVote = try c.decodeIfPresent(VoteDirection.self, forKey: .myVote)
        likeCount = try c.decodeIfPresent(Int.self, forKey: .likeCount) ?? 0
        likedByMe = try c.decodeIfPresent(Bool.self, forKey: .likedByMe) ?? false
        children = try c.decodeIfPresent([Comment].self, forKey: .children) ?? []
    }
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
    /// Vergebene Auszeichnungen, neueste zuerst.
    var badges: [Badge]

    var id: String { userId }

    private enum CodingKeys: String, CodingKey {
        case userId, name, avatarUrl, role, tierName, points, levelName, joinedAt, badges
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = try c.decode(String.self, forKey: .userId)
        name = try c.decode(String.self, forKey: .name)
        avatarUrl = try c.decodeIfPresent(String.self, forKey: .avatarUrl)
        role = try c.decode(Role.self, forKey: .role)
        tierName = try c.decodeIfPresent(String.self, forKey: .tierName)
        points = try c.decode(Int.self, forKey: .points)
        levelName = try c.decodeIfPresent(String.self, forKey: .levelName)
        joinedAt = try c.decode(Date.self, forKey: .joinedAt)
        badges = try c.decodeIfPresent([Badge].self, forKey: .badges) ?? []
    }
}

// MARK: - Auszeichnungen

/// Eine vergebene Auszeichnung. Form, Stufe und Symbol beschreiben, wie die
/// Plakette gezeichnet wird — es gibt bewusst keine Bilddatei dazu.
struct Badge: Decodable, Hashable, Sendable, Identifiable {
    enum Shape: String, Decodable, Hashable, Sendable {
        case coin = "COIN"
        case medal = "MEDAL"
        case hex = "HEX"
        case seal = "SEAL"

        init(from decoder: Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            self = Shape(rawValue: raw) ?? .coin
        }
    }

    enum Tier: String, Decodable, Hashable, Sendable {
        case gold = "GOLD"
        case silver = "SILVER"
        case bronze = "BRONZE"
        case brand = "BRAND"
        case ink = "INK"

        init(from decoder: Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            self = Tier(rawValue: raw) ?? .brand
        }
    }

    var id: String
    var name: String
    var description: String?
    var shape: Shape
    var tier: Tier
    /// Symbolname aus dem Web-Icon-Satz; die App bildet ihn auf SF Symbols ab.
    var icon: String
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
        /// Währung der Abrechnung; ältere Server liefern sie nicht mit.
        var currency: String?
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

/// Eintrag des aggregierten Home-Feeds (`GET /home`): Post + Community-Karte.
struct HomeItem: Decodable, Hashable, Sendable, Identifiable {
    var community: CommunityCard
    var post: Post

    var id: String { post.id }
}

/// `tab`-Parameter für `GET /home`.
enum HomeFeedTab: String, Hashable, Sendable, CaseIterable {
    case home
    case members
}

struct HomeFeedResponse: Decodable, Sendable {
    var data: [HomeItem]
    var nextCursor: String?
}

/// Antwort von `GET /explore` (Patreon-artige Entdecken-Seite).
struct ExploreResponse: Decodable, Hashable, Sendable {
    /// Kategorien sortiert nach Community-Anzahl (max. 8).
    var trending: [DiscoverCategory]
    /// Personalisiert (Kategorien der eigenen Mitgliedschaften), sonst beliebteste.
    var forYou: [CommunityCard]
    /// Meiste neue Mitglieder der letzten 7 Tage, per `memberCount` aufgefüllt.
    var popularWeek: [CommunityCard]
}

struct CommunityResponse: Decodable, Hashable, Sendable {
    var community: CommunityDetail
    var viewer: Viewer
    var spaces: [SpaceSummary]
    /// Kopfzeilen-Stil und Menüzeile aus dem Layout-Editor des Creators.
    var header: CommunityHeader?
    var announcement: Announcement?
}

/// Ausführung der Kopfzeile — dieselben fünf Zustände wie im Web.
enum HeaderVariant: String, Decodable, Hashable, Sendable {
    case editorial = "EDITORIAL"
    case mosaic = "MOSAIC"
    case spotlight = "SPOTLIGHT"
    case immersive = "IMMERSIVE"
    case compact = "COMPACT"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = HeaderVariant(rawValue: raw) ?? .editorial
    }
}

struct CommunityHeader: Decodable, Hashable, Sendable {
    var variant: HeaderVariant
    /// Bilder des Mosaik-Kopfbereichs, in dieser Reihenfolge.
    var mosaic: [String]
    var socials: [SocialLink]
    var menu: HeroMenu

    private enum CodingKeys: String, CodingKey {
        case variant, mosaic, socials, menu
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        variant = try c.decodeIfPresent(HeaderVariant.self, forKey: .variant) ?? .editorial
        mosaic = try c.decodeIfPresent([String].self, forKey: .mosaic) ?? []
        socials = try c.decodeIfPresent([SocialLink].self, forKey: .socials) ?? []
        menu = try c.decodeIfPresent(HeroMenu.self, forKey: .menu)
            ?? HeroMenu(bar: [], more: [], moreLabel: nil)
    }
}

struct SocialLink: Decodable, Hashable, Sendable, Identifiable {
    var platform: String
    var url: String

    var id: String { url }
}

/// Die vom Creator zusammengestellte Menüzeile. Der Server liefert sie
/// bereits auf diesen Betrachter aufgelöst.
struct HeroMenu: Decodable, Hashable, Sendable {
    var bar: [HeroMenuItem]
    var more: [HeroMenuItem]
    /// Eigene Beschriftung des „…"-Knopfs, sonst `nil`.
    var moreLabel: String?

    var isEmpty: Bool { bar.isEmpty && more.isEmpty }
}

enum HeroMenuType: String, Decodable, Hashable, Sendable {
    case space = "SPACE"
    case home = "HOME"
    case members = "MEMBERS"
    case leaderboard = "LEADERBOARD"
    case library = "LIBRARY"
    case live = "LIVE"
    case search = "SEARCH"
    case join = "JOIN"
    case tips = "TIPS"
    case share = "SHARE"
    case link = "LINK"
    /// Vom Server geliefert, dieser App-Version aber unbekannt.
    case unknown = "__unknown__"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = HeroMenuType(rawValue: raw) ?? .unknown
    }

    /// Standardbeschriftung, wenn der Creator keine eigene gesetzt hat.
    var defaultLabel: String {
        switch self {
        case .space: String(localized: "Bereich")
        case .home: String(localized: "Startseite")
        case .members: String(localized: "Mitglieder")
        case .leaderboard: String(localized: "Rangliste")
        case .library: String(localized: "Bibliothek")
        case .live: String(localized: "Live")
        case .search: String(localized: "Suche")
        case .join: String(localized: "Mitglied werden")
        case .tips: String(localized: "Unterstützen")
        case .share: String(localized: "Teilen")
        case .link: String(localized: "Link")
        case .unknown: String(localized: "Mehr")
        }
    }

    var symbolName: String {
        switch self {
        case .space: "square.grid.2x2"
        case .home: "house"
        case .members: "person.2"
        case .leaderboard: "trophy"
        case .library: "books.vertical"
        case .live: "dot.radiowaves.left.and.right"
        case .search: "magnifyingglass"
        case .join: "sparkles"
        case .tips: "heart"
        case .share: "square.and.arrow.up"
        case .link: "arrow.up.right"
        case .unknown: "ellipsis"
        }
    }
}

enum HeroMenuStyle: String, Decodable, Hashable, Sendable {
    case solid = "SOLID"
    case outline = "OUTLINE"
    case plain = "PLAIN"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = HeroMenuStyle(rawValue: raw) ?? .plain
    }
}

struct HeroMenuItem: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    /// Eigene Beschriftung des Creators, sonst `nil`.
    var label: String?
    var type: HeroMenuType
    var style: HeroMenuStyle
    /// Nur bei `space` und `tips`.
    var spaceSlug: String?
    /// Nur bei `link`.
    var url: String?

    var title: String { label?.isEmpty == false ? label! : type.defaultLabel }
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
    /// Weitere Beiträge desselben Space: die neuesten und die beliebtesten.
    /// Sie stehen unter den Kommentaren — wer bis dahin gelesen hat, ist mit
    /// dem Beitrag fertig.
    var related: [Post]
    var popular: [Post]

    private enum CodingKeys: String, CodingKey {
        case post, comments, related, popular
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        post = try c.decode(Post.self, forKey: .post)
        comments = try c.decodeIfPresent([Comment].self, forKey: .comments) ?? []
        related = try c.decodeIfPresent([Post].self, forKey: .related) ?? []
        popular = try c.decodeIfPresent([Post].self, forKey: .popular) ?? []
    }
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
    var imageUrl: String?
    var videoUrl: String?
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

/// `purpose`-Parameter für `POST /studio/{slug}/upload`.
enum StudioUploadPurpose: String, Hashable, Sendable {
    /// Post-Bild (PUBLIC, nur Bilder, max. 5 MB).
    case postImage = "post-image"
    /// Post-Video (MEMBERS — Media-Proxy gated, nur Videos, max. 512 MB).
    case postVideo = "post-video"
    /// Story-Medium (Bild oder Video, PUBLIC).
    case story
}

// MARK: - Studio: Live

/// Live-Session aus Sicht des Creators (`GET /studio/{slug}/live`).
struct StudioLiveSession: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var status: LiveSessionStatus
    var source: LiveSource
    var spaceSlug: String?
    var startsAt: Date?
    var endedAt: Date?
    /// Nur eigene Streams aus dem Gerät lassen sich aus der App senden.
    var canBroadcast: Bool
    /// Adresse der Studio-Bühne im WebView.
    var studioUrl: String
}

struct StudioLiveOverview: Decodable, Hashable, Sendable {
    struct SpaceRef: Decodable, Hashable, Sendable, Identifiable {
        var slug: String
        var name: String

        var id: String { slug }
    }

    var spaces: [SpaceRef]
    var sessions: [StudioLiveSession]
    /// Ist Cloudflare Stream für die Plattform eingerichtet?
    var streamEnabled: Bool
}

/// Antwort von `POST /studio/{slug}/stories` (Story-Item-Shape wie im
/// STORIES-Space-Content).
struct StudioStory: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var mediaUrl: String
    var mediaType: MediaType
    var caption: String?
    var createdAt: Date
    /// `nil` = dauerhafte Story, sie läuft nie ab.
    var expiresAt: Date?
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
