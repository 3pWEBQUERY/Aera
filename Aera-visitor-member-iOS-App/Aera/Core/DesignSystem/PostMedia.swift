import SwiftUI

// MARK: - Bilder eines Beitrags

/// Bildfläche eines Beitrags.
///
/// Ein Bild steht im 16:9-Rahmen, mehrere in einem Raster, dessen Form sich
/// nach der Anzahl richtet — wie im Web (`components/community/post-images.tsx`).
/// Ab fünf Bildern trägt das letzte Feld die Zahl der übrigen; alle öffnen
/// dieselbe Vollbildansicht.
struct PostImageGrid: View {
    let urls: [String]
    var cornerRadius: CGFloat = 12

    @State private var openIndex: ImageLightbox.Context?

    var body: some View {
        Group {
            switch urls.count {
            case 0:
                EmptyView()
            case 1:
                tile(0)
                    .aspectRatio(16 / 9, contentMode: .fit)
            case 2:
                HStack(spacing: 4) {
                    tile(0)
                    tile(1)
                }
                .aspectRatio(16 / 9, contentMode: .fit)
            case 3:
                HStack(spacing: 4) {
                    tile(0)
                    VStack(spacing: 4) {
                        tile(1)
                        tile(2)
                    }
                }
                .aspectRatio(16 / 9, contentMode: .fit)
            default:
                VStack(spacing: 4) {
                    HStack(spacing: 4) {
                        tile(0)
                        tile(1)
                    }
                    HStack(spacing: 4) {
                        tile(2)
                        tile(3, overflow: urls.count - 4)
                    }
                }
                .aspectRatio(1, contentMode: .fit)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .fullScreenCover(item: $openIndex) { context in
            ImageLightbox(urls: urls, startIndex: context.index) {
                openIndex = nil
            }
        }
    }

    private func tile(_ index: Int, overflow: Int = 0) -> some View {
        Color.clear
            .overlay {
                AsyncImageView(url: urls[index])
            }
            .overlay {
                if overflow > 0 {
                    ZStack {
                        Color.black.opacity(0.45)
                        Text("+\(overflow)")
                            .font(.system(size: 22, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                    }
                }
            }
            .clipped()
            .contentShape(Rectangle())
            .onTapGesture {
                openIndex = ImageLightbox.Context(index: index)
            }
    }
}

// MARK: - Vollbild

/// Vollbildansicht mit Blättern und Zoom.
struct ImageLightbox: View {
    let urls: [String]
    let startIndex: Int
    /// Setzt das Präsentations-Binding im Parent zurück — `dismiss()` allein
    /// schließt einen `fullScreenCover` in dieser App nicht zuverlässig
    /// (dieselbe Stelle wie im Galerie- und im Story-Viewer).
    let onClose: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var index: Int
    @State private var dragOffset: CGFloat = 0

    struct Context: Identifiable, Hashable {
        let index: Int
        var id: Int { index }
    }

    init(urls: [String], startIndex: Int, onClose: @escaping () -> Void = {}) {
        self.urls = urls
        self.startIndex = startIndex
        self.onClose = onClose
        self._index = State(initialValue: startIndex)
    }

    private func close() {
        onClose()
        dismiss()
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()

            TabView(selection: $index) {
                ForEach(Array(urls.enumerated()), id: \.offset) { offset, url in
                    ZoomableImage(url: url)
                        .tag(offset)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()

            HStack {
                Button {
                    close()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .glassEffect(.regular, in: .circle)
                        .contentShape(.circle)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Schließen"))

                Spacer()

                if urls.count > 1 {
                    Text("\(index + 1)/\(urls.count)")
                        .font(.system(size: 13, weight: .medium))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .glassEffect(.regular)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .offset(y: max(dragOffset, 0))
        // Nach unten wischen schließt — in einer Bildansicht erwartet man das,
        // und es ist der zweite Weg hinaus, falls der Knopf mal danebengeht.
        .gesture(
            DragGesture(minimumDistance: 20)
                .onChanged { value in
                    if value.translation.height > 0 {
                        dragOffset = value.translation.height
                    }
                }
                .onEnded { value in
                    if value.translation.height > 120 {
                        close()
                    } else {
                        withAnimation(.snappy(duration: 0.25)) { dragOffset = 0 }
                    }
                }
        )
        // nicht .preferredColorScheme: der Modifier blockiert in
        // fullScreenCover das Schließen (bekannter SwiftUI-Fehler).
        .environment(\.colorScheme, .dark)
    }
}

/// Ein Bild, das sich zwei-Finger- oder Doppeltipp-zoomen lässt.
private struct ZoomableImage: View {
    let url: String

    @State private var zoom: CGFloat = 1
    @State private var committedZoom: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var committedOffset: CGSize = .zero

    var body: some View {
        AsyncImageView(url: url, contentMode: .fit)
            .scaleEffect(zoom)
            .offset(offset)
            .gesture(
                MagnifyGesture()
                    .onChanged { value in
                        zoom = max(1, min(4, committedZoom * value.magnification))
                    }
                    .onEnded { _ in
                        committedZoom = zoom
                        if zoom <= 1 {
                            reset()
                        }
                    }
            )
            // Nur im Zoom greift das Ziehen; sonst gehoert die Geste dem
            // Blaettern zwischen den Bildern.
            .highPriorityGesture(
                DragGesture()
                    .onChanged { value in
                        guard zoom > 1 else { return }
                        offset = CGSize(
                            width: committedOffset.width + value.translation.width,
                            height: committedOffset.height + value.translation.height
                        )
                    }
                    .onEnded { _ in
                        committedOffset = offset
                    },
                including: zoom > 1 ? .all : .subviews
            )
            .onTapGesture(count: 2) {
                withAnimation(.snappy(duration: 0.25)) {
                    if zoom > 1 {
                        reset()
                    } else {
                        zoom = 2.5
                        committedZoom = 2.5
                    }
                }
            }
    }

    private func reset() {
        zoom = 1
        committedZoom = 1
        offset = .zero
        committedOffset = .zero
    }
}

// MARK: - Titelplatte

/// Titelbild eines Blog-Beitrags mit gespeichertem Bildausschnitt.
///
/// Der Creator legt im Web Mitte und Zoom fest; beides kommt als Prozentwert
/// mit und wird hier auf dieselbe Weise angewendet.
struct PostCoverImage: View {
    let url: String
    var focusX: Double = 50
    var focusY: Double = 50
    var zoom: Double = 100

    var body: some View {
        GeometryReader { proxy in
            AsyncImageView(url: url)
                .scaleEffect(max(1, zoom / 100))
                .offset(
                    x: proxy.size.width * (0.5 - focusX / 100) * max(1, zoom / 100),
                    y: proxy.size.height * (0.5 - focusY / 100) * max(1, zoom / 100)
                )
        }
        .clipped()
    }
}

// MARK: - Preis-Plakette

/// Preis eines einzeln verkauften Beitrags — klein, auf der Karte, damit man
/// sieht, was es kostet, bevor man tippt.
struct PostPriceBadge: View {
    let priceCents: Int
    let currency: String

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "lock.fill")
                .font(.system(size: 10, weight: .semibold))
            Text(Format.price(cents: priceCents, currency: currency))
                .font(.system(size: 12, weight: .semibold))
                .monospacedDigit()
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Theme.ink.opacity(0.75), in: .capsule)
    }
}

// MARK: - Umfrage

/// Umfrage an einem Beitrag: vor der Stimme Auswahlfelder, danach Balken mit
/// Anteilen. Eine erneute Stimme ersetzt die alte.
struct PollBlock: View {
    let poll: Poll
    let canVote: Bool
    let onVote: ([Int]) -> Void

    @Environment(\.brand) private var brand
    @State private var selection: Set<Int> = []

    init(poll: Poll, canVote: Bool, onVote: @escaping ([Int]) -> Void) {
        self.poll = poll
        self.canVote = canVote
        self.onVote = onVote
        self._selection = State(initialValue: Set(poll.myVotes))
    }

    var body: some View {
        AeraCard(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                Text(poll.question)
                    .font(.displaySerif(18))
                    .foregroundStyle(Theme.ink)

                VStack(spacing: 8) {
                    ForEach(poll.options) { option in
                        optionRow(option)
                    }
                }

                HStack(spacing: 8) {
                    Text("\(poll.totalVotes) Stimmen")
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink.opacity(0.5))

                    if poll.multiple {
                        Text("· Mehrfachauswahl")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.ink.opacity(0.5))
                    }

                    Spacer()

                    if canVote {
                        Button(poll.hasVoted ? "Stimme ändern" : "Abstimmen") {
                            onVote(Array(selection).sorted())
                        }
                        .buttonStyle(.secondary)
                        .disabled(selection.isEmpty || selection == Set(poll.myVotes))
                    }
                }
            }
        }
        .onChange(of: poll) { _, newPoll in
            selection = Set(newPoll.myVotes)
        }
    }

    private func optionRow(_ option: PollOption) -> some View {
        let chosen = selection.contains(option.index)
        let share = poll.share(of: option)

        return Button {
            guard canVote else { return }
            withAnimation(.snappy(duration: 0.25)) {
                if poll.multiple {
                    if chosen { selection.remove(option.index) } else { selection.insert(option.index) }
                } else {
                    selection = [option.index]
                }
            }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Image(systemName: symbol(chosen: chosen))
                        .font(.system(size: 15))
                        .foregroundStyle(chosen ? brand.color : Theme.ink.opacity(0.3))

                    Text(option.label)
                        .font(.system(size: 14, weight: chosen ? .semibold : .regular))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)

                    Spacer(minLength: 8)

                    if poll.hasVoted {
                        Text(share.formatted(.percent.precision(.fractionLength(0))))
                            .font(.system(size: 12, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(Theme.ink.opacity(0.55))
                    }
                }

                if poll.hasVoted {
                    GeometryReader { proxy in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Theme.softFill)
                            Capsule()
                                .fill(chosen ? brand.color : brand.color.opacity(0.35))
                                .frame(width: max(2, proxy.size.width * share))
                        }
                    }
                    .frame(height: 6)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(chosen ? brand.color.opacity(0.5) : Theme.border, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!canVote)
        .accessibilityAddTraits(chosen ? .isSelected : [])
    }

    private func symbol(chosen: Bool) -> String {
        if poll.multiple {
            return chosen ? "checkmark.square.fill" : "square"
        }
        return chosen ? "largecircle.fill.circle" : "circle"
    }
}
