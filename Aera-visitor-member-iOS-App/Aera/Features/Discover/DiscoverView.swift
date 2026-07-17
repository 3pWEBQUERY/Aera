import SwiftUI

/// Tab „Entdecken" (Patreon-artige Explore-Seite, `GET /explore`):
/// Suche (`GET /discover/search`, debounced), „Im Trend"-Kategorie-Chips,
/// „Zuletzt besucht" (lokale Slugs via `RecentCommunitiesStore`, hydriert über
/// `GET /communities/cards`), „Kreative für dich" und „Diese Woche beliebt",
/// darunter der Creator-CTA mit In-App-Erstellung.
///
/// `embedded: true` lässt den eigenen `NavigationStack` weg — so ist die
/// Seite aus der Startseite pushbar (Lupe/„Communities entdecken").
struct DiscoverView: View {
    @Environment(AppState.self) private var appState

    @State private var explore: ExploreResponse?
    @State private var recentCommunities: [CommunityCard] = []
    /// `true`, sobald der Nutzer eine eigene Community besitzt (OWNER-Rolle)
    /// → Creator-CTA ausblenden (wie `discover.ownsCommunity` zuvor).
    @State private var ownsCommunity = false
    @State private var loadErrorMessage: String?
    @State private var searchText = ""
    @State private var selectedCategory: String?
    @State private var searchResults: [CommunityCard]?
    @State private var isSearching = false
    @State private var showLogin = false
    @State private var showCreateCommunity = false
    /// Nach Login über den Creator-CTA direkt das Create-Sheet öffnen.
    @State private var pendingCreateAfterLogin = false
    @State private var createdCommunity: CreatedCommunity?
    /// Vollständige Kategorien-Liste für `CreateCommunityView` — wird erst
    /// beim Öffnen des Create-Sheets über `GET /discover` geladen
    /// (Fallback: `explore.trending`).
    @State private var createCategories: [DiscoverCategory] = []

    private let embedded: Bool

    init(embedded: Bool = false) {
        self.embedded = embedded
    }

    var body: some View {
        if embedded {
            content
        } else {
            NavigationStack {
                content
            }
        }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                titleHeader

                if !appState.session.isLoggedIn {
                    loginCard
                }

                if isFilterActive {
                    searchSection
                } else if let explore {
                    sections(explore)
                } else if let loadErrorMessage {
                    loadErrorCard(loadErrorMessage)
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 60)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .background(Theme.paper.ignoresSafeArea())
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: Text("Communities suchen"))
        .refreshable { await load() }
        .task {
            if explore == nil {
                await load()
            }
        }
        .task(id: searchKey) {
            await runSearch()
        }
        .sheet(isPresented: $showLogin) {
            LoginSheetView {
                Task { await load() }
                if pendingCreateAfterLogin {
                    pendingCreateAfterLogin = false
                    prepareCreateCategories()
                    // Kurz warten, bis das Login-Sheet weggeräumt ist,
                    // sonst verschluckt SwiftUI die zweite Präsentation.
                    Task {
                        try? await Task.sleep(for: .milliseconds(450))
                        showCreateCommunity = true
                    }
                }
            }
        }
        .sheet(isPresented: $showCreateCommunity) {
            CreateCommunityView(categories: createCategories) { slug in
                Task {
                    await load()
                    createdCommunity = CreatedCommunity(slug: slug)
                }
            }
        }
        .navigationDestination(item: $createdCommunity) { created in
            CommunityView(slug: created.slug)
        }
    }

    // MARK: - Kopf

    private var titleHeader: some View {
        VStack(alignment: .leading, spacing: 6) {
            EyebrowLabel("Communities & Creator")
            Text("Entdecken.")
                .font(.displaySerif(34))
                .kerning(-0.4)
                .foregroundStyle(Theme.ink)
        }
    }

    private var loginCard: some View {
        AeraCard(padding: 16) {
            HStack(spacing: 12) {
                Image(systemName: "person.crop.circle.badge.checkmark")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.defaultBrand)
                    .frame(width: 40, height: 40)
                    .background(Theme.defaultBrand.opacity(0.1), in: .circle)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Schon dabei?")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                    Text("Melde dich an, um Empfehlungen für dich zu sehen.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink.opacity(0.55))
                }

                Spacer(minLength: 8)

                Button("Anmelden") {
                    pendingCreateAfterLogin = false
                    showLogin = true
                }
                .buttonStyle(.secondary)
            }
        }
    }

    // MARK: - Suche

    private var trimmedQuery: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isFilterActive: Bool {
        !trimmedQuery.isEmpty || selectedCategory != nil
    }

    private var searchKey: String {
        "\(trimmedQuery)|\(selectedCategory ?? "")"
    }

    @ViewBuilder
    private var searchSection: some View {
        activeCategoryChip

        if isSearching {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60)
        } else if let searchResults {
            if searchResults.isEmpty {
                ContentUnavailableView.search(text: trimmedQuery)
                    .padding(.vertical, 24)
            } else {
                LazyVStack(spacing: 16) {
                    ForEach(searchResults) { community in
                        communityLink(community)
                    }
                }
            }
        }
    }

    /// Aktiver Kategorie-Filter als abwählbarer Chip (die alte Chip-Leiste
    /// wurde durch „Im Trend" ersetzt — hier lässt sich der Filter lösen).
    @ViewBuilder
    private var activeCategoryChip: some View {
        if let selectedCategory {
            Button {
                withAnimation(.snappy(duration: 0.25)) {
                    self.selectedCategory = nil
                }
            } label: {
                HStack(spacing: 6) {
                    Text(categoryLabel(for: selectedCategory))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.7))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Theme.ink, in: .capsule)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Filter \(categoryLabel(for: selectedCategory)) entfernen"))
        }
    }

    private func categoryLabel(for key: String) -> String {
        explore?.trending.first(where: { $0.key == key })?.label
            ?? createCategories.first(where: { $0.key == key })?.label
            ?? key.capitalized
    }

    private func runSearch() async {
        guard isFilterActive else {
            searchResults = nil
            isSearching = false
            return
        }
        isSearching = true
        // Debounce: erst nach kurzer Tipp-Pause suchen.
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        do {
            let results = try await appState.api.searchCommunities(query: trimmedQuery,
                                                                   category: selectedCategory)
            guard !Task.isCancelled else { return }
            searchResults = results
        } catch {
            guard !Task.isCancelled else { return }
            searchResults = []
        }
        isSearching = false
    }

    // MARK: - Sektionen

    @ViewBuilder
    private func sections(_ explore: ExploreResponse) -> some View {
        if !explore.trending.isEmpty {
            trendingSection(explore.trending)
        }

        if !recentCommunities.isEmpty {
            recentSection
        }

        if !explore.forYou.isEmpty {
            forYouSection(explore.forYou)
        }

        if !explore.popularWeek.isEmpty {
            popularWeekSection(explore.popularWeek)
        }

        // CTA ausblenden, sobald der Nutzer bereits eine eigene Community besitzt.
        if !ownsCommunity {
            creatorCTA
        }

        if explore.trending.isEmpty, explore.forYou.isEmpty, explore.popularWeek.isEmpty {
            EmptyStateView(
                icon: "sparkles",
                title: "Noch nichts zu entdecken",
                message: "Sobald hier Communities verfügbar sind, erscheinen sie an dieser Stelle."
            )
        }
    }

    // MARK: - Im Trend

    /// Kategorie-Chips in zwei untereinander gestapelten, horizontal
    /// scrollenden Reihen (Items abwechselnd verteilt); Tap setzt den Filter.
    private func trendingSection(_ trending: [DiscoverCategory]) -> some View {
        let firstRow = trending.enumerated().filter { $0.offset.isMultiple(of: 2) }.map(\.element)
        let secondRow = trending.enumerated().filter { !$0.offset.isMultiple(of: 2) }.map(\.element)

        return VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Im Trend")
            ScrollView(.horizontal) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        ForEach(firstRow) { category in
                            trendingChip(category)
                        }
                    }
                    if !secondRow.isEmpty {
                        HStack(spacing: 8) {
                            ForEach(secondRow) { category in
                                trendingChip(category)
                            }
                        }
                    }
                }
                .padding(.vertical, 2)
            }
            .scrollIndicators(.hidden)
            .scrollClipDisabled()
        }
    }

    private func trendingChip(_ category: DiscoverCategory) -> some View {
        Button {
            withAnimation(.snappy(duration: 0.25)) {
                selectedCategory = category.key
            }
        } label: {
            HStack(spacing: 6) {
                Text(category.label)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.ink)
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.ink.opacity(0.4))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(Theme.softFill, in: .capsule)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Zuletzt besucht

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Zuletzt besucht")
            ScrollView(.horizontal) {
                HStack(spacing: 12) {
                    ForEach(recentCommunities) { community in
                        NavigationLink {
                            CommunityView(slug: community.slug)
                        } label: {
                            RecentCommunityRow(community: community)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .scrollIndicators(.hidden)
            .scrollClipDisabled()
        }
    }

    // MARK: - Kreative für dich

    private func forYouSection(_ communities: [CommunityCard]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                if appState.session.isLoggedIn {
                    EyebrowLabel("Basierend auf deinen Mitgliedschaften")
                }
                SectionHeader("Kreative für dich")
            }
            ScrollView(.horizontal) {
                HStack(spacing: 12) {
                    ForEach(communities) { community in
                        NavigationLink {
                            CommunityView(slug: community.slug)
                        } label: {
                            CreatorPosterCard(community: community)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .scrollIndicators(.hidden)
            .scrollClipDisabled()
        }
    }

    // MARK: - Diese Woche beliebt

    private func popularWeekSection(_ communities: [CommunityCard]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Diese Woche beliebt")
            ScrollView(.horizontal) {
                HStack(spacing: 12) {
                    ForEach(communities) { community in
                        communityLink(community)
                            .frame(width: 300)
                    }
                }
            }
            .scrollIndicators(.hidden)
            .scrollClipDisabled()
        }
    }

    private func communityLink(_ community: CommunityCard) -> some View {
        NavigationLink {
            CommunityView(slug: community.slug)
        } label: {
            CommunityCardView(community: community)
        }
        .buttonStyle(.plain)
    }

    /// Dunkler Creator-Banner wie auf der Web-Discover-Seite. Startet die
    /// In-App-Erstellung: eingeloggt → Create-Sheet, sonst Login → Create-Sheet.
    private var creatorCTA: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Deine Inhalte. Deine Mitglieder. \(Text("Deine Community.").foregroundStyle(.white.opacity(0.55)))")
                .font(.displaySerif(24))
                .kerning(-0.3)
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)

            Text("Starte in wenigen Minuten deine eigene Community mit Memberships, Kursen, Events und Shop — unter deiner Marke.")
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)

            Button {
                if appState.session.isLoggedIn {
                    prepareCreateCategories()
                    showCreateCommunity = true
                } else {
                    pendingCreateAfterLogin = true
                    showLogin = true
                }
            } label: {
                Label("Community starten", systemImage: "plus")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 11)
                    .background(.white, in: .capsule)
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.rail, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    // MARK: - Laden

    private func load() async {
        async let exploreResult = appState.api.explore()
        async let recentResult = loadRecentCards()
        async let ownerResult = loadOwnsCommunity()

        do {
            explore = try await exploreResult
            loadErrorMessage = nil
        } catch {
            if explore == nil {
                loadErrorMessage = error.localizedDescription
            }
        }
        if let recent = await recentResult {
            recentCommunities = recent
        }
        ownsCommunity = await ownerResult
    }

    /// Hydriert die lokal gespeicherten „Zuletzt besucht"-Slugs;
    /// `nil` = Anfrage fehlgeschlagen (bestehende Liste behalten).
    private func loadRecentCards() async -> [CommunityCard]? {
        let slugs = RecentCommunitiesStore.slugs()
        guard !slugs.isEmpty else { return [] }
        return try? await appState.api.communityCards(slugs: slugs)
    }

    /// OWNER-Rolle in irgendeiner Mitgliedschaft = eigene Community vorhanden.
    private func loadOwnsCommunity() async -> Bool {
        guard appState.session.isLoggedIn else { return false }
        guard let me = try? await appState.api.me() else { return ownsCommunity }
        return me.memberships.contains { $0.role == .owner }
    }

    /// Lädt die vollständige Kategorien-Liste für das Create-Sheet nach
    /// (nur beim Öffnen; Fallback: Trend-Kategorien aus `GET /explore`).
    private func prepareCreateCategories() {
        guard createCategories.isEmpty else { return }
        createCategories = explore?.trending ?? []
        Task {
            if let response = try? await appState.api.discover() {
                createCategories = response.categories
            }
        }
    }

    private func loadErrorCard(_ message: String) -> some View {
        VStack(spacing: 16) {
            EmptyStateView(icon: "wifi.exclamationmark",
                           title: "Laden fehlgeschlagen",
                           message: "Die Communities konnten nicht geladen werden.")
            Button("Erneut versuchen") {
                loadErrorMessage = nil
                Task { await load() }
            }
            .buttonStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

/// Hashable-Wrapper für `navigationDestination(item:)` — Slug der frisch
/// erstellten Community.
private struct CreatedCommunity: Identifiable, Hashable {
    let slug: String

    var id: String { slug }
}

// MARK: - RecentCommunityRow

/// Kompakte „Zuletzt besucht"-Zeile: Logo 44 + Name.
private struct RecentCommunityRow: View {
    let community: CommunityCard

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(url: community.logoUrl, name: community.name, size: 44)
                .environment(\.brand, BrandTheme(primaryHex: community.primaryColor,
                                                 accentHex: community.accentColor))
            Text(community.name)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(width: 210, alignment: .leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
    }
}

// MARK: - CreatorPosterCard

/// Posterkarte („Kreative für dich"): Hochformat-Cover, Logo-Badge, Name darunter.
private struct CreatorPosterCard: View {
    let community: CommunityCard

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topLeading) {
                cover
                    .frame(width: 150, height: 200)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                AvatarView(url: community.logoUrl, name: community.name, size: 28)
                    .padding(8)
            }
            Text(community.name)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
                .frame(width: 150, alignment: .leading)
        }
    }

    @ViewBuilder
    private var cover: some View {
        if community.coverUrl != nil {
            AsyncImageView(url: community.coverUrl)
        } else {
            ZStack {
                BrandTheme(primaryHex: community.primaryColor,
                           accentHex: community.accentColor).color
                Text(community.name.prefix(1).uppercased())
                    .font(.displaySerif(56))
                    .foregroundStyle(.white.opacity(0.25))
            }
        }
    }
}

// MARK: - CommunityCardView

/// Community-Karte für Discover-Listen: Cover 16:9 (Radius 16 über die Karte),
/// Logo als `AvatarView`, Name in Serif, Tagline und Mitglieder-Chip.
private struct CommunityCardView: View {
    let community: CommunityCard

    var body: some View {
        AeraCard(padding: 0, cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 0) {
                cover
                    .clipShape(
                        UnevenRoundedRectangle(topLeadingRadius: 16, topTrailingRadius: 16)
                    )

                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .center, spacing: 10) {
                        AvatarView(url: community.logoUrl, name: community.name, size: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(community.name)
                                .font(.displaySerif(18))
                                .kerning(-0.2)
                                .foregroundStyle(Theme.ink)
                                .lineLimit(1)
                            if let tagline = community.tagline, !tagline.isEmpty {
                                Text(tagline)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.ink.opacity(0.55))
                                    .lineLimit(2)
                            }
                        }
                    }

                    // Pills unten anpinnen — hält alle Karten gleich hoch.
                    Spacer(minLength: 0)

                    // Scrollbar statt Umbruch/Überlauf, falls die Pills breiter als die Karte sind.
                    ScrollView(.horizontal) {
                        HStack(spacing: 6) {
                            PillLabel(String(localized: "\(community.memberCount) Mitglieder"),
                                      systemImage: "person.2")
                            if let categoryLabel = community.categoryLabel ?? community.category,
                               !categoryLabel.isEmpty {
                                PillLabel(categoryLabel)
                            }
                            if community.isMember {
                                PillLabel(String(localized: "Mitglied"),
                                          systemImage: "checkmark",
                                          prominent: true)
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            // Einheitliche Kartenhöhe, unabhängig von Tagline-Länge:
            // Cover 170 + Inhalt fix.
            .frame(height: 306, alignment: .top)
        }
        .environment(\.brand, BrandTheme(primaryHex: community.primaryColor,
                                         accentHex: community.accentColor))
    }

    /// Festes Cover-Format (Höhe 170), unabhängig vom Seitenverhältnis des Bildes —
    /// Hochformat-Cover können die Karte so nicht mehr aufblähen.
    private var cover: some View {
        Group {
            if community.coverUrl != nil {
                Color.clear
                    .overlay {
                        AsyncImageView(url: community.coverUrl)
                    }
            } else {
                BrandCoverPlaceholder(name: community.name,
                                      brand: BrandTheme(primaryHex: community.primaryColor,
                                                        accentHex: community.accentColor))
            }
        }
        .frame(height: 170)
        .frame(maxWidth: .infinity)
        .clipped()
    }
}
