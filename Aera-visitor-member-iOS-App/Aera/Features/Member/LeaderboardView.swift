import SwiftUI

/// Rangliste: Podium der Top 3 auf dunkler Rail-Fläche (Medaillen-Ringe
/// amber/grau/orange), darunter die vollständige Liste. Die eigene Zeile
/// wird mit `brand.soft` hinterlegt; ist man nicht in der Liste,
/// erscheint oben eine eigene Rang-Karte.
struct LeaderboardView: View {
    let slug: String

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var response: LeaderboardResponse?
    @State private var loadFailed = false

    init(slug: String) {
        self.slug = slug
    }

    var body: some View {
        Group {
            if let response {
                content(response)
            } else if loadFailed {
                loadErrorView
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle("Rangliste")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private var myUserId: String? {
        appState.session.currentUser?.id
    }

    // MARK: - Inhalt

    private func content(_ response: LeaderboardResponse) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let me = response.me, !isMeInList(response) {
                    myRankCard(me)
                }

                if response.top.isEmpty {
                    EmptyStateView(
                        icon: "trophy",
                        title: "Noch keine Rangliste",
                        message: "Sobald Mitglieder Punkte sammeln, erscheint hier die Rangliste."
                    )
                } else {
                    podium(entries: Array(response.top.prefix(3)))

                    VStack(spacing: 8) {
                        ForEach(response.top) { entry in
                            rankRow(entry)
                        }
                    }
                }
            }
            .padding(16)
        }
        .refreshable { await load(force: true) }
    }

    private func isMeInList(_ response: LeaderboardResponse) -> Bool {
        guard let myUserId else { return false }
        return response.top.contains { $0.member.userId == myUserId }
    }

    private func myRankCard(_ me: LeaderboardResponse.MyRank) -> some View {
        AeraCard(cornerRadius: 16) {
            HStack(spacing: 12) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(brand.color)
                    .frame(width: 44, height: 44)
                    .background(brand.soft, in: .circle)

                VStack(alignment: .leading, spacing: 3) {
                    Text(myRankTitle(me))
                        .font(.system(size: 15, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink)
                    if let levelName = me.levelName {
                        Text(levelName)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink.opacity(0.55))
                    }
                }
            }
        }
    }

    private func myRankTitle(_ me: LeaderboardResponse.MyRank) -> String {
        if let rank = me.rank {
            return String(localized: "Dein Rang: #\(rank) · \(me.points) Punkte")
        }
        return String(localized: "Noch ohne Platzierung · \(me.points) Punkte")
    }

    // MARK: - Podium

    private func podium(entries: [LeaderboardResponse.Entry]) -> some View {
        // Anordnung: Platz 2 links, Platz 1 mittig (höher), Platz 3 rechts.
        let first = entries.first(where: { $0.rank == 1 }) ?? entries.first
        let second = entries.first(where: { $0.rank == 2 })
        let third = entries.first(where: { $0.rank == 3 })

        return HStack(alignment: .bottom, spacing: 16) {
            if let second {
                podiumColumn(second, avatarSize: 56)
            }
            if let first {
                podiumColumn(first, avatarSize: 64)
                    .padding(.bottom, 22)
            }
            if let third {
                podiumColumn(third, avatarSize: 56)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
        .padding(.top, 32)
        .padding(.bottom, 22)
        .background(Theme.rail, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func podiumColumn(_ entry: LeaderboardResponse.Entry, avatarSize: CGFloat) -> some View {
        let medal = medalColor(for: entry.rank)
        let shape = RoundedRectangle(cornerRadius: avatarSize * 0.27, style: .continuous)

        return VStack(spacing: 8) {
            AvatarView(url: entry.member.avatarUrl, name: entry.member.name, size: avatarSize)
                .overlay(shape.strokeBorder(medal, lineWidth: 2.5))
                .overlay(alignment: .bottomTrailing) {
                    Text("\(entry.rank)")
                        .font(.system(size: 11, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Theme.rail)
                        .frame(width: 20, height: 20)
                        .background(medal, in: .circle)
                        .offset(x: 5, y: 5)
                }

            Text(entry.member.name)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)

            Text("\(Format.compactCount(entry.member.points)) Punkte")
                .font(.system(size: 11, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(.white.opacity(0.85))
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .background(.white.opacity(0.14), in: .capsule)
        }
        .frame(maxWidth: .infinity)
    }

    private func medalColor(for rank: Int) -> Color {
        switch rank {
        case 1: Color(hex: "#F59E0B")   // Amber
        case 2: Color(hex: "#9CA3AF")   // Grau
        default: Color(hex: "#EA580C")  // Orange
        }
    }

    // MARK: - Liste

    private func rankRow(_ entry: LeaderboardResponse.Entry) -> some View {
        let isMe = entry.member.userId == myUserId

        return HStack(spacing: 12) {
            Text("\(entry.rank)")
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Theme.ink.opacity(0.5))
                .frame(width: 30, alignment: .leading)

            AvatarView(url: entry.member.avatarUrl, name: entry.member.name, size: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.member.name)
                    .font(.system(size: 14, weight: isMe ? .semibold : .medium))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                if let levelName = entry.member.levelName {
                    LevelChip(levelName: levelName)
                }
            }

            Spacer()

            Text(Format.compactCount(entry.member.points))
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Theme.ink.opacity(0.7))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(isMe ? brand.soft : Theme.card,
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(isMe ? brand.color.opacity(0.35) : Theme.border, lineWidth: 1)
        )
    }

    private var loadErrorView: some View {
        VStack(spacing: 16) {
            EmptyStateView(
                icon: "wifi.exclamationmark",
                title: "Laden fehlgeschlagen",
                message: "Die Rangliste konnte nicht geladen werden."
            )
            Button("Erneut versuchen") {
                loadFailed = false
                Task { await load(force: true) }
            }
            .buttonStyle(.secondary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Laden

    private func load(force: Bool = false) async {
        if response != nil && !force { return }
        do {
            response = try await appState.api.leaderboard(slug: slug)
            loadFailed = false
        } catch {
            if response == nil { loadFailed = true }
        }
    }
}
