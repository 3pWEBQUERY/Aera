import SwiftUI

/// BOOKING-Space: Slots gruppiert nach Tag. Kostenlose freie Slots lassen
/// sich direkt reservieren, bezahlte laufen über den IAP-Flow;
/// ausgebuchte Slots werden ausgegraut.
struct BookingSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: BookingContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    /// Lokal bestätigte Reservierungen (bis zum nächsten Reload).
    @State private var localReservations: [String: ReservationStatus] = [:]
    @State private var reservingSlotIds: Set<String> = []
    @State private var actionError: String?
    @State private var successCount = 0

    init(slug: String,
         space: SpaceDetail,
         content: BookingContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
    }

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 20) {
            if content.slots.isEmpty {
                EmptyStateView(
                    icon: "clock.badge.checkmark",
                    title: "Keine Termine",
                    message: "Sobald hier buchbare Termine angeboten werden, erscheinen sie an dieser Stelle."
                )
            } else {
                ForEach(groupedDays, id: \.self) { day in
                    daySection(day)
                }
            }
        }
        .padding(.horizontal, 16)
        .sensoryFeedback(.success, trigger: successCount)
        .alert("Fehler", isPresented: Binding(
            get: { actionError != nil },
            set: { if !$0 { actionError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(actionError ?? "")
        }
    }

    // MARK: - Gruppierung

    private var slotsByDay: [Date: [BookingSlot]] {
        Dictionary(grouping: content.slots) { slot in
            Calendar.current.startOfDay(for: slot.startsAt)
        }
    }

    private var groupedDays: [Date] {
        slotsByDay.keys.sorted()
    }

    private func daySection(_ day: Date) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(day.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                .font(.displaySerif(18))
                .kerning(-0.3)
                .foregroundStyle(Theme.ink)

            ForEach((slotsByDay[day] ?? []).sorted(by: { $0.startsAt < $1.startsAt })) { slot in
                slotCard(slot)
            }
        }
    }

    // MARK: - Slot-Karte

    private func slotCard(_ slot: BookingSlot) -> some View {
        let reservation = localReservations[slot.id] ?? slot.myReservation
        let isSoldOut = slot.spotsLeft <= 0 && reservation == nil

        return AeraCard(padding: 14) {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(slot.startsAt.formatted(date: .omitted, time: .shortened))
                        .font(.system(size: 16, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink)
                    Text("\(slot.durationMin) Min.")
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink.opacity(0.5))
                }
                .frame(width: 62, alignment: .leading)

                VStack(alignment: .leading, spacing: 6) {
                    Text(slot.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)

                    if let description = slot.description, !description.isEmpty {
                        Text(description)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink.opacity(0.6))
                            .lineLimit(2)
                    }

                    HStack(spacing: 8) {
                        Text(spotsLabel(for: slot))
                            .font(.system(size: 12, weight: .medium))
                            .monospacedDigit()
                            .foregroundStyle(Theme.ink.opacity(0.55))

                        if slot.priceCents > 0 {
                            Text(Format.price(cents: slot.priceCents, currency: slot.currency))
                                .font(.system(size: 12, weight: .semibold))
                                .monospacedDigit()
                                .foregroundStyle(Theme.ink.opacity(0.7))
                        }
                    }

                    actionArea(for: slot, reservation: reservation, isSoldOut: isSoldOut)
                }
            }
        }
        .opacity(isSoldOut ? 0.55 : 1)
    }

    private func spotsLabel(for slot: BookingSlot) -> String {
        if slot.spotsLeft <= 0 {
            return String(localized: "Keine Plätze frei")
        }
        return String(localized: "\(slot.spotsLeft) Plätze frei")
    }

    // MARK: - Aktionen

    @ViewBuilder
    private func actionArea(for slot: BookingSlot,
                            reservation: ReservationStatus?,
                            isSoldOut: Bool) -> some View {
        if let reservation {
            switch reservation {
            case .confirmed:
                PillLabel(String(localized: "Bestätigt"), systemImage: "checkmark", prominent: true)
            case .pending:
                PillLabel(String(localized: "Ausstehend"), systemImage: "hourglass")
            }
        } else if isSoldOut {
            PillLabel(String(localized: "Ausgebucht"), systemImage: "xmark")
        } else if slot.priceCents <= 0 {
            Button {
                reserve(slot)
            } label: {
                if reservingSlotIds.contains(slot.id) {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text("Reservieren")
                }
            }
            .buttonStyle(.brand)
            .disabled(reservingSlotIds.contains(slot.id))
        } else if let unlock = slot.unlock, unlock.appleProductId != nil {
            Button {
                purchase(unlock)
            } label: {
                Text("Buchen für \(Format.price(cents: unlock.priceCents, currency: unlock.currency))")
                    .monospacedDigit()
            }
            .buttonStyle(.brand)
            .disabled(appState.purchases.isPurchasing)
        } else {
            HStack(spacing: 5) {
                Image(systemName: "globe")
                    .font(.system(size: 11, weight: .medium))
                Text("Auf der Website verfügbar")
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundStyle(Theme.ink.opacity(0.55))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Theme.softFill, in: .capsule)
        }
    }

    private func reserve(_ slot: BookingSlot) {
        guard !reservingSlotIds.contains(slot.id) else { return }
        reservingSlotIds.insert(slot.id)
        Task {
            do {
                let status = try await appState.api.reserveBookingSlot(slug: slug, slotId: slot.id)
                withAnimation(.snappy(duration: 0.25)) {
                    localReservations[slot.id] = status
                }
                successCount += 1
            } catch {
                actionError = error.localizedDescription
            }
            reservingSlotIds.remove(slot.id)
        }
    }

    private func purchase(_ unlock: Unlock) {
        guard !appState.purchases.isPurchasing else { return }
        Task {
            do {
                try await appState.purchases.purchase(unlock: unlock, tenantSlug: slug)
                successCount += 1
                await reload()
            } catch StoreError.cancelled {
                // Nutzer-Abbruch: bewusst kein Alert.
            } catch {
                actionError = error.localizedDescription
            }
        }
    }
}
