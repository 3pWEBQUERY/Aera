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
    /// Der Chat liegt auf dem Bild und ist von Anfang an da — der Creator soll
    /// mitlesen, ohne die Sendung aus den Augen zu lassen. Abschaltbar, weil
    /// ein freies Bild manchmal wichtiger ist.
    @State private var chatVisible = true
    @State private var showLeaveConfirm = false
    @State private var ticker: Task<Void, Never>?
    /// Kameras, die die Bühne im Gerät findet — eingebaute und angeschlossene.
    @State private var cameras: [StudioCamera] = []
    @State private var activeCameraId: String?

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
                // Ohne das schöbe die Tastatur des Chats die ganze Bühne hoch.
                .ignoresSafeArea(.keyboard, edges: .bottom)
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
        .overlay(alignment: .bottom) {
            if chatVisible, appState.session.token != nil {
                StudioChatOverlay(slug: slug, sessionId: session.id)
                    // Darunter liegt die Knopfreihe der Bühne (Mikrofon,
                    // Beenden, Kamera) — die bleibt frei.
                    .padding(.bottom, Self.stageControlsInset)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .environment(\.colorScheme, .dark)
        .brandTheme(brand)
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

            // Nur zeigen, wenn es etwas zu wählen gibt — bei einer einzigen
            // Kamera bleibt der Knopf der Bühne (Vorne/Hinten) genug.
            if cameras.count > 1 {
                cameraMenu
            }

            Button {
                withAnimation(.snappy(duration: 0.25)) { chatVisible.toggle() }
            } label: {
                Image(systemName: chatVisible
                      ? "bubble.left.and.bubble.right.fill"
                      : "bubble.left.and.bubble.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .glassEffect(.regular, in: .circle)
                    .contentShape(.circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(chatVisible ? "Chat ausblenden" : "Chat einblenden"))
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
    }

    /// Kameraauswahl. Was hier steht, meldet die Bühne aus dem Gerät: die
    /// eingebauten Kameras und alles, was angeschlossen ist. Der Haken zeigt,
    /// welche gerade sendet; der Wechsel läuft auch mitten in der Sendung.
    private var cameraMenu: some View {
        Menu {
            Picker("Kamera", selection: cameraSelection) {
                ForEach(cameras) { camera in
                    Text(camera.label).tag(camera.id as String?)
                }
            }
        } label: {
            Image(systemName: "camera.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .glassEffect(.regular, in: .circle)
                .contentShape(.circle)
        }
        .accessibilityLabel(Text("Kamera wählen"))
    }

    private var cameraSelection: Binding<String?> {
        Binding(
            get: { activeCameraId },
            set: { newValue in
                guard let newValue, newValue != activeCameraId else { return }
                activeCameraId = newValue
                bridge.selectCamera(newValue)
            }
        )
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

    /// Abstand nach unten, gerechnet ab dem unteren Sicherheitsrand: Die Bühne
    /// legt ihre Knopfreihe 32 pt über den eigenen Rand, die Knöpfe sind 48 pt
    /// hoch. Dazu 12 pt Luft, damit sich Chat und Knöpfe nicht berühren.
    private static let stageControlsInset: CGFloat = 92

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
        case "cameras":
            cameras = event.cameras
            // Die Bühne meldet, was wirklich sendet — auch wenn sie selbst
            // umgeschaltet hat (Knopf „Kamera wechseln").
            if let active = event.activeCameraId { activeCameraId = active }
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
            _ = try? await appState.api.setStudioLiveStatus(slug: slug,
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

/// Eine im Gerät gefundene Kamera, wie die Bühne sie meldet.
struct StudioCamera: Identifiable, Hashable, Sendable {
    let id: String
    let label: String
}

/// Eine Nachricht der Bühne an die App.
struct StudioEvent {
    let type: String
    let phase: String?
    var cameras: [StudioCamera] = []
    var activeCameraId: String?
}

/// Griff auf das WebView: Sendung von außen beenden, Kamera umstellen.
@MainActor
final class StudioWebBridge {
    weak var webView: WKWebView?

    func end() {
        webView?.evaluateJavaScript("window.aeraStudioEnd && window.aeraStudioEnd()")
    }

    /// Stellt die Bühne auf ein bestimmtes Aufnahmegerät um — auch mitten in
    /// der Sendung, die Bühne tauscht die Spur im laufenden Stream.
    func selectCamera(_ deviceId: String) {
        let data = (try? JSONSerialization.data(withJSONObject: [deviceId])) ?? Data()
        let array = String(data: data, encoding: .utf8) ?? "[\"\"]"
        let literal = String(array.dropFirst().dropLast())
        webView?.evaluateJavaScript("window.__aeraSelectCamera && window.__aeraSelectCamera(\(literal))")
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
        controller.addUserScript(
            WKUserScript(source: hideStageBadgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        controller.addUserScript(
            WKUserScript(source: cameraChoiceScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
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

    /// Sobald gesendet wird, legt die Bühne oben links ihr eigenes rotes
    /// „Auf Sendung"-Abzeichen ab (`<span>` direkt hinter dem `<video>`).
    /// Genau dort steht die Kopfzeile der App mit demselben Zustand und dem
    /// Schließen-Knopf — beides übereinander ist unleserlich. Die App gewinnt,
    /// weil sie den Knopf trägt; das Abzeichen der Seite wird ausgeblendet.
    ///
    /// Der Selektor hängt an der Struktur, nicht an Tailwind-Klassen: die
    /// Fehlermeldung der Bühne ist ein `<div>` und bleibt sichtbar.
    private var hideStageBadgeScript: String {
        """
        (function () {
          var style = document.createElement('style');
          style.textContent = 'video + span { display: none !important; }';
          document.documentElement.appendChild(style);
        })();
        """
    }

    /// Kameraauswahl für die Bühne.
    ///
    /// Die Bühne fragt nur nach `facingMode` (vorne/hinten) und kennt damit
    /// keine angeschlossenen Kameras. Statt die Seite zu ändern, legt die App
    /// sich um `getUserMedia`: ist in der App ein Gerät gewählt, ersetzt der
    /// Mantel `facingMode` durch dessen `deviceId`. Umgeschaltet wird über den
    /// eigenen Knopf der Bühne — der tauscht die Spur im laufenden Stream aus,
    /// die Sendung reißt also nicht ab.
    ///
    /// Nebenbei wird die Spiegelung geradegezogen: die Seite spiegelt nach
    /// ihrem eigenen Schalter, richtig ist die Frontkamera. Gespiegelt wird
    /// ohnehin nur die Vorschau, nie das gesendete Bild.
    private var cameraChoiceScript: String {
        """
        (function () {
          var md = navigator.mediaDevices;
          if (!md || !md.getUserMedia) { return; }

          var style = document.createElement('style');
          style.textContent = 'html.aera-no-mirror video { transform: none !important; }';
          document.documentElement.appendChild(style);

          var chosen = null;
          var original = md.getUserMedia.bind(md);

          function post(payload) {
            try { window.webkit.messageHandlers.aeraStudio.postMessage(payload); } catch (e) {}
          }

          function report(active) {
            md.enumerateDevices().then(function (devices) {
              var index = 0;
              var cameras = devices.filter(function (d) { return d.kind === 'videoinput'; })
                .map(function (d) {
                  index += 1;
                  return { id: d.deviceId, label: d.label || ('Kamera ' + index) };
                })
                .filter(function (c) { return c.id; });
              post({ type: 'cameras', cameras: cameras, active: active || null });
            }).catch(function () {});
          }

          md.getUserMedia = function (constraints) {
            var request = constraints;
            if (chosen && request && request.video && typeof request.video === 'object') {
              var video = {};
              for (var key in request.video) {
                if (key !== 'facingMode') { video[key] = request.video[key]; }
              }
              video.deviceId = { exact: chosen };
              request = {};
              for (var outer in constraints) { request[outer] = constraints[outer]; }
              request.video = video;
            }
            return original(request).then(function (stream) {
              try {
                var track = stream.getVideoTracks()[0];
                var settings = track && track.getSettings ? track.getSettings() : {};
                document.documentElement.classList.toggle('aera-no-mirror',
                                                          settings.facingMode !== 'user');
                report(settings.deviceId || null);
              } catch (e) {}
              return stream;
            });
          };

          // Der Knopf „Kamera wechseln" der Bühne steht als letzter in der
          // Knopfreihe; ihn zu drücken ist der getestete Weg, die Aufnahme neu
          // zu holen — samt Spurtausch im laufenden Stream.
          window.__aeraSelectCamera = function (deviceId) {
            chosen = deviceId;
            var buttons = document.querySelectorAll('button');
            if (buttons.length) { buttons[buttons.length - 1].click(); }
          };

          md.addEventListener && md.addEventListener('devicechange', function () { report(null); });
        })();
        """
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
            let cameras = (body["cameras"] as? [[String: Any]] ?? []).compactMap { entry -> StudioCamera? in
                guard let id = entry["id"] as? String, !id.isEmpty else { return nil }
                return StudioCamera(id: id, label: entry["label"] as? String ?? id)
            }
            onEvent(StudioEvent(type: type,
                                phase: body["phase"] as? String,
                                cameras: cameras,
                                activeCameraId: body["active"] as? String))
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

// MARK: - Zuschauer-Chat auf dem Bild

/// Der Chat der Zuschauer, direkt auf der Sendung — wie der Creator ihn aus
/// den grossen Live-Apps kennt: neue Nachrichten laufen unten links herein,
/// ältere wandern nach oben aus dem Bild.
///
/// Bewusst schmal und links: die rechte Bildhälfte gehört dem Motiv, und die
/// Knopfreihe der Bühne bleibt frei. Über der Liste liegt ein Verlauf, damit
/// die Schrift auch auf hellem Bild lesbar bleibt.
private struct StudioChatOverlay: View {
    let slug: String
    let sessionId: String

    @Environment(AppState.self) private var appState

    @State private var messages: [ChatMessage] = []
    @State private var knownIds: Set<String> = []
    @State private var draft = ""
    @State private var isSending = false
    @State private var sendSuccessCount = 0
    @FocusState private var replyFocused: Bool

    /// Mehr als das passt nicht ins Bild, ohne die Sendung zuzudecken.
    private static let visibleCount = 6

    private var recent: [ChatMessage] {
        Array(messages.suffix(Self.visibleCount))
    }

    private var trimmedDraft: String {
        draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            messageList
            replyBar
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sensoryFeedback(.success, trigger: sendSuccessCount)
        .task {
            while !Task.isCancelled {
                await poll()
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }

    // MARK: - Nachrichten

    @ViewBuilder
    private var messageList: some View {
        if !recent.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(recent) { message in
                    row(message)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .frame(maxWidth: 290, alignment: .leading)
            .animation(.snappy(duration: 0.3), value: recent.map(\.id))
            // Nach oben ausblenden: die älteste Zeile verliert sich im Bild,
            // statt hart abzuschneiden.
            .mask(
                LinearGradient(colors: [.clear, .black, .black],
                               startPoint: .top,
                               endPoint: .center)
            )
        }
    }

    private func row(_ message: ChatMessage) -> some View {
        HStack(alignment: .top, spacing: 8) {
            AvatarView(url: message.author.avatarUrl,
                       name: message.author.name,
                       size: 26)

            VStack(alignment: .leading, spacing: 1) {
                Text(message.author.name)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)
                Text(message.body)
                    .font(.system(size: 14))
                    .foregroundStyle(.white)
                    .lineLimit(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(.black.opacity(0.35), in: .rect(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.35), radius: 6, y: 2)
    }

    // MARK: - Antworten

    private var replyBar: some View {
        HStack(spacing: 8) {
            TextField("Antworten…", text: $draft, axis: .vertical)
                .lineLimit(1...3)
                .font(.system(size: 14))
                .foregroundStyle(.white)
                .tint(.white)
                .focused($replyFocused)
                .submitLabel(.send)
                .onSubmit(send)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .glassEffect(.regular, in: .capsule)

            if !trimmedDraft.isEmpty || isSending {
                Button(action: send) {
                    Group {
                        if isSending {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                    }
                    .frame(width: 38, height: 38)
                    .background(Theme.danger, in: .circle)
                }
                .buttonStyle(.plain)
                .disabled(isSending)
                .accessibilityLabel(Text("Senden"))
                .transition(.scale.combined(with: .opacity))
            }
        }
        .frame(maxWidth: 320, alignment: .leading)
        .animation(.snappy(duration: 0.2), value: trimmedDraft.isEmpty)
    }

    // MARK: - Laden & Senden

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
        let text = trimmedDraft
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
