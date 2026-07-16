import SwiftUI

/// Mitgliederliste mit Cursor-Pagination und optionaler
/// „Freunde einladen"-Karte (ShareLink auf `inviteUrl`).
struct MembersView: View {
    let slug: String

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var members: [MemberCard] = []
    @State private var nextCursor: String?
    @State private var inviteUrl: String?
    @State private var isLoaded = false
    @State private var isLoadingMore = false
    @State private var loadFailed = false

    init(slug: String) {
        self.slug = slug
    }

    var body: some View {
        Group {
            if isLoaded {
                memberList
            } else if loadFailed {
                loadErrorView
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle("Mitglieder")
        .navigationBarTitleDisplayMode(.inline)
        .task { await initialLoad() }
    }

    // MARK: - Liste

    private var memberList: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                if let inviteUrl, let url = URL(string: inviteUrl) {
                    inviteCard(url: url)
                }

                if members.isEmpty {
                    EmptyStateView(
                        icon: "person.2",
                        title: "Keine Mitglieder",
                        message: "Hier erscheinen alle Mitglieder der Community."
                    )
                } else {
                    ForEach(members) { member in
                        memberRow(member)
                            .onAppear {
                                if member.id == members.last?.id {
                                    Task { await loadMore() }
                                }
                            }
                    }

                    if isLoadingMore {
                        ProgressView()
                            .padding(.vertical, 12)
                    }
                }
            }
            .padding(16)
        }
        .refreshable { await refresh() }
    }

    private func inviteCard(url: URL) -> some View {
        AeraCard(cornerRadius: 16) {
            HStack(spacing: 12) {
                Image(systemName: "person.crop.circle.badge.plus")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(brand.color)
                    .frame(width: 44, height: 44)
                    .background(brand.soft, in: .circle)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Freunde einladen")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                    Text("Teile deinen Einladungslink.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink.opacity(0.55))
                }

                Spacer()

                ShareLink(item: url) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 38, height: 38)
                        .background(brand.color, in: .circle)
                }
                .accessibilityLabel(Text("Einladungslink teilen"))
            }
        }
    }

    private func memberRow(_ member: MemberCard) -> some View {
        AeraCard(padding: 12) {
            HStack(spacing: 12) {
                AvatarView(url: member.avatarUrl, name: member.name, size: 40)

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(member.name)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        RoleBadge(role: member.role)
                    }
                    if let tierName = member.tierName {
                        Text(tierName)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.ink.opacity(0.5))
                    }
                }

                Spacer()

                if let levelName = member.levelName {
                    LevelChip(levelName: levelName, points: member.points)
                } else {
                    Text(Format.compactCount(member.points))
                        .font(.system(size: 13, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink.opacity(0.6))
                }
            }
        }
    }

    private var loadErrorView: some View {
        VStack(spacing: 16) {
            EmptyStateView(
                icon: "wifi.exclamationmark",
                title: "Laden fehlgeschlagen",
                message: "Die Mitglieder konnten nicht geladen werden."
            )
            Button("Erneut versuchen") {
                loadFailed = false
                Task { await initialLoad() }
            }
            .buttonStyle(.secondary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Laden

    private func initialLoad() async {
        guard !isLoaded else { return }
        await refresh()
    }

    private func refresh() async {
        do {
            let response = try await appState.api.members(slug: slug)
            members = response.data
            nextCursor = response.nextCursor
            inviteUrl = response.inviteUrl
            isLoaded = true
            loadFailed = false
        } catch {
            if !isLoaded { loadFailed = true }
        }
    }

    private func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let response = try await appState.api.members(slug: slug, cursor: cursor)
            let known = Set(members.map(\.id))
            members.append(contentsOf: response.data.filter { !known.contains($0.id) })
            nextCursor = response.nextCursor
        } catch {
            // Pagination-Fehler still: erneuter Versuch beim nächsten Scrollen.
        }
    }
}
