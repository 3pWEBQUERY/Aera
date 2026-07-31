import SwiftUI

/// Zentraler Community-Screen (DESIGN.md §4): Hero, Announcement-Banner,
/// sticky Space-Chip-Bar (Glass) und darunter der Inhalt des gewählten
/// Spaces inline (`SpaceContentView`).
///
/// Toolbar: Nichtmitglieder sehen eine „Beitreten"-Brand-Kapsel (JoinView-Sheet),
/// Mitglieder Glocke (Badge = `viewer.unreadNotifications`) und Suche.
struct CommunityView: View {
    let slug: String

    @Environment(AppState.self) private var appState

    @State private var response: CommunityResponse?
    @State private var loadErrorMessage: String?
    @State private var selectedSpaceSlug: String?
    /// Erhöht sich bei Pull-to-Refresh/Join/neuem Beitrag → setzt den
    /// Space-Cache in `SpaceContentView` zurück (`.id`).
    @State private var spaceRefreshToken = 0
    @State private var showJoin = false
    @State private var composeContext: ComposeContext?
    @State private var showComposer = false
    /// Ziel eines Menüpunkts der Kopfzeile.
    @State private var heroRoute: HeroRoute?
    /// Adresse, die geteilt werden soll (Menüpunkt „Teilen").
    @State private var shareURL: ShareTarget?

    @Environment(\.openURL) private var openURL

    init(slug: String) {
        self.slug = slug
    }

    var body: some View {
        Group {
            if let response {
                content(response)
            } else if let loadErrorMessage {
                errorView(loadErrorMessage)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .brandTheme(brand)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbarContent }
        .overlay(alignment: .bottomTrailing) {
            if composeContext != nil {
                composeButton
            }
        }
        .onPreferenceChange(ComposeContextKey.self) { value in
            composeContext = value
        }
        .sheet(isPresented: $showJoin) {
            JoinView(slug: slug) {
                await reloadAll()
            }
        }
        .navigationDestination(item: $heroRoute) { route in
            heroDestination(route)
        }
        .sheet(item: $shareURL) { target in
            ShareSheet(items: [target.url])
        }
        .sheet(isPresented: $showComposer) {
            if let composeContext {
                PostComposerSheet(slug: slug,
                                  spaceSlug: composeContext.spaceSlug,
                                  withTitle: composeContext.withTitle) { _ in
                    spaceRefreshToken += 1
                }
            }
        }
        .task {
            if response == nil {
                await loadCommunity()
            }
        }
    }

    private var brand: BrandTheme {
        BrandTheme(primaryHex: response?.community.primaryColor,
                   accentHex: response?.community.accentColor)
    }

    // MARK: - Inhalt

    private func content(_ response: CommunityResponse) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16, pinnedViews: [.sectionHeaders]) {
                hero(response)
                    .padding(.horizontal, 16)

                if let announcement = response.announcement {
                    announcementBanner(announcement)
                        .padding(.horizontal, 16)
                }

                Section {
                    if let summary = selectedSpaceSummary(in: response) {
                        SpaceContentView(slug: slug,
                                         spaceSummary: summary,
                                         viewer: response.viewer) {
                            await loadCommunity()
                        }
                        .id(spaceRefreshToken)
                        .padding(.top, 4)
                    } else {
                        EmptyStateView(
                            icon: "square.grid.2x2",
                            title: "Keine Bereiche",
                            message: "Diese Community hat noch keine sichtbaren Bereiche."
                        )
                        .padding(.horizontal, 16)
                    }
                } header: {
                    if !response.spaces.isEmpty {
                        GlassChipBar(spaces: sortedSpaces(response),
                                     selection: $selectedSpaceSlug)
                            .padding(.vertical, 2)
                    }
                }
            }
            .padding(.top, 8)
            .padding(.bottom, 48)
        }
        .scrollEdgeEffectStyle(.soft, for: .top)
        .refreshable { await reloadAll() }
    }

    private func sortedSpaces(_ response: CommunityResponse) -> [SpaceSummary] {
        response.spaces.sorted { $0.sortOrder < $1.sortOrder }
    }

    private func selectedSpaceSummary(in response: CommunityResponse) -> SpaceSummary? {
        let spaces = sortedSpaces(response)
        if let selectedSpaceSlug,
           let summary = spaces.first(where: { $0.slug == selectedSpaceSlug }) {
            return summary
        }
        return spaces.first(where: \.accessible) ?? spaces.first
    }

    // MARK: - Hero

    private func hero(_ response: CommunityResponse) -> some View {
        CommunityHeroView(community: response.community,
                          viewer: response.viewer,
                          header: response.header) { item in
            handle(item, in: response)
        }
    }

    // MARK: - Menüzeile

    /// Ziel eines Menüpunkts, das als eigene Seite geöffnet wird.
    private enum HeroRoute: Hashable, Identifiable {
        case members
        case leaderboard
        case library
        case search

        var id: Self { self }
    }

    @ViewBuilder
    private func heroDestination(_ route: HeroRoute) -> some View {
        switch route {
        case .members:
            MembersView(slug: slug).brandTheme(brand)
        case .leaderboard:
            LeaderboardView(slug: slug).brandTheme(brand)
        case .library:
            LibraryView(slug: slug).brandTheme(brand)
        case .search:
            CommunitySearchView(slug: slug).brandTheme(brand)
        }
    }

    /// Was ein Menüpunkt tut. Bereiche wählt die Chip-Leiste aus — sie sind
    /// keine eigene Seite, sondern der Inhalt unter der Kopfzeile.
    private func handle(_ item: HeroMenuItem, in response: CommunityResponse) {
        switch item.type {
        case .space, .tips:
            if let target = item.spaceSlug,
               response.spaces.contains(where: { $0.slug == target }) {
                withAnimation(.snappy(duration: 0.25)) { selectedSpaceSlug = target }
            }
        case .live:
            if let live = response.spaces.first(where: { $0.type == .live }) {
                withAnimation(.snappy(duration: 0.25)) { selectedSpaceSlug = live.slug }
            }
        case .home:
            withAnimation(.snappy(duration: 0.25)) { selectedSpaceSlug = nil }
        case .members:
            heroRoute = .members
        case .leaderboard:
            heroRoute = .leaderboard
        case .library:
            heroRoute = .library
        case .search:
            heroRoute = .search
        case .join:
            showJoin = true
        case .share:
            shareURL = ShareTarget(url: AppConfig.baseURL.appending(path: "c/\(slug)"))
        case .link:
            if let raw = item.url, let url = URL(string: raw) {
                openURL(url)
            }
        case .unknown:
            break
        }
    }

    // MARK: - Announcement

    @ViewBuilder
    private func announcementBanner(_ announcement: Announcement) -> some View {
        if let href = announcement.href, let url = AppConfig.mediaURL(href) {
            Link(destination: url) {
                announcementLabel(announcement, showsLinkIcon: true)
            }
            .buttonStyle(.plain)
        } else {
            announcementLabel(announcement, showsLinkIcon: false)
        }
    }

    private func announcementLabel(_ announcement: Announcement, showsLinkIcon: Bool) -> some View {
        let background = Color(validatingHex: announcement.bgColor) ?? Theme.rail
        let foreground = Color(validatingHex: announcement.textColor) ?? .white
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)

        return HStack(alignment: .center, spacing: 10) {
            Image(systemName: "megaphone.fill")
                .font(.system(size: 13, weight: .semibold))
            Text(announcement.message)
                .font(.system(size: 14, weight: .medium))
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            if showsLinkIcon {
                Spacer(minLength: 4)
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 12, weight: .semibold))
            }
        }
        .foregroundStyle(foreground)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(background, in: shape)
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        if let response {
            if response.viewer.isMember {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        CommunitySearchView(slug: slug)
                            .brandTheme(brand)
                    } label: {
                        Image(systemName: "magnifyingglass")
                    }
                    .accessibilityLabel(Text("Suche"))
                }
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        NotificationsView(slug: slug)
                            .brandTheme(brand)
                    } label: {
                        bellIcon(unread: response.viewer.unreadNotifications)
                    }
                    .accessibilityLabel(Text("Benachrichtigungen"))
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        NavigationLink {
                            MembersView(slug: slug)
                                .brandTheme(brand)
                        } label: {
                            Label("Mitglieder", systemImage: "person.2")
                        }
                        NavigationLink {
                            LeaderboardView(slug: slug)
                                .brandTheme(brand)
                        } label: {
                            Label("Rangliste", systemImage: "trophy")
                        }
                        NavigationLink {
                            LibraryView(slug: slug)
                                .brandTheme(brand)
                        } label: {
                            Label("Bibliothek", systemImage: "books.vertical")
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                    .accessibilityLabel(Text("Mehr"))
                }
            } else {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showJoin = true
                    } label: {
                        Text("Beitreten")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(brand.color, in: .capsule)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func bellIcon(unread: Int) -> some View {
        Image(systemName: "bell")
            .overlay(alignment: .topTrailing) {
                if unread > 0 {
                    Text(unread > 99 ? "99+" : "\(unread)")
                        .font(.system(size: 10, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .padding(.horizontal, 4)
                        .frame(minWidth: 15, minHeight: 15)
                        .background(brand.accent, in: .capsule)
                        .offset(x: 8, y: -7)
                }
            }
    }

    // MARK: - Compose-Button

    private var composeButton: some View {
        Button {
            showComposer = true
        } label: {
            Image(systemName: "square.and.pencil")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.tint(brand.color).interactive(), in: .circle)
        .padding(.trailing, 20)
        .padding(.bottom, 24)
        .accessibilityLabel(Text("Beitrag verfassen"))
    }

    // MARK: - Fehler

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
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
                        loadErrorMessage = nil
                        Task { await loadCommunity() }
                    }
                    .buttonStyle(.secondary)
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // MARK: - Laden

    private func loadCommunity() async {
        do {
            let loaded = try await appState.api.community(slug: slug)
            response = loaded
            loadErrorMessage = nil
            RecentCommunitiesStore.record(slug: slug)
            if selectedSpaceSlug == nil || !loaded.spaces.contains(where: { $0.slug == selectedSpaceSlug }) {
                let spaces = sortedSpaces(loaded)
                selectedSpaceSlug = (spaces.first(where: \.accessible) ?? spaces.first)?.slug
            }
        } catch {
            if response == nil {
                loadErrorMessage = error.localizedDescription
            }
        }
    }

    /// Community neu laden und den Space-Cache zurücksetzen
    /// (Pull-to-Refresh, nach Beitritt, nach neuem Beitrag).
    private func reloadAll() async {
        await loadCommunity()
        spaceRefreshToken += 1
    }
}

// MARK: - BrandCoverPlaceholder

/// Brand-Fläche als Cover-Ersatz: Verlauf aus der Brand-Farbe mit großer
/// Serif-Initiale in Weiß bei 25 % Opazität (DESIGN.md §4).
struct BrandCoverPlaceholder: View {
    let name: String
    let brand: BrandTheme

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [brand.color, brand.color.mixed(with: .black, amount: 0.25)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Circle()
                .fill(brand.accent.opacity(0.35))
                .frame(width: 180, height: 180)
                .blur(radius: 60)
                .offset(x: 90, y: -50)

            Text(initial)
                .font(.displaySerif(96))
                .foregroundStyle(.white.opacity(0.25))
        }
    }

    private var initial: String {
        guard let first = name.trimmingCharacters(in: .whitespacesAndNewlines).first else {
            return "A"
        }
        return String(first).uppercased()
    }
}
