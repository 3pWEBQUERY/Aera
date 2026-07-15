import SwiftUI
import AVKit
import Observation

// MARK: - RemoteVideoPlayer

/// AVKit-VideoPlayer für Remote-URLs (Videos-Space, Kurs-Lektionen, Replays).
/// Der Aufrufer bestimmt die Größe (z. B. `.aspectRatio(16/9, contentMode: .fit)`).
struct RemoteVideoPlayer: View {
    let url: URL

    @State private var player: AVPlayer?

    init(url: URL) {
        self.url = url
    }

    var body: some View {
        VideoPlayer(player: player)
            .task(id: url) {
                if player == nil {
                    player = AVPlayer(url: url)
                } else if (player?.currentItem?.asset as? AVURLAsset)?.url != url {
                    player?.replaceCurrentItem(with: AVPlayerItem(url: url))
                }
            }
            .onDisappear {
                player?.pause()
            }
    }
}

// MARK: - AudioPlayerBar

/// Steuerlogik für den Podcast-Player (AVPlayer + periodischer Time-Observer).
@MainActor
@Observable
final class AudioPlayerModel {
    private(set) var isPlaying = false
    private(set) var duration: Double = 0
    var currentTime: Double = 0
    var isScrubbing = false

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var loadedURL: URL?

    func load(url: URL) {
        guard url != loadedURL else { return }
        teardown()
        loadedURL = url

        let item = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: item)
        self.player = player

        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            MainActor.assumeIsolated {
                self?.tick(seconds: time.seconds)
            }
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: item,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.playbackEnded()
            }
        }

        Task { [weak self] in
            guard let loaded = try? await item.asset.load(.duration), loaded.isNumeric else { return }
            self?.duration = loaded.seconds
        }
    }

    func togglePlayback() {
        guard let player else { return }
        if isPlaying {
            player.pause()
        } else {
            player.play()
        }
        isPlaying.toggle()
    }

    func seek(to seconds: Double) {
        currentTime = seconds
        player?.seek(
            to: CMTime(seconds: seconds, preferredTimescale: 600),
            toleranceBefore: .zero,
            toleranceAfter: .zero
        )
    }

    func teardown() {
        if let timeObserver, let player {
            player.removeTimeObserver(timeObserver)
        }
        timeObserver = nil
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
        }
        endObserver = nil
        player?.pause()
        player = nil
        loadedURL = nil
        isPlaying = false
        currentTime = 0
        duration = 0
    }

    private func tick(seconds: Double) {
        guard !isScrubbing, seconds.isFinite else { return }
        currentTime = seconds
    }

    private func playbackEnded() {
        isPlaying = false
        currentTime = 0
        player?.seek(to: .zero)
    }
}

/// Podcast-Player-Leiste: Play/Pause, Slider mit Zeitanzeige.
struct AudioPlayerBar: View {
    let url: URL
    var title: String?

    @Environment(\.brand) private var brand
    @State private var model = AudioPlayerModel()

    init(url: URL, title: String? = nil) {
        self.url = url
        self.title = title
    }

    var body: some View {
        HStack(spacing: 12) {
            Button {
                model.togglePlayback()
            } label: {
                Image(systemName: model.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(brand.color, in: .circle)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 4) {
                if let title {
                    Text(title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                }
                Slider(
                    value: $model.currentTime,
                    in: 0...max(model.duration, 1)
                ) { editing in
                    model.isScrubbing = editing
                    if !editing {
                        model.seek(to: model.currentTime)
                    }
                }
                HStack {
                    Text(Format.duration(model.currentTime))
                    Spacer()
                    Text(Format.duration(model.duration))
                }
                .font(.system(size: 11))
                .monospacedDigit()
                .foregroundStyle(Theme.ink.opacity(0.5))
            }
        }
        .padding(12)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Theme.border, lineWidth: 1)
        )
        .task(id: url) {
            model.load(url: url)
        }
        .onDisappear {
            model.teardown()
        }
    }
}
