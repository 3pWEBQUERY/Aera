import SwiftUI

/// Live-Bereich des Studios: Sessions anlegen und aus dem Gerät senden.
///
/// Gesendet wird über dieselbe Bühne wie im Web-Studio — Bild und Ton gehen
/// per WebRTC direkt an Cloudflare, ohne Zwischenstation und ohne Aufzeichnung
/// auf dem Telefon. Die Bühne selbst liegt im WebView (`LiveStudioView`), weil
/// es den WebRTC-Stack auf iOS nur dort gibt; alles darum herum ist nativ.
struct StudioLiveView: View {
    let community: StudioCommunity

    @Environment(AppState.self) private var appState

    @State private var overview: StudioLiveOverview?
    @State private var loadErrorMessage: String?
    @State private var showCompose = false
    @State private var studioSession: StudioLiveSession?
    /// Frisch angelegte Session, die nach dem Schließen des Blatts geöffnet wird.
    @State private var pendingSession: StudioLiveSession?
    @State private var actionError: String?
    @State private var successCount = 0

    private var slug: String { community.community.slug }

    private var brandTheme: BrandTheme {
        BrandTheme(primaryHex: community.community.primaryColor,
                   accentHex: community.community.accentColor)
    }

    init(community: StudioCommunity) {
        self.community = community
    }

    var body: some View {
        Group {
            if let overview {
                content(overview)
            } else if let loadErrorMessage {
                errorView(loadErrorMessage)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .brandTheme(brandTheme)
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle("Live")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if overview?.spaces.isEmpty == false {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCompose = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel(Text("Session erstellen"))
                }
            }
        }
        .sheet(isPresented: $showCompose, onDismiss: {
            // Erst wenn das Blatt zu ist, geht die Bühne auf — zwei
            // Präsentationen im selben Zug verschluckt SwiftUI.
            if let created = pendingSession {
                pendingSession = nil
                studioSession = created
            }
        }) {
            StudioLiveComposeSheet(slug: slug,
                                   spaces: overview?.spaces ?? [],
                                   brand: brandTheme) { session in
                successCount += 1
                // Direkt auf die Bühne: wer eine Session anlegt, will senden.
                pendingSession = session
                showCompose = false
                Task { await load(force: true) }
            }
        }
        .fullScreenCover(item: $studioSession) { session in
            LiveStudioView(slug: slug, session: session, brand: brandTheme) {
                studioSession = nil
                Task { await load(force: true) }
            }
        }
        .sensoryFeedback(.success, trigger: successCount)
        .alert("Fehler", isPresented: Binding(
            get: { actionError != nil },
            set: { if !$0 { actionError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(actionError ?? "")
        }
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    // MARK: - Inhalt

    private func content(_ overview: StudioLiveOverview) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                if overview.spaces.isEmpty {
                    EmptyStateView(
                        icon: "dot.radiowaves.left.and.right",
                        title: "Kein Live-Bereich",
                        message: "Lege im Dashboard einen Live-Bereich an, dann kannst du von hier aus senden."
                    )
                } else if !overview.streamEnabled {
                    EmptyStateView(
                        icon: "exclamationmark.triangle",
                        title: "Streaming nicht eingerichtet",
                        message: "Für diese Plattform ist Cloudflare Stream noch nicht hinterlegt."
                    )
                } else if overview.sessions.isEmpty {
                    EmptyStateView(
                        icon: "dot.radiowaves.left.and.right",
                        title: "Noch keine Session",
                        message: "Erstelle eine Session — danach gehst du mit einem Tippen auf Sendung."
                    )
                    Button("Session erstellen") { showCompose = true }
                        .buttonStyle(.brand(fullWidth: true))
                } else {
                    ForEach(overview.sessions) { session in
                        sessionCard(session)
                    }
                }
            }
            .padding(16)
        }
    }

    private func sessionCard(_ session: StudioLiveSession) -> some View {
        AeraCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    statusPill(session)
                    Spacer(minLength: 4)
                    if let spaceSlug = session.spaceSlug {
                        Text(spaceSlug)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.ink.opacity(0.4))
                            .lineLimit(1)
                    }
                }

                Text(session.title)
                    .font(.displaySerif(20))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)

                if session.status == .scheduled, let startsAt = session.startsAt {
                    LiveCountdownText(target: startsAt)
                        .foregroundStyle(brandTheme.color)
                }

                if session.canBroadcast {
                    HStack(spacing: 10) {
                        Button(session.status == .live ? "Studio öffnen" : "Live gehen") {
                            studioSession = session
                        }
                        .buttonStyle(.brand)

                        if session.status == .live {
                            Button("Beenden") {
                                setStatus(session, to: .ended)
                            }
                            .buttonStyle(.secondary)
                        }
                    }
                } else {
                    Text("Diese Session kommt von einer anderen Quelle — sie lässt sich nur im Dashboard steuern.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink.opacity(0.55))
                }
            }
        }
    }

    @ViewBuilder
    private func statusPill(_ session: StudioLiveSession) -> some View {
        switch session.status {
        case .live:
            HStack(spacing: 6) {
                LivePulseDot(size: 6)
                Text("LIVE")
                    .font(.system(size: 11, weight: .bold))
                    .kerning(1.2)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Theme.danger, in: .capsule)
        case .scheduled:
            PillLabel(String(localized: "Geplant"), systemImage: "calendar", prominent: true)
        case .ended:
            PillLabel(String(localized: "Beendet"), systemImage: "checkmark")
        }
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
            EmptyStateView(icon: "wifi.exclamationmark",
                           title: "Laden fehlgeschlagen",
                           message: LocalizedStringKey(message))
            Button("Erneut versuchen") {
                loadErrorMessage = nil
                Task { await load(force: true) }
            }
            .buttonStyle(.secondary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // MARK: - Laden & Aktionen

    private func load(force: Bool = false) async {
        if overview != nil && !force { return }
        do {
            overview = try await appState.api.studioLive(slug: slug)
            loadErrorMessage = nil
        } catch {
            if overview == nil { loadErrorMessage = error.localizedDescription }
        }
    }

    private func setStatus(_ session: StudioLiveSession, to status: LiveSessionStatus) {
        Task {
            do {
                _ = try await appState.api.setStudioLiveStatus(slug: slug,
                                                                sessionId: session.id,
                                                                status: status)
                successCount += 1
                await load(force: true)
            } catch {
                actionError = error.localizedDescription
            }
        }
    }
}

// MARK: - Hilfstypen

/// Neue Session anlegen: Bereich, Titel, optional ein Termin.
private struct StudioLiveComposeSheet: View {
    let slug: String
    let spaces: [StudioLiveOverview.SpaceRef]
    let brand: BrandTheme
    let onCreated: (StudioLiveSession) -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var spaceSlug: String = ""
    @State private var title = ""
    @State private var scheduled = false
    @State private var startsAt = Date().addingTimeInterval(3600)
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Titel") {
                    TextField("Worum geht es?", text: $title, axis: .vertical)
                        .lineLimit(1...3)
                }

                if spaces.count > 1 {
                    Section("Bereich") {
                        Picker("Bereich", selection: $spaceSlug) {
                            ForEach(spaces) { space in
                                Text(space.name).tag(space.slug)
                            }
                        }
                    }
                }

                Section {
                    Toggle("Für später planen", isOn: $scheduled)
                    if scheduled {
                        DatePicker("Beginn", selection: $startsAt, in: Date()...)
                    }
                } footer: {
                    Text("Ohne Termin kannst du sofort auf Sendung gehen.")
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.danger)
                    }
                }
            }
            .navigationTitle("Neue Live-Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Erstellen") { save() }
                        .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 || isSaving)
                }
            }
            .brandTheme(brand)
        }
        .onAppear {
            if spaceSlug.isEmpty { spaceSlug = spaces.first?.slug ?? "" }
        }
    }

    private func save() {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2, !spaceSlug.isEmpty, !isSaving else { return }
        isSaving = true
        Task {
            do {
                let session = try await appState.api.createStudioLive(
                    slug: slug,
                    spaceSlug: spaceSlug,
                    title: trimmed,
                    startsAt: scheduled ? startsAt : nil
                )
                // Schliessen uebernimmt der Aufrufer — er weiss, was danach
                // aufgehen soll.
                onCreated(session)
            } catch {
                errorMessage = error.localizedDescription
            }
            isSaving = false
        }
    }
}
