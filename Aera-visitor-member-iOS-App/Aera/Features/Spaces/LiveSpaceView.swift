import SwiftUI

/// LIVE-Space: drei klar unterscheidbare Zustände, wie im Web.
///
/// - **Auf Sendung**: dunkle Bühne mit pulsierendem Punkt — sie soll sich aus
///   der Liste herausheben, denn sie ist der einzige Eintrag, der jetzt
///   gerade etwas zeigt.
/// - **Geplant**: helle Karte mit tickendem Countdown.
/// - **Beendet**: ruhige Archivkarte mit Verweis auf die Aufzeichnung.
struct LiveSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: LiveContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(\.brand) private var brand

    @State private var showJoin = false

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
                        VStack(spacing: 10) {
                            LiveSessionCard(session: session)
                            Button("Mitgliedschaft ansehen") {
                                showJoin = true
                            }
                            .buttonStyle(.brand(fullWidth: true))
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .sheet(isPresented: $showJoin) {
            JoinView(slug: slug, onJoined: reload)
        }
    }
}

// MARK: - LiveSessionCard

private struct LiveSessionCard: View {
    let session: LiveSession

    @Environment(\.brand) private var brand

    var body: some View {
        if session.status == .live {
            liveStage
        } else {
            quietCard
        }
    }

    // MARK: Auf Sendung

    private var liveStage: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    LivePulseDot()
                    Text("LIVE")
                        .font(.system(size: 12, weight: .bold))
                        .kerning(1.2)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(Theme.danger, in: .capsule)

                sourceTag

                Spacer(minLength: 4)

                if session.accessible {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(.white.opacity(0.9))
                }
            }

            Text(session.title)
                .font(.displaySerif(22))
                .kerning(-0.4)
                .foregroundStyle(.white)
                .multilineTextAlignment(.leading)

            if let description = session.description, !description.isEmpty {
                Text(description)
                    .font(.system(size: 14))
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
            }

            if session.accessible {
                Text("Jetzt zusehen")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 9)
                    .background(.white, in: .capsule)
            } else {
                lockNote(onDark: true)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack {
                Theme.rail
                // Ein Hauch Community-Farbe von unten — die Bühne bleibt dunkel,
                // trägt aber die Handschrift der Community.
                LinearGradient(
                    colors: [.clear, brand.color.opacity(0.45)],
                    startPoint: .top,
                    endPoint: .bottomTrailing
                )
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 14, y: 6)
    }

    // MARK: Geplant & beendet

    private var quietCard: some View {
        AeraCard(padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 8) {
                    if session.status == .ended {
                        PillLabel(String(localized: "Aufzeichnung"), systemImage: "play.rectangle")
                    } else {
                        PillLabel(scheduledLabel, systemImage: "calendar", prominent: true)
                    }

                    sourceTag

                    Spacer(minLength: 4)

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

                if session.status == .scheduled, let scheduledAt = session.scheduledAt {
                    LiveCountdownText(target: scheduledAt)
                        .foregroundStyle(brand.color)
                }

                if !session.accessible {
                    lockNote(onDark: false)
                }
            }
        }
    }

    // MARK: Bausteine

    /// Woher gesendet wird: Plattform-Marke oder „über Aera".
    @ViewBuilder
    private var sourceTag: some View {
        if let platform = LivePlatformStyle.label(session.platform) {
            LivePlatformTag(name: platform, color: LivePlatformStyle.color(session.platform))
                .opacity(session.status == .live ? 1 : 0.9)
        } else if session.source == .aera {
            if session.status == .live {
                LivePlatformTag(name: String(localized: "Eigener Stream"), color: .white)
            } else {
                PillLabel(String(localized: "Eigener Stream"), systemImage: "dot.radiowaves.left.and.right")
            }
        }
    }

    private func lockNote(onDark: Bool) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "lock.fill")
                .font(.system(size: 11, weight: .semibold))
            Text("Mit Mitgliedschaft verfügbar")
                .font(.system(size: 13, weight: .medium))
        }
        .foregroundStyle(onDark ? Color.white.opacity(0.8) : Theme.ink.opacity(0.55))
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(onDark ? Color.white.opacity(0.14) : Theme.softFill, in: .capsule)
    }

    private var scheduledLabel: String {
        if let scheduledAt = session.scheduledAt {
            return String(localized: "Geplant · \(scheduledAt.formatted(date: .abbreviated, time: .shortened))")
        }
        return String(localized: "Geplant")
    }
}
