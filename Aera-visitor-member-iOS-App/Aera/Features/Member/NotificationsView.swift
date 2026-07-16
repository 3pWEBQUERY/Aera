import SwiftUI

/// Benachrichtigungen: `GET /c/{slug}/notifications` (der Server markiert
/// danach alle als gelesen). Ungelesene Zeilen zeigen links einen Brand-Punkt.
struct NotificationsView: View {
    let slug: String

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var notifications: [AppNotification]?
    @State private var loadFailed = false

    init(slug: String) {
        self.slug = slug
    }

    var body: some View {
        Group {
            if let notifications {
                content(notifications)
            } else if loadFailed {
                loadErrorView
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle("Benachrichtigungen")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    // MARK: - Inhalt

    private func content(_ notifications: [AppNotification]) -> some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                if notifications.isEmpty {
                    EmptyStateView(
                        icon: "bell",
                        title: "Keine Benachrichtigungen",
                        message: "Hier erscheinen Reaktionen und Antworten auf deine Beiträge."
                    )
                    .padding(.top, 12)
                } else {
                    ForEach(notifications) { notification in
                        notificationRow(notification)
                    }
                }
            }
            .padding(16)
        }
        .refreshable { await load(force: true) }
    }

    private func notificationRow(_ notification: AppNotification) -> some View {
        AeraCard(padding: 12) {
            HStack(alignment: .top, spacing: 10) {
                Circle()
                    .fill(notification.readAt == nil ? brand.color : .clear)
                    .frame(width: 7, height: 7)
                    .padding(.top, 14)

                if let actor = notification.actor {
                    AvatarView(url: actor.avatarUrl, name: actor.name, size: 36)
                } else {
                    Image(systemName: "bell.fill")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(brand.color)
                        .frame(width: 36, height: 36)
                        .background(brand.soft, in: RoundedRectangle(cornerRadius: 36 * 0.27, style: .continuous))
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(text(for: notification))
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(notification.createdAt.relativeLabel)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.ink.opacity(0.45))
                }

                Spacer(minLength: 0)
            }
        }
    }

    private func text(for notification: AppNotification) -> String {
        guard let actor = notification.actor else {
            return notification.message
        }
        switch notification.type {
        case .postComment:
            return String(localized: "\(actor.name) hat deinen Beitrag kommentiert")
        case .commentReply:
            return String(localized: "\(actor.name) hat auf deinen Kommentar geantwortet")
        case .reaction:
            return String(localized: "\(actor.name) gefällt dein Beitrag")
        }
    }

    private var loadErrorView: some View {
        VStack(spacing: 16) {
            EmptyStateView(
                icon: "wifi.exclamationmark",
                title: "Laden fehlgeschlagen",
                message: "Die Benachrichtigungen konnten nicht geladen werden."
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
        if notifications != nil && !force { return }
        do {
            notifications = try await appState.api.notifications(slug: slug)
            loadFailed = false
        } catch {
            if notifications == nil { loadFailed = true }
        }
    }
}
