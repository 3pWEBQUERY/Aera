import SwiftUI

/// CHAT-Space: Liste der Unterhaltungen (Gruppen-Chats mit Space-Icon,
/// Direktnachrichten mit Avatar). Tap öffnet den Thread als Push.
struct ChatSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: ChatContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(\.brand) private var brand

    init(slug: String,
         space: SpaceDetail,
         content: ChatContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
    }

    var body: some View {
        VStack(spacing: 12) {
            if content.conversations.isEmpty {
                EmptyStateView(
                    icon: "message",
                    title: "Noch keine Unterhaltungen",
                    message: "Sobald hier Nachrichten geschrieben werden, erscheinen sie in dieser Liste."
                )
            } else {
                ForEach(content.conversations) { conversation in
                    NavigationLink {
                        ChatThreadView(slug: slug, conversation: conversation)
                            .brandTheme(brand)
                    } label: {
                        ConversationRow(conversation: conversation, spaceType: space.type)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - ConversationRow

private struct ConversationRow: View {
    let conversation: Conversation
    let spaceType: SpaceType

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

    /// GROUP → Space-Icon auf Brand-Fläche (bzw. Avatar-Bild, falls gesetzt),
    /// DIRECT → Avatar des Gegenübers.
    @ViewBuilder
    private var leadingIcon: some View {
        if conversation.type == .group, conversation.avatarUrl == nil {
            let shape = RoundedRectangle(cornerRadius: 44 * 0.27, style: .continuous)
            Image(systemName: spaceType.symbolName)
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
