import SwiftUI

/// Einstieg in den Creator-„Studio"-Bereich (`GET /studio`).
/// Genau eine Community → direkt deren `StudioHomeView`; mehrere →
/// Karten-Liste (Logo, Name, Rolle, Kennzahlen) mit Push zur Verwaltung.
struct StudioView: View {
    @Environment(AppState.self) private var appState

    @State private var communities: [StudioCommunity]?
    @State private var loadErrorMessage: String?

    var body: some View {
        Group {
            if let communities {
                if communities.count == 1, let only = communities.first {
                    StudioHomeView(community: only)
                } else {
                    communityList(communities)
                }
            } else if let loadErrorMessage {
                errorState(loadErrorMessage)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationTitle("Studio")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    // MARK: - Liste

    private func communityList(_ communities: [StudioCommunity]) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Studio")
                    .font(.displaySerif(26))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)

                if communities.isEmpty {
                    EmptyStateView(
                        icon: "megaphone",
                        title: "Keine eigene Community",
                        message: "Das Studio steht dir zur Verfügung, sobald du eine Community verwaltest."
                    )
                } else {
                    ForEach(communities) { entry in
                        NavigationLink {
                            StudioHomeView(community: entry)
                        } label: {
                            StudioCommunityCard(entry: entry)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .scrollEdgeEffectStyle(.soft, for: .top)
        .refreshable { await load() }
    }

    // MARK: - Fehler

    private func errorState(_ message: String) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                EmptyStateView(
                    icon: "wifi.exclamationmark",
                    title: "Laden fehlgeschlagen",
                    message: LocalizedStringKey(message)
                )
                Button("Erneut versuchen") {
                    loadErrorMessage = nil
                    Task { await load() }
                }
                .buttonStyle(.secondary)
            }
            .padding(16)
        }
        .refreshable { await load() }
    }

    // MARK: - Laden

    private func load() async {
        do {
            communities = try await appState.api.studioCommunities()
            loadErrorMessage = nil
        } catch {
            if communities == nil {
                loadErrorMessage = error.localizedDescription
            }
        }
    }
}

// MARK: - StudioCommunityCard

/// Karte einer verwalteten Community: Logo, Name, `RoleBadge` und Pills
/// für Mitglieder, ausstehende Anfragen (>0) und Umsatz der letzten 30 Tage.
private struct StudioCommunityCard: View {
    let entry: StudioCommunity

    var body: some View {
        AeraCard(padding: 16, cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    AvatarView(url: entry.community.logoUrl,
                               name: entry.community.name,
                               size: 48)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(entry.community.name)
                            .font(.displaySerif(19))
                            .kerning(-0.2)
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        RoleBadge(role: entry.role)
                    }

                    Spacer(minLength: 8)

                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.ink.opacity(0.3))
                }

                HStack(spacing: 6) {
                    PillLabel(memberLabel, systemImage: "person.2")
                    if entry.pendingMembers > 0 {
                        PillLabel(pendingLabel, systemImage: "hourglass", prominent: true)
                    }
                    PillLabel(revenueLabel, systemImage: "chart.line.uptrend.xyaxis")
                }
            }
        }
        .environment(\.brand, BrandTheme(primaryHex: entry.community.primaryColor,
                                         accentHex: entry.community.accentColor))
    }

    private var memberLabel: String {
        entry.memberCount == 1
            ? String(localized: "1 Mitglied")
            : String(localized: "\(entry.memberCount) Mitglieder")
    }

    private var pendingLabel: String {
        String(localized: "\(entry.pendingMembers) ausstehend")
    }

    private var revenueLabel: String {
        String(localized: "\(Format.price(cents: entry.revenueCents30d, currency: "eur")) · 30 Tage")
    }
}
