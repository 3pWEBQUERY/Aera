import SwiftUI

/// Community-Suche: `.searchable` mit Debounce, Ergebnisse in Sektionen
/// (Beiträge, Kurse, Events, Produkte, Wissen). Gesperrte Treffer zeigen
/// ein Schloss; Beiträge öffnen das Post-Detail.
struct CommunitySearchView: View {
    let slug: String

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var query = ""
    @State private var results: CommunitySearchResponse?
    @State private var isSearching = false
    @State private var searchFailed = false

    init(slug: String) {
        self.slug = slug
    }

    var body: some View {
        ScrollView {
            content
                .padding(16)
        }
        .background(Theme.paper.ignoresSafeArea())
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle("Suche")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: Text("In der Community suchen"))
        .task(id: query) {
            await search()
        }
    }

    private var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Inhalt

    @ViewBuilder
    private var content: some View {
        if trimmedQuery.isEmpty {
            EmptyStateView(
                icon: "magnifyingglass",
                title: "Community durchsuchen",
                message: "Suche nach Beiträgen, Kursen, Events, Produkten und Wissensartikeln."
            )
            .padding(.top, 24)
        } else if isSearching && results == nil {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.top, 48)
        } else if searchFailed {
            VStack(spacing: 16) {
                EmptyStateView(
                    icon: "wifi.exclamationmark",
                    title: "Suche fehlgeschlagen",
                    message: "Die Suche konnte nicht ausgeführt werden."
                )
                Button("Erneut versuchen") {
                    searchFailed = false
                    Task { await search(immediately: true) }
                }
                .buttonStyle(.secondary)
            }
            .padding(.top, 24)
        } else if let results {
            if isEmpty(results) {
                ContentUnavailableView.search(text: trimmedQuery)
                    .padding(.top, 24)
            } else {
                resultSections(results)
            }
        }
    }

    private func isEmpty(_ results: CommunitySearchResponse) -> Bool {
        results.posts.isEmpty
            && results.courses.isEmpty
            && results.events.isEmpty
            && results.products.isEmpty
            && results.knowledge.isEmpty
    }

    private func resultSections(_ results: CommunitySearchResponse) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            if !results.posts.isEmpty {
                section("Beiträge") {
                    ForEach(results.posts) { post in
                        NavigationLink {
                            PostDetailView(slug: slug, postId: post.id)
                                .brandTheme(brand)
                        } label: {
                            resultRow(
                                icon: post.spaceType.symbolName,
                                title: post.title ?? String(post.body?.prefix(80) ?? "Beitrag"),
                                subtitle: post.author.name,
                                locked: post.locked,
                                showsChevron: true
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            if !results.courses.isEmpty {
                section("Kurse") {
                    ForEach(results.courses) { course in
                        resultRow(
                            icon: "graduationcap",
                            title: course.title,
                            subtitle: course.description,
                            locked: !course.accessible
                        )
                    }
                }
            }

            if !results.events.isEmpty {
                section("Events") {
                    ForEach(results.events) { event in
                        resultRow(
                            icon: "calendar",
                            title: event.title,
                            subtitle: event.startsAt.formatted(date: .abbreviated, time: .shortened),
                            locked: !event.accessible
                        )
                    }
                }
            }

            if !results.products.isEmpty {
                section("Produkte") {
                    ForEach(results.products) { product in
                        resultRow(
                            icon: "bag",
                            title: product.name,
                            subtitle: Format.price(cents: product.priceCents, currency: product.currency),
                            locked: false
                        )
                    }
                }
            }

            if !results.knowledge.isEmpty {
                section("Wissen") {
                    ForEach(results.knowledge) { article in
                        resultRow(
                            icon: "books.vertical",
                            title: article.title,
                            subtitle: article.excerpt,
                            locked: article.locked
                        )
                    }
                }
            }
        }
    }

    private func section(_ title: LocalizedStringKey, @ViewBuilder rows: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title)
            rows()
        }
    }

    private func resultRow(icon: String,
                           title: String,
                           subtitle: String?,
                           locked: Bool,
                           showsChevron: Bool = false) -> some View {
        AeraCard(padding: 12) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(brand.color)
                    .frame(width: 36, height: 36)
                    .background(brand.soft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                        .multilineTextAlignment(.leading)
                    if let subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.ink.opacity(0.55))
                            .lineLimit(1)
                    }
                }

                Spacer()

                if locked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.ink.opacity(0.4))
                }
                if showsChevron {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.ink.opacity(0.3))
                }
            }
        }
    }

    // MARK: - Suche

    private func search(immediately: Bool = false) async {
        guard !trimmedQuery.isEmpty else {
            results = nil
            isSearching = false
            searchFailed = false
            return
        }

        if !immediately {
            // Debounce: erst nach kurzer Tipp-Pause suchen.
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
        }

        isSearching = true
        defer { isSearching = false }
        do {
            let response = try await appState.api.searchCommunity(slug: slug, query: trimmedQuery)
            guard !Task.isCancelled else { return }
            results = response
            searchFailed = false
        } catch {
            guard !Task.isCancelled else { return }
            if results == nil { searchFailed = true }
        }
    }
}
