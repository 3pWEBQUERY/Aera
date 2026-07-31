import SwiftUI

/// BLOG-Space: Editorial-Karten (Cover 16:9, Serif-Titel 22, Datum und
/// Lesezeit). Seitenbasiertes Paging über `api.space(page:)` mit
/// „Mehr laden", solange `page < totalPages`. Push ins Post-Detail.
struct BlogSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: BlogContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var posts: [Post]
    @State private var page: Int
    @State private var totalPages: Int
    @State private var isLoadingMore = false
    @State private var loadMoreError: String?

    init(slug: String,
         space: SpaceDetail,
         content: BlogContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
        self._posts = State(initialValue: content.posts)
        self._page = State(initialValue: content.page)
        self._totalPages = State(initialValue: content.totalPages)
    }

    var body: some View {
        LazyVStack(spacing: 16) {
            if posts.isEmpty {
                EmptyStateView(
                    icon: "text.book.closed",
                    title: "Noch keine Artikel",
                    message: "Sobald hier Artikel veröffentlicht werden, erscheinen sie an dieser Stelle."
                )
            } else {
                ForEach(posts) { post in
                    NavigationLink {
                        PostDetailView(slug: slug, postId: post.id)
                            .brandTheme(brand)
                    } label: {
                        articleCard(post)
                    }
                    .buttonStyle(.plain)
                }

                if page < totalPages {
                    loadMoreFooter
                }
            }
        }
        .padding(.horizontal, 16)
        .onChange(of: content) { _, newContent in
            posts = newContent.posts
            page = newContent.page
            totalPages = newContent.totalPages
            loadMoreError = nil
        }
    }

    // MARK: - Karte

    private func articleCard(_ post: Post) -> some View {
        AeraCard(padding: 0, cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 0) {
                cover(post)

                VStack(alignment: .leading, spacing: 8) {
                    Text(post.title ?? String(localized: "Ohne Titel"))
                        .font(.displaySerif(22))
                        .kerning(-0.4)
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)

                    HStack(spacing: 8) {
                        Text(post.publishedAt.formatted(date: .abbreviated, time: .omitted))
                        if let minutes = post.readingMinutes {
                            Text("·")
                            Text("\(minutes) Min. Lesezeit")
                                .monospacedDigit()
                        }
                        if post.locked {
                            Text("·")
                            Label("Gesperrt", systemImage: "lock.fill")
                        }
                    }
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink.opacity(0.5))

                    HStack(spacing: 8) {
                        AvatarView(url: post.author.avatarUrl, name: post.author.name, size: 24)
                        Text(post.author.name)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.ink.opacity(0.7))
                            .lineLimit(1)
                    }
                    .padding(.top, 2)
                }
                .padding(16)
            }
        }
    }

    /// Titelplatte: bevorzugt das eigens gesetzte Titelbild samt gespeichertem
    /// Bildausschnitt, sonst das Beitragsbild. Gesperrte Beiträge zeigen ihr
    /// Bild verwischt — sichtbar, aber nicht verraten.
    @ViewBuilder
    private func cover(_ post: Post) -> some View {
        let shape = UnevenRoundedRectangle(topLeadingRadius: 16, topTrailingRadius: 16)
        if post.locked, let preview = post.lockedPreviewUrl ?? post.teaserUrl {
            Color.clear
                .aspectRatio(16 / 9, contentMode: .fit)
                .overlay {
                    AsyncImageView(url: preview)
                        .blur(radius: 18)
                }
                .overlay(alignment: .bottomLeading) {
                    if post.lockKind == .paid, post.priceCents > 0 {
                        PostPriceBadge(priceCents: post.priceCents, currency: post.currency)
                            .padding(12)
                    } else {
                        HStack(spacing: 6) {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 10, weight: .semibold))
                            Text("Mit Mitgliedschaft")
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Theme.ink.opacity(0.75), in: .capsule)
                        .padding(12)
                    }
                }
                .clipShape(shape)
        } else if let cover = post.coverUrl {
            PostCoverImage(url: cover,
                           focusX: post.coverFocusX,
                           focusY: post.coverFocusY,
                           zoom: post.coverZoom)
                .aspectRatio(16 / 9, contentMode: .fit)
                .clipShape(shape)
        } else if post.imageUrl != nil || post.teaserUrl != nil {
            Color.clear
                .aspectRatio(16 / 9, contentMode: .fit)
                .overlay {
                    AsyncImageView(url: post.imageUrl ?? post.teaserUrl)
                }
                .clipShape(shape)
        }
    }

    // MARK: - Mehr laden

    private var loadMoreFooter: some View {
        VStack(spacing: 8) {
            if let loadMoreError {
                Text(loadMoreError)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.danger)
                    .multilineTextAlignment(.center)
            }
            Button {
                loadMore()
            } label: {
                if isLoadingMore {
                    ProgressView()
                } else {
                    Text("Mehr laden")
                }
            }
            .buttonStyle(.secondary)
            .disabled(isLoadingMore)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
    }

    private func loadMore() {
        guard !isLoadingMore, page < totalPages else { return }
        isLoadingMore = true
        loadMoreError = nil
        Task {
            do {
                let response = try await appState.api.space(slug: slug,
                                                            spaceSlug: space.slug,
                                                            page: page + 1)
                if case .blog(let more) = response.content {
                    let known = Set(posts.map(\.id))
                    posts.append(contentsOf: more.posts.filter { !known.contains($0.id) })
                    page = more.page
                    totalPages = more.totalPages
                }
            } catch {
                loadMoreError = error.localizedDescription
            }
            isLoadingMore = false
        }
    }
}
