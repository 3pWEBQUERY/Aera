import Foundation

// MARK: - Content-Union

/// Tagged Union über `space.type` (Discriminator: `kind`).
/// Unbekannte `kind`-Werte werden als `.unsupported` dekodiert,
/// damit neue Server-Features alte App-Versionen nicht brechen.
enum SpaceContent: Decodable, Sendable {
    case posts(PostsContent)          // FEED | VIDEOS | PODCAST
    case forum(ForumContent)
    case blog(BlogContent)
    case gallery(GalleryContent)
    case courses(CoursesContent)
    case shop(ShopContent)
    case events(EventsContent)
    case newsletter(NewsletterContent)
    case knowledge(KnowledgeContent)
    case links(LinksContent)
    case live(LiveContent)
    case chat(ChatContent)
    case requests(RequestsContent)
    case booking(BookingContent)
    case stories(StoriesContent)
    case tips(TipsContent)
    case calendar(CalendarContent)
    case unsupported(kind: String)

    private enum CodingKeys: String, CodingKey {
        case kind
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(String.self, forKey: .kind)
        switch kind {
        case "posts": self = .posts(try PostsContent(from: decoder))
        case "forum": self = .forum(try ForumContent(from: decoder))
        case "blog": self = .blog(try BlogContent(from: decoder))
        case "gallery": self = .gallery(try GalleryContent(from: decoder))
        case "courses": self = .courses(try CoursesContent(from: decoder))
        case "shop": self = .shop(try ShopContent(from: decoder))
        case "events": self = .events(try EventsContent(from: decoder))
        case "newsletter": self = .newsletter(try NewsletterContent(from: decoder))
        case "knowledge": self = .knowledge(try KnowledgeContent(from: decoder))
        case "links": self = .links(try LinksContent(from: decoder))
        case "live": self = .live(try LiveContent(from: decoder))
        case "chat": self = .chat(try ChatContent(from: decoder))
        case "requests": self = .requests(try RequestsContent(from: decoder))
        case "booking": self = .booking(try BookingContent(from: decoder))
        case "stories": self = .stories(try StoriesContent(from: decoder))
        case "tips": self = .tips(try TipsContent(from: decoder))
        case "calendar": self = .calendar(try CalendarContent(from: decoder))
        default: self = .unsupported(kind: kind)
        }
    }
}

// MARK: - Content-Payloads

/// FEED | VIDEOS | PODCAST
struct PostsContent: Decodable, Hashable, Sendable {
    var posts: [Post]
    var canPost: Bool
    var nextCursor: String?
}

struct ForumContent: Decodable, Hashable, Sendable {
    var posts: [Post]
    var canPost: Bool
    var tab: ForumTab
    var nextCursor: String?
}

struct BlogContent: Decodable, Hashable, Sendable {
    var posts: [Post]
    var page: Int
    var totalPages: Int
}

struct GalleryContent: Decodable, Hashable, Sendable {
    var packages: [GalleryPackage]
}

struct GalleryPackage: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var description: String?
    var coverUrl: String?
    var priceCents: Int
    var currency: String
    var owned: Bool
    var availableUntil: Date?
    var unlock: Unlock?
    var items: [GalleryItem]
}

struct GalleryItem: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var type: MediaType
    var url: String?
    var thumbUrl: String?
    var locked: Bool
    var isPreview: Bool
    var unlock: Unlock?
}

struct CoursesContent: Decodable, Hashable, Sendable {
    var courses: [Course]
}

struct ShopContent: Decodable, Hashable, Sendable {
    var products: [Product]
}

struct EventsContent: Decodable, Hashable, Sendable {
    var upcoming: [Event]
    var past: [Event]
}

struct NewsletterContent: Decodable, Hashable, Sendable {
    var campaigns: [NewsletterCampaign]
}

struct NewsletterCampaign: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var subject: String
    var preheader: String?
    var bodyHtml: String
    var sentAt: Date
}

struct KnowledgeContent: Decodable, Hashable, Sendable {
    var articles: [KnowledgeArticle]
}

struct KnowledgeArticle: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var slug: String
    var excerpt: String
    var bodyHtml: String?
    var locked: Bool
    var updatedAt: Date
}

struct LinksContent: Decodable, Hashable, Sendable {
    var links: [LinkItem]
}

struct LinkItem: Decodable, Hashable, Sendable, Identifiable {
    var label: String
    var url: String
    var description: String?

    var id: String { url }
}

struct LiveContent: Decodable, Hashable, Sendable {
    var sessions: [LiveSession]
}

enum LiveSessionStatus: String, Decodable, Hashable, Sendable {
    case scheduled = "SCHEDULED"
    case live = "LIVE"
    case ended = "ENDED"
}

struct LiveSession: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var description: String?
    var status: LiveSessionStatus
    var scheduledAt: Date?
    var streamUrl: String?
    var replayUrl: String?
    var accessible: Bool
}

struct ChatContent: Decodable, Hashable, Sendable {
    var conversations: [Conversation]
}

struct RequestsContent: Decodable, Hashable, Sendable {
    var requests: [MemberRequest]
    var canCreate: Bool
}

enum RequestStatus: String, Decodable, Hashable, Sendable {
    case open = "OPEN"
    case accepted = "ACCEPTED"
    case priced = "PRICED"
    case fulfilled = "FULFILLED"
    case declined = "DECLINED"
}

struct MemberRequest: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var body: String
    var status: RequestStatus
    var score: Int
    var myVote: VoteDirection?
    var priceCents: Int?
    var unlock: Unlock?
    var author: Author
    var createdAt: Date
}

struct BookingContent: Decodable, Hashable, Sendable {
    var slots: [BookingSlot]
}

struct BookingSlot: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var description: String?
    var startsAt: Date
    var durationMin: Int
    var capacity: Int
    var spotsLeft: Int
    var priceCents: Int
    var currency: String
    var unlock: Unlock?
    var myReservation: ReservationStatus?
}

struct StoriesContent: Decodable, Hashable, Sendable {
    var groups: [StoryGroup]
}

struct StoryGroup: Decodable, Hashable, Sendable, Identifiable {
    var author: Author
    var stories: [Story]

    var id: String { author.userId }
}

struct Story: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var mediaUrl: String
    var mediaType: MediaType
    var createdAt: Date
    var expiresAt: Date
}

struct TipsContent: Decodable, Hashable, Sendable {
    var goal: TipGoal?
    var presets: [TipPreset]
    var tips: [Tip]
}

struct TipGoal: Decodable, Hashable, Sendable {
    var title: String
    var targetCents: Int
    var raisedCents: Int
}

struct TipPreset: Decodable, Hashable, Sendable, Identifiable {
    var amountCents: Int
    var appleProductId: String?

    var id: Int { amountCents }
}

struct Tip: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var amountCents: Int
    var message: String?
    var author: Author?
    var createdAt: Date
}

struct CalendarContent: Decodable, Hashable, Sendable {
    var items: [CalendarItem]
}

enum CalendarItemKind: String, Decodable, Hashable, Sendable {
    case event
    case live
    case post
}

struct CalendarItem: Decodable, Hashable, Sendable, Identifiable {
    var kind: CalendarItemKind
    var date: Date
    var title: String
    var subtitle: String?
    var spaceSlug: String?
    var refId: String

    var id: String { "\(kind.rawValue)-\(refId)" }
}
