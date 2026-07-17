import SwiftUI

/// Tab 1 „Startseite": Patreon-artiger, Tenant-übergreifender Content-Feed
/// (`GET /home`). Oben eine Zwei-Segment-Leiste „Startseite" (alle
/// Communities, auch ausgeloggt) / „Mitgliedschaften" (nur eigene ACTIVE-
/// Memberships); beide Feeds werden getrennt gecacht. Cursor-Pagination über
/// das letzte Element, Pull-to-Refresh, Fehler-Karte mit Retry.
struct HomeFeedView: View {
    @Environment(AppState.self) private var appState

    /// Zustand eines Feed-Tabs (Startseite/Mitgliedschaften getrennt gecacht).
    private struct TabFeed {
        var items: [HomeItem]?
        var nextCursor: String?
        var errorMessage: String?
        var isLoadingMore = false
        var loadMoreFailed = false
    }

    @State private var selectedTab: HomeFeedTab = .home
    @State private var homeFeed = TabFeed()
    @State private var membersFeed = TabFeed()
    @State private var showLogin = false
    /// Push zur Community (Like/Beitreten ohne Mitgliedschaft).
    @State private var joinTarget: CommunityCard?
    @State private var purchaseError: String?
    @State private var likeTrigger = 0
    @State private var successCount = 0

    @Namespace private var underlineNamespace

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    tabBar
                        .padding(.bottom, 4)

                    feedContent
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
            .background(Theme.paper.ignoresSafeArea())
            .scrollEdgeEffectStyle(.soft, for: .top)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        DiscoverView(embedded: true)
                    } label: {
                        Image(systemName: "magnifyingglass")
                    }
                    .accessibilityLabel(Text("Communities suchen"))
                }
            }
            .refreshable { await load(tab: selectedTab) }
            .task(id: loadKey) { await loadIfNeeded() }
            .onChange(of: appState.session.isLoggedIn) { _, _ in
                // Login/Logout ändert isMember-Flags und den Mitglieder-Feed.
                homeFeed = TabFeed()
                membersFeed = TabFeed()
            }
            .navigationDestination(item: $joinTarget) { community in
                CommunityView(slug: community.slug)
            }
            .sheet(isPresented: $showLogin) {
                LoginSheetView()
            }
            .sensoryFeedback(.impact(weight: .light), trigger: likeTrigger)
            .sensoryFeedback(.success, trigger: successCount)
            .alert("Kauf fehlgeschlagen", isPresented: Binding(
                get: { purchaseError != nil },
                set: { if !$0 { purchaseError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(purchaseError ?? "")
            }
        }
    }

    // MARK: - Tab-Leiste

    private var tabBar: some View {
        HStack(spacing: 24) {
            tabButton("Startseite", tab: .home)
            tabButton("Mitgliedschaften", tab: .members)
            Spacer(minLength: 0)
        }
    }

    private func tabButton(_ title: LocalizedStringKey, tab: HomeFeedTab) -> some View {
        let isActive = selectedTab == tab
        return Button {
            guard selectedTab != tab else { return }
            withAnimation(.snappy(duration: 0.25)) {
                selectedTab = tab
            }
        } label: {
            VStack(spacing: 6) {
                Text(title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(isActive ? Theme.ink : Theme.ink.opacity(0.45))
                ZStack {
                    if isActive {
                        Capsule()
                            .fill(Theme.ink)
                            .matchedGeometryEffect(id: "homeFeedUnderline",
                                                   in: underlineNamespace)
                    }
                }
                .frame(height: 2)
            }
            .fixedSize()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    // MARK: - Inhalt

    @ViewBuilder
    private var feedContent: some View {
        if selectedTab == .members, !appState.session.isLoggedIn {
            membersLoggedOutState
        } else {
            let feed = currentFeed
            if let items = feed.items {
                if items.isEmpty {
                    emptyState
                } else {
                    ForEach(items) { item in
                        HomeFeedCard(
                            item: item,
                            isLoggedIn: appState.session.isLoggedIn,
                            onLike: { toggleLike(item) },
                            onUnlock: { unlock in purchase(unlock, slug: item.community.slug) }
                        )
                        .environment(\.brand, BrandTheme(primaryHex: item.community.primaryColor,
                                                         accentHex: item.community.accentColor))
                        .onAppear {
                            if item.id == items.last?.id {
                                loadMore(tab: selectedTab)
                            }
                        }
                    }

                    paginationFooter(feed)
                }
            } else if let message = feed.errorMessage {
                errorCard(message)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 60)
            }
        }
    }

    private var membersLoggedOutState: some View {
        VStack(spacing: 16) {
            EmptyStateView(
                icon: "person.2",
                title: "Deine Mitgliedschaften",
                message: "Melde dich an, um die Beiträge deiner Communities zu sehen."
            )
            Button("Anmelden") {
                showLogin = true
            }
            .buttonStyle(.brand)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var emptyState: some View {
        if selectedTab == .members {
            VStack(spacing: 16) {
                EmptyStateView(
                    icon: "person.2",
                    title: "Noch keine Mitgliedschaften",
                    message: "Tritt Communities bei, um ihre Beiträge hier gesammelt zu sehen."
                )
                NavigationLink {
                    DiscoverView(embedded: true)
                } label: {
                    Text("Communities entdecken")
                }
                .buttonStyle(.brand)
            }
            .frame(maxWidth: .infinity)
        } else {
            EmptyStateView(
                icon: "square.text.square",
                title: "Noch keine Beiträge",
                message: "Sobald Communities etwas veröffentlichen, erscheint es hier."
            )
        }
    }

    @ViewBuilder
    private func paginationFooter(_ feed: TabFeed) -> some View {
        if feed.nextCursor != nil {
            if feed.loadMoreFailed {
                Button("Mehr laden") {
                    updateFeed(selectedTab) { $0.loadMoreFailed = false }
                    loadMore(tab: selectedTab)
                }
                .buttonStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
        }
    }

    private func errorCard(_ message: String) -> some View {
        VStack(spacing: 16) {
            EmptyStateView(
                icon: "wifi.exclamationmark",
                title: "Laden fehlgeschlagen",
                message: "Der Feed konnte nicht geladen werden."
            )
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(Theme.ink.opacity(0.5))
                .multilineTextAlignment(.center)
            Button("Erneut versuchen") {
                updateFeed(selectedTab) { $0.errorMessage = nil }
                Task { await load(tab: selectedTab) }
            }
            .buttonStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Feed-Zustand

    private var currentFeed: TabFeed {
        selectedTab == .home ? homeFeed : membersFeed
    }

    private func feed(for tab: HomeFeedTab) -> TabFeed {
        tab == .home ? homeFeed : membersFeed
    }

    private func updateFeed(_ tab: HomeFeedTab, _ transform: (inout TabFeed) -> Void) {
        switch tab {
        case .home: transform(&homeFeed)
        case .members: transform(&membersFeed)
        }
    }

    // MARK: - Laden

    /// Cache-Key: Tab-Wechsel und Login-Wechsel stoßen das Laden neu an.
    private var loadKey: String {
        "\(selectedTab.rawValue)|\(appState.session.isLoggedIn)"
    }

    private func loadIfNeeded() async {
        if selectedTab == .members, !appState.session.isLoggedIn { return }
        if feed(for: selectedTab).items == nil {
            await load(tab: selectedTab)
        }
    }

    private func load(tab: HomeFeedTab) async {
        if tab == .members, !appState.session.isLoggedIn { return }
        do {
            let response = try await appState.api.homeFeed(tab: tab)
            updateFeed(tab) {
                $0.items = response.data
                $0.nextCursor = response.nextCursor
                $0.errorMessage = nil
                $0.loadMoreFailed = false
            }
        } catch {
            updateFeed(tab) {
                if $0.items == nil {
                    $0.errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func loadMore(tab: HomeFeedTab) {
        let current = feed(for: tab)
        guard !current.isLoadingMore, !current.loadMoreFailed,
              let cursor = current.nextCursor else { return }
        updateFeed(tab) { $0.isLoadingMore = true }
        Task {
            do {
                let response = try await appState.api.homeFeed(tab: tab, cursor: cursor)
                updateFeed(tab) { feed in
                    let known = Set((feed.items ?? []).map(\.id))
                    feed.items = (feed.items ?? []) + response.data.filter { !known.contains($0.id) }
                    feed.nextCursor = response.nextCursor
                }
            } catch {
                updateFeed(tab) { $0.loadMoreFailed = true }
            }
            updateFeed(tab) { $0.isLoadingMore = false }
        }
    }

    // MARK: - Like

    private func toggleLike(_ item: HomeItem) {
        guard appState.session.isLoggedIn else {
            showLogin = true
            return
        }
        guard item.community.isMember else {
            // Liken erfordert Mitgliedschaft → zur Community mit Beitritts-Flow.
            joinTarget = item.community
            return
        }

        let tab = selectedTab
        updateFeed(tab) { feed in
            guard let index = feed.items?.firstIndex(where: { $0.id == item.id }) else { return }
            withAnimation(.snappy(duration: 0.25)) {
                feed.items?[index].post.likedByMe.toggle()
                let liked = feed.items?[index].post.likedByMe == true
                feed.items?[index].post.likeCount += liked ? 1 : -1
            }
        }
        likeTrigger += 1

        Task {
            do {
                let response = try await appState.api.toggleReaction(slug: item.community.slug,
                                                                     postId: item.post.id)
                updateFeed(tab) { feed in
                    guard let index = feed.items?.firstIndex(where: { $0.id == item.id }) else { return }
                    feed.items?[index].post.likedByMe = response.liked
                    feed.items?[index].post.likeCount = response.likeCount
                }
            } catch {
                updateFeed(tab) { feed in
                    guard let index = feed.items?.firstIndex(where: { $0.id == item.id }) else { return }
                    withAnimation(.snappy(duration: 0.25)) {
                        feed.items?[index].post.likedByMe = item.post.likedByMe
                        feed.items?[index].post.likeCount = item.post.likeCount
                    }
                }
            }
        }
    }

    // MARK: - Kauf (Pay-per-Post)

    private func purchase(_ unlock: Unlock, slug: String) {
        guard !appState.purchases.isPurchasing else { return }
        let tab = selectedTab
        Task {
            do {
                try await appState.purchases.purchase(unlock: unlock, tenantSlug: slug)
                successCount += 1
                await load(tab: tab)
            } catch StoreError.cancelled {
                // Nutzer-Abbruch: bewusst kein Alert.
            } catch {
                purchaseError = error.localizedDescription
            }
        }
    }
}

// MARK: - HomeFeedCard

/// Feed-Karte des Home-Feeds: Community-Kopfzeile (Logo, Name, Zeit,
/// „Beitreten"-Kapsel für Nichtmitglieder), Space-Pill, Titel (Serif),
/// Body-Auszug, Bild/Video bzw. Locked-Fläche und Like/Kommentar-Fußzeile.
/// Läuft im Branding der jeweiligen Community (`\.brand` vom Aufrufer).
private struct HomeFeedCard: View {
    let item: HomeItem
    let isLoggedIn: Bool
    let onLike: () -> Void
    let onUnlock: (Unlock) -> Void

    @Environment(\.brand) private var brand

    private var community: CommunityCard { item.community }
    private var post: Post { item.post }

    var body: some View {
        AeraCard(padding: 0, cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 0) {
                header
                    .padding(14)

                textContent

                media
                    .padding(.top, 10)

                footer
                    .padding(14)
            }
        }
    }

    // MARK: - Kopfzeile

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            detailLink {
                HStack(alignment: .center, spacing: 10) {
                    AvatarView(url: community.logoUrl, name: community.name, size: 40)

                    VStack(alignment: .leading, spacing: 3) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(community.name)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Theme.ink)
                                .lineLimit(1)
                            Text(post.publishedAt.relativeLabel)
                                .font(.system(size: 12))
                                .monospacedDigit()
                                .foregroundStyle(Theme.ink.opacity(0.45))
                                .lineLimit(1)
                        }
                        PillLabel(post.spaceType.displayName,
                                  systemImage: post.spaceType.symbolName)
                    }
                }
            }

            Spacer(minLength: 8)

            if !community.isMember {
                NavigationLink {
                    CommunityView(slug: community.slug)
                } label: {
                    Text("Beitreten")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(brand.color)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(brand.soft, in: .capsule)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("\(community.name) beitreten"))
            }
        }
    }

    // MARK: - Text

    @ViewBuilder
    private var textContent: some View {
        let title = post.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let body = post.body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !title.isEmpty || !body.isEmpty {
            detailLink {
                VStack(alignment: .leading, spacing: 8) {
                    if !title.isEmpty {
                        Text(title)
                            .font(.displaySerif(20))
                            .kerning(-0.2)
                            .foregroundStyle(Theme.ink)
                            .multilineTextAlignment(.leading)
                    }
                    if !body.isEmpty {
                        Text(body)
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.ink.opacity(0.8))
                            .lineLimit(5)
                            .multilineTextAlignment(.leading)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 14)
        }
    }

    // MARK: - Medien

    @ViewBuilder
    private var media: some View {
        if post.locked {
            lockedArea
        } else if let videoUrl = post.videoUrl, let url = AppConfig.mediaURL(videoUrl) {
            RemoteVideoPlayer(url: url)
                .aspectRatio(16 / 9, contentMode: .fit)
        } else if post.imageUrl != nil {
            detailLink {
                Color.clear
                    .frame(height: 220)
                    .frame(maxWidth: .infinity)
                    .overlay {
                        AsyncImageView(url: post.imageUrl)
                    }
                    .clipped()
            }
        }
    }

    /// Gesperrter Post: Teaser bzw. Brand-Fläche mit `LockedOverlay`
    /// (Pay-per-Post) oder „Community beitreten" (Space-gesperrt).
    private var lockedArea: some View {
        Color.clear
            .aspectRatio(16 / 9, contentMode: .fit)
            .overlay {
                if post.teaserUrl != nil {
                    AsyncImageView(url: post.teaserUrl)
                } else {
                    BrandCoverPlaceholder(name: community.name, brand: brand)
                }
            }
            .overlay {
                if let unlock = post.unlock {
                    LockedOverlay(unlock: unlock, onUnlock: onUnlock)
                } else {
                    memberLockedOverlay
                }
            }
            .clipped()
    }

    /// Gesperrt ohne `unlock`: Freischalten nur über die Mitgliedschaft.
    private var memberLockedOverlay: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial)
            brand.color.opacity(0.25)
            VStack(spacing: 12) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 54, height: 54)
                    .glassEffect(.regular, in: .circle)
                NavigationLink {
                    CommunityView(slug: community.slug)
                } label: {
                    Text("Community beitreten")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(.white, in: .capsule)
                }
                .buttonStyle(.plain)
            }
            .padding(16)
        }
    }

    // MARK: - Fußzeile

    private var footer: some View {
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

            detailLink {
                HStack(spacing: 5) {
                    Image(systemName: "bubble.right")
                    Text(Format.compactCount(post.commentCount))
                        .monospacedDigit()
                }
            }
            .accessibilityLabel(Text("Kommentare"))

            Spacer(minLength: 0)
        }
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(Theme.ink.opacity(0.5))
    }

    // MARK: - Detail-Push

    /// NavigationLink zur Post-Detailseite im Branding der Community.
    private func detailLink<Label: View>(@ViewBuilder label: () -> Label) -> some View {
        NavigationLink {
            PostDetailView(slug: community.slug, postId: post.id)
                .brandTheme(brand)
        } label: {
            label()
        }
        .buttonStyle(.plain)
    }
}
