import SwiftUI

/// LIVE-Space: Session-Karten mit Status-Pill (LIVE rot pulsierend,
/// „Geplant" mit Datum, „Beendet"). Zugängliche Sessions öffnen den
/// `LiveRoomView` als Push, gesperrte zeigen einen Schloss-Hinweis.
struct LiveSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: LiveContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(\.brand) private var brand

    init(slug: String,
         space: SpaceDetail,
         content: LiveContent,
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
            if content.sessions.isEmpty {
                EmptyStateView(
                    icon: "dot.radiowaves.left.and.right",
                    title: "Keine Live-Sessions",
                    message: "Sobald hier eine Live-Session geplant wird, erscheint sie an dieser Stelle."
                )
            } else {
                ForEach(content.sessions) { session in
                    if session.accessible {
                        NavigationLink {
                            LiveRoomView(slug: slug, sessionId: session.id)
                                .brandTheme(brand)
                        } label: {
                            LiveSessionCard(session: session)
                        }
                        .buttonStyle(.plain)
                    } else {
                        LiveSessionCard(session: session)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - LiveSessionCard

private struct LiveSessionCard: View {
    let session: LiveSession

    @Environment(\.brand) private var brand

    var body: some View {
        AeraCard(padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center) {
                    LiveStatusPill(status: session.status, scheduledAt: session.scheduledAt)
                    Spacer()
                    if session.accessible {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.ink.opacity(0.3))
                    }
                }

                Text(session.title)
                    .font(.displaySerif(20))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)
                    .multilineTextAlignment(.leading)

                if let description = session.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.ink.opacity(0.6))
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                }

                if !session.accessible {
                    HStack(spacing: 6) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 11, weight: .semibold))
                        Text("Mit Mitgliedschaft verfügbar")
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundStyle(Theme.ink.opacity(0.55))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Theme.softFill, in: .capsule)
                }
            }
        }
    }
}

// MARK: - LiveStatusPill

private struct LiveStatusPill: View {
    let status: LiveSessionStatus
    let scheduledAt: Date?

    @State private var isPulsing = false

    var body: some View {
        switch status {
        case .live:
            HStack(spacing: 6) {
                Circle()
                    .fill(.white)
                    .frame(width: 7, height: 7)
                    .opacity(isPulsing ? 0.35 : 1)
                Text("LIVE")
                    .font(.system(size: 12, weight: .bold))
                    .kerning(1.2)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(Theme.danger, in: .capsule)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                    isPulsing = true
                }
            }
        case .scheduled:
            PillLabel(scheduledLabel, systemImage: "calendar", prominent: true)
        case .ended:
            PillLabel(String(localized: "Beendet"), systemImage: "checkmark")
        }
    }

    private var scheduledLabel: String {
        if let scheduledAt {
            return String(localized: "Geplant · \(scheduledAt.formatted(date: .abbreviated, time: .shortened))")
        }
        return String(localized: "Geplant")
    }
}
