import SwiftUI

/// Live-Raum: das Bild füllt den Schirm, der Chat liegt darauf.
///
/// So sehen Live-Apps aus, und so sieht seit dem Umbau auch die mobile
/// Web-Ansicht aus: hochkant liegt der Chat unten auf dem Stream, quer als
/// schmale Spalte rechts. Das Telefon darf sich für diese eine Ansicht drehen
/// (`allowsLandscape()`), denn genau dafür dreht man es.
///
/// Eigene Streams laufen als HLS direkt in AVPlayer; fremde Plattformen
/// kommen als Einbettung ins WebView. Welches von beidem, entscheidet der
/// Server (`hlsUrl` / `embedUrl`).
struct LiveRoomView: View {
    let slug: String
    let sessionId: String

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand
    @Environment(\.dismiss) private var dismiss

    @State private var session: LiveSession?
    @State private var messages: [ChatMessage] = []
    @State private var knownIds: Set<String> = []
    @State private var isLoaded = false
    @State private var loadFailed = false
    @State private var draft = ""
    @State private var isSending = false
    @State private var sendError: String?
    @State private var sendSuccessCount = 0
    @State private var chatVisible = true
    /// Bild füllen (anschneiden) statt einpassen — im Hochformat oft schöner.
    @State private var fillsScreen = false
    @State private var stream = LiveStreamModel()

    init(slug: String, sessionId: String) {
        self.slug = slug
        self.sessionId = sessionId
    }

    /// Quer ist, was breiter als hoch ist. Die Groessenklasse taugt dafuer
    /// nicht: auf dem iPad ist sie auch im Querformat „regular".
    private func isLandscape(_ size: CGSize) -> Bool { size.width > size.height }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if isLoaded, let session {
                GeometryReader { proxy in
                    stage(for: session, size: proxy.size)
                }
                .ignoresSafeArea(edges: .bottom)
            } else if loadFailed {
                loadErrorView
            } else {
                ProgressView()
                    .tint(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .environment(\.colorScheme, .dark)
        .allowsLandscape()
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
        .task(id: hlsURL) {
            guard let hlsURL else { return }
            stream.load(url: hlsURL)
        }
        .onDisappear {
            stream.teardown()
        }
    }

    // MARK: - Bühne

    private func stage(for session: LiveSession, size: CGSize) -> some View {
        ZStack(alignment: .top) {
            playerLayer(for: session)
                .frame(width: size.width, height: size.height)
                .clipped()

            // Verlauf, damit die Kopfzeile auf jedem Bild lesbar bleibt.
            LinearGradient(
                colors: [.black.opacity(0.65), .clear],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 140)
            .allowsHitTesting(false)

            chatLayer(for: session, size: size)

            VStack(spacing: 0) {
                topBar(for: session, landscape: isLandscape(size))
                Spacer(minLength: 0)
            }
        }
    }

    @ViewBuilder
    private func playerLayer(for session: LiveSession) -> some View {
        if hlsURL != nil {
            ZStack {
                HLSPlayerView(
                    player: stream.player,
                    gravity: fillsScreen ? .resizeAspectFill : .resizeAspect
                )
                if stream.failed {
                    streamNotice(
                        icon: "exclamationmark.triangle",
                        title: String(localized: "Der Stream lässt sich gerade nicht abspielen.")
                    )
                }
            }
            .onTapGesture {
                withAnimation(.snappy(duration: 0.25)) { chatVisible.toggle() }
            }
        } else if let embedURL {
            WebEmbedView(url: embedURL)
        } else {
            placeholder(for: session)
        }
    }

    /// Kein Bild: geplant mit Countdown, beendet ohne Aufzeichnung, oder
    /// gesperrt.
    private func placeholder(for session: LiveSession) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "dot.radiowaves.left.and.right")
                .font(.system(size: 24, weight: .medium))
                .foregroundStyle(.white.opacity(0.9))
                .frame(width: 64, height: 64)
                .glassEffect(.regular, in: .circle)

            Text(placeholderTitle(for: session))
                .font(.displaySerif(20))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)

            if session.status == .scheduled, let scheduledAt = session.scheduledAt {
                LiveCountdownText(target: scheduledAt, font: .system(size: 15, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.8))
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func placeholderTitle(for session: LiveSession) -> String {
        switch session.status {
        case .scheduled: String(localized: "Der Stream hat noch nicht begonnen.")
        case .live: String(localized: "Kein Stream verfügbar.")
        case .ended: String(localized: "Keine Aufzeichnung verfügbar.")
        }
    }

    private func streamNotice(icon: String, title: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(.white)
            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.black.opacity(0.5))
    }

    // MARK: - Kopfzeile

    private func topBar(for session: LiveSession, landscape: Bool) -> some View {
        HStack(spacing: 10) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .glassEffect(.regular.interactive(), in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Zurück"))

            VStack(alignment: .leading, spacing: 2) {
                Text(session.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .shadow(color: .black.opacity(0.5), radius: 3, y: 1)

                HStack(spacing: 6) {
                    if session.status == .live {
                        HStack(spacing: 5) {
                            LivePulseDot(size: 6)
                            Text("Live")
                                .font(.system(size: 11, weight: .bold))
                                .kerning(0.8)
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Theme.danger, in: .capsule)
                    }

                    if let platform = LivePlatformStyle.label(session.platform) {
                        LivePlatformTag(name: platform, color: LivePlatformStyle.color(session.platform))
                    } else if session.source == .aera {
                        LivePlatformTag(name: String(localized: "Eigener Stream"), color: brand.color)
                    }
                }
            }

            Spacer(minLength: 4)

            if hlsURL != nil {
                circleButton(
                    icon: stream.isPlaying ? "pause.fill" : "play.fill",
                    label: stream.isPlaying ? String(localized: "Pause") : String(localized: "Abspielen")
                ) {
                    stream.togglePlayback()
                }

                circleButton(
                    icon: stream.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                    label: stream.isMuted ? String(localized: "Ton einschalten") : String(localized: "Ton ausschalten")
                ) {
                    stream.toggleMute()
                }

                circleButton(
                    icon: fillsScreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right",
                    label: fillsScreen ? String(localized: "Bild einpassen") : String(localized: "Bild füllen")
                ) {
                    withAnimation(.snappy(duration: 0.25)) { fillsScreen.toggle() }
                }
            }

            circleButton(
                icon: chatVisible ? "bubble.left.and.bubble.right.fill" : "bubble.left.and.bubble.right",
                label: chatVisible ? String(localized: "Chat ausblenden") : String(localized: "Chat einblenden")
            ) {
                withAnimation(.snappy(duration: 0.25)) { chatVisible.toggle() }
            }
        }
        .padding(.horizontal, 12)
        // Quer ist oben wenig Platz — die Leiste rueckt dichter an den Rand.
        .padding(.top, landscape ? 2 : 6)
    }

    private func circleButton(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .glassEffect(.regular.interactive(), in: .circle)
                .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }

    // MARK: - Chat auf dem Bild

    @ViewBuilder
    private func chatLayer(for session: LiveSession, size: CGSize) -> some View {
        if chatVisible {
            if isLandscape(size) {
                HStack(spacing: 0) {
                    Spacer(minLength: 0)
                    chatColumn(for: session, landscape: true)
                        .frame(width: min(340, size.width * 0.42))
                        .background {
                            LinearGradient(
                                colors: [.clear, .black.opacity(0.75)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        }
                }
                .transition(.move(edge: .trailing).combined(with: .opacity))
            } else {
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    chatColumn(for: session, landscape: false)
                        .frame(height: min(size.height * 0.46, 380))
                        .background {
                            LinearGradient(
                                colors: [.clear, .black.opacity(0.8)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    private func chatColumn(for session: LiveSession, landscape: Bool) -> some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        if messages.isEmpty {
                            Text("Noch keine Nachrichten. Schreib etwas!")
                                .font(.system(size: 13))
                                .foregroundStyle(.white.opacity(0.6))
                                .padding(.vertical, 12)
                        } else {
                            ForEach(messages) { message in
                                LiveChatRow(message: message)
                                    .id(message.id)
                            }
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .defaultScrollAnchor(.bottom)
                .scrollDismissesKeyboard(.interactively)
                .scrollIndicators(.hidden)
                // Nach oben ausblenden: der Chat soll dem Bild nichts nehmen.
                .mask(
                    LinearGradient(
                        colors: [.clear, .black, .black],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .onChange(of: messages.count) {
                    if let lastId = messages.last?.id {
                        withAnimation(.snappy(duration: 0.25)) {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
            }

            if session.canChat {
                LiveChatInputBar(text: $draft, isSending: isSending, onSend: send)
            } else {
                Text("Mitglieder können hier mitschreiben.")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.65))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
            }
        }
        .padding(.bottom, landscape ? 8 : 0)
    }

    // MARK: - Fehler

    private var loadErrorView: some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(.white.opacity(0.8))
            Text("Laden fehlgeschlagen")
                .font(.displaySerif(20))
                .foregroundStyle(.white)
            Text("Die Live-Session konnte nicht geladen werden.")
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.65))
                .multilineTextAlignment(.center)
            HStack(spacing: 10) {
                Button("Zurück") { dismiss() }
                    .buttonStyle(.secondary)
                Button("Erneut versuchen") {
                    loadFailed = false
                    Task { await load() }
                }
                .buttonStyle(.brand)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Adressen

    private var hlsURL: URL? {
        guard let session, session.accessible else { return nil }
        if let hls = session.hlsUrl, let url = URL(string: hls) { return url }
        // Ältere Sessions liefern die Aufzeichnung weiterhin als Rohadresse.
        if session.status == .ended, let replay = session.replayUrl, replay.hasSuffix(".m3u8") {
            return URL(string: replay)
        }
        return nil
    }

    private var embedURL: URL? {
        guard let session, session.accessible else { return nil }
        guard let embed = session.embedUrl else { return nil }
        return URL(string: embed)
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

// MARK: - Hilfstypen

/// Nachricht im Live-Chat: liegt auf dem Bild, darum heller Text mit Schatten
/// statt Sprechblase.
private struct LiveChatRow: View {
    let message: ChatMessage

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            AvatarView(url: message.author.avatarUrl, name: message.author.name, size: 26)

            VStack(alignment: .leading, spacing: 1) {
                Text(message.author.name)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)

                Text(message.body)
                    .font(.system(size: 14))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.5), radius: 3, y: 1)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
    }
}

/// Eingabeleiste auf dunklem Grund — das Gegenstück zu `ChatInputBar`.
private struct LiveChatInputBar: View {
    @Binding var text: String
    let isSending: Bool
    let onSend: () -> Void

    @Environment(\.brand) private var brand

    private var trimmed: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        HStack(spacing: 10) {
            TextField("Nachricht schreiben", text: $text, axis: .vertical)
                .lineLimit(1...3)
                .font(.system(size: 15))
                .foregroundStyle(.white)
                .tint(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .glassEffect(.regular, in: .rect(cornerRadius: 20))
                .onSubmit(onSend)

            Button(action: onSend) {
                Group {
                    if isSending {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: 38, height: 38)
                .background(brand.color, in: .circle)
                .opacity(trimmed.isEmpty ? 0.45 : 1)
            }
            .buttonStyle(.plain)
            .disabled(trimmed.isEmpty || isSending)
            .accessibilityLabel(Text("Senden"))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}

/// Kleine Marke der Plattform — Farbpunkt plus Name, keine nachgezeichneten
/// Logos.
struct LivePlatformTag: View {
    let name: String
    let color: Color

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text(name)
                .font(.system(size: 11, weight: .medium))
        }
        .foregroundStyle(.white.opacity(0.9))
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(.white.opacity(0.16), in: .capsule)
    }
}
