import SwiftUI

/// LINKS-Space: Link-Karten mit Label, Beschreibung und Domain.
/// Tap öffnet die URL im System-Browser.
struct LinksSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: LinksContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand
    @Environment(\.openURL) private var openURL

    init(slug: String,
         space: SpaceDetail,
         content: LinksContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
    }

    var body: some View {
        LazyVStack(spacing: 12) {
            if content.links.isEmpty {
                EmptyStateView(
                    icon: "link",
                    title: "Noch keine Links",
                    message: "Sobald hier Links geteilt werden, erscheinen sie an dieser Stelle."
                )
            } else {
                ForEach(content.links) { link in
                    Button {
                        open(link)
                    } label: {
                        linkCard(for: link)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 16)
    }

    private func linkCard(for link: LinkItem) -> some View {
        AeraCard(padding: 16) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(link.label)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)

                    if let description = link.description, !description.isEmpty {
                        Text(description)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink.opacity(0.6))
                            .multilineTextAlignment(.leading)
                            .lineLimit(2)
                    }

                    if let domain = domain(of: link) {
                        Text(domain)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.ink.opacity(0.5))
                    }
                }

                Spacer(minLength: 8)

                Image(systemName: "arrow.up.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(brand.color)
                    .frame(width: 32, height: 32)
                    .background(brand.soft, in: .circle)
            }
        }
    }

    /// Domain ohne „www.“-Präfix, z. B. „aera.so“.
    private func domain(of link: LinkItem) -> String? {
        guard let host = URL(string: link.url)?.host() else { return nil }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    private func open(_ link: LinkItem) {
        guard let url = URL(string: link.url) else { return }
        openURL(url)
    }
}
