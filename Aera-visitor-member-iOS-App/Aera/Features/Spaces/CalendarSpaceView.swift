import SwiftUI

/// CALENDAR-Space: Einträge gruppiert nach Tag („Mittwoch, 15. Juli“),
/// je Tag eine Karte mit Zeilen pro Eintrag (Icon je `kind`, Titel,
/// Untertitel, Uhrzeit).
struct CalendarSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: CalendarContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    init(slug: String,
         space: SpaceDetail,
         content: CalendarContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
    }

    /// Einträge chronologisch, gruppiert nach Kalendertag.
    private var days: [(date: Date, items: [CalendarItem])] {
        let grouped = Dictionary(grouping: content.items) { item in
            Calendar.current.startOfDay(for: item.date)
        }
        return grouped.keys.sorted().map { day in
            (date: day, items: (grouped[day] ?? []).sorted { $0.date < $1.date })
        }
    }

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 20) {
            if content.items.isEmpty {
                EmptyStateView(
                    icon: "calendar.day.timeline.left",
                    title: "Noch keine Termine",
                    message: "Sobald hier Termine anstehen, erscheinen sie an dieser Stelle."
                )
            } else {
                ForEach(days, id: \.date) { day in
                    VStack(alignment: .leading, spacing: 10) {
                        Text(day.date.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.ink.opacity(0.55))

                        AeraCard(padding: 0) {
                            VStack(spacing: 0) {
                                ForEach(Array(day.items.enumerated()), id: \.element.id) { index, item in
                                    if index > 0 {
                                        Divider()
                                            .overlay(Theme.border)
                                            .padding(.leading, 60)
                                    }
                                    itemRow(for: item)
                                }
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }

    private func itemRow(for item: CalendarItem) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: symbolName(for: item.kind))
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(brand.color)
                .frame(width: 34, height: 34)
                .background(brand.soft, in: RoundedRectangle(cornerRadius: 9, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2)

                if let subtitle = item.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink.opacity(0.55))
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            Text(item.date.formatted(.dateTime.hour().minute()))
                .font(.system(size: 13))
                .monospacedDigit()
                .foregroundStyle(Theme.ink.opacity(0.5))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private func symbolName(for kind: CalendarItemKind) -> String {
        switch kind {
        case .event: "calendar"
        case .live: "dot.radiowaves.left.and.right"
        case .post: "doc.text"
        }
    }
}
