import SwiftUI

/// PODCAST-Space: Episodenliste. Freie Episoden mit `AudioPlayerBar`
/// (`videoUrl` ist die Audioquelle), gesperrte mit `LockedOverlay` über
/// einem kompakten Cover + „Anhören mit Mitgliedschaft"-Hinweis.
struct PodcastSpaceView: View {
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
                    icon: "waveform",
                    title: "Noch keine Episoden",
                    message: "Neue Podcast-Episoden erscheinen hier, sobald sie veröffentlicht werden."
                )
            } else {
                ForEach(content.posts) { post in
                    episodeCard(for: post)
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

    // MARK: - Episode

    private func episodeCard(for post: Post) -> some View {
        AeraCard(padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                Text(post.title ?? String(localized: "Episode"))
                    .font(.displaySerif(18))
                    .foregroundStyle(Theme.ink)

                Text(post.publishedAt.formatted(date: .abbreviated, time: .omitted))
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink.opacity(0.5))

                if post.locked {
                    lockedCover(for: post)

                    HStack(spacing: 6) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 11, weight: .semibold))
                        Text("Anhören mit Mitgliedschaft")
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundStyle(Theme.ink.opacity(0.6))
                } else if let audioUrl = post.videoUrl, let url = AppConfig.mediaURL(audioUrl) {
                    AudioPlayerBar(url: url)
                }
            }
        }
    }

    /// Kompaktes Cover mit Paywall-Overlay.
    private func lockedCover(for post: Post) -> some View {
        Color.clear
            .frame(height: 150)
            .frame(maxWidth: .infinity)
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
                    ZStack {
                        Rectangle().fill(.ultraThinMaterial)
                        brand.color.opacity(0.25)
                        Image(systemName: "lock.fill")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 54, height: 54)
                            .glassEffect(.regular, in: .circle)
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
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
