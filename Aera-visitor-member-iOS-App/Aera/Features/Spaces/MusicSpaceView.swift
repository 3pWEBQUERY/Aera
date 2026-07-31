import SwiftUI

/// MUSIC-Space: Titelliste mit durchgehendem Player.
///
/// Das Cover trägt die Bühne — einmal weit verwischt als Fläche, einmal
/// scharf als Platte darauf. So färbt jeder Titel seine eigene Karte ein,
/// ohne dass irgendwo eine Farbe hinterlegt werden müsste. Genauso macht es
/// der Web-Player (`components/community/music-player.tsx`).
///
/// Die Beitragsform ist die des Podcasts: Audio in `videoUrl`, Cover in
/// `imageUrl`. Gesperrte Titel bleiben in der Liste stehen, lassen sich aber
/// nicht abspielen — für sie liefert der Server die Audiodatei gar nicht erst
/// aus.
struct MusicSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: PostsContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var tracks: [Post]
    @State private var nextCursor: String?
    @State private var isLoadingMore = false
    @State private var loadMoreFailed = false
    @State private var currentIndex = 0
    /// Erst nach einem Tippen wird von selbst gestartet — beim Öffnen des
    /// Space soll nichts losspielen.
    @State private var autoplay = false
    @State private var showLogin = false
    @State private var purchaseError: String?
    @State private var likeTrigger = 0
    @State private var purchaseSuccessCount = 0
    @State private var player = AudioPlayerModel()

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
        self._tracks = State(initialValue: content.posts)
        self._nextCursor = State(initialValue: content.nextCursor)
    }

    var body: some View {
        LazyVStack(spacing: 16) {
            if tracks.isEmpty {
                EmptyStateView(
                    icon: "music.note",
                    title: "Noch keine Titel",
                    message: "Sobald hier Musik veröffentlicht wird, erscheint sie an dieser Stelle."
                )
            } else {
                if let track = currentTrack {
                    stage(for: track)
                }

                trackList

                paginationFooter
            }
        }
        .padding(.horizontal, 16)
        .onAppear {
            // Am Ende eines Titels läuft der nächste — wie in der Warteschlange
            // des Web-Players.
            player.onFinish = { playNext() }
        }
        .onChange(of: content) { _, newContent in
            tracks = newContent.posts
            nextCursor = newContent.nextCursor
            loadMoreFailed = false
            if !tracks.indices.contains(currentIndex) {
                currentIndex = 0
            }
        }
        .task(id: currentTrack?.id) {
            guard let url = currentAudioURL else {
                // Gesperrter Titel: es waere sonst der vorherige zu hoeren,
                // waehrend die Buehne laengst einen anderen zeigt.
                player.teardown()
                return
            }
            player.load(url: url)
            if autoplay {
                player.play()
            }
        }
        .onDisappear {
            // Erst die Rueckmeldung loesen, sonst haelt sie die Ansicht fest.
            player.onFinish = nil
            player.teardown()
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

    // MARK: - Bühne

    private func stage(for track: Post) -> some View {
        VStack(spacing: 16) {
            cover(for: track)

            VStack(spacing: 4) {
                Text(track.title ?? String(localized: "Titel"))
                    .font(.displaySerif(22))
                    .kerning(-0.3)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)

                Text(track.author.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.7))
            }
            .frame(maxWidth: .infinity)

            if track.locked {
                lockedNote(for: track)
            } else {
                progress
                controls
            }

            stageMeta(for: track)
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background { stageBackground(for: track) }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    /// Verwischtes Cover als Fläche. Ohne Cover trägt die Community-Farbe.
    private func stageBackground(for track: Post) -> some View {
        ZStack {
            if coverUrl(for: track) != nil {
                Color.clear
                    .overlay {
                        AsyncImageView(url: coverUrl(for: track))
                            .blur(radius: 36)
                    }
                    .clipped()
                Color.black.opacity(0.38)
            } else {
                LinearGradient(
                    colors: [brand.color, brand.hover],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
    }

    /// Scharfe Platte über der Fläche.
    private func cover(for track: Post) -> some View {
        Color.clear
            .frame(width: 168, height: 168)
            .overlay {
                if coverUrl(for: track) != nil {
                    AsyncImageView(url: coverUrl(for: track))
                } else {
                    ZStack {
                        Color.white.opacity(0.12)
                        Image(systemName: "music.note")
                            .font(.system(size: 34, weight: .light))
                            .foregroundStyle(.white.opacity(0.8))
                    }
                }
            }
            .clipped()
            .overlay {
                if track.locked {
                    ZStack {
                        Rectangle().fill(.ultraThinMaterial)
                        Image(systemName: "lock.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .glassEffect(.regular, in: .circle)
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: .black.opacity(0.35), radius: 18, y: 10)
    }

    private var progress: some View {
        VStack(spacing: 2) {
            Slider(
                value: $player.currentTime,
                in: 0...max(player.duration, 1)
            ) { editing in
                player.isScrubbing = editing
                if !editing {
                    player.seek(to: player.currentTime)
                }
            }
            .tint(.white)

            HStack {
                Text(Format.duration(player.currentTime))
                Spacer()
                Text(Format.duration(player.duration))
            }
            .font(.system(size: 11))
            .monospacedDigit()
            .foregroundStyle(.white.opacity(0.6))
        }
    }

    private var controls: some View {
        HStack(spacing: 28) {
            Button {
                playPrevious()
            } label: {
                Image(systemName: "backward.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white.opacity(hasPrevious ? 0.9 : 0.3))
            }
            .buttonStyle(.plain)
            .disabled(!hasPrevious)
            .accessibilityLabel(Text("Vorheriger Titel"))

            Button {
                player.togglePlayback()
            } label: {
                Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 62, height: 62)
                    .background(.white, in: .circle)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(player.isPlaying ? "Pause" : "Abspielen"))

            Button {
                playNext()
            } label: {
                Image(systemName: "forward.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white.opacity(hasNext ? 0.9 : 0.3))
            }
            .buttonStyle(.plain)
            .disabled(!hasNext)
            .accessibilityLabel(Text("Nächster Titel"))
        }
        .padding(.vertical, 2)
    }

    /// Gesperrter Titel: Kaufknopf, sonst der Hinweis auf die Mitgliedschaft.
    @ViewBuilder
    private func lockedNote(for track: Post) -> some View {
        if let unlock = track.unlock, let productId = unlock.appleProductId, !productId.isEmpty {
            Button {
                purchase(unlock)
            } label: {
                Text("Freischalten ab \(Format.price(cents: unlock.priceCents, currency: unlock.currency))")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 11)
                    .background(.white, in: .capsule)
            }
            .buttonStyle(.plain)
        } else {
            HStack(spacing: 6) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 11, weight: .semibold))
                Text("Mit Mitgliedschaft anhören")
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundStyle(.white.opacity(0.85))
        }
    }

    private func stageMeta(for track: Post) -> some View {
        HStack(spacing: 18) {
            Button {
                toggleLike(track)
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: track.likedByMe ? "heart.fill" : "heart")
                    Text(Format.compactCount(track.likeCount))
                        .monospacedDigit()
                        .contentTransition(.numericText())
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(track.likedByMe ? "Gefällt mir entfernen" : "Gefällt mir"))

            NavigationLink {
                PostDetailView(slug: slug, postId: track.id)
                    .brandTheme(brand)
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "bubble.right")
                    Text(Format.compactCount(track.commentCount))
                        .monospacedDigit()
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Kommentare"))

            Spacer()

            Text(track.publishedAt.formatted(date: .abbreviated, time: .omitted))
                .font(.system(size: 12))
        }
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(.white.opacity(0.75))
    }

    // MARK: - Titelliste

    private var trackList: some View {
        AeraCard(padding: 8) {
            VStack(spacing: 0) {
                ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                    trackRow(track, index: index)

                    if track.id != tracks.last?.id {
                        Divider()
                            .overlay(Theme.border)
                            .padding(.leading, 62)
                    }
                }
            }
        }
    }

    private func trackRow(_ track: Post, index: Int) -> some View {
        let isCurrent = index == currentIndex

        return Button {
            select(index)
        } label: {
            HStack(spacing: 12) {
                Color.clear
                    .frame(width: 44, height: 44)
                    .overlay {
                        if coverUrl(for: track) != nil {
                            AsyncImageView(url: coverUrl(for: track))
                        } else {
                            ZStack {
                                brand.soft
                                Image(systemName: "music.note")
                                    .font(.system(size: 15))
                                    .foregroundStyle(brand.color)
                            }
                        }
                    }
                    .clipped()
                    .overlay {
                        if isCurrent && player.isPlaying {
                            ZStack {
                                Color.black.opacity(0.45)
                                Image(systemName: "waveform")
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .symbolEffect(.variableColor.iterative, isActive: true)
                            }
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(track.title ?? String(localized: "Titel"))
                        .font(.system(size: 15, weight: isCurrent ? .semibold : .medium))
                        .foregroundStyle(isCurrent ? brand.color : Theme.ink)
                        .lineLimit(1)

                    Text(track.author.name)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.ink.opacity(0.5))
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                if track.locked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.ink.opacity(0.35))
                } else if track.likeCount > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: track.likedByMe ? "heart.fill" : "heart")
                        Text(Format.compactCount(track.likeCount))
                            .monospacedDigit()
                    }
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(track.likedByMe ? brand.color : Theme.ink.opacity(0.4))
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
    }

    // MARK: - Wiedergabe

    private var currentTrack: Post? {
        tracks.indices.contains(currentIndex) ? tracks[currentIndex] : nil
    }

    private var currentAudioURL: URL? {
        guard let track = currentTrack, !track.locked else { return nil }
        return AppConfig.mediaURL(track.videoUrl)
    }

    /// Beim Einzelverkauf steht das Vorschaubild, sonst das Cover.
    private func coverUrl(for track: Post) -> String? {
        track.locked ? (track.teaserUrl ?? track.imageUrl) : (track.imageUrl ?? track.teaserUrl)
    }

    private var hasPrevious: Bool { nextPlayable(from: currentIndex, step: -1) != nil }
    private var hasNext: Bool { nextPlayable(from: currentIndex, step: 1) != nil }

    /// Nächster abspielbarer Titel in Laufrichtung — gesperrte werden
    /// übersprungen, für sie gibt es keine Audiodatei.
    private func nextPlayable(from index: Int, step: Int) -> Int? {
        var candidate = index + step
        while tracks.indices.contains(candidate) {
            let track = tracks[candidate]
            if !track.locked, track.videoUrl != nil {
                return candidate
            }
            candidate += step
        }
        return nil
    }

    private func select(_ index: Int) {
        guard tracks.indices.contains(index) else { return }
        let track = tracks[index]
        guard !track.locked, track.videoUrl != nil else {
            // Gesperrt: die Bühne zeigt den Titel samt Kaufknopf.
            withAnimation(.snappy(duration: 0.25)) { currentIndex = index }
            return
        }
        if index == currentIndex {
            player.togglePlayback()
            return
        }
        autoplay = true
        withAnimation(.snappy(duration: 0.25)) { currentIndex = index }
    }

    private func playNext() {
        guard let next = nextPlayable(from: currentIndex, step: 1) else { return }
        autoplay = true
        withAnimation(.snappy(duration: 0.25)) { currentIndex = next }
    }

    private func playPrevious() {
        guard let previous = nextPlayable(from: currentIndex, step: -1) else { return }
        autoplay = true
        withAnimation(.snappy(duration: 0.25)) { currentIndex = previous }
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
                // Der Nachschub haengt am Fuss der Liste, nicht an der letzten
                // Zeile: die Liste ist nicht lazy, sonst laedt sie beim
                // Oeffnen sofort den ganzen Katalog nach.
                ProgressView()
                    .padding(.vertical, 12)
                    .onAppear { loadMore() }
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
                    let known = Set(tracks.map(\.id))
                    tracks.append(contentsOf: more.posts.filter { !known.contains($0.id) })
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

    private func toggleLike(_ track: Post) {
        guard appState.session.isLoggedIn else {
            showLogin = true
            return
        }
        guard let index = tracks.firstIndex(where: { $0.id == track.id }) else { return }
        let original = tracks[index]

        withAnimation(.snappy(duration: 0.25)) {
            tracks[index].likedByMe.toggle()
            tracks[index].likeCount += tracks[index].likedByMe ? 1 : -1
        }
        likeTrigger += 1

        Task {
            do {
                let response = try await appState.api.toggleReaction(slug: slug, postId: track.id)
                if let current = tracks.firstIndex(where: { $0.id == track.id }) {
                    tracks[current].likedByMe = response.liked
                    tracks[current].likeCount = response.likeCount
                }
            } catch {
                if let current = tracks.firstIndex(where: { $0.id == track.id }) {
                    withAnimation(.snappy(duration: 0.25)) {
                        tracks[current].likedByMe = original.likedByMe
                        tracks[current].likeCount = original.likeCount
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
