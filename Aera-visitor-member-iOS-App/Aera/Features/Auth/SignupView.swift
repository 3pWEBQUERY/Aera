import SwiftUI

/// Registrierung: Name/E-Mail/Passwort mit Live-Validierungshinweisen.
/// Wird von `LoginSheetView` in deren NavigationStack gepusht;
/// nach Erfolg: `session.apply` + `onSuccess` (schließt das Login-Sheet).
struct SignupView: View {
    let onSuccess: () -> Void

    @Environment(AppState.self) private var appState

    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case name
        case email
        case password
    }

    init(onSuccess: @escaping () -> Void) {
        self.onSuccess = onSuccess
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                fields
                if let errorMessage {
                    errorCard(errorMessage)
                }
                termsNotice
                submitButton
            }
            .padding(24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.paper.ignoresSafeArea())
        .navigationTitle("Registrieren")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(isSubmitting)
    }

    // MARK: - Abschnitte

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            EyebrowLabel("Neu bei Aera")
            Text("Konto erstellen")
                .font(.displaySerif(30))
                .kerning(-0.4)
                .foregroundStyle(Theme.ink)
            Text("Erstelle dein Konto, um Communities beizutreten und mitzumachen.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink.opacity(0.6))
        }
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                fieldLabel("Name")
                TextField("Dein Name", text: $name)
                    .textContentType(.name)
                    .focused($focusedField, equals: .name)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .email }
                    .authInputStyle()
                if showsNameHint {
                    fieldHint("Bitte gib deinen Namen ein (mindestens 2 Zeichen).", isProblem: true)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                fieldLabel("E-Mail")
                TextField("du@example.com", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
                    .authInputStyle()
                if showsEmailHint {
                    fieldHint("Bitte gib eine gültige E-Mail-Adresse ein.", isProblem: true)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                fieldLabel("Passwort")
                SecureField("Neues Passwort", text: $password)
                    .textContentType(.newPassword)
                    .focused($focusedField, equals: .password)
                    .submitLabel(.go)
                    .onSubmit { submit() }
                    .authInputStyle()
                fieldHint("Mindestens 8 Zeichen.", isProblem: showsPasswordHint)
            }
        }
    }

    private var termsNotice: some View {
        Text("Mit der Registrierung akzeptierst du die Nutzungsbedingungen und die Datenschutzerklärung von Aera.")
            .font(.system(size: 12))
            .foregroundStyle(Theme.ink.opacity(0.5))
            .fixedSize(horizontal: false, vertical: true)
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
                    Text("Konto erstellen")
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.brand(fullWidth: true))
        .disabled(!canSubmit || isSubmitting)
        .opacity(canSubmit ? 1 : 0.55)
    }

    // MARK: - Bausteine

    private func fieldLabel(_ text: LocalizedStringKey) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Theme.ink.opacity(0.7))
    }

    private func fieldHint(_ text: LocalizedStringKey, isProblem: Bool) -> some View {
        Text(text)
            .font(.system(size: 12))
            .foregroundStyle(isProblem ? Theme.danger : Theme.ink.opacity(0.5))
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

    // MARK: - Validierung

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isNameValid: Bool {
        trimmedName.count >= 2
    }

    private var isEmailValid: Bool {
        let parts = trimmedEmail.split(separator: "@")
        return parts.count == 2 && parts[1].contains(".")
    }

    private var isPasswordValid: Bool {
        password.count >= 8
    }

    private var showsNameHint: Bool {
        !name.isEmpty && !isNameValid
    }

    private var showsEmailHint: Bool {
        !email.isEmpty && !isEmailValid
    }

    private var showsPasswordHint: Bool {
        !password.isEmpty && !isPasswordValid
    }

    private var canSubmit: Bool {
        isNameValid && isEmailValid && isPasswordValid
    }

    // MARK: - Logik

    private func submit() {
        guard canSubmit, !isSubmitting else { return }
        errorMessage = nil
        isSubmitting = true

        Task {
            do {
                let response = try await appState.api.signup(name: trimmedName,
                                                             email: trimmedEmail,
                                                             password: password)
                appState.session.apply(token: response.token, user: response.user)
                isSubmitting = false
                onSuccess()
                return
            } catch let error as APIError {
                switch error.code {
                case .emailAlreadyRegistered:
                    errorMessage = String(localized: "Diese E-Mail-Adresse ist bereits registriert. Melde dich stattdessen an.")
                case .rateLimited:
                    errorMessage = String(localized: "Zu viele Registrierungen. Bitte versuche es später erneut.")
                case .validation:
                    errorMessage = error.message
                case .network:
                    errorMessage = String(localized: "Keine Verbindung. Bitte prüfe dein Netzwerk.")
                default:
                    errorMessage = error.message
                }
            } catch {
                errorMessage = String(localized: "Registrierung fehlgeschlagen. Bitte versuche es erneut.")
            }
            isSubmitting = false
        }
    }
}
