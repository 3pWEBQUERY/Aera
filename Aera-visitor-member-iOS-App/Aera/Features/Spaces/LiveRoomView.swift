import SwiftUI

/// Live-Raum: oben der Stream (LIVE → `streamUrl`, ENDED → `replayUrl`,
/// sonst Platzhalter „Stream startet in Kürze"), darunter der Live-Chat
/// mit 3-Sekunden-Polling (`GET /c/{slug}/live/{sessionId}?after=`).
struct LiveRoomView: View {
    let slug: String
    let sessionId: String

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var session: LiveSession?
    @State private var messages: [ChatMessage] = []
    @State private var knownIds: Set<String> = []
    @State private var isLoaded = false
    @State private var loadFailed = false
    @State private var draft = ""
    @State private var isSending = false
    @State private var sendError: String?
    @State private var sendSuccessCount = 0

    init(slug: String, sessionId: String) {
        self.slug = slug
        self.sessionId = sessionId
    }

    var body: some View {
        Group {
            if isLoaded, let session {
                content(for: session)
            } else if loadFailed {
                loadErrorView
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationTitle(session?.title ?? String(localized: "Live"))
        .navigationBarTitleDisplayMode(.inline)
        .sensoryFeedback(.success, trigger: sendSuccessCount)
        .alert("Senden fehlgeschlagen", isPresented: Binding(
            get: { sendError != nil },
            set: { if !$0 { sendError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(sendError ?? "")
        }
        .task {
            await load()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                guard !Task.isCancelled else { break }
                await poll()
            }
        }
    }

    // MARK: - Inhalt

    private func content(for session: LiveSession) -> some View {
        VStack(spacing: 0) {
            videoArea(for: session)

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 10) {
                        if messages.isEmpty {
                            Text("Noch keine Nachrichten. Sag hallo!")
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.ink.opacity(0.45))
                                .padding(.top, 24)
                        } else {
                            ForEach(ChatTimelineRow.rows(for: messages)) { row in
                                switch row {
                                case .separator(let date):
                                    ChatDateSeparator(date: date)
                                case .message(let message):
                                    ChatBubbleRow(message: message)
                                        .id(message.id)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .defaultScrollAnchor(.bottom)
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: messages.count) {
                    if let lastId = messages.last?.id {
                        withAnimation(.snappy(duration: 0.25)) {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            ChatInputBar(text: $draft, isSending: isSending, onSend: send)
        }
    }

    @ViewBuilder
    private func videoArea(for session: LiveSession) -> some View {
        if let url = playbackURL(for: session) {
            RemoteVideoPlayer(url: url)
                .aspectRatio(16 / 9, contentMode: .fit)
                .background(.black)
        } else {
            placeholderCard(for: session)
        }
    }

    private func playbackURL(for session: LiveSession) -> URL? {
        switch session.status {
        case .live:
            session.streamUrl.flatMap(URL.init(string:))
        case .ended:
            session.replayUrl.flatMap(URL.init(string:))
        case .scheduled:
            nil
        }
    }

    private func placeholderCard(for session: LiveSession) -> some View {
        AeraCard(padding: 24) {
            VStack(spacing: 10) {
                Image(systemName: "dot.radiowaves.left.and.right")
                    .font(.system(size: 22, weight: .medium))
                    .foregroundStyle(brand.color)
                    .frame(width: 52, height: 52)
                    .background(brand.soft, in: .circle)
                Text(session.status == .ended ? "Kein Replay verfügbar" : "Stream startet in Kürze")
                    .font(.displaySerif(18))
                    .foregroundStyle(Theme.ink)
                if session.status == .scheduled, let scheduledAt = session.scheduledAt {
                    Text("Geplant für \(scheduledAt.formatted(date: .abbreviated, time: .shortened))")
                        .font(.system(size: 13))
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink.opacity(0.55))
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding(16)
    }

    private var loadErrorView: some View {
        VStack(spacing: 16) {
            EmptyStateView(
                icon: "wifi.exclamationmark",
                title: "Laden fehlgeschlagen",
                message: "Die Live-Session konnte nicht geladen werden."
            )
            Button("Erneut versuchen") {
                loadFailed = false
                Task { await load() }
            }
            .buttonStyle(.secondary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Laden & Polling

    private func load() async {
        guard !isLoaded else { return }
        do {
            let response = try await appState.api.liveSession(slug: slug, sessionId: sessionId)
            session = response.session
            append(response.messages)
            isLoaded = true
            loadFailed = false
        } catch {
            if !isLoaded { loadFailed = true }
        }
    }

    private func poll() async {
        guard isLoaded else {
            await load()
            return
        }
        do {
            let response = try await appState.api.liveSession(slug: slug,
                                                              sessionId: sessionId,
                                                              after: messages.last?.id)
            session = response.session
            append(response.messages)
        } catch {
            // Polling-Fehler bewusst still: nächster Versuch in 3 Sekunden.
        }
    }

    private func append(_ new: [ChatMessage]) {
        let unseen = new.filter { !knownIds.contains($0.id) }
        guard !unseen.isEmpty else { return }
        messages.append(contentsOf: unseen)
        knownIds.formUnion(unseen.map(\.id))
    }

    // MARK: - Senden

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }
        isSending = true
        Task {
            do {
                let message = try await appState.api.sendLiveMessage(slug: slug,
                                                                     sessionId: sessionId,
                                                                     body: text)
                append([message])
                draft = ""
                sendSuccessCount += 1
            } catch {
                sendError = error.localizedDescription
            }
            isSending = false
        }
    }
}
