import SwiftUI

/// Bibliothek: gekaufte Medien-Pakete („Meine Inhalte") und Bestellungen.
/// Paket → 3er-Grid der Items → Vollbild-Pager (Bild/Video).
struct LibraryView: View {
    let slug: String

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var library: LibraryResponse?
    @State private var loadFailed = false

    init(slug: String) {
        self.slug = slug
    }

    var body: some View {
        Group {
            if let library {
                content(library)
            } else if loadFailed {
                loadErrorView
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle("Bibliothek")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    // MARK: - Inhalt

    private func content(_ library: LibraryResponse) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if library.packages.isEmpty && library.orders.isEmpty {
                    EmptyStateView(
                        icon: "books.vertical",
                        title: "Noch keine Inhalte",
                        message: "Gekaufte Medien und Bestellungen erscheinen hier."
                    )
                } else {
                    if !library.packages.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeader("Meine Inhalte")
                            ForEach(library.packages) { package in
                                NavigationLink {
                                    LibraryPackageView(package: package)
                                        .brandTheme(brand)
                                } label: {
                                    packageCard(package)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if !library.orders.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeader("Bestellungen")
                            ForEach(library.orders) { order in
                                LibraryOrderRow(order: order)
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .refreshable { await load(force: true) }
    }

    private func packageCard(_ package: GalleryPackage) -> some View {
        AeraCard(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Color.clear
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .overlay {
                        AsyncImageView(url: package.coverUrl ?? package.items.first?.thumbUrl)
                    }
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: 12, topTrailingRadius: 12))

                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(package.title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                        Text("\(package.items.count) Medien")
                            .font(.system(size: 12))
                            .monospacedDigit()
                            .foregroundStyle(Theme.ink.opacity(0.5))
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.ink.opacity(0.3))
                }
                .padding(14)
            }
        }
    }

    private var loadErrorView: some View {
        VStack(spacing: 16) {
            EmptyStateView(
                icon: "wifi.exclamationmark",
                title: "Laden fehlgeschlagen",
                message: "Deine Bibliothek konnte nicht geladen werden."
            )
            Button("Erneut versuchen") {
                loadFailed = false
                Task { await load(force: true) }
            }
            .buttonStyle(.secondary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Laden

    private func load(force: Bool = false) async {
        if library != nil && !force { return }
        do {
            library = try await appState.api.library(slug: slug)
            loadFailed = false
        } catch {
            if library == nil { loadFailed = true }
        }
    }
}

// MARK: - LibraryOrderRow

private struct LibraryOrderRow: View {
    let order: Order

    @Environment(\.openURL) private var openURL

    var body: some View {
        AeraCard(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(order.description)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                        Text(order.createdAt.formatted(date: .abbreviated, time: .omitted))
                            .font(.system(size: 12))
                            .monospacedDigit()
                            .foregroundStyle(Theme.ink.opacity(0.5))
                    }
                    Spacer()
                    Text(Format.price(cents: order.amountCents, currency: order.currency))
                        .font(.system(size: 14, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink)
                }

                HStack(spacing: 10) {
                    OrderStatusPill(status: order.status)

                    if let downloadUrl = order.downloadUrl, let url = AppConfig.mediaURL(downloadUrl) {
                        Button {
                            openURL(url)
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "arrow.down.circle")
                                    .font(.system(size: 12, weight: .semibold))
                                Text("Download")
                                    .font(.system(size: 12, weight: .semibold))
                            }
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Theme.ink)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Theme.card, in: .capsule)
                        .overlay(Capsule().strokeBorder(Theme.border, lineWidth: 1))
                    }
                }
            }
        }
    }
}

// MARK: - OrderStatusPill

/// Status-Pill für Bestellungen (auch von `AccountView` verwendet).
struct OrderStatusPill: View {
    let status: OrderStatus

    var body: some View {
        PillLabel(label, prominent: status == .paid)
    }

    private var label: String {
        switch status {
        case .pending: String(localized: "Ausstehend")
        case .paid: String(localized: "Bezahlt")
        case .refunded: String(localized: "Erstattet")
        case .failed: String(localized: "Fehlgeschlagen")
        }
    }
}

// MARK: - LibraryPackageView

/// Detailansicht eines gekauften Pakets: 3er-Grid der Items,
/// Tap öffnet den Vollbild-Pager.
private struct LibraryPackageView: View {
    let package: GalleryPackage

    @State private var pagerContext: LibraryPagerContext?

    private let gridColumns = [
        GridItem(.flexible(), spacing: 6),
        GridItem(.flexible(), spacing: 6),
        GridItem(.flexible(), spacing: 6)
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let description = package.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.ink.opacity(0.6))
                }

                if package.items.isEmpty {
                    EmptyStateView(
                        icon: "photo.on.rectangle.angled",
                        title: "Keine Medien",
                        message: "Dieses Paket enthält noch keine Medien."
                    )
                } else {
                    LazyVGrid(columns: gridColumns, spacing: 6) {
                        ForEach(Array(package.items.enumerated()), id: \.element.id) { index, item in
                            Button {
                                pagerContext = LibraryPagerContext(startIndex: index)
                            } label: {
                                thumbCell(item)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.paper.ignoresSafeArea())
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle(package.title)
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(item: $pagerContext) { context in
            LibraryMediaPager(items: package.items, startIndex: context.startIndex)
        }
    }

    private func thumbCell(_ item: GalleryItem) -> some View {
        ZStack {
            Color.clear
                .aspectRatio(1, contentMode: .fit)
                .overlay {
                    AsyncImageView(url: item.thumbUrl ?? item.url)
                }
                .clipped()

            if item.type == .video {
                Image(systemName: "play.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .glassEffect(.regular, in: .circle)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

private struct LibraryPagerContext: Identifiable {
    let id = UUID()
    let startIndex: Int
}

// MARK: - LibraryMediaPager

/// Vollbild-Pager über die Paket-Items (Bild bzw. Video).
private struct LibraryMediaPager: View {
    let items: [GalleryItem]
    let startIndex: Int

    @Environment(\.dismiss) private var dismiss
    @State private var currentIndex: Int

    init(items: [GalleryItem], startIndex: Int) {
        self.items = items
        self.startIndex = startIndex
        self._currentIndex = State(initialValue: min(max(startIndex, 0), max(items.count - 1, 0)))
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()

            TabView(selection: $currentIndex) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    mediaPage(for: item)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()

            VStack(alignment: .trailing, spacing: 10) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .glassEffect(.regular.interactive(), in: .circle)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Schließen"))

                if items.count > 1 {
                    Text("\(currentIndex + 1)/\(items.count)")
                        .font(.system(size: 12, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .glassEffect(.regular)
                }
            }
            .padding(16)
        }
        .preferredColorScheme(.dark)
    }

    @ViewBuilder
    private func mediaPage(for item: GalleryItem) -> some View {
        if item.type == .video, let urlString = item.url, let url = AppConfig.mediaURL(urlString) {
            RemoteVideoPlayer(url: url)
        } else {
            AsyncImageView(url: item.url ?? item.thumbUrl, contentMode: .fit)
        }
    }
}
