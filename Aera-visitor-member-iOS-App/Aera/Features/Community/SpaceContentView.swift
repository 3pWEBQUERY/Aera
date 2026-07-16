import SwiftUI

// MARK: - ComposeContext

/// Meldet dem `CommunityView`-Screen per Preference, dass der aktuelle Space
/// einen Floating-Compose-Button anbieten soll (FEED/FORUM mit `canPost`).
struct ComposeContext: Equatable {
    let spaceSlug: String
    /// FORUM-Beiträge haben ein Titelfeld.
    let withTitle: Bool
}

struct ComposeContextKey: PreferenceKey {
    static var defaultValue: ComposeContext? = nil

    static func reduce(value: inout ComposeContext?, nextValue: () -> ComposeContext?) {
        value = nextValue() ?? value
    }
}

// MARK: - SpaceContentView

/// Lädt `GET /c/{slug}/space/{spaceSlug}` und rendert je nach Content-Typ
/// die passende Space-View. Antworten werden pro Space-Slug gecacht
/// (View-Lebensdauer; Reset über `.id` im Parent).
///
/// 403 `not_member`/`payment_required` → `SpacePaywallView`.
struct SpaceContentView: View {
    let slug: String
    let spaceSummary: SpaceSummary
    let viewer: Viewer
    let onViewerChanged: () async -> Void

    @Environment(AppState.self) private var appState

    /// Ladezustand pro Space-Slug — bleibt beim Wechseln der Chips erhalten.
    @State private var states: [String: LoadState] = [:]

    private enum LoadState {
        case loading
        case loaded(SpaceResponse)
        case gated(SpaceSummary)
        case failed(String)
    }

    init(slug: String,
         spaceSummary: SpaceSummary,
         viewer: Viewer,
         onViewerChanged: @escaping () async -> Void) {
        self.slug = slug
        self.spaceSummary = spaceSummary
        self.viewer = viewer
        self.onViewerChanged = onViewerChanged
    }

    var body: some View {
        Group {
            switch states[spaceSummary.slug] ?? .loading {
            case .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 48)
            case .gated(let space):
                SpacePaywallView(slug: slug, space: space, viewer: viewer) {
                    await onViewerChanged()
                    await load(spaceSlug: space.slug, force: true)
                }
            case .failed(let message):
                errorCard(message)
            case .loaded(let response):
                contentView(response)
            }
        }
        .task(id: spaceSummary.slug) {
            await load(spaceSlug: spaceSummary.slug, force: false)
        }
        .preference(key: ComposeContextKey.self, value: composeContext)
    }

    // MARK: - Compose

    private var composeContext: ComposeContext? {
        guard case .loaded(let response) = states[spaceSummary.slug] else { return nil }
        switch response.content {
        case .posts(let content) where response.space.type == .feed && content.canPost:
            return ComposeContext(spaceSlug: response.space.slug, withTitle: false)
        case .forum(let content) where content.canPost:
            return ComposeContext(spaceSlug: response.space.slug, withTitle: true)
        default:
            return nil
        }
    }

    // MARK: - Dispatcher

    @ViewBuilder
    private func contentView(_ response: SpaceResponse) -> some View {
        let space = response.space
        let spaceSlug = space.slug
        let reload: () async -> Void = {
            await load(spaceSlug: spaceSlug, force: true)
            await onViewerChanged()
        }

        switch response.content {
        case .posts(let content):
            switch space.type {
            case .videos:
                VideosSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
            case .podcast:
                PodcastSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
            default:
                FeedSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
            }
        case .forum(let content):
            ForumSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .blog(let content):
            BlogSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .gallery(let content):
            GallerySpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .courses(let content):
            CoursesSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .shop(let content):
            ShopSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .events(let content):
            EventsSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .newsletter(let content):
            NewsletterSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .knowledge(let content):
            KnowledgeSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .links(let content):
            LinksSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .live(let content):
            LiveSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .chat(let content):
            ChatSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .requests(let content):
            RequestsSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .booking(let content):
            BookingSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .stories(let content):
            StoriesSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .tips(let content):
            TipsSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .calendar(let content):
            CalendarSpaceView(slug: slug, space: space, content: content, viewer: viewer, reload: reload)
        case .unsupported:
            EmptyStateView(
                icon: "sparkles",
                title: "Noch nicht verfügbar",
                message: "Dieser Bereich wird von dieser App-Version noch nicht unterstützt."
            )
            .padding(.horizontal, 16)
        }
    }

    // MARK: - Fehler

    private func errorCard(_ message: String) -> some View {
        AeraCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "wifi.exclamationmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.danger)
                    Text("Laden fehlgeschlagen")
                        .font(.displaySerif(18))
                        .foregroundStyle(Theme.ink)
                }
                Text(message)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.ink.opacity(0.6))
                Button("Erneut versuchen") {
                    let spaceSlug = spaceSummary.slug
                    Task { await load(spaceSlug: spaceSlug, force: true) }
                }
                .buttonStyle(.secondary)
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Laden

    private func load(spaceSlug: String, force: Bool) async {
        if !force, let state = states[spaceSlug] {
            // Bereits geladen/gesperrt: Cache verwenden.
            if case .failed = state {} else { return }
        }
        states[spaceSlug] = .loading
        do {
            let response = try await appState.api.space(slug: slug, spaceSlug: spaceSlug)
            guard !Task.isCancelled else { return }
            states[spaceSlug] = .loaded(response)
        } catch let error as APIError where error.code == .paymentRequired || error.code == .notMember {
            guard !Task.isCancelled else { return }
            let gatedSpace = error.decodeDetails(GatedSpacePayload.self)?.space.summary ?? spaceSummary
            states[spaceSlug] = .gated(gatedSpace)
        } catch {
            guard !Task.isCancelled else { return }
            states[spaceSlug] = .failed(error.localizedDescription)
        }
    }
}
