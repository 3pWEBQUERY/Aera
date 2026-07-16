import SwiftUI

/// VIDEOS-Space: einspaltiges Karten-Grid, jede Karte mit 16:9-Videofläche.
/// Freie Videos werden inline abgespielt (`RemoteVideoPlayer`), gesperrte
/// zeigen Teaser + `LockedOverlay`. Tap auf den Titel öffnet das Post-Detail.
struct VideosSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: PostsContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var purchaseError: String?
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
    }

    var body: some View {
        LazyVStack(spacing: 16) {
            if content.posts.isEmpty {
                EmptyStateView(
                    icon: "play.rectangle",
                    title: "Noch keine Videos",
                    message: "Sobald hier Videos veröffentlicht werden, erscheinen sie an dieser Stelle."
                )
            } else {
                ForEach(content.posts) { post in
                    videoCard(for: post)
                }
            }
        }
        .padding(.horizontal, 16)
        .sensoryFeedback(.success, trigger: purchaseSuccessCount)
        .alert("Kauf fehlgeschlagen", isPresented: purchaseErrorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(purchaseError ?? "")
        }
    }

    // MARK: - Karte

    private func videoCard(for post: Post) -> some View {
        AeraCard(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                mediaArea(for: post)
                    .clipShape(
                        UnevenRoundedRectangle(
                            topLeadingRadius: 12,
                            topTrailingRadius: 12
                        )
                    )

                VStack(alignment: .leading, spacing: 8) {
                    NavigationLink {
                        PostDetailView(slug: slug, postId: post.id)
                    } label: {
                        Text(post.title ?? String(localized: "Video"))
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                            .multilineTextAlignment(.leading)
                    }
                    .buttonStyle(.plain)

                    Text(post.publishedAt.formatted(date: .abbreviated, time: .omitted))
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink.opacity(0.5))

                    HStack(spacing: 16) {
                        Label {
                            Text(Format.compactCount(post.likeCount))
                                .monospacedDigit()
                        } icon: {
                            Image(systemName: post.likedByMe ? "heart.fill" : "heart")
                                .foregroundStyle(post.likedByMe ? brand.color : Theme.ink.opacity(0.5))
                        }
                        Label {
                            Text(Format.compactCount(post.commentCount))
                                .monospacedDigit()
                        } icon: {
                            Image(systemName: "bubble.right")
                        }
                    }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.ink.opacity(0.5))
                }
                .padding(16)
            }
        }
    }

    /// 16:9-Medienfläche: Player (frei), Teaser + LockedOverlay (gesperrt)
    /// oder Standbild als Fallback.
    @ViewBuilder
    private func mediaArea(for post: Post) -> some View {
        if post.locked {
            Color.clear
                .aspectRatio(16 / 9, contentMode: .fit)
                .overlay {
                    AsyncImageView(url: post.teaserUrl ?? post.imageUrl)
                }
                .clipped()
                .overlay {
                    if let unlock = post.unlock {
                        LockedOverlay(unlock: unlock) { unlock in
                            purchase(unlock)
                        }
                    } else {
                        lockedFallbackOverlay
                    }
                }
        } else if let videoUrl = post.videoUrl, let url = AppConfig.mediaURL(videoUrl) {
            RemoteVideoPlayer(url: url)
                .aspectRatio(16 / 9, contentMode: .fit)
        } else {
            Color.clear
                .aspectRatio(16 / 9, contentMode: .fit)
                .overlay {
                    AsyncImageView(url: post.imageUrl ?? post.teaserUrl)
                }
                .clipped()
        }
    }

    /// Gesperrt ohne `unlock`-Objekt: nur Blur + Schloss (Zugang über Mitgliedschaft).
    private var lockedFallbackOverlay: some View {
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
            } catch {
                purchaseError = error.localizedDescription
            }
        }
    }
}
