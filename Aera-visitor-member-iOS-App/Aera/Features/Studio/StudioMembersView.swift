import SwiftUI

/// Mitglieder-Verwaltung: Suche (debounced), Status-Filter-Chips und
/// Aktionen (Freigeben/Bannen/Entbannen) mit optimistischen Updates
/// (`GET/POST /studio/{slug}/members`). Cursor-Pagination.
struct StudioMembersView: View {
    let community: StudioCommunity

    @Environment(AppState.self) private var appState

    @State private var statusFilter: MemberStatus?
    @State private var query = ""
    @State private var members: [StudioMember]?
    @State private var nextCursor: String?
    @State private var isLoadingMore = false
    @State private var loadErrorMessage: String?
    @State private var actionError: String?
    @State private var banTarget: StudioMember?
    @State private var busyUserIds: Set<String> = []
    @State private var successCount = 0

    private var slug: String { community.community.slug }

    private var brandTheme: BrandTheme {
        BrandTheme(primaryHex: community.community.primaryColor,
                   accentHex: community.community.accentColor)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Mitglieder")
                    .font(.displaySerif(26))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)

                searchField

                filterChips

                content
            }
            .padding(16)
        }
        .background(Theme.paper.ignoresSafeArea())
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle("Mitglieder")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: taskKey) {
            // Debounce für die Suche; Filterwechsel laden nach derselben Pause.
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await load()
        }
        .sensoryFeedback(.success, trigger: successCount)
        .alert("Fehler", isPresented: Binding(
            get: { actionError != nil },
            set: { if !$0 { actionError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(actionError ?? "")
        }
        .confirmationDialog(
            "Mitglied bannen?",
            isPresented: Binding(
                get: { banTarget != nil },
                set: { if !$0 { banTarget = nil } }
            ),
            titleVisibility: .visible,
            presenting: banTarget
        ) { member in
            Button("Bannen", role: .destructive) {
                perform(.ban, on: member)
            }
            Button("Abbrechen", role: .cancel) {}
        } message: { member in
            Text("\(member.name) verliert sofort den Zugriff auf die Community.")
        }
        .brandTheme(brandTheme)
    }

    /// Kombinierter Schlüssel, damit `.task(id:)` bei Such- und
    /// Filteränderungen neu lädt.
    private var taskKey: String {
        "\(statusFilter?.rawValue ?? "ALL")|\(query)"
    }

    // MARK: - Suche & Filter

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.ink.opacity(0.4))
            TextField("Name oder E-Mail suchen", text: $query)
                .font(.system(size: 15))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.ink.opacity(0.3))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Suche löschen"))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Theme.border, lineWidth: 1)
        )
    }

    private var filterChips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                filterChip(label: String(localized: "Alle"), value: nil)
                filterChip(label: String(localized: "Aktiv"), value: .active)
                filterChip(label: String(localized: "Ausstehend"), value: .pending)
                filterChip(label: String(localized: "Gebannt"), value: .banned)
            }
        }
        .scrollIndicators(.hidden)
    }

    private func filterChip(label: String, value: MemberStatus?) -> some View {
        let isActive = statusFilter == value
        return Button {
            withAnimation(.snappy(duration: 0.25)) {
                statusFilter = value
            }
        } label: {
            Text(label)
                .font(.system(size: 13, weight: isActive ? .semibold : .medium))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .foregroundStyle(isActive ? .white : Theme.ink)
                .background(isActive ? AnyShapeStyle(brandTheme.color) : AnyShapeStyle(Theme.card),
                            in: .capsule)
                .overlay {
                    if !isActive {
                        Capsule().strokeBorder(Theme.border, lineWidth: 1)
                    }
                }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Inhalt

    @ViewBuilder
    private var content: some View {
        if let members {
            if members.isEmpty {
                EmptyStateView(
                    icon: "person.2",
                    title: "Keine Mitglieder gefunden",
                    message: "Passe Suche oder Filter an, um Mitglieder zu sehen."
                )
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(members) { member in
                        memberCard(member)
                            .onAppear {
                                if member.id == members.last?.id {
                                    Task { await loadMore() }
                                }
                            }
                    }
                    if isLoadingMore {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                }
            }
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
        } else {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
        }
    }

    // MARK: - Karte

    private func memberCard(_ member: StudioMember) -> some View {
        AeraCard(padding: 12) {
            HStack(alignment: .center, spacing: 12) {
                AvatarView(url: member.avatarUrl, name: member.name, size: 40)

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(member.name)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        RoleBadge(role: member.role)
                        if member.status == .banned {
                            Text("Gebannt")
                                .font(.system(size: 10, weight: .semibold))
                                .textCase(.uppercase)
                                .kerning(0.8)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .foregroundStyle(Theme.danger)
                                .background(Theme.danger.opacity(0.1), in: .capsule)
                        }
                    }
                    Text(member.email)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.ink.opacity(0.5))
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        if let tierName = member.tierName {
                            PillLabel(tierName, systemImage: "crown")
                        }
                        PillLabel(pointsLabel(member.points), systemImage: "star")
                    }
                }

                Spacer(minLength: 8)

                trailingAction(for: member)
            }
        }
        .contextMenu {
            contextActions(for: member)
        }
    }

    private func pointsLabel(_ points: Int) -> String {
        String(localized: "\(Format.compactCount(points)) Punkte")
    }

    @ViewBuilder
    private func trailingAction(for member: StudioMember) -> some View {
        if busyUserIds.contains(member.userId) {
            ProgressView()
        } else if !isProtected(member), member.status == .pending {
            Button {
                perform(.approve, on: member)
            } label: {
                Text("Freigeben")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(brandTheme.color, in: .capsule)
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private func contextActions(for member: StudioMember) -> some View {
        if !isProtected(member) {
            switch member.status {
            case .pending:
                Button {
                    perform(.approve, on: member)
                } label: {
                    Label("Freigeben", systemImage: "checkmark.circle")
                }
                Button(role: .destructive) {
                    banTarget = member
                } label: {
                    Label("Bannen", systemImage: "hand.raised")
                }
            case .active:
                Button(role: .destructive) {
                    banTarget = member
                } label: {
                    Label("Bannen", systemImage: "hand.raised")
                }
            case .banned:
                Button {
                    perform(.unban, on: member)
                } label: {
                    Label("Entbannen", systemImage: "arrow.uturn.backward.circle")
                }
            }
        }
    }

    /// OWNER und die eigene Membership sind nicht änderbar (Server-Guard 403).
    private func isProtected(_ member: StudioMember) -> Bool {
        member.role == .owner || member.userId == appState.session.currentUser?.id
    }

    // MARK: - Aktionen

    private func perform(_ action: StudioMemberAction, on member: StudioMember) {
        guard !busyUserIds.contains(member.userId),
              let index = members?.firstIndex(where: { $0.userId == member.userId }) else { return }

        let snapshot = member
        var optimistic = member
        optimistic.status = action == .ban ? .banned : .active

        busyUserIds.insert(member.userId)
        withAnimation(.snappy(duration: 0.25)) {
            members?[index] = optimistic
        }

        Task {
            defer { busyUserIds.remove(member.userId) }
            do {
                let updated = try await appState.api.memberAction(slug: slug,
                                                                  userId: member.userId,
                                                                  action: action)
                withAnimation(.snappy(duration: 0.25)) {
                    if let statusFilter, updated.status != statusFilter {
                        members?.removeAll { $0.userId == updated.userId }
                    } else if let liveIndex = members?.firstIndex(where: { $0.userId == updated.userId }) {
                        members?[liveIndex] = updated
                    }
                }
                successCount += 1
            } catch {
                if let liveIndex = members?.firstIndex(where: { $0.userId == member.userId }) {
                    withAnimation(.snappy(duration: 0.25)) {
                        members?[liveIndex] = snapshot
                    }
                }
                actionError = error.localizedDescription
            }
        }
    }

    // MARK: - Laden

    private func load() async {
        nextCursor = nil
        do {
            let response = try await appState.api.studioMembers(
                slug: slug,
                status: statusFilter,
                query: query.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            members = response.data
            nextCursor = response.nextCursor
            loadErrorMessage = nil
        } catch {
            if members == nil {
                loadErrorMessage = error.localizedDescription
            } else {
                actionError = error.localizedDescription
            }
        }
    }

    private func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let response = try await appState.api.studioMembers(
                slug: slug,
                status: statusFilter,
                query: query.trimmingCharacters(in: .whitespacesAndNewlines),
                cursor: cursor
            )
            let known = Set((members ?? []).map(\.userId))
            members?.append(contentsOf: response.data.filter { !known.contains($0.userId) })
            nextCursor = response.nextCursor
        } catch {
            actionError = error.localizedDescription
        }
    }
}
