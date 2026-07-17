import SwiftUI

/// Studio-Startseite einer Community: Statistik-Grid (`GET /studio/{slug}/overview`),
/// Navigations-Zeilen zu Beiträgen, Mitgliedern, Wünschen und Bestellungen,
/// „Event erstellen"-Sheet sowie die letzte Aktivität.
/// MODERATOR-Rollen sehen nur einen Hinweis (Verwaltung erfordert ADMIN).
struct StudioHomeView: View {
    let community: StudioCommunity

    @Environment(AppState.self) private var appState

    @State private var overview: StudioOverview?
    @State private var loadErrorMessage: String?
    @State private var showEventSheet = false
    @State private var successCount = 0

    private var slug: String { community.community.slug }

    private var brandTheme: BrandTheme {
        BrandTheme(primaryHex: community.community.primaryColor,
                   accentHex: community.community.accentColor)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header

                if community.role == .moderator {
                    moderatorHint
                } else {
                    statsSection
                    navigationSection
                    activitySection
                    footnote
                }
            }
            .padding(16)
        }
        .background(Theme.paper.ignoresSafeArea())
        .scrollEdgeEffectStyle(.soft, for: .top)
        .refreshable { await load() }
        .task { await load() }
        .sensoryFeedback(.success, trigger: successCount)
        .sheet(isPresented: $showEventSheet) {
            StudioEventComposeSheet(slug: slug) {
                successCount += 1
            }
            .brandTheme(brandTheme)
        }
        .brandTheme(brandTheme)
    }

    // MARK: - Kopf

    private var header: some View {
        HStack(spacing: 12) {
            AvatarView(url: community.community.logoUrl,
                       name: community.community.name,
                       size: 48)
            VStack(alignment: .leading, spacing: 3) {
                EyebrowLabel("Studio")
                Text(community.community.name)
                    .font(.displaySerif(24))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            RoleBadge(role: community.role)
        }
    }

    // MARK: - Moderator-Hinweis

    private var moderatorHint: some View {
        AeraCard(padding: 16, cornerRadius: 16) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: "info.circle")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.amber800)
                Text("Als Moderator kannst du Inhalte direkt in den Spaces moderieren. Die Studio-Verwaltung steht ab der Rolle Admin zur Verfügung.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.amber800)
            }
        }
    }

    // MARK: - Statistik

    @ViewBuilder
    private var statsSection: some View {
        if let overview {
            statsGrid(overview.stats)
        } else if let loadErrorMessage {
            VStack(spacing: 16) {
                EmptyStateView(
                    icon: "wifi.exclamationmark",
                    title: "Laden fehlgeschlagen",
                    message: LocalizedStringKey(loadErrorMessage)
                )
                Button("Erneut versuchen") {
                    self.loadErrorMessage = nil
                    Task { await load() }
                }
                .buttonStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
        } else {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 32)
        }
    }

    private func statsGrid(_ stats: StudioStats) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
                  spacing: 12) {
            statCard(label: "Mitglieder", value: Format.compactCount(stats.members))
            statCard(label: "Aktiv", value: Format.compactCount(stats.activeMembers))
            statCard(label: "Ausstehend",
                     value: Format.compactCount(stats.pendingMembers),
                     highlighted: stats.pendingMembers > 0)
            statCard(label: "Posts 30 T.", value: Format.compactCount(stats.posts30d))
            statCard(label: "Kommentare 30 T.", value: Format.compactCount(stats.comments30d))
            statCard(label: "Abonnenten", value: Format.compactCount(stats.subscribers))
            statCard(label: "Umsatz 30 T.",
                     value: Format.price(cents: stats.revenueCents30d, currency: stats.currency))
            statCard(label: "Umsatz gesamt",
                     value: Format.price(cents: stats.revenueCentsTotal, currency: stats.currency))
        }
    }

    private func statCard(label: LocalizedStringKey, value: String, highlighted: Bool = false) -> some View {
        AeraCard(padding: 14) {
            VStack(alignment: .leading, spacing: 6) {
                EyebrowLabel(label)
                Text(value)
                    .font(.system(size: 24, weight: .bold))
                    .monospacedDigit()
                    .kerning(-0.4)
                    .foregroundStyle(highlighted ? brandTheme.color : Theme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
    }

    // MARK: - Navigation

    private var navigationSection: some View {
        AeraCard(padding: 0, cornerRadius: 16) {
            VStack(spacing: 0) {
                NavigationLink {
                    StudioPostsView(community: community)
                } label: {
                    studioRow(icon: "square.and.pencil", title: "Beiträge & Planung")
                }
                .buttonStyle(.plain)

                rowDivider

                NavigationLink {
                    StudioMembersView(community: community)
                } label: {
                    studioRow(icon: "person.2",
                              title: "Mitglieder",
                              badge: overview?.stats.pendingMembers ?? community.pendingMembers)
                }
                .buttonStyle(.plain)

                rowDivider

                NavigationLink {
                    StudioRequestsView(community: community)
                } label: {
                    studioRow(icon: "lightbulb", title: "Wünsche")
                }
                .buttonStyle(.plain)

                rowDivider

                NavigationLink {
                    StudioOrdersView(community: community)
                } label: {
                    studioRow(icon: "shippingbox", title: "Bestellungen")
                }
                .buttonStyle(.plain)

                rowDivider

                Button {
                    showEventSheet = true
                } label: {
                    studioRow(icon: "calendar.badge.plus", title: "Event erstellen")
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var rowDivider: some View {
        Divider().padding(.leading, 58)
    }

    private func studioRow(icon: String, title: LocalizedStringKey, badge: Int = 0) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(brandTheme.color)
                .frame(width: 30, height: 30)
                .background(brandTheme.soft, in: .circle)
            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.ink)
            Spacer()
            if badge > 0 {
                Text(Format.compactCount(badge))
                    .font(.system(size: 12, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(brandTheme.color)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(brandTheme.soft, in: .capsule)
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.ink.opacity(0.3))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    // MARK: - Aktivität

    @ViewBuilder
    private var activitySection: some View {
        if let overview, !overview.recentActivity.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Letzte Aktivität")

                AeraCard(padding: 0, cornerRadius: 16) {
                    VStack(spacing: 0) {
                        let items = Array(overview.recentActivity.enumerated())
                        ForEach(items, id: \.offset) { index, item in
                            activityRow(item)
                            if index < items.count - 1 {
                                rowDivider
                            }
                        }
                    }
                }
            }
        }
    }

    private func activityRow(_ item: StudioActivity) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: icon(for: item.kind))
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(brandTheme.color)
                .frame(width: 30, height: 30)
                .background(brandTheme.soft, in: .circle)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                if let subtitle = item.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.ink.opacity(0.55))
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            Text(item.createdAt.relativeLabel)
                .font(.system(size: 12))
                .monospacedDigit()
                .foregroundStyle(Theme.ink.opacity(0.45))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private func icon(for kind: StudioActivity.Kind) -> String {
        switch kind {
        case .memberJoined: "person.badge.plus"
        case .comment: "bubble.left"
        case .order: "bag"
        case .request: "lightbulb"
        }
    }

    // MARK: - Fußnote

    private var footnote: some View {
        Text("Branding, Stufen, Newsletter & Auszahlungen verwaltest du im Web-Dashboard.")
            .font(.system(size: 12))
            .foregroundStyle(Theme.ink.opacity(0.45))
            .frame(maxWidth: .infinity, alignment: .center)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
    }

    // MARK: - Laden

    private func load() async {
        guard community.role != .moderator else { return }
        do {
            overview = try await appState.api.studioOverview(slug: slug)
            loadErrorMessage = nil
        } catch {
            if overview == nil {
                loadErrorMessage = error.localizedDescription
            }
        }
    }
}
