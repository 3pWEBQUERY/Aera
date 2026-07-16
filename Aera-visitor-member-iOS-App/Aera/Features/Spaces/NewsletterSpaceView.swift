import SwiftUI

/// NEWSLETTER-Space: Archivliste der verschickten Kampagnen.
/// Tap öffnet das Detail (`NewsletterDetailView`) mit HTML-Body.
struct NewsletterSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: NewsletterContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    init(slug: String,
         space: SpaceDetail,
         content: NewsletterContent,
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
            if content.campaigns.isEmpty {
                EmptyStateView(
                    icon: "envelope.open",
                    title: "Noch keine Ausgaben",
                    message: "Sobald hier Newsletter verschickt werden, findest du das Archiv an dieser Stelle."
                )
            } else {
                ForEach(content.campaigns) { campaign in
                    NavigationLink {
                        NewsletterDetailView(campaign: campaign)
                    } label: {
                        campaignRow(for: campaign)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 16)
    }

    private func campaignRow(for campaign: NewsletterCampaign) -> some View {
        AeraCard(padding: 16) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(campaign.subject)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)

                    if let preheader = campaign.preheader, !preheader.isEmpty {
                        Text(preheader)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink.opacity(0.6))
                            .multilineTextAlignment(.leading)
                            .lineLimit(2)
                    }

                    Text(campaign.sentAt.relativeLabel)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink.opacity(0.5))
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.ink.opacity(0.3))
            }
        }
    }
}

// MARK: - NewsletterDetailView

/// Newsletter-Detail: Betreff in Display-Serif, Versanddatum und
/// HTML-Body auf Paper-Hintergrund.
struct NewsletterDetailView: View {
    let campaign: NewsletterCampaign

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(campaign.subject)
                    .font(.displaySerif(24))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)

                Text(campaign.sentAt.formatted(date: .long, time: .shortened))
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink.opacity(0.5))

                Divider()
                    .overlay(Theme.border)

                HTMLTextView(html: campaign.bodyHtml)
            }
            .padding(16)
        }
        .background(Theme.paper)
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle("Newsletter")
        .navigationBarTitleDisplayMode(.inline)
    }
}
