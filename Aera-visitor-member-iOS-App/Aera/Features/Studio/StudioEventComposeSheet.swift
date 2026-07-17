import SwiftUI

/// Sheet zum Erstellen eines Events (`POST /studio/{slug}/events`):
/// Titel, Beschreibung, Start, optionales Ende, Online-Toggle mit
/// Meeting-Link bzw. Ort sowie optionale Kapazität.
/// Gleiches Sheet-Muster wie `ChangeNameSheet` (AccountView).
struct StudioEventComposeSheet: View {
    let slug: String
    let onCreated: () -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var eventDescription = ""
    @State private var startsAt = Self.defaultStartDate
    @State private var hasEnd = false
    @State private var endsAt = Self.defaultEndDate
    @State private var isOnline = false
    @State private var meetingUrl = ""
    @State private var location = ""
    @State private var capacityText = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private static var defaultStartDate: Date {
        Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now.addingTimeInterval(86400)
    }

    private static var defaultEndDate: Date {
        defaultStartDate.addingTimeInterval(3600)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Titel")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.ink.opacity(0.7))
                        TextField("Wie heißt das Event?", text: $title)
                            .authInputStyle()
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Beschreibung (optional)")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.ink.opacity(0.7))
                        TextField("Worum geht es?", text: $eventDescription, axis: .vertical)
                            .lineLimit(4...10)
                            .authInputStyle()
                    }

                    dateCard

                    locationCard

                    capacityCard

                    if let validationHint {
                        Text(validationHint)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink.opacity(0.5))
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.danger)
                    }
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Event erstellen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                    .disabled(isSubmitting)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        submit()
                    } label: {
                        if isSubmitting {
                            ProgressView()
                        } else {
                            Text("Erstellen")
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(!canSubmit || isSubmitting)
                }
            }
        }
        .interactiveDismissDisabled(isSubmitting)
    }

    // MARK: - Karten

    private var dateCard: some View {
        formCard {
            DatePicker("Start", selection: $startsAt, displayedComponents: [.date, .hourAndMinute])
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink)

            Toggle(isOn: $hasEnd.animation(.snappy(duration: 0.25))) {
                Text("Ende festlegen")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.ink)
            }

            if hasEnd {
                DatePicker("Ende",
                           selection: $endsAt,
                           in: startsAt...,
                           displayedComponents: [.date, .hourAndMinute])
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.ink)
            }
        }
    }

    private var locationCard: some View {
        formCard {
            Toggle(isOn: $isOnline.animation(.snappy(duration: 0.25))) {
                Text("Online-Event")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.ink)
            }

            if isOnline {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Meeting-Link (optional)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.ink.opacity(0.7))
                    TextField("https://…", text: $meetingUrl)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .authInputStyle()
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Ort (optional)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.ink.opacity(0.7))
                    TextField("Wo findet das Event statt?", text: $location)
                        .authInputStyle()
                }
            }
        }
    }

    private var capacityCard: some View {
        formCard {
            VStack(alignment: .leading, spacing: 6) {
                Text("Kapazität (optional)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.ink.opacity(0.7))
                TextField("Unbegrenzt", text: $capacityText)
                    .keyboardType(.numberPad)
                    .authInputStyle()
            }
        }
    }

    private func formCard(@ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Theme.border, lineWidth: 1)
        )
    }

    // MARK: - Validierung

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedMeetingUrl: String {
        meetingUrl.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Parst die Kapazität; leer → `nil`, ungültig/≤ 0 → Hinweis.
    private var capacity: Int? {
        let trimmed = capacityText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return Int(trimmed)
    }

    private var isMeetingUrlValid: Bool {
        guard isOnline, !trimmedMeetingUrl.isEmpty else { return true }
        guard let url = URL(string: trimmedMeetingUrl), let scheme = url.scheme else { return false }
        return scheme == "http" || scheme == "https"
    }

    private var isCapacityValid: Bool {
        let trimmed = capacityText.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return true }
        guard let value = Int(trimmed) else { return false }
        return value > 0
    }

    private var validationHint: String? {
        if !trimmedTitle.isEmpty && trimmedTitle.count < 2 {
            return String(localized: "Der Titel muss mindestens 2 Zeichen haben.")
        }
        if trimmedTitle.count > 120 {
            return String(localized: "Der Titel darf höchstens 120 Zeichen haben.")
        }
        if hasEnd && endsAt <= startsAt {
            return String(localized: "Das Ende muss nach dem Start liegen.")
        }
        if !isMeetingUrlValid {
            return String(localized: "Bitte gib einen gültigen Meeting-Link an (https://…).")
        }
        if !isCapacityValid {
            return String(localized: "Die Kapazität muss eine Zahl größer 0 sein.")
        }
        return nil
    }

    private var canSubmit: Bool {
        trimmedTitle.count >= 2
            && trimmedTitle.count <= 120
            && (!hasEnd || endsAt > startsAt)
            && isMeetingUrlValid
            && isCapacityValid
    }

    // MARK: - Absenden

    private func submit() {
        guard canSubmit, !isSubmitting else { return }
        isSubmitting = true
        errorMessage = nil
        let trimmedDescription = eventDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedLocation = location.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            do {
                _ = try await appState.api.createStudioEvent(
                    slug: slug,
                    title: trimmedTitle,
                    description: trimmedDescription.isEmpty ? nil : trimmedDescription,
                    startsAt: startsAt,
                    endsAt: hasEnd ? endsAt : nil,
                    location: isOnline || trimmedLocation.isEmpty ? nil : trimmedLocation,
                    isOnline: isOnline,
                    meetingUrl: isOnline && !trimmedMeetingUrl.isEmpty ? trimmedMeetingUrl : nil,
                    capacity: capacity
                )
                onCreated()
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
                isSubmitting = false
            }
        }
    }
}
