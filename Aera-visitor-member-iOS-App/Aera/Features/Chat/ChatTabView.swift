import SwiftUI

/// Root-Tab „Chat": alle Unterhaltungen des Users über alle Communities hinweg —
/// Gruppen-Chats (vom Creator angelegte CHAT-Spaces) und Direktnachrichten,
/// gruppiert nach Community (Pendant zur Chat-Seite der Web-App).
struct ChatTabView: View {
    @Environment(AppState.self) private var appState

    @State private var sections: [CommunityChats]?
    @State private var loadErrorMessage: String?
    @State private var showLogin = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Chat")
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
                    icon: "message",
                    title: "Deine Chats",
                    message: "Melde dich an, um deine Unterhaltungen zu sehen."
                )
                Button("Anmelden") {
                    showLogin = true
                }
                .buttonStyle(.brand)
            }
        } else if let sections {
            if sections.allSatisfy({ $0.conversations.isEmpty }) {
                EmptyStateView(
                    icon: "message",
                    title: "Noch keine Unterhaltungen",
                    message: "Sobald in deinen Communities Chats verfügbar sind, erscheinen sie hier."
                )
            } else {
                LazyVStack(alignment: .leading, spacing: 24) {
                    ForEach(sections) { section in
                        if !section.conversations.isEmpty {
                            communitySection(section)
                        }
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

    private func communitySection(_ section: CommunityChats) -> some View {
        let brand = BrandTheme(primaryHex: section.community.primaryColor,
                               accentHex: section.community.accentColor)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                AvatarView(url: section.community.logoUrl,
                           name: section.community.name,
                           size: 28)
                Text(section.community.name)
                    .font(.displaySerif(20))
                    .kerning(-0.2)
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
            }

            ForEach(section.conversations) { conversation in
                NavigationLink {
                    ChatThreadView(slug: section.community.slug, conversation: conversation)
                        .brandTheme(brand)
                } label: {
                    ChatOverviewRow(conversation: conversation)
                }
                .buttonStyle(.plain)
            }
        }
        .environment(\.brand, brand)
    }

    // MARK: - Laden

    private func load() async {
        guard appState.session.isLoggedIn else {
            sections = nil
            loadErrorMessage = nil
            return
        }
        do {
            let me = try await appState.api.me()
            appState.session.update(user: me.user)

            let communities = me.memberships.map(\.community)
            let result = await withTaskGroup(of: (Int, [Conversation]).self) { group in
                for (index, community) in communities.enumerated() {
                    group.addTask { @MainActor in
                        // Einzelne Fehler (z. B. kein Chat-Space) blockieren die Übersicht nicht.
                        let conversations = (try? await appState.api.conversations(slug: community.slug)) ?? []
                        return (index, conversations)
                    }
                }
                var byIndex: [Int: [Conversation]] = [:]
                for await (index, conversations) in group {
                    byIndex[index] = conversations
                }
                return communities.enumerated().map { index, community in
                    CommunityChats(community: community, conversations: byIndex[index] ?? [])
                }
            }

            sections = result
            loadErrorMessage = nil
        } catch let error as APIError where error.status == 401 {
            appState.session.clear()
            sections = nil
        } catch {
            if sections == nil {
                loadErrorMessage = error.localizedDescription
            }
        }
    }
}

// MARK: - Modelle & Zeile

private struct CommunityChats: Identifiable {
    let community: CommunityCard
    let conversations: [Conversation]

    var id: String { community.slug }
}

/// Unterhaltungs-Zeile der Chat-Übersicht: Gruppen-Chats mit Chat-Icon auf
/// Brand-Fläche, Direktnachrichten mit Avatar; letzte Nachricht + Zeit.
private struct ChatOverviewRow: View {
    let conversation: Conversation

    @Environment(\.brand) private var brand

    var body: some View {
        AeraCard(padding: 14) {
            HStack(alignment: .center, spacing: 12) {
                leadingIcon

                VStack(alignment: .leading, spacing: 3) {
                    Text(conversation.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)

                    if let last = conversation.lastMessage {
                        Text("\(last.author.name): \(last.body)")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink.opacity(0.55))
                            .lineLimit(1)
                    } else {
                        Text("Noch keine Nachrichten")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink.opacity(0.45))
                    }
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 6) {
                    if let last = conversation.lastMessage {
                        Text(last.createdAt.relativeLabel)
                            .font(.system(size: 12))
                            .monospacedDigit()
                            .foregroundStyle(Theme.ink.opacity(0.45))
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.ink.opacity(0.3))
                }
            }
        }
    }

    @ViewBuilder
    private var leadingIcon: some View {
        if conversation.type == .group, conversation.avatarUrl == nil {
            let shape = RoundedRectangle(cornerRadius: 44 * 0.27, style: .continuous)
            Image(systemName: "message")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(brand.color)
                .frame(width: 44, height: 44)
                .background(brand.soft, in: shape)
                .overlay(shape.strokeBorder(.black.opacity(0.05), lineWidth: 1))
        } else {
            AvatarView(url: conversation.avatarUrl, name: conversation.title, size: 44)
        }
    }
}
