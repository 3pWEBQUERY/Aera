import SwiftUI

/// EVENTS-Space: Sektionen „Anstehend“/„Vergangen“ mit Datums-Badge-Karten.
/// Tap öffnet das Event-Detail (`EventDetailView`) mit RSVP.
struct EventsSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: EventsContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    init(slug: String,
         space: SpaceDetail,
         content: EventsContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
    }

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 16) {
            if content.upcoming.isEmpty && content.past.isEmpty {
                EmptyStateView(
                    icon: "calendar",
                    title: "Noch keine Events",
                    message: "Sobald hier Events geplant werden, erscheinen sie an dieser Stelle."
                )
            } else {
                if !content.upcoming.isEmpty {
                    SectionHeader("Anstehend")
                    ForEach(content.upcoming) { event in
                        eventLink(for: event)
                    }
                }
                if !content.past.isEmpty {
                    SectionHeader("Vergangen")
                    ForEach(content.past) { event in
                        eventLink(for: event, isPast: true)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Karte

    private func eventLink(for event: Event, isPast: Bool = false) -> some View {
        NavigationLink {
            EventDetailView(slug: slug, event: event, viewer: viewer, reload: reload)
        } label: {
            eventCard(for: event, isPast: isPast)
        }
        .buttonStyle(.plain)
    }

    private func eventCard(for event: Event, isPast: Bool) -> some View {
        AeraCard(padding: 16) {
            HStack(alignment: .center, spacing: 14) {
                dateBadge(for: event)

                VStack(alignment: .leading, spacing: 8) {
                    Text(event.title)
                        .font(.displaySerif(20))
                        .kerning(-0.4)
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)

                    HStack(spacing: 8) {
                        if event.isOnline {
                            PillLabel(String(localized: "Online"), systemImage: "video")
                        } else if let location = event.location, !location.isEmpty {
                            PillLabel(location, systemImage: "mappin.and.ellipse")
                        }

                        HStack(spacing: 4) {
                            Image(systemName: "person.2")
                                .font(.system(size: 11, weight: .medium))
                            Text(Self.rsvpLabel(event.rsvpCount))
                                .monospacedDigit()
                        }
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.ink.opacity(0.55))
                    }
                }

                Spacer(minLength: 0)
            }
        }
        .opacity(isPast ? 0.6 : 1)
    }

    /// Datums-Badge: Monat kurz oben, Tag groß darunter, auf `brand.soft`.
    private func dateBadge(for event: Event) -> some View {
        VStack(spacing: 1) {
            Text(event.startsAt.formatted(.dateTime.month(.abbreviated)))
                .font(.system(size: 11, weight: .semibold))
                .textCase(.uppercase)
                .kerning(0.8)
                .foregroundStyle(brand.color)
            Text(event.startsAt.formatted(.dateTime.day()))
                .font(.system(size: 22, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Theme.ink)
        }
        .frame(width: 54, height: 56)
        .background(brand.soft, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    /// „1 Zusage“ / „X Zusagen“.
    static func rsvpLabel(_ count: Int) -> String {
        count == 1
            ? String(localized: "1 Zusage")
            : String(localized: "\(count) Zusagen")
    }
}

// MARK: - EventDetailView

/// Event-Detail: Cover, formatiertes Datum, Ort/Meeting-Link, Kapazität,
/// Beschreibung und RSVP (optimistisch, nur für Mitglieder).
struct EventDetailView: View {
    let slug: String
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var event: Event
    @State private var isSendingRSVP = false
    @State private var errorMessage: String?
    @State private var rsvpSuccessCount = 0

    init(slug: String, event: Event, viewer: Viewer, reload: @escaping () async -> Void) {
        self.slug = slug
        self.viewer = viewer
        self.reload = reload
        self._event = State(initialValue: event)
    }

    private var isPast: Bool {
        (event.endsAt ?? event.startsAt) < .now
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let coverUrl = event.coverUrl {
                    Color.clear
                        .aspectRatio(16 / 9, contentMode: .fit)
                        .overlay {
                            AsyncImageView(url: coverUrl)
                        }
                        .clipped()
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }

                Text(event.title)
                    .font(.displaySerif(26))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)

                infoCard

                if let meetingUrl = event.meetingUrl, let url = URL(string: meetingUrl) {
                    Link(destination: url) {
                        HStack(spacing: 8) {
                            Image(systemName: "video")
                            Text("Zum Meeting")
                        }
                    }
                    .buttonStyle(.brand(fullWidth: true))
                }

                if let description = event.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.ink.opacity(0.7))
                }

                rsvpSection
            }
            .padding(16)
        }
        .background(Theme.paper)
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle(event.title)
        .navigationBarTitleDisplayMode(.inline)
        .sensoryFeedback(.impact(weight: .light), trigger: rsvpSuccessCount)
        .alert("Aktion fehlgeschlagen", isPresented: errorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    // MARK: - Info

    private var infoCard: some View {
        AeraCard(padding: 16, cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 12) {
                infoRow(icon: "calendar", text: dateText)

                if event.isOnline {
                    infoRow(icon: "video", text: String(localized: "Online-Event"))
                } else {
                    if let location = event.location, !location.isEmpty {
                        infoRow(icon: "mappin.and.ellipse", text: location)
                    }
                }

                infoRow(icon: "person.2", text: capacityText)
            }
        }
    }

    /// Formatiertes Datum inkl. Ende, z. B.
    /// „Mittwoch, 15. Juli 2026, 18:30 – 20:00“.
    private var dateText: String {
        let start = event.startsAt.formatted(
            .dateTime.weekday(.wide).day().month(.wide).year().hour().minute()
        )
        guard let endsAt = event.endsAt else { return start }
        let end: String
        if Calendar.current.isDate(endsAt, inSameDayAs: event.startsAt) {
            end = endsAt.formatted(.dateTime.hour().minute())
        } else {
            end = endsAt.formatted(.dateTime.weekday(.wide).day().month(.wide).hour().minute())
        }
        return "\(start) – \(end)"
    }

    /// „X Zusagen“ + „· Y Plätze“, falls eine Kapazität gesetzt ist.
    private var capacityText: String {
        var text = EventsSpaceView.rsvpLabel(event.rsvpCount)
        if let capacity = event.capacity {
            text += " · " + String(localized: "\(capacity) Plätze")
        }
        return text
    }

    private func infoRow(icon: String, text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(brand.color)
                .frame(width: 20)
            Text(text)
                .font(.system(size: 15))
                .monospacedDigit()
                .foregroundStyle(Theme.ink.opacity(0.8))
                .contentTransition(.numericText())
        }
    }

    // MARK: - RSVP

    @ViewBuilder
    private var rsvpSection: some View {
        if !event.accessible {
            lockedHint
        } else if isPast {
            Text("Dieses Event liegt in der Vergangenheit.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink.opacity(0.5))
        } else if viewer.isMember {
            Button {
                toggleRSVP()
            } label: {
                HStack(spacing: 8) {
                    if event.myRsvp {
                        Image(systemName: "checkmark")
                    }
                    Text(event.myRsvp ? "Zugesagt" : "Zusagen")
                }
            }
            .buttonStyle(event.myRsvp
                ? AnyButtonStyle(SecondaryButtonStyle(fullWidth: true))
                : AnyButtonStyle(BrandButtonStyle(fullWidth: true)))
            .disabled(isSendingRSVP)
            .animation(.snappy(duration: 0.25), value: event.myRsvp)
        } else {
            Text("Werde Mitglied, um zuzusagen.")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.ink.opacity(0.6))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Theme.softFill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    /// Schloss-Hinweiskarte für Events außerhalb der eigenen Mitgliedschaft.
    private var lockedHint: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: "lock.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.amber800)
            Text("Dieses Event ist in deiner Mitgliedschaft nicht enthalten.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.amber800)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.amber50, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Theme.amber200, lineWidth: 1)
        )
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )
    }

    /// Optimistisches RSVP über `POST /c/{slug}/events/{eventId}/rsvp`;
    /// bei Fehlern wird der vorherige Zustand wiederhergestellt.
    private func toggleRSVP() {
        guard !isSendingRSVP else { return }
        let previous = event
        withAnimation(.snappy(duration: 0.25)) {
            event.myRsvp.toggle()
            event.rsvpCount += event.myRsvp ? 1 : -1
        }
        isSendingRSVP = true
        Task {
            do {
                let response = try await appState.api.rsvp(slug: slug, eventId: event.id)
                event.myRsvp = response.going
                event.rsvpCount = response.rsvpCount
                rsvpSuccessCount += 1
                await reload()
            } catch {
                withAnimation(.snappy(duration: 0.25)) {
                    event = previous
                }
                errorMessage = error.localizedDescription
            }
            isSendingRSVP = false
        }
    }
}

// MARK: - AnyButtonStyle

/// Typ-Eraser, um abhängig vom Zustand zwischen Button-Styles zu wechseln.
struct AnyButtonStyle: ButtonStyle {
    private let _makeBody: (Configuration) -> AnyView

    init<S: ButtonStyle>(_ style: S) {
        _makeBody = { AnyView(style.makeBody(configuration: $0)) }
    }

    func makeBody(configuration: Configuration) -> some View {
        _makeBody(configuration)
    }
}
