import SwiftUI

/// GALLERY-Space: MediaPackages als Sektionen. Freie/Preview-Items öffnen den
/// Vollbild-Viewer, gesperrte Items zeigen einen geblurrten Thumb und lassen
/// sich einzeln oder als Paket freischalten (Confirmation-Dialog).
struct GallerySpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: GalleryContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var viewerContext: GalleryViewerContext?
    @State private var pendingPurchase: GalleryPurchaseChoice?
    @State private var infoMessage: String?
    @State private var purchaseError: String?
    @State private var purchaseSuccessCount = 0

    private let gridColumns = [
        GridItem(.flexible(), spacing: 6),
        GridItem(.flexible(), spacing: 6),
        GridItem(.flexible(), spacing: 6)
    ]

    init(slug: String,
         space: SpaceDetail,
         content: GalleryContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
    }

    var body: some View {
        LazyVStack(spacing: 28) {
            if content.packages.isEmpty {
                EmptyStateView(
                    icon: "photo.on.rectangle.angled",
                    title: "Noch keine Medien",
                    message: "Sobald hier Foto- oder Video-Pakete veröffentlicht werden, erscheinen sie an dieser Stelle."
                )
            } else {
                ForEach(content.packages) { package in
                    packageSection(for: package)
                }
            }
        }
        .padding(.horizontal, 16)
        .sensoryFeedback(.success, trigger: purchaseSuccessCount)
        .fullScreenCover(item: $viewerContext) { context in
            GalleryFullscreenViewer(items: context.items, startIndex: context.startIndex)
        }
        .confirmationDialog(
            "Freischalten",
            isPresented: purchaseDialogBinding,
            titleVisibility: .visible,
            presenting: pendingPurchase
        ) { choice in
            if let itemUnlock = choice.itemUnlock, itemUnlock.appleProductId != nil {
                Button("Einzeln kaufen · \(Format.price(cents: itemUnlock.priceCents, currency: itemUnlock.currency))") {
                    purchase(itemUnlock)
                }
            }
            if let packageUnlock = choice.packageUnlock, packageUnlock.appleProductId != nil {
                Button("Ganzes Paket · \(Format.price(cents: packageUnlock.priceCents, currency: packageUnlock.currency))") {
                    purchase(packageUnlock)
                }
            }
            Button("Abbrechen", role: .cancel) {}
        } message: { _ in
            Text("Wähle, wie du den Inhalt freischalten möchtest.")
        }
        .alert("Kauf fehlgeschlagen", isPresented: purchaseErrorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(purchaseError ?? "")
        }
        .alert("Hinweis", isPresented: infoBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(infoMessage ?? "")
        }
    }

    // MARK: - Paket-Sektion

    private func packageSection(for package: GalleryPackage) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(package.title)
                    .font(.displaySerif(20))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)
                Spacer()
                if !package.owned {
                    packagePurchaseCapsule(for: package)
                }
            }

            if let description = package.description, !description.isEmpty {
                Text(description)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.ink.opacity(0.6))
            }

            if let availableUntil = package.availableUntil {
                PillLabel(
                    String(localized: "Verfügbar bis \(availableUntil.formatted(date: .abbreviated, time: .omitted))"),
                    systemImage: "clock",
                    prominent: true
                )
            }

            if package.items.isEmpty {
                Text("Dieses Paket enthält noch keine Medien.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink.opacity(0.5))
            } else {
                LazyVGrid(columns: gridColumns, spacing: 6) {
                    ForEach(package.items) { item in
                        itemCell(item, in: package)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func packagePurchaseCapsule(for package: GalleryPackage) -> some View {
        if let unlock = package.unlock, unlock.appleProductId != nil {
            Button {
                purchase(unlock)
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "lock.open")
                        .font(.system(size: 11, weight: .semibold))
                    Text(Format.price(cents: unlock.priceCents, currency: unlock.currency))
                        .monospacedDigit()
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(brand.color, in: .capsule)
            }
            .buttonStyle(.plain)
            .disabled(appState.purchases.isPurchasing)
        } else {
            PillLabel(String(localized: "Auf der Website verfügbar"), systemImage: "safari")
        }
    }

    // MARK: - Item-Zelle

    private func itemCell(_ item: GalleryItem, in package: GalleryPackage) -> some View {
        Button {
            handleTap(on: item, in: package)
        } label: {
            ZStack {
                Color.clear
                    .aspectRatio(1, contentMode: .fit)
                    .overlay {
                        AsyncImageView(url: item.thumbUrl ?? item.url)
                    }
                    .clipped()

                if item.locked {
                    Rectangle().fill(.ultraThinMaterial)
                    Image(systemName: "lock.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .glassEffect(.regular, in: .circle)
                } else if item.type == .video {
                    Image(systemName: "play.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 32, height: 32)
                        .glassEffect(.regular, in: .circle)
                } else if item.isPreview {
                    VStack {
                        Spacer()
                        HStack {
                            Text("Preview")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .glassEffect(.regular)
                            Spacer()
                        }
                    }
                    .padding(6)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func handleTap(on item: GalleryItem, in package: GalleryPackage) {
        if item.locked {
            let choice = GalleryPurchaseChoice(
                itemUnlock: item.unlock,
                packageUnlock: package.owned ? nil : package.unlock
            )
            if choice.hasPurchasableOption {
                pendingPurchase = choice
            } else {
                infoMessage = String(localized: "Dieser Inhalt ist in der App nicht kaufbar. Er ist auf der Website verfügbar.")
            }
        } else {
            let viewableItems = package.items.filter { !$0.locked }
            let startIndex = viewableItems.firstIndex(where: { $0.id == item.id }) ?? 0
            viewerContext = GalleryViewerContext(items: viewableItems, startIndex: startIndex)
        }
    }

    // MARK: - Kauf

    private var purchaseDialogBinding: Binding<Bool> {
        Binding(
            get: { pendingPurchase != nil },
            set: { if !$0 { pendingPurchase = nil } }
        )
    }

    private var purchaseErrorBinding: Binding<Bool> {
        Binding(
            get: { purchaseError != nil },
            set: { if !$0 { purchaseError = nil } }
        )
    }

    private var infoBinding: Binding<Bool> {
        Binding(
            get: { infoMessage != nil },
            set: { if !$0 { infoMessage = nil } }
        )
    }

    private func purchase(_ unlock: Unlock) {
        guard !appState.purchases.isPurchasing else { return }
        Task {
            do {
                try await appState.purchases.purchase(unlock: unlock, tenantSlug: slug)
                purchaseSuccessCount += 1
                await reload()
            } catch {
                purchaseError = error.localizedDescription
            }
        }
    }
}

// MARK: - Hilfstypen

/// Auswahl für den Kauf-Dialog eines gesperrten Items.
private struct GalleryPurchaseChoice {
    let itemUnlock: Unlock?
    let packageUnlock: Unlock?

    var hasPurchasableOption: Bool {
        itemUnlock?.appleProductId != nil || packageUnlock?.appleProductId != nil
    }
}

/// Kontext für den Vollbild-Viewer (nur freigeschaltete Items).
private struct GalleryViewerContext: Identifiable {
    let id = UUID()
    let items: [GalleryItem]
    let startIndex: Int
}

// MARK: - Vollbild-Viewer

/// Paged Vollbild-Viewer: Bilder zoombar, Videos über `RemoteVideoPlayer`.
private struct GalleryFullscreenViewer: View {
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
        if item.type == .video, let urlString = item.url, let url = URL(string: urlString) {
            RemoteVideoPlayer(url: url)
        } else {
            ZoomableRemoteImage(url: item.url ?? item.thumbUrl)
        }
    }
}

/// Einfaches zoombares Bild (Pinch bis 4x, Doppeltipp setzt zurück).
private struct ZoomableRemoteImage: View {
    let url: String?

    @State private var scale: CGFloat = 1
    @State private var baseScale: CGFloat = 1

    var body: some View {
        AsyncImageView(url: url, contentMode: .fit)
            .scaleEffect(scale)
            .gesture(
                MagnifyGesture()
                    .onChanged { value in
                        scale = min(max(baseScale * value.magnification, 1), 4)
                    }
                    .onEnded { _ in
                        baseScale = scale
                    }
            )
            .onTapGesture(count: 2) {
                withAnimation(.snappy(duration: 0.25)) {
                    scale = 1
                    baseScale = 1
                }
            }
    }
}
