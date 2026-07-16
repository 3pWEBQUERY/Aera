import SwiftUI

/// Root-Tab „Communities": Mitgliedschaften aus `GET /auth/me` als Karten
/// (Community, Stufe, Level, Abo-Status). Tap → `CommunityView`.
/// Nicht eingeloggt: leerer Zustand mit Login-Button.
struct MyCommunitiesView: View {
    @Environment(AppState.self) private var appState

    @State private var memberships: [MembershipHome]?
    @State private var loadErrorMessage: String?
    @State private var showLogin = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Communities")
                        .font(.displaySerif(34))
                        .kerning(-0.4)
                        .foregroundStyle(Theme.ink)

                    content
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
            .background(Theme.paper.ignoresSafeArea())
            .scrollEdgeEffectStyle(.soft, for: .top)
            .navigationBarTitleDisplayMode(.inline)
            .refreshable { await load() }
            .task(id: appState.session.isLoggedIn) {
                await load()
            }
            .sheet(isPresented: $showLogin) {
                LoginSheetView()
            }
        }
    }

    // MARK: - Inhalt

    @ViewBuilder
    private var content: some View {
        if !appState.session.isLoggedIn {
            VStack(spacing: 16) {
                EmptyStateView(
                    icon: "person.2",
                    title: "Deine Communities",
                    message: "Melde dich an, um deine Mitgliedschaften zu sehen."
                )
                Button("Anmelden") {
                    showLogin = true
                }
                .buttonStyle(.brand)
            }
        } else if let memberships {
            if memberships.isEmpty {
                EmptyStateView(
                    icon: "sparkles",
                    title: "Noch keine Mitgliedschaften",
                    message: "Entdecke Communities und tritt deiner ersten bei."
                )
            } else {
                LazyVStack(spacing: 16) {
                    ForEach(memberships) { membership in
                        NavigationLink {
                            CommunityView(slug: membership.community.slug)
                        } label: {
                            MembershipCardView(membership: membership)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        } else if let loadErrorMessage {
            VStack(spacing: 16) {
                EmptyStateView(icon: "wifi.exclamationmark",
                               title: "Laden fehlgeschlagen",
                               message: LocalizedStringKey(loadErrorMessage))
                Button("Erneut versuchen") {
                    self.loadErrorMessage = nil
                    Task { await load() }
                }
                .buttonStyle(.secondary)
            }
        } else {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60)
        }
    }

    // MARK: - Laden

    private func load() async {
        guard appState.session.isLoggedIn else {
            memberships = nil
            loadErrorMessage = nil
            return
        }
        do {
            let response = try await appState.api.me()
            appState.session.update(user: response.user)
            memberships = response.memberships
            loadErrorMessage = nil
        } catch let error as APIError where error.status == 401 {
            appState.session.clear()
            memberships = nil
        } catch {
            if memberships == nil {
                loadErrorMessage = error.localizedDescription
            }
        }
    }
}

// MARK: - MembershipCardView

/// Karte einer Mitgliedschaft: Logo, Name in Serif, Stufe, `LevelChip`
/// und eine Abo-Status-Zeile.
private struct MembershipCardView: View {
    let membership: MembershipHome

    var body: some View {
        AeraCard(padding: 16, cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center, spacing: 12) {
                    AvatarView(url: membership.community.logoUrl,
                               name: membership.community.name,
                               size: 48)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(membership.community.name)
                            .font(.displaySerif(19))
                            .kerning(-0.2)
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        if let tagline = membership.community.tagline, !tagline.isEmpty {
                            Text(tagline)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.ink.opacity(0.55))
                                .lineLimit(1)
                        }
                    }

                    Spacer(minLength: 8)

                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.ink.opacity(0.3))
                }

                HStack(spacing: 6) {
                    if let tier = membership.tier {
                        PillLabel(tier.name, systemImage: "crown")
                    }
                    if let levelName = membership.levelName {
                        LevelChip(levelName: levelName, points: membership.points)
                    }
                    RoleBadge(role: membership.role)
                }

                Text(statusLine)
                    .font(.system(size: 13))
                    .monospacedDigit()
                    .foregroundStyle(Theme.ink.opacity(0.55))
            }
        }
        .environment(\.brand, BrandTheme(primaryHex: membership.community.primaryColor,
                                         accentHex: membership.community.accentColor))
    }

    /// Abo-Status: aktiv/gekündigt/überfällig inkl. Datum; ohne Abo
    /// „Mitglied seit …".
    private var statusLine: String {
        guard let subscription = membership.subscription else {
            let joined = membership.joinedAt.formatted(date: .abbreviated, time: .omitted)
            return String(localized: "Mitglied seit \(joined)")
        }

        let suffix = subscription.isApple ? String(localized: " · Apple-Abo") : ""
        let periodEnd = subscription.currentPeriodEnd?
            .formatted(date: .abbreviated, time: .omitted)

        switch subscription.status.lowercased() {
        case "active":
            if subscription.cancelAtPeriodEnd, let periodEnd {
                return String(localized: "Abo endet am \(periodEnd)") + suffix
            }
            if let periodEnd {
                return String(localized: "Abo aktiv · verlängert sich am \(periodEnd)") + suffix
            }
            return String(localized: "Abo aktiv") + suffix
        case "trialing":
            if let periodEnd {
                return String(localized: "Testphase bis \(periodEnd)") + suffix
            }
            return String(localized: "Testphase") + suffix
        case "past_due":
            return String(localized: "Zahlung ausstehend") + suffix
        case "canceled", "cancelled":
            return String(localized: "Abo gekündigt") + suffix
        default:
            return subscription.status + suffix
        }
    }
}
