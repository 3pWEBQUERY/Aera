import SwiftUI
import AVKit
import WebKit

// MARK: - HLS-Player

/// Wiedergabe eines HLS-Streams ohne AVKit-Bedienung.
///
/// Im Live-Raum liegt die Steuerung auf dem Bild — Chat, Ton, Vollbild. Die
/// Systemsteuerung würde sich mit ihr überlagern, darum bekommt der Player
/// nur eine Ebene und keine eigenen Knöpfe.
@MainActor
@Observable
final class LiveStreamModel {
    private(set) var isMuted = false
    private(set) var isPlaying = false
    /// Der Stream ließ sich nicht abspielen (noch nicht auf Sendung, Rechte
    /// abgelaufen, Netz weg).
    private(set) var failed = false

    let player = AVPlayer()

    private var failObserver: NSObjectProtocol?
    private var loadedURL: URL?

    func load(url: URL) {
        guard url != loadedURL else { return }
        loadedURL = url
        failed = false

        if let failObserver {
            NotificationCenter.default.removeObserver(failObserver)
        }
        let item = AVPlayerItem(url: url)
        failObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.failedToPlayToEndTimeNotification,
            object: item,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.failed = true
                self?.isPlaying = false
            }
        }

        // Ton auch bei stummgeschaltetem Klingelschalter — eine Live-Sendung
        // ohne Ton ist keine.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)

        player.replaceCurrentItem(with: item)
        player.isMuted = isMuted
        player.play()
        isPlaying = true
    }

    func togglePlayback() {
        if isPlaying {
            player.pause()
        } else {
            player.play()
        }
        isPlaying.toggle()
    }

    func toggleMute() {
        isMuted.toggle()
        player.isMuted = isMuted
    }

    /// Springt ans Live-Ende — nach einer Pause hinkt der Puffer sonst hinterher.
    func jumpToLive() {
        guard let item = player.currentItem else { return }
        let end = item.seekableTimeRanges.last?.timeRangeValue
        guard let end else { return }
        player.seek(to: CMTimeRangeGetEnd(end))
    }

    func teardown() {
        if let failObserver {
            NotificationCenter.default.removeObserver(failObserver)
        }
        failObserver = nil
        player.pause()
        player.replaceCurrentItem(with: nil)
        loadedURL = nil
        isPlaying = false
        failed = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

/// UIView, deren Ebene direkt die Player-Ebene ist — kein Zwischen-Layer,
/// keine Layout-Nacharbeit beim Drehen.
final class PlayerLayerView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }

    var playerLayer: AVPlayerLayer {
        // Durch `layerClass` garantiert.
        layer as! AVPlayerLayer
    }
}

struct HLSPlayerView: UIViewRepresentable {
    let player: AVPlayer
    /// `.resizeAspect` zeigt das ganze Bild, `.resizeAspectFill` füllt die
    /// Fläche und schneidet an — im Hochformat sieht das nach Live-App aus.
    var gravity: AVLayerVideoGravity = .resizeAspect

    func makeUIView(context: Context) -> PlayerLayerView {
        let view = PlayerLayerView()
        view.backgroundColor = .black
        view.playerLayer.player = player
        view.playerLayer.videoGravity = gravity
        return view
    }

    func updateUIView(_ uiView: PlayerLayerView, context: Context) {
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
        }
        if uiView.playerLayer.videoGravity != gravity {
            uiView.playerLayer.videoGravity = gravity
        }
    }
}

// MARK: - Einbettung fremder Plattformen

/// Player einer fremden Plattform (Twitch, YouTube, Kick, Vimeo …).
///
/// Die fertige Adresse kommt vom Server — Twitch prüft den Host der
/// einbettenden Seite, den nur der Server kennt. `loadHTMLString(baseURL:)`
/// gibt der Seite genau diesen Host, darum liegt der Player in einer eigenen
/// kleinen Seite statt direkt in `load(URLRequest)`.
struct WebEmbedView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.backgroundColor = .black
        webView.allowsBackForwardNavigationGestures = false
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.loaded != url else { return }
        context.coordinator.loaded = url
        webView.loadHTMLString(Self.page(for: url), baseURL: Self.embedBase)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var loaded: URL?
    }

    /// Host, für den der Server die Einbettungsadresse gebaut hat.
    private static var embedBase: URL? {
        guard let host = AppConfig.baseURL.host() else { return AppConfig.defaultBaseURL }
        return URL(string: "https://\(host)")
    }

    private static func page(for url: URL) -> String {
        let escaped = url.absoluteString
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "\"", with: "&quot;")
        return """
        <!doctype html><html><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
        <style>html,body{margin:0;height:100%;background:#000;overflow:hidden}
        iframe{border:0;width:100%;height:100%;display:block}</style></head>
        <body><iframe src="\(escaped)" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></body></html>
        """
    }
}

// MARK: - Countdown

/// Tickender Countdown bis zum Sendestart — wie auf den Live-Karten im Web.
struct LiveCountdownText: View {
    let target: Date
    var font: Font = .system(size: 13, weight: .semibold)

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            Text(label(now: context.date))
                .font(font)
                .monospacedDigit()
        }
    }

    private func label(now: Date) -> String {
        let remaining = Int(target.timeIntervalSince(now).rounded())
        guard remaining > 0 else { return String(localized: "Beginnt jeden Moment …") }

        let days = remaining / 86_400
        let hours = (remaining % 86_400) / 3600
        let minutes = (remaining % 3600) / 60
        let seconds = remaining % 60
        let clock = String(format: "%02d:%02d:%02d", hours, minutes, seconds)
        let time = days > 0 ? String(localized: "\(days) T \(clock)") : clock
        return String(localized: "Startet in \(time)")
    }
}

// MARK: - Plattform-Optik

/// Markenname und -farbe der Plattform. Bewusst ohne nachgezeichnete Logos:
/// ein falsches Logo ist schlechter als gar keines.
enum LivePlatformStyle {
    static func label(_ key: String?) -> String? {
        switch key {
        case "twitch": "Twitch"
        case "youtube": "YouTube"
        case "tiktok": "TikTok"
        case "kick": "Kick"
        case "instagram": "Instagram"
        case "chaturbate": "Chaturbate"
        case "vimeo": "Vimeo"
        default: nil
        }
    }

    static func color(_ key: String?) -> Color {
        switch key {
        case "twitch": Color(hex: "#9146FF")
        case "youtube": Color(hex: "#FF0000")
        case "tiktok": Color(hex: "#111111")
        case "kick": Color(hex: "#53FC18")
        case "instagram": Color(hex: "#E4405F")
        case "chaturbate": Color(hex: "#F47321")
        case "vimeo": Color(hex: "#1AB7EA")
        default: Color(hex: "#94A3B8")
        }
    }
}

// MARK: - Live-Punkt

/// Pulsierender Punkt für „auf Sendung".
struct LivePulseDot: View {
    var size: CGFloat = 7
    var color: Color = .white

    @State private var pulsing = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .opacity(pulsing ? 0.35 : 1)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                    pulsing = true
                }
            }
    }
}
