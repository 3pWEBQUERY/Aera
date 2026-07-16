import SwiftUI

/// KNOWLEDGE-Space: Artikelliste mit clientseitiger Suche (schlichtes
/// TextField mit Lupe — `.searchable` steht in der eingebetteten View ohne
/// eigenen NavigationStack nicht zur Verfügung). Gesperrte Artikel werden
/// mit Schloss und disabled-Optik gezeigt; Tap öffnet das Artikel-Detail.
struct KnowledgeSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: KnowledgeContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var query = ""

    init(slug: String,
         space: SpaceDetail,
         content: KnowledgeContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
    }

    private var filteredArticles: [KnowledgeArticle] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return content.articles }
        return content.articles.filter { article in
            article.title.localizedCaseInsensitiveContains(trimmed)
                || article.excerpt.localizedCaseInsensitiveContains(trimmed)
        }
    }

    var body: some View {
        LazyVStack(spacing: 12) {
            if content.articles.isEmpty {
                EmptyStateView(
                    icon: "books.vertical",
                    title: "Noch keine Artikel",
                    message: "Sobald hier Wissensartikel veröffentlicht werden, erscheinen sie an dieser Stelle."
                )
            } else {
                searchField

                if filteredArticles.isEmpty {
                    EmptyStateView(
                        icon: "magnifyingglass",
                        title: "Keine Treffer",
                        message: "Für deine Suche wurden keine Artikel gefunden."
                    )
                } else {
                    ForEach(filteredArticles) { article in
                        articleRow(for: article)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .animation(.snappy(duration: 0.25), value: filteredArticles)
    }

    // MARK: - Suche

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.ink.opacity(0.45))

            TextField("Artikel durchsuchen", text: $query)
                .font(.system(size: 15))
                .foregroundStyle(Theme.ink)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.ink.opacity(0.3))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Suche löschen")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Theme.border, lineWidth: 1)
        )
    }

    // MARK: - Zeilen

    @ViewBuilder
    private func articleRow(for article: KnowledgeArticle) -> some View {
        if article.locked {
            articleCard(for: article)
        } else {
            NavigationLink {
                KnowledgeArticleDetailView(article: article)
            } label: {
                articleCard(for: article)
            }
            .buttonStyle(.plain)
        }
    }

    private func articleCard(for article: KnowledgeArticle) -> some View {
        AeraCard(padding: 16) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    if article.locked {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.ink.opacity(0.45))
                    }
                    Text(article.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)
                }

                Text(article.excerpt)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink.opacity(0.6))
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)

                Text("Aktualisiert \(article.updatedAt.relativeLabel)")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.ink.opacity(0.5))

                if article.locked {
                    Text("Mit Mitgliedschaft verfügbar")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.amber800)
                }
            }
            .opacity(article.locked ? 0.55 : 1)
        }
    }
}

// MARK: - KnowledgeArticleDetailView

/// Artikel-Detail: Titel in Display-Serif 26 und HTML-Body
/// auf Paper-Hintergrund.
struct KnowledgeArticleDetailView: View {
    let article: KnowledgeArticle

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(article.title)
                    .font(.displaySerif(26))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)

                Text("Aktualisiert \(article.updatedAt.relativeLabel)")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink.opacity(0.5))

                Divider()
                    .overlay(Theme.border)

                if let bodyHtml = article.bodyHtml, !bodyHtml.isEmpty {
                    HTMLTextView(html: bodyHtml)
                } else {
                    Text(article.excerpt)
                        .font(.displaySerif(17, weight: .regular))
                        .foregroundStyle(Theme.ink)
                }
            }
            .padding(16)
        }
        .background(Theme.paper)
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle(article.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
