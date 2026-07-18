import SwiftUI

/// STORIES-Space: horizontale Autor-Reihe (Avatar 64 mit Brand-Gradient-Ring),
/// Tap öffnet den Vollbild-Story-Player als `fullScreenCover`.
struct StoriesSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: StoriesContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(\.brand) private var brand

    @State private var selectedGroup: StoryGroup?

    init(slug: String,
         space: SpaceDetail,
         content: StoriesContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
    }

    var body: some View {
        VStack(spacing: 12) {
            if content.groups.isEmpty {
                EmptyStateView(
                    icon: space.type.symbolName,
                    title: "Keine Stories",
                    message: "Aktuell gibt es keine aktiven Stories. Schau später wieder vorbei."
                )
                .padding(.horizontal, 16)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 16) {
                        ForEach(content.groups) { group in
                            Button {
                                selectedGroup = group
                            } label: {
                                StoryAuthorCell(group: group)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 4)
                }
            }
        }
        .fullScreenCover(item: $selectedGroup) { group in
            StoryPlayerView(group: group) {
                selectedGroup = nil
            }
            .brandTheme(brand)
        }
    }
}

// MARK: - StoryAuthorCell

/// Avatar 64 (eckig-gerundet) in einem runden Brand-Gradient-Ring (3 pt),
/// darunter der Autorenname.
private struct StoryAuthorCell: View {
    let group: StoryGroup

    @Environment(\.brand) private var brand

    var body: some View {
        VStack(spacing: 6) {
            AvatarView(url: group.author.avatarUrl, name: group.author.name, size: 64)
                .padding(6)
                .overlay {
                    Circle()
                        .strokeBorder(
                            LinearGradient(colors: [brand.color, brand.accent],
                                           startPoint: .topLeading,
                                           endPoint: .bottomTrailing),
                            lineWidth: 3
                        )
                }

            Text(group.author.name)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.ink.opacity(0.7))
                .lineLimit(1)
                .frame(width: 76)
        }
    }
}

// MARK: - StoryPlayerView

/// Vollbild-Story-Player: schwarzer Hintergrund, Page-TabView über die Stories,
/// Segment-Fortschrittsbalken oben (5 s pro Story), Tap-Zonen links/rechts,
/// Autor-Zeile in Glass-Kapsel, Swipe-down zum Schließen.
struct StoryPlayerView: View {
    let group: StoryGroup
    /// Setzt das Präsentations-Binding im Parent zurück — `dismiss()` allein
    /// läuft ins Leere, wenn der präsentierende Space-Bereich lazy neu
    /// aufgebaut wurde (gleiches Muster wie im Gallery-Viewer).
    let onClose: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var currentIndex = 0
    @State private var progress: Double = 0
    @State private var dragOffset: CGFloat = 0

    private static let storyDuration: Double = 5

    init(group: StoryGroup, onClose: @escaping () -> Void = {}) {
        self.group = group
        self.onClose = onClose
    }

    private func close() {
        onClose()
        dismiss()
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            TabView(selection: $currentIndex) {
                ForEach(Array(group.stories.enumerated()), id: \.element.id) { index, story in
                    storyPage(for: story)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()

            // Tap-Zonen: links zurück, rechts weiter.
            HStack(spacing: 0) {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { goBack() }
                    .frame(maxWidth: .infinity)
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { advance() }
                    .frame(maxWidth: .infinity)
            }
            .padding(.top, 110)
            .padding(.bottom, 60)

            VStack(spacing: 12) {
                progressSegments
                authorRow
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .offset(y: max(dragOffset, 0))
        .gesture(
            DragGesture()
                .onChanged { value in
                    if value.translation.height > 0 {
                        dragOffset = value.translation.height
                    }
                }
                .onEnded { value in
                    if value.translation.height > 120 {
                        close()
                    } else {
                        withAnimation(.snappy(duration: 0.25)) {
                            dragOffset = 0
                        }
                    }
                }
        )
        .interactiveDismissDisabled(false)
        .environment(\.colorScheme, .dark) // nicht .preferredColorScheme: blockiert Dismiss in fullScreenCover
        .task(id: currentIndex) {
            await runStoryTimer()
        }
    }

    // MARK: - Seiten

    @ViewBuilder
    private func storyPage(for story: Story) -> some View {
        if story.mediaType == .video, let url = AppConfig.mediaURL(story.mediaUrl) {
            RemoteVideoPlayer(url: url)
        } else {
            AsyncImageView(url: story.mediaUrl, contentMode: .fit)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // MARK: - Overlays

    private var progressSegments: some View {
        HStack(spacing: 4) {
            ForEach(Array(group.stories.enumerated()), id: \.element.id) { index, _ in
                Capsule()
                    .fill(.white.opacity(0.35))
                    .frame(height: 3)
                    .overlay(alignment: .leading) {
                        Capsule()
                            .fill(.white)
                            .scaleEffect(x: fillAmount(for: index), y: 1, anchor: .leading)
                    }
                    .clipShape(Capsule())
            }
        }
    }

    private func fillAmount(for index: Int) -> CGFloat {
        if index < currentIndex { return 1 }
        if index > currentIndex { return 0 }
        return CGFloat(progress)
    }

    private var authorRow: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                AvatarView(url: group.author.avatarUrl, name: group.author.name, size: 28)
                Text(group.author.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if let story = currentStory {
                    Text(story.createdAt.relativeLabel)
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .glassEffect(.regular, in: .capsule)

            Spacer()

            Button {
                close()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .glassEffect(.regular.interactive(), in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Schließen"))
        }
    }

    private var currentStory: Story? {
        guard group.stories.indices.contains(currentIndex) else { return nil }
        return group.stories[currentIndex]
    }

    // MARK: - Timer & Navigation

    private func runStoryTimer() async {
        progress = 0
        let tick = 0.05
        var elapsed: Double = 0
        while elapsed < Self.storyDuration {
            try? await Task.sleep(for: .seconds(tick))
            guard !Task.isCancelled else { return }
            elapsed += tick
            progress = min(elapsed / Self.storyDuration, 1)
        }
        advance()
    }

    private func advance() {
        if currentIndex < group.stories.count - 1 {
            withAnimation(.snappy(duration: 0.25)) {
                currentIndex += 1
            }
        } else {
            close()
        }
    }

    private func goBack() {
        if currentIndex > 0 {
            withAnimation(.snappy(duration: 0.25)) {
                currentIndex -= 1
            }
        } else {
            progress = 0
        }
    }
}
