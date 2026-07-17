import SwiftUI

/// Sheet „Community starten": Name (mit Live-Verfügbarkeitscheck über
/// `GET /communities/name-check`, debounced), optionale Tagline und Kategorie.
/// Erstellt die Community über `POST /communities` und meldet den neuen Slug
/// über `onCreated` zurück. Gleiches Sheet-Muster wie `ChangeNameSheet`.
struct CreateCommunityView: View {
    let categories: [DiscoverCategory]
    let onCreated: (String) -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var tagline = ""
    @State private var selectedCategory: DiscoverCategory?
    @State private var nameCheck: NameCheckState = .idle
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var successTrigger = 0

    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case name
        case tagline
    }

    /// Zustand des Live-Verfügbarkeitschecks.
    private enum NameCheckState: Equatable {
        case idle
        case checking
        case available
        case taken
        case short
        case long
        /// Check fehlgeschlagen (z. B. offline) — Submit trotzdem erlauben,
        /// der Server prüft den Namen ohnehin verbindlich.
        case unknown
    }

    init(categories: [DiscoverCategory], onCreated: @escaping (String) -> Void) {
        self.categories = categories
        self.onCreated = onCreated
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    fields
                    if let errorMessage {
                        errorCard(errorMessage)
                    }
                    submitButton
                    footer
                }
                .padding(24)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.paper.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                    .disabled(isSubmitting)
                }
            }
        }
        .sensoryFeedback(.success, trigger: successTrigger)
        .interactiveDismissDisabled(isSubmitting)
        .task(id: trimmedName) {
            await checkName()
        }
    }

    // MARK: - Abschnitte

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            EyebrowLabel("Deine eigene Community")
            Text("Community starten")
                .font(.displaySerif(30))
                .kerning(-0.4)
                .foregroundStyle(Theme.ink)
            Text("Gib deiner Community einen Namen — Memberships, Feed und Forum richten wir dir direkt ein.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink.opacity(0.6))
        }
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                fieldLabel("Name")
                TextField("z. B. Atelier Nord", text: $name)
                    .textInputAutocapitalization(.words)
                    .focused($focusedField, equals: .name)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .tagline }
                    .authInputStyle()
                nameHint
            }

            VStack(alignment: .leading, spacing: 6) {
                fieldLabel("Tagline (optional)")
                TextField("Worum geht es bei dir?", text: $tagline)
                    .focused($focusedField, equals: .tagline)
                    .submitLabel(.done)
                    .authInputStyle()
            }

            VStack(alignment: .leading, spacing: 6) {
                fieldLabel("Kategorie (optional)")
                categoryMenu
            }
        }
    }

    @ViewBuilder
    private var nameHint: some View {
        switch nameCheck {
        case .idle, .unknown:
            EmptyView()
        case .checking:
            hintRow("Verfügbarkeit wird geprüft …", color: Theme.ink.opacity(0.5))
        case .available:
            hintRow("Name ist verfügbar ✓", color: Theme.ink.opacity(0.5))
        case .taken:
            hintRow("Name ist bereits vergeben", color: Theme.danger)
        case .short:
            hintRow("Der Name muss mindestens 2 Zeichen haben.", color: Theme.danger)
        case .long:
            hintRow("Der Name darf höchstens 60 Zeichen haben.", color: Theme.danger)
        }
    }

    private func hintRow(_ text: LocalizedStringKey, color: Color) -> some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(color)
    }

    private var categoryMenu: some View {
        Menu {
            Button("Keine Kategorie") {
                selectedCategory = nil
            }
            Divider()
            ForEach(categories) { category in
                Button {
                    selectedCategory = category
                } label: {
                    if selectedCategory?.key == category.key {
                        Label(category.label, systemImage: "checkmark")
                    } else {
                        Text(category.label)
                    }
                }
            }
        } label: {
            HStack {
                Text(selectedCategory?.label ?? String(localized: "Keine Kategorie"))
                    .foregroundStyle(selectedCategory == nil ? Theme.ink.opacity(0.5) : Theme.ink)
                Spacer()
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.ink.opacity(0.45))
            }
            .authInputStyle()
            .contentShape(.rect)
        }
        .disabled(isSubmitting)
    }

    private var submitButton: some View {
        Button {
            submit()
        } label: {
            Group {
                if isSubmitting {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text("Community starten")
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.brand(fullWidth: true))
        .disabled(!canSubmit || isSubmitting)
        .opacity(canSubmit ? 1 : 0.55)
    }

    private var footer: some View {
        Text("Verwalten kannst du deine Community im Web-Dashboard.")
            .font(.system(size: 13))
            .foregroundStyle(Theme.ink.opacity(0.5))
    }

    // MARK: - Bausteine

    private func fieldLabel(_ text: LocalizedStringKey) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Theme.ink.opacity(0.7))
    }

    private func errorCard(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 14, weight: .semibold))
            Text(text)
                .font(.system(size: 13.5))
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(Theme.danger)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Theme.danger.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // MARK: - Logik

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedTagline: String {
        tagline.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSubmit: Bool {
        guard trimmedName.count >= 2, trimmedName.count <= 60 else { return false }
        // Bei fehlgeschlagenem Check (offline) entscheidet der Server.
        return nameCheck != .taken && nameCheck != .checking
    }

    /// Live-Verfügbarkeitscheck, debounced (400 ms Tipp-Pause).
    private func checkName() async {
        guard !trimmedName.isEmpty else {
            nameCheck = .idle
            return
        }
        guard trimmedName.count >= 2 else {
            nameCheck = .short
            return
        }
        guard trimmedName.count <= 60 else {
            nameCheck = .long
            return
        }
        nameCheck = .checking
        try? await Task.sleep(for: .milliseconds(400))
        guard !Task.isCancelled else { return }
        do {
            let status = try await appState.api.checkCommunityName(trimmedName)
            guard !Task.isCancelled else { return }
            switch status {
            case "available": nameCheck = .available
            case "taken": nameCheck = .taken
            case "short": nameCheck = .short
            case "long": nameCheck = .long
            default: nameCheck = .unknown
            }
        } catch {
            guard !Task.isCancelled else { return }
            nameCheck = .unknown
        }
    }

    private func submit() {
        guard canSubmit, !isSubmitting else { return }
        isSubmitting = true
        errorMessage = nil
        focusedField = nil
        Task {
            do {
                let slug = try await appState.api.createCommunity(
                    name: trimmedName,
                    tagline: trimmedTagline.isEmpty ? nil : trimmedTagline,
                    category: selectedCategory?.key
                )
                successTrigger += 1
                dismiss()
                onCreated(slug)
            } catch let error as APIError {
                switch error.code {
                case .nameTaken:
                    nameCheck = .taken
                    errorMessage = String(localized: "Dieser Name ist bereits vergeben. Bitte wähle einen anderen.")
                case .addressTaken:
                    errorMessage = String(localized: "Für diesen Namen ist keine freie Adresse verfügbar. Bitte wähle einen anderen Namen.")
                case .network:
                    errorMessage = String(localized: "Keine Verbindung. Bitte prüfe dein Netzwerk.")
                case .unauthorized:
                    errorMessage = String(localized: "Bitte melde dich erneut an.")
                default:
                    errorMessage = error.message
                }
                isSubmitting = false
            } catch {
                errorMessage = String(localized: "Die Community konnte nicht erstellt werden. Bitte versuche es erneut.")
                isSubmitting = false
            }
        }
    }
}
