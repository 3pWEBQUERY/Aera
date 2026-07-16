import SwiftUI

/// FEED-Space: Postliste als Karten mit Autor, Titel (Serif), Body-Auszug,
/// Bild/Video, Like-Herz (optimistisch) und Kommentar-Meta (Push ins Detail).
/// Gesperrte Posts zeigen Teaser + `LockedOverlay`. Cursor-Pagination über
/// das letzte Element.
///
/// Der Floating-Compose-Button wird über `ComposeContextKey` vom
/// `CommunityView`-Screen gerendert (Viewport-Overlay).
struct FeedSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: PostsContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var posts: [Post]
    @State private var nextCursor: String?
    @State private var isLoadingMore = false
    @State private var loadMoreFailed = false
    @State private var showLogin = false
    @State private var purchaseError: String?
    @State private var likeTrigger = 0
    @State private var purchaseSuccessCount = 0

    init(slug: String,
         space: SpaceDetail,
         content: PostsContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
        self._posts = State(initialValue: content.posts)
        self._nextCursor = State(initialValue: content.nextCursor)
    }

    var body: some View {
        LazyVStack(spacing: 16) {
            if posts.isEmpty {
                EmptyStateView(
                    icon: "square.text.square",
                    title: "Noch keine Beiträge",
                    message: "Sobald hier etwas gepostet wird, erscheint es an dieser Stelle."
                )
            } else {
                ForEach(posts) { post in
                    FeedPostCard(slug: slug,
                                 post: post,
                                 onLike: { toggleLike(post) },
                                 onUnlock: { unlock in purchase(unlock) })
                        .onAppear {
                            if post.id == posts.last?.id {
                                loadMore()
                            }
                        }
                }

                paginationFooter
            }
        }
        .padding(.horizontal, 16)
        .onChange(of: content) { _, newContent in
            posts = newContent.posts
            nextCursor = newContent.nextCursor
            loadMoreFailed = false
        }
        .sheet(isPresented: $showLogin) {
            LoginSheetView()
        }
        .sensoryFeedback(.impact(weight: .light), trigger: likeTrigger)
        .sensoryFeedback(.success, trigger: purchaseSuccessCount)
        .alert("Kauf fehlgeschlagen", isPresented: purchaseErrorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(purchaseError ?? "")
        }
    }

    // MARK: - Pagination

    @ViewBuilder
    private var paginationFooter: some View {
        if nextCursor != nil {
            if loadMoreFailed {
                Button("Mehr laden") {
                    loadMoreFailed = false
                    loadMore()
                }
                .buttonStyle(.secondary)
                .padding(.vertical, 4)
            } else {
                ProgressView()
                    .padding(.vertical, 12)
            }
        }
    }

    private func loadMore() {
        guard !isLoadingMore, !loadMoreFailed, let cursor = nextCursor else { return }
        isLoadingMore = true
        Task {
            do {
                let response = try await appState.api.space(slug: slug,
                                                            spaceSlug: space.slug,
                                                            cursor: cursor)
                if case .posts(let more) = response.content {
                    let known = Set(posts.map(\.id))
                    posts.append(contentsOf: more.posts.filter { !known.contains($0.id) })
                    nextCursor = more.nextCursor
                } else {
                    nextCursor = nil
                }
            } catch {
                loadMoreFailed = true
            }
            isLoadingMore = false
        }
    }

    // MARK: - Like

    private func toggleLike(_ post: Post) {
        guard appState.session.isLoggedIn else {
            showLogin = true
            return
        }
        guard let index = posts.firstIndex(where: { $0.id == post.id }) else { return }
        let original = posts[index]

        withAnimation(.snappy(duration: 0.25)) {
            posts[index].likedByMe.toggle()
            posts[index].likeCount += posts[index].likedByMe ? 1 : -1
        }
        likeTrigger += 1

        Task {
            do {
                let response = try await appState.api.toggleReaction(slug: slug, postId: post.id)
                if let current = posts.firstIndex(where: { $0.id == post.id }) {
                    posts[current].likedByMe = response.liked
                    posts[current].likeCount = response.likeCount
                }
            } catch {
                if let current = posts.firstIndex(where: { $0.id == post.id }) {
                    withAnimation(.snappy(duration: 0.25)) {
                        posts[current].likedByMe = original.likedByMe
                        posts[current].likeCount = original.likeCount
                    }
                }
            }
        }
    }

    // MARK: - Kauf

    private var purchaseErrorBinding: Binding<Bool> {
        Binding(
            get: { purchaseError != nil },
            set: { if !$0 { purchaseError = nil } }
        )
    }

    private func purchase(_ unlock: Unlock) {
        guard !appState.purchases.isPurchasing else { return }
        Task {
            do {
                try await appState.purchases.purchase(unlock: unlock, tenantSlug: slug)
                purchaseSuccessCount += 1
                await reload()
            } catch StoreError.cancelled {
                // Nutzer-Abbruch: bewusst kein Alert.
            } catch {
                purchaseError = error.localizedDescription
            }
        }
    }
}

// MARK: - FeedPostCard

/// Einzelne Feed-Karte: Autor-Zeile, Pinned-Pill, Titel (Serif 20),
/// Body (max. 6 Zeilen), Medienfläche und Like/Kommentar-Meta.
private struct FeedPostCard: View {
    let slug: String
    let post: Post
    let onLike: () -> Void
    let onUnlock: (Unlock) -> Void

    @Environment(\.brand) private var brand

    var body: some View {
        AeraCard {
            VStack(alignment: .leading, spacing: 12) {
                header

                NavigationLink {
                    PostDetailView(slug: slug, postId: post.id)
                        .brandTheme(brand)
                } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        if let title = post.title, !title.isEmpty {
                            Text(title)
                                .font(.displaySerif(20))
                                .kerning(-0.2)
                                .foregroundStyle(Theme.ink)
                                .multilineTextAlignment(.leading)
                        }
                        if let body = post.body, !body.isEmpty {
                            Text(body)
                                .font(.system(size: 15))
                                .foregroundStyle(Theme.ink.opacity(0.8))
                                .lineLimit(6)
                                .multilineTextAlignment(.leading)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)

                media

                meta
            }
        }
    }

    // MARK: - Kopfzeile

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            AvatarView(url: post.author.avatarUrl, name: post.author.name)

            VStack(alignment: .leading, spacing: 1) {
                Text(post.author.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Text(post.publishedAt.relativeLabel)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.ink.opacity(0.5))
            }

            Spacer(minLength: 8)

            if post.isPinned {
                PillLabel(String(localized: "Angepinnt"), systemImage: "pin.fill", prominent: true)
            }
        }
    }

    // MARK: - Medien

    @ViewBuilder
    private var media: some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        if post.locked {
            Color.clear
                .aspectRatio(16 / 9, contentMode: .fit)
                .overlay {
                    AsyncImageView(url: post.teaserUrl ?? post.imageUrl)
                }
                .overlay {
                    if let unlock = post.unlock {
                        LockedOverlay(unlock: unlock, onUnlock: onUnlock)
                    } else {
                        memberLockedOverlay
                    }
                }
                .clipShape(shape)
        } else if let videoUrl = post.videoUrl, let url = AppConfig.mediaURL(videoUrl) {
            RemoteVideoPlayer(url: url)
                .aspectRatio(16 / 9, contentMode: .fit)
                .clipShape(shape)
        } else if post.imageUrl != nil {
            Color.clear
                .aspectRatio(16 / 9, contentMode: .fit)
                .overlay {
                    AsyncImageView(url: post.imageUrl)
                }
                .clipShape(shape)
        }
    }

    /// Gesperrt ohne `unlock`-Objekt: Zugang nur über die Mitgliedschaft.
    private var memberLockedOverlay: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial)
            brand.color.opacity(0.25)
            VStack(spacing: 10) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 54, height: 54)
                    .glassEffect(.regular, in: .circle)
                Text("Mit Mitgliedschaft verfügbar")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white)
            }
        }
    }

    // MARK: - Meta

    private var meta: some View {
        HStack(spacing: 18) {
            Button(action: onLike) {
                HStack(spacing: 5) {
                    Image(systemName: post.likedByMe ? "heart.fill" : "heart")
                        .foregroundStyle(post.likedByMe ? brand.color : Theme.ink.opacity(0.5))
                    Text(Format.compactCount(post.likeCount))
                        .monospacedDigit()
                        .contentTransition(.numericText())
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(post.likedByMe ? "Gefällt mir entfernen" : "Gefällt mir"))

            NavigationLink {
                PostDetailView(slug: slug, postId: post.id)
                    .brandTheme(brand)
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "bubble.right")
                    Text(Format.compactCount(post.commentCount))
                        .monospacedDigit()
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Kommentare"))

            Spacer()
        }
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(Theme.ink.opacity(0.5))
    }
}
