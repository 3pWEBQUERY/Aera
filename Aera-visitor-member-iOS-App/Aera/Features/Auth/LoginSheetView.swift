import SwiftUI

/// Login-Sheet: E-Mail/Passwort. Bei aktivem TOTP (401 `totp_required`)
/// wird ein zusätzliches 6-stelliges Code-Feld eingeblendet.
/// Nach Erfolg: `session.apply` + dismiss + optionaler `onSuccess`-Callback.
struct LoginSheetView: View {
    var onSuccess: (() -> Void)?

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @Environment(\.brand) private var brand

    @State private var email = ""
    @State private var password = ""
    @State private var totpCode = ""
    @State private var showsTOTPField = false
    @State private var isSubmitting = false
    @State private var isRequestingReset = false
    @State private var errorMessage: String?
    @State private var infoMessage: String?
    @State private var showSignup = false
    @State private var successTrigger = 0

    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case email
        case password
        case totp
    }

    init(onSuccess: (() -> Void)? = nil) {
        self.onSuccess = onSuccess
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    fields
                    messages
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
            .navigationDestination(isPresented: $showSignup) {
                SignupView {
                    finishAuthentication()
                }
            }
        }
        .sensoryFeedback(.success, trigger: successTrigger)
        .interactiveDismissDisabled(isSubmitting)
    }

    // MARK: - Abschnitte

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            EyebrowLabel("Willkommen zurück")
            Text("Anmelden")
                .font(.displaySerif(30))
                .kerning(-0.4)
                .foregroundStyle(Theme.ink)
            Text("Melde dich an, um deinen Communities beizutreten und nichts zu verpassen.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink.opacity(0.6))
        }
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: 16) {
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
            }

            VStack(alignment: .leading, spacing: 6) {
                fieldLabel("Passwort")
                SecureField("Dein Passwort", text: $password)
                    .textContentType(.password)
                    .focused($focusedField, equals: .password)
                    .submitLabel(showsTOTPField ? .next : .go)
                    .onSubmit {
                        if showsTOTPField {
                            focusedField = .totp
                        } else {
                            submit()
                        }
                    }
                    .authInputStyle()
            }

            if showsTOTPField {
                VStack(alignment: .leading, spacing: 6) {
                    fieldLabel("Zwei-Faktor-Code")
                    TextField("6-stelliger Code", text: $totpCode)
                        .textContentType(.oneTimeCode)
                        .keyboardType(.numberPad)
                        .focused($focusedField, equals: .totp)
                        .authInputStyle()
                        .onChange(of: totpCode) { _, newValue in
                            let filtered = String(newValue.filter(\.isNumber).prefix(6))
                            if filtered != newValue {
                                totpCode = filtered
                            }
                        }
                }
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.25), value: showsTOTPField)
    }

    @ViewBuilder
    private var messages: some View {
        if let errorMessage {
            messageCard(errorMessage,
                        icon: "exclamationmark.triangle.fill",
                        foreground: Theme.danger,
                        background: Theme.danger.opacity(0.08))
        }
        if let infoMessage {
            messageCard(infoMessage,
                        icon: "info.circle.fill",
                        foreground: Theme.amber800,
                        background: Theme.amber50,
                        border: Theme.amber200)
        }
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
                    Text("Anmelden")
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.brand(fullWidth: true))
        .disabled(!canSubmit || isSubmitting)
        .opacity(canSubmit ? 1 : 0.55)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 16) {
            Button {
                requestPasswordReset()
            } label: {
                if isRequestingReset {
                    ProgressView()
                } else {
                    Text("Passwort vergessen?")
                }
            }
            .buttonStyle(.ghost)
            .disabled(isRequestingReset || isSubmitting)

            HStack(spacing: 6) {
                Text("Noch kein Konto?")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.ink.opacity(0.6))
                Button {
                    showSignup = true
                } label: {
                    Text("Registrieren")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(brand.color)
                }
                .buttonStyle(.plain)
                .disabled(isSubmitting)
            }
        }
    }

    // MARK: - Bausteine

    private func fieldLabel(_ text: LocalizedStringKey) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Theme.ink.opacity(0.7))
    }

    private func messageCard(_ text: String,
                             icon: String,
                             foreground: Color,
                             background: Color,
                             border: Color? = nil) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
            Text(text)
                .font(.system(size: 13.5))
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(foreground)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(background, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            if let border {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(border, lineWidth: 1)
            }
        }
    }

    // MARK: - Logik

    private var canSubmit: Bool {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedEmail.contains("@"), !password.isEmpty else { return false }
        if showsTOTPField {
            return totpCode.count == 6
        }
        return true
    }

    private func submit() {
        guard canSubmit, !isSubmitting else { return }
        errorMessage = nil
        infoMessage = nil
        isSubmitting = true
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let totp = showsTOTPField ? totpCode : nil

        Task {
            do {
                let response = try await appState.api.login(email: trimmedEmail,
                                                            password: password,
                                                            totp: totp)
                appState.session.apply(token: response.token, user: response.user)
                isSubmitting = false
                finishAuthentication()
                return
            } catch let error as APIError where error.code == .totpRequired {
                if showsTOTPField, totpCode.count == 6 {
                    errorMessage = String(localized: "Der Code ist ungültig oder abgelaufen. Bitte versuche es erneut.")
                } else {
                    infoMessage = String(localized: "Dein Konto ist mit Zwei-Faktor-Authentifizierung geschützt. Gib den 6-stelligen Code aus deiner Authenticator-App ein.")
                }
                withAnimation(.snappy(duration: 0.25)) {
                    showsTOTPField = true
                }
                totpCode = ""
                focusedField = .totp
            } catch let error as APIError {
                switch error.code {
                case .invalidCredentials:
                    errorMessage = String(localized: "E-Mail oder Passwort ist falsch.")
                case .rateLimited:
                    errorMessage = String(localized: "Zu viele Versuche. Bitte warte einen Moment.")
                case .network:
                    errorMessage = String(localized: "Keine Verbindung. Bitte prüfe dein Netzwerk.")
                default:
                    errorMessage = error.message
                }
            } catch {
                errorMessage = String(localized: "Anmeldung fehlgeschlagen. Bitte versuche es erneut.")
            }
            isSubmitting = false
        }
    }

    private func requestPasswordReset() {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        errorMessage = nil
        infoMessage = nil
        guard trimmedEmail.contains("@") else {
            errorMessage = String(localized: "Bitte gib zuerst deine E-Mail-Adresse ein.")
            focusedField = .email
            return
        }
        isRequestingReset = true
        Task {
            do {
                try await appState.api.requestPasswordReset(email: trimmedEmail)
                infoMessage = String(localized: "Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link zum Zurücksetzen geschickt.")
            } catch let error as APIError {
                errorMessage = error.code == .network
                    ? String(localized: "Keine Verbindung. Bitte prüfe dein Netzwerk.")
                    : error.message
            } catch {
                errorMessage = String(localized: "Die Anfrage konnte nicht gesendet werden.")
            }
            isRequestingReset = false
        }
    }

    private func finishAuthentication() {
        successTrigger += 1
        dismiss()
        onSuccess?()
    }
}

// MARK: - Eingabefeld-Stil

/// Aera-Eingabefeld: weiß, Radius 10, Hairline-Border (DESIGN.md §3).
struct AuthInputModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: 16))
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(Theme.border, lineWidth: 1)
            )
    }
}

extension View {
    /// Standard-Eingabefeld-Optik (weiß, Radius 10, Hairline).
    func authInputStyle() -> some View {
        modifier(AuthInputModifier())
    }
}
