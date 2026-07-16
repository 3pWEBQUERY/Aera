import SwiftUI

/// Composer-Sheet für neue Beiträge (`POST /c/{slug}/posts`):
/// optionales Titelfeld (FORUM), TextEditor mit Mindestlänge,
/// Abbrechen/Posten in der Toolbar.
struct PostComposerSheet: View {
    let slug: String
    let spaceSlug: String
    let withTitle: Bool
    let onCreated: (Post) -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @Environment(\.brand) private var brand

    @State private var title = ""
    @State private var bodyText = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var successTrigger = 0

    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case title
        case body
    }

    private static let minimumBodyLength = 3
    private static let minimumTitleLength = 3

    init(slug: String,
         spaceSlug: String,
         withTitle: Bool,
         onCreated: @escaping (Post) -> Void) {
        self.slug = slug
        self.spaceSlug = spaceSlug
        self.withTitle = withTitle
        self.onCreated = onCreated
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if withTitle {
                        VStack(alignment: .leading, spacing: 6) {
                            fieldLabel("Titel")
                            TextField("Worum geht es?", text: $title)
                                .focused($focusedField, equals: .title)
                                .submitLabel(.next)
                                .onSubmit { focusedField = .body }
                                .authInputStyle()
                        }
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        fieldLabel("Beitrag")
                        TextEditor(text: $bodyText)
                            .focused($focusedField, equals: .body)
                            .font(.system(size: 16))
                            .foregroundStyle(Theme.ink)
                            .scrollContentBackground(.hidden)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .frame(minHeight: 160)
                            .background(Theme.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .strokeBorder(Theme.border, lineWidth: 1)
                            )
                    }

                    if let errorMessage {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 14, weight: .semibold))
                            Text(errorMessage)
                                .font(.system(size: 13.5))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .foregroundStyle(Theme.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Theme.danger.opacity(0.08),
                                    in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Neuer Beitrag")
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
                            Text("Posten")
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(!canSubmit || isSubmitting)
                }
            }
        }
        .tint(brand.color)
        .sensoryFeedback(.success, trigger: successTrigger)
        .interactiveDismissDisabled(isSubmitting || hasContent)
        .onAppear {
            focusedField = withTitle ? .title : .body
        }
    }

    // MARK: - Bausteine

    private func fieldLabel(_ text: LocalizedStringKey) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Theme.ink.opacity(0.7))
    }

    // MARK: - Logik

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedBody: String {
        bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var hasContent: Bool {
        !trimmedBody.isEmpty || !trimmedTitle.isEmpty
    }

    private var canSubmit: Bool {
        guard trimmedBody.count >= Self.minimumBodyLength else { return false }
        if withTitle {
            return trimmedTitle.count >= Self.minimumTitleLength
        }
        return true
    }

    private func submit() {
        guard canSubmit, !isSubmitting else { return }
        errorMessage = nil
        isSubmitting = true

        Task {
            do {
                let post = try await appState.api.createPost(slug: slug,
                                                             spaceSlug: spaceSlug,
                                                             title: withTitle ? trimmedTitle : nil,
                                                             body: trimmedBody)
                successTrigger += 1
                isSubmitting = false
                onCreated(post)
                dismiss()
                return
            } catch let error as APIError {
                switch error.code {
                case .network:
                    errorMessage = String(localized: "Keine Verbindung. Bitte prüfe dein Netzwerk.")
                case .validation:
                    errorMessage = error.message
                default:
                    errorMessage = error.message
                }
            } catch {
                errorMessage = String(localized: "Der Beitrag konnte nicht erstellt werden.")
            }
            isSubmitting = false
        }
    }
}
