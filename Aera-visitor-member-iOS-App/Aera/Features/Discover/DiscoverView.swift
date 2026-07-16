import SwiftUI

/// Root-Tab „Entdecken": Suche (`GET /discover/search`, debounced),
/// Kategorie-Chips und die Sektionen „Meine Communities" (nur eingeloggt),
/// „Beliebt" und „Neu" aus `GET /discover`.
struct DiscoverView: View {
    @Environment(AppState.self) private var appState

    @State private var discover: DiscoverResponse?
    @State private var loadErrorMessage: String?
    @State private var searchText = ""
    @State private var selectedCategory: String?
    @State private var searchResults: [CommunityCard]?
    @State private var isSearching = false
    @State private var showLogin = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    titleHeader

                    if !appState.session.isLoggedIn {
                        loginCard
                    }

                    if let categories = discover?.categories, !categories.isEmpty {
                        categoryChips(categories)
                    }

                    if isFilterActive {
                        searchSection
                    } else if let discover {
                        sections(discover)
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
                if discover == nil {
                    await load()
                }
            }
            .task(id: searchKey) {
                await runSearch()
            }
            .sheet(isPresented: $showLogin) {
                LoginSheetView {
                    Task { await load() }
                }
            }
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
                    Text("Melde dich an, um deine Communities zu sehen.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink.opacity(0.55))
                }

                Spacer(minLength: 8)

                Button("Anmelden") {
                    showLogin = true
                }
                .buttonStyle(.secondary)
            }
        }
    }

    // MARK: - Kategorien

    private func categoryChips(_ categories: [DiscoverCategory]) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                allChip
                ForEach(categories) { category in
                    categoryChip(category)
                }
            }
            .padding(.vertical, 2)
        }
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
    }

    private var allChip: some View {
        let isSelected = selectedCategory == nil
        return Button {
            withAnimation(.snappy(duration: 0.25)) {
                selectedCategory = nil
            }
        } label: {
            Text("Alle")
                .font(.system(size: 13, weight: isSelected ? .semibold : .medium))
                .foregroundStyle(isSelected ? .white : Theme.ink.opacity(0.7))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(isSelected ? Theme.ink : Theme.softFill, in: .capsule)
        }
        .buttonStyle(.plain)
    }

    private func categoryChip(_ category: DiscoverCategory) -> some View {
        let isSelected = selectedCategory == category.key
        return Button {
            withAnimation(.snappy(duration: 0.25)) {
                selectedCategory = isSelected ? nil : category.key
            }
        } label: {
            Text(category.label)
                .font(.system(size: 13, weight: isSelected ? .semibold : .medium))
                .foregroundStyle(isSelected ? .white : Theme.ink.opacity(0.7))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(isSelected ? Theme.ink : Theme.softFill, in: .capsule)
        }
        .buttonStyle(.plain)
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
    private func sections(_ discover: DiscoverResponse) -> some View {
        if appState.session.isLoggedIn, !discover.myCommunities.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Deine Communities")
                ScrollView(.horizontal) {
                    HStack(spacing: 12) {
                        ForEach(discover.myCommunities) { community in
                            NavigationLink {
                                CommunityView(slug: community.slug)
                            } label: {
                                MyCommunityCompactCard(community: community)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .scrollClipDisabled()
            }
        }

        if let topics = discover.topics, !topics.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Themen entdecken")
                ScrollView(.horizontal) {
                    HStack(spacing: 12) {
                        ForEach(Array(topics.enumerated()), id: \.element.id) { index, topic in
                            Button {
                                withAnimation(.snappy(duration: 0.25)) {
                                    selectedCategory = topic.key
                                }
                            } label: {
                                TopicTile(topic: topic,
                                          tone: TopicTile.tones[index % TopicTile.tones.count])
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .scrollClipDisabled()
            }
        }

        if let creatorRows = discover.topCreators {
            ForEach(creatorRows) { row in
                if !row.communities.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            EyebrowLabel("Top-Kreative")
                            Text(row.label)
                                .font(.displaySerif(22))
                                .kerning(-0.3)
                                .foregroundStyle(Theme.ink)
                        }
                        ScrollView(.horizontal) {
                            HStack(spacing: 12) {
                                ForEach(row.communities) { community in
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
            }
        }

        if !discover.popular.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Beliebt")
                ScrollView(.horizontal) {
                    HStack(spacing: 12) {
                        ForEach(discover.popular) { community in
                            communityLink(community)
                                .frame(width: 300)
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .scrollClipDisabled()
            }
        }

        if !discover.newest.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Neu")
                ScrollView(.horizontal) {
                    HStack(spacing: 12) {
                        ForEach(discover.newest) { community in
                            communityLink(community)
                                .frame(width: 300)
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .scrollClipDisabled()
            }
        }

        creatorCTA

        if discover.popular.isEmpty, discover.newest.isEmpty, discover.myCommunities.isEmpty {
            EmptyStateView(
                icon: "sparkles",
                title: "Noch nichts zu entdecken",
                message: "Sobald hier Communities verfügbar sind, erscheinen sie an dieser Stelle."
            )
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

    /// Dunkler Creator-Banner wie auf der Web-Discover-Seite (führt zu /start im Web).
    private var creatorCTA: some View {
        VStack(alignment: .leading, spacing: 12) {
            (Text("Deine Inhalte. Deine Mitglieder. ")
                + Text("Deine Community.").foregroundStyle(.white.opacity(0.55)))
                .font(.displaySerif(24))
                .kerning(-0.3)
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)

            Text("Starte in wenigen Minuten deine eigene Community mit Memberships, Kursen, Events und Shop — unter deiner Marke.")
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)

            Link(destination: AppConfig.baseURL.appending(path: "start")) {
                Label("Community starten", systemImage: "plus")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 11)
                    .background(.white, in: .capsule)
            }
            .padding(.top, 4)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.rail, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    // MARK: - Laden

    private func load() async {
        do {
            discover = try await appState.api.discover()
            loadErrorMessage = nil
        } catch {
            if discover == nil {
                loadErrorMessage = error.localizedDescription
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

// MARK: - Discover-Bausteine (Web-Home-Pendants)

/// Kompakte „Deine Communities"-Karte: Logo + Name + Mitgliederzahl (Web: HScrollRow).
private struct MyCommunityCompactCard: View {
    let community: CommunityCard

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(url: community.logoUrl, name: community.name, size: 44)
            VStack(alignment: .leading, spacing: 3) {
                Text(community.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Text("\(community.memberCount) Mitglieder")
                    .font(.system(size: 11, weight: .semibold))
                    .kerning(1.2)
                    .textCase(.uppercase)
                    .foregroundStyle(Theme.ink.opacity(0.45))
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(width: 260, alignment: .leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
    }
}

/// „Themen entdecken"-Kachel mit den Marketing-Tönen der Web-App.
private struct TopicTile: View {
    let topic: DiscoverTopic
    let tone: (background: Color, foreground: Color)

    /// Poster-Palette aus app/home/page.tsx (CATEGORY_TILE_TONES).
    static let tones: [(background: Color, foreground: Color)] = [
        (Color(hex: "#ECE7DC"), Color(hex: "#161613")),
        (Color(hex: "#21372B"), Color(hex: "#ECE7DC")),
        (Color(hex: "#C8553A"), Color(hex: "#F7F1E8")),
        (Color(hex: "#1C1C19"), Color(hex: "#ECE7DC")),
        (Color(hex: "#D8D1F0"), Color(hex: "#241458")),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Thema")
                    .font(.system(size: 11, weight: .semibold))
                    .kerning(1.6)
                    .textCase(.uppercase)
                Spacer()
                Image(systemName: "sparkles")
                    .font(.system(size: 13, weight: .medium))
            }
            .opacity(0.75)

            Spacer(minLength: 12)

            Text(topic.label)
                .font(.displaySerif(21))
                .kerning(-0.3)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            Text("\(topic.count) Communities")
                .font(.system(size: 12))
                .opacity(0.75)
                .padding(.top, 3)
        }
        .padding(16)
        .frame(width: 210, height: 140, alignment: .leading)
        .foregroundStyle(tone.foreground)
        .background(tone.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// „Top-Kreative"-Posterkarte: Hochformat-Cover, Logo-Badge, Name darunter.
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
                .padding(14)
            }
        }
        .environment(\.brand, BrandTheme(primaryHex: community.primaryColor,
                                         accentHex: community.accentColor))
    }

    @ViewBuilder
    private var cover: some View {
        if community.coverUrl != nil {
            Color.clear
                .aspectRatio(16 / 9, contentMode: .fit)
                .overlay {
                    AsyncImageView(url: community.coverUrl)
                }
                .clipped()
        } else {
            BrandCoverPlaceholder(name: community.name,
                                  brand: BrandTheme(primaryHex: community.primaryColor,
                                                    accentHex: community.accentColor))
                .aspectRatio(16 / 9, contentMode: .fit)
        }
    }
}
