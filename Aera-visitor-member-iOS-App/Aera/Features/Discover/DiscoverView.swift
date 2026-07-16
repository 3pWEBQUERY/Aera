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
        Text("Entdecken")
            .font(.displaySerif(34))
            .kerning(-0.4)
            .foregroundStyle(Theme.ink)
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

    private func categoryChips(_ categories: [String]) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(categories, id: \.self) { category in
                    categoryChip(category)
                }
            }
            .padding(.vertical, 2)
        }
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
    }

    private func categoryChip(_ category: String) -> some View {
        let isSelected = selectedCategory == category
        return Button {
            withAnimation(.snappy(duration: 0.25)) {
                selectedCategory = isSelected ? nil : category
            }
        } label: {
            Text(category)
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
                SectionHeader("Meine Communities")
                ScrollView(.horizontal) {
                    HStack(spacing: 12) {
                        ForEach(discover.myCommunities) { community in
                            communityLink(community)
                                .frame(width: 280)
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .scrollClipDisabled()
            }
        }

        if !discover.popular.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Beliebt")
                LazyVStack(spacing: 16) {
                    ForEach(discover.popular) { community in
                        communityLink(community)
                    }
                }
            }
        }

        if !discover.newest.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Neu")
                LazyVStack(spacing: 16) {
                    ForEach(discover.newest) { community in
                        communityLink(community)
                    }
                }
            }
        }

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
                        if let category = community.category, !category.isEmpty {
                            PillLabel(category)
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
