import SwiftUI
import WebKit
import UIKit

/// Das Live-Studio der App: Bühne im WebView, alles andere nativ.
///
/// Senden heißt WebRTC (WHIP), und den Stack gibt es auf iOS nur im WebView.
/// Statt einen zweiten Sendeweg zu bauen, der eigene Fehler haben kann, lädt
/// die App dieselbe Bühne, die auch das Browser-Studio benutzt
/// (`/live-studio`), und legt ihre eigene Kopfzeile, den Zuschauer-Chat und
/// das Beenden darum herum.
///
/// Angemeldet wird über das Token der Mobile-API, das vor dem Laden ins
/// Fenster geschoben wird — es steht damit weder in der Adresse noch in einem
/// Server-Log.
struct LiveStudioView: View {
    let slug: String
    let session: StudioLiveSession
    let brand: BrandTheme
    let onClose: () -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var bridge = StudioWebBridge()
    @State private var phase: StudioPhase = .idle
    @State private var seconds = 0
    @State private var showChat = false
    @State private var showLeaveConfirm = false
    @State private var ticker: Task<Void, Never>?

    init(slug: String,
         session: StudioLiveSession,
         brand: BrandTheme,
         onClose: @escaping () -> Void) {
        self.slug = slug
        self.session = session
        self.brand = brand
        self.onClose = onClose
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()

            if let url = URL(string: session.studioUrl), let token = appState.session.token {
                StudioWebView(url: url, token: token, slug: slug, bridge: bridge) { event in
                    handle(event)
                }
                .ignoresSafeArea(edges: .bottom)
            } else {
                missingTokenNotice
            }

            LinearGradient(colors: [.black.opacity(0.7), .clear],
                           startPoint: .top,
                           endPoint: .bottom)
                .frame(height: 130)
                .allowsHitTesting(false)

            topBar
        }
        .environment(\.colorScheme, .dark)
        .brandTheme(brand)
        .sheet(isPresented: $showChat) {
            // Das Studio ist dunkel, der Chat ist eine gewoehnliche Aera-Fläche —
            // ohne diese Zeile erbt er das dunkle Schema und wird unleserlich.
            StudioLiveChatSheet(slug: slug, sessionId: session.id, brand: brand)
                .environment(\.colorScheme, .light)
        }
        .confirmationDialog("Sendung beenden?",
                            isPresented: $showLeaveConfirm,
                            titleVisibility: .visible) {
            Button("Beenden", role: .destructive) { end() }
            Button("Weiter senden", role: .cancel) {}
        } message: {
            Text("Du bist auf Sendung. Wenn du das Studio verlässt, endet die Übertragung.")
        }
        // Solange gesendet wird, soll der Bildschirm nicht schlafen gehen.
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    // MARK: - Kopfzeile

    private var topBar: some View {
        HStack(spacing: 10) {
            Button {
                close()
            } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .glassEffect(.regular, in: .circle)
                    .contentShape(.circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Studio schließen"))

            VStack(alignment: .leading, spacing: 3) {
                Text(session.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .shadow(color: .black.opacity(0.5), radius: 3, y: 1)

                if phase == .live {
                    HStack(spacing: 6) {
                        LivePulseDot(size: 6)
                        Text("Auf Sendung")
                            .font(.system(size: 11, weight: .bold))
                        Text(clock)
                            .font(.system(size: 11, weight: .semibold))
                            .monospacedDigit()
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Theme.danger, in: .capsule)
                } else if phase == .starting {
                    Text("Verbinde…")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.75))
                }
            }

            Spacer(minLength: 4)

            Button {
                showChat = true
            } label: {
                Image(systemName: "bubble.left.and.bubble.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .glassEffect(.regular, in: .circle)
                    .contentShape(.circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Live-Chat"))
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
    }

    private var missingTokenNotice: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.crop.circle.badge.exclamationmark")
                .font(.system(size: 24, weight: .medium))
                .foregroundStyle(.white.opacity(0.9))
            Text("Melde dich an, um zu senden.")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var clock: String {
        String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }

    // MARK: - Ereignisse der Bühne

    private func handle(_ event: StudioEvent) {
        switch event.type {
        case "live":
            phase = .live
            seconds = 0
            startTicking()
        case "phase":
            if let raw = event.phase, let value = StudioPhase(rawValue: raw) {
                phase = value
                if value != .live { stopTicking() }
            }
        case "ended":
            phase = .idle
            stopTicking()
            // Die Bühne hat sauber abgemeldet — jetzt darf das Studio zu.
            close(force: true)
        case "error":
            if phase == .starting { phase = .idle }
        default:
            break
        }
    }

    private func startTicking() {
        ticker?.cancel()
        ticker = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
                seconds += 1
            }
        }
    }

    private func stopTicking() {
        ticker?.cancel()
        ticker = nil
    }

    /// Verlassen: läuft die Sendung, wird erst gefragt.
    private func close(force: Bool = false) {
        if phase == .live && !force {
            showLeaveConfirm = true
            return
        }
        stopTicking()
        onClose()
        dismiss()
    }

    private func end() {
        // Die Bühne beendet die Sendung und meldet sich anschließend zurück.
        bridge.end()
        // Meldet sie sich nicht — abgestürzte Seite, kaputtes JavaScript —,
        // beendet die App selbst. Eine Session, die serverseitig „live"
        // bleibt, waere das schlechtere Ende.
        Task {
            try? await Task.sleep(for: .seconds(3))
            guard phase == .live else { return }
            try? await appState.api.setStudioLiveStatus(slug: slug,
                                                        sessionId: session.id,
                                                        status: .ended)
            phase = .idle
            close(force: true)
        }
    }
}

// MARK: - Zustand & Brücke

private enum StudioPhase: String {
    case idle
    case starting
    case live
    case error
}

/// Eine Nachricht der Bühne an die App.
struct StudioEvent {
    let type: String
    let phase: String?
}

/// Griff auf das WebView, um die Sendung von außen zu beenden.
@MainActor
final class StudioWebBridge {
    weak var webView: WKWebView?

    func end() {
        webView?.evaluateJavaScript("window.aeraStudioEnd && window.aeraStudioEnd()")
    }
}

// MARK: - WebView

/// WKWebView mit Kamera- und Mikrofonfreigabe, Token-Einschleusung und
/// Rückkanal.
struct StudioWebView: UIViewRepresentable {
    let url: URL
    let token: String
    let slug: String
    let bridge: StudioWebBridge
    let onEvent: @MainActor (StudioEvent) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(host: url.host, onEvent: onEvent)
    }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        // Token und Slug vor dem ersten Skript ins Fenster legen — so stehen
        // sie nie in der Adresse und landen in keinem Server-Log.
        let payload = "window.__aeraStudio = { token: \(jsString(token)), slug: \(jsString(slug)) };"
        controller.addUserScript(
            WKUserScript(source: payload, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        controller.add(context.coordinator, name: "aeraStudio")

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.backgroundColor = .black
        webView.allowsBackForwardNavigationGestures = false
        webView.load(URLRequest(url: url))

        bridge.webView = webView
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onEvent = onEvent
        bridge.webView = webView
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        // Der Content-Controller hält den Handler stark — ohne Abmelden bliebe
        // er (und mit ihm das WebView) am Leben.
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "aeraStudio")
        webView.stopLoading()
    }

    /// String sicher in JavaScript einbetten.
    private func jsString(_ value: String) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: [value])) ?? Data()
        let array = String(data: data, encoding: .utf8) ?? "[\"\"]"
        return String(array.dropFirst().dropLast())
    }

    @MainActor
    final class Coordinator: NSObject, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate {
        /// Nur dieser Host bekommt Token, Kamera und Mikrofon zu sehen.
        let host: String?
        var onEvent: @MainActor (StudioEvent) -> Void

        init(host: String?, onEvent: @escaping @MainActor (StudioEvent) -> Void) {
            self.host = host
            self.onEvent = onEvent
        }

        /// Die Seite darf ihren Host nicht verlassen. Das Token liegt im
        /// Fenster; eine Weiterleitung nach draussen wuerde es mitnehmen.
        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            let target = navigationAction.request.url?.host
            decisionHandler(target == nil || target == host ? .allow : .cancel)
        }

        func userContentController(_ controller: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String else { return }
            onEvent(StudioEvent(type: type, phase: body["phase"] as? String))
        }

        /// Kamera und Mikrofon freigeben — aber nur der eigenen Seite. Das
        /// System hat den Nutzer vorher ohnehin gefragt.
        func webView(_ webView: WKWebView,
                     requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo,
                     type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            decisionHandler(origin.host == host ? .grant : .deny)
        }
    }
}

// MARK: - Zuschauer-Chat

/// Der Chat der laufenden Session — damit der Creator reagieren kann, ohne die
/// Sendung aus den Augen zu lassen.
private struct StudioLiveChatSheet: View {
    let slug: String
    let sessionId: String
    let brand: BrandTheme

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var messages: [ChatMessage] = []
    @State private var knownIds: Set<String> = []
    @State private var draft = ""
    @State private var isSending = false
    @State private var sendSuccessCount = 0

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        if messages.isEmpty {
                            Text("Noch keine Nachrichten.")
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.ink.opacity(0.45))
                                .padding(.top, 24)
                        } else {
                            ForEach(messages) { message in
                                ChatBubbleRow(message: message)
                                    .id(message.id)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .defaultScrollAnchor(.bottom)
                .onChange(of: messages.count) {
                    if let lastId = messages.last?.id {
                        withAnimation(.snappy(duration: 0.25)) {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
            }
            .background(Theme.paper.ignoresSafeArea())
            .safeAreaInset(edge: .bottom) {
                ChatInputBar(text: $draft, isSending: isSending, onSend: send)
            }
            .navigationTitle("Live-Chat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") { dismiss() }
                }
            }
            .brandTheme(brand)
        }
        .presentationDetents([.medium, .large])
        .sensoryFeedback(.success, trigger: sendSuccessCount)
        .task {
            while !Task.isCancelled {
                await poll()
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }

    private func poll() async {
        do {
            let response = try await appState.api.liveSession(slug: slug,
                                                              sessionId: sessionId,
                                                              after: messages.last?.id)
            let unseen = response.messages.filter { !knownIds.contains($0.id) }
            guard !unseen.isEmpty else { return }
            messages.append(contentsOf: unseen)
            knownIds.formUnion(unseen.map(\.id))
        } catch {
            // Still: der nächste Versuch kommt in drei Sekunden.
        }
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }
        isSending = true
        Task {
            do {
                let message = try await appState.api.sendLiveMessage(slug: slug,
                                                                     sessionId: sessionId,
                                                                     body: text)
                if !knownIds.contains(message.id) {
                    messages.append(message)
                    knownIds.insert(message.id)
                }
                draft = ""
                sendSuccessCount += 1
            } catch {
                // Fehler beim Senden bleibt still; die Nachricht steht noch da.
            }
            isSending = false
        }
    }
}
