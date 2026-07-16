import SwiftUI

/// REQUESTS-Space: Anfragen-Karten mit Vote-Control (optimistisch),
/// Status-Pill (PRICED mit Freischalten-Kauf) und Floating-Glass-Button
/// zum Erstellen neuer Anfragen (wenn `canCreate`).
struct RequestsSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: RequestsContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var requests: [MemberRequest]
    @State private var showComposeSheet = false
    @State private var actionError: String?
    @State private var voteFeedbackCount = 0
    @State private var purchaseSuccessCount = 0

    init(slug: String,
         space: SpaceDetail,
         content: RequestsContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
        self._requests = State(initialValue: content.requests)
    }

    var body: some View {
        LazyVStack(spacing: 12) {
            if requests.isEmpty {
                EmptyStateView(
                    icon: "lightbulb",
                    title: "Noch keine Anfragen",
                    message: "Hier können Mitglieder Wünsche und Ideen einreichen, über die abgestimmt wird."
                )
            } else {
                ForEach(requests) { request in
                    RequestCard(
                        request: request,
                        onVote: { dir in vote(on: request, dir: dir) },
                        onUnlock: { unlock in purchase(unlock) }
                    )
                }
            }
        }
        .padding(.horizontal, 16)
        .overlay(alignment: .bottomTrailing) {
            if content.canCreate {
                composeButton
            }
        }
        .onChange(of: content.requests) { _, newValue in
            requests = newValue
        }
        .sensoryFeedback(.impact(weight: .light), trigger: voteFeedbackCount)
        .sensoryFeedback(.success, trigger: purchaseSuccessCount)
        .sheet(isPresented: $showComposeSheet) {
            RequestComposeSheet { title, body in
                try await create(title: title, body: body)
            }
            .brandTheme(brand)
        }
        .alert("Fehler", isPresented: Binding(
            get: { actionError != nil },
            set: { if !$0 { actionError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(actionError ?? "")
        }
    }

    // MARK: - Compose-Button

    private var composeButton: some View {
        Button {
            showComposeSheet = true
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .glassEffect(.regular.tint(brand.color).interactive(), in: .circle)
        }
        .buttonStyle(.plain)
        .padding(20)
        .accessibilityLabel(Text("Neue Anfrage"))
    }

    // MARK: - Aktionen

    private func vote(on request: MemberRequest, dir: VoteDirection) {
        guard let index = requests.firstIndex(where: { $0.id == request.id }) else { return }
        let snapshot = requests[index]

        // Optimistisches Update: gleiche Richtung erneut → Stimme entfernen.
        var updated = snapshot
        if snapshot.myVote == dir {
            updated.myVote = nil
            updated.score += dir == .up ? -1 : 1
        } else {
            var delta = dir == .up ? 1 : -1
            if snapshot.myVote != nil { delta *= 2 }
            updated.myVote = dir
            updated.score += delta
        }
        withAnimation(.snappy(duration: 0.25)) {
            requests[index] = updated
        }
        voteFeedbackCount += 1

        Task {
            do {
                let response = try await appState.api.voteRequest(slug: slug, requestId: request.id, dir: dir)
                if let liveIndex = requests.firstIndex(where: { $0.id == request.id }) {
                    requests[liveIndex].score = response.score
                    requests[liveIndex].myVote = response.myVote
                }
            } catch {
                if let liveIndex = requests.firstIndex(where: { $0.id == request.id }) {
                    withAnimation(.snappy(duration: 0.25)) {
                        requests[liveIndex] = snapshot
                    }
                }
                actionError = error.localizedDescription
            }
        }
    }

    private func purchase(_ unlock: Unlock) {
        guard !appState.purchases.isPurchasing else { return }
        Task {
            do {
                try await appState.purchases.purchase(unlock: unlock, tenantSlug: slug)
                purchaseSuccessCount += 1
                await reload()
            } catch StoreError.cancelled {
                // Nutzer-Abbruch: bewusst kein Alert.
            } catch {
                actionError = error.localizedDescription
            }
        }
    }

    private func create(title: String, body: String) async throws {
        let request = try await appState.api.createRequest(slug: slug, title: title, body: body)
        withAnimation(.snappy(duration: 0.25)) {
            requests.insert(request, at: 0)
        }
        purchaseSuccessCount += 1
    }
}

// MARK: - RequestCard

private struct RequestCard: View {
    let request: MemberRequest
    let onVote: (VoteDirection) -> Void
    let onUnlock: (Unlock) -> Void

    @Environment(\.brand) private var brand

    var body: some View {
        AeraCard(padding: 14) {
            HStack(alignment: .top, spacing: 14) {
                voteControl

                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top) {
                        Text(request.title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 8)
                        statusPill
                    }

                    if !request.body.isEmpty {
                        Text(request.body)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.ink.opacity(0.7))
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)
                    }

                    if request.status == .priced {
                        pricedArea
                    }

                    HStack(spacing: 6) {
                        Text(request.author.name)
                            .font(.system(size: 12, weight: .medium))
                        Text("·")
                        Text(request.createdAt.relativeLabel)
                            .font(.system(size: 12))
                    }
                    .foregroundStyle(Theme.ink.opacity(0.45))
                }
            }
        }
    }

    // MARK: - Vote-Control

    private var voteControl: some View {
        VStack(spacing: 4) {
            Button {
                onVote(.up)
            } label: {
                Image(systemName: "chevron.up")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(request.myVote == .up ? brand.color : Theme.ink.opacity(0.4))
                    .frame(width: 30, height: 26)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Text("\(request.score)")
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .contentTransition(.numericText())
                .foregroundStyle(request.myVote != nil ? brand.color : Theme.ink.opacity(0.7))

            Button {
                onVote(.down)
            } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(request.myVote == .down ? brand.color : Theme.ink.opacity(0.4))
                    .frame(width: 30, height: 26)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 2)
        .background(Theme.softFill, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // MARK: - Status

    @ViewBuilder
    private var statusPill: some View {
        switch request.status {
        case .open:
            PillLabel(String(localized: "Offen"))
        case .accepted:
            PillLabel(String(localized: "Angenommen"), prominent: true)
        case .priced:
            PillLabel(String(localized: "Bepreist"), systemImage: "tag", prominent: true)
        case .fulfilled:
            PillLabel(String(localized: "Umgesetzt"), systemImage: "checkmark")
        case .declined:
            PillLabel(String(localized: "Abgelehnt"), systemImage: "xmark")
        }
    }

    @ViewBuilder
    private var pricedArea: some View {
        HStack(spacing: 12) {
            PriceText(cents: request.priceCents ?? request.unlock?.priceCents ?? 0,
                      currency: request.unlock?.currency ?? "eur",
                      size: 18)

            if let unlock = request.unlock, unlock.appleProductId != nil {
                Button("Freischalten") {
                    onUnlock(unlock)
                }
                .buttonStyle(.brand)
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
    }
}

// MARK: - RequestComposeSheet

/// Sheet zum Erstellen einer Anfrage: Titel + Beschreibung → `POST /requests`.
private struct RequestComposeSheet: View {
    let onSubmit: (String, String) async throws -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var body_ = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Titel")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.ink.opacity(0.7))
                        TextField("Worum geht es?", text: $title)
                            .authInputStyle()
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Beschreibung")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.ink.opacity(0.7))
                        TextField("Beschreibe deine Anfrage", text: $body_, axis: .vertical)
                            .lineLimit(5...12)
                            .authInputStyle()
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
            .navigationTitle("Neue Anfrage")
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
                            Text("Senden")
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(!canSubmit || isSubmitting)
                }
            }
        }
        .interactiveDismissDisabled(isSubmitting)
    }

    private var canSubmit: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !body_.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submit() {
        guard canSubmit, !isSubmitting else { return }
        isSubmitting = true
        errorMessage = nil
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = body_.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            do {
                try await onSubmit(trimmedTitle, trimmedBody)
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
                isSubmitting = false
            }
        }
    }
}
