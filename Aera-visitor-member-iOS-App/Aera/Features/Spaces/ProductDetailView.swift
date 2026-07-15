import SwiftUI

/// Produkt-Detail: Bilder-Pager, Name, Beschreibung, Preis und Kauf-Logik.
/// - owned → grüner Haken „Gekauft" + Download (falls vorhanden)
/// - PHYSICAL bzw. `appleProductId == nil` → Hinweis „Auf der Website verfügbar"
///   (App-Store-konform: kein Kaufbutton, kein Preis im Hinweis)
/// - nicht auf Lager → ausgegraut „Ausverkauft"
/// - sonst → Brand-Kaufbutton via `appState.purchases`
struct ProductDetailView: View {
    let slug: String
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var product: Product
    @State private var currentImageIndex = 0
    @State private var purchaseError: String?
    @State private var purchaseSuccessCount = 0

    init(slug: String, product: Product, reload: @escaping () async -> Void) {
        self.slug = slug
        self.reload = reload
        self._product = State(initialValue: product)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                imagePager

                VStack(alignment: .leading, spacing: 12) {
                    Text(product.name)
                        .font(.displaySerif(24))
                        .kerning(-0.4)
                        .foregroundStyle(Theme.ink)

                    if let description = product.description, !description.isEmpty {
                        Text(description)
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.ink.opacity(0.7))
                    }

                    if showsPrice {
                        PriceText(cents: product.priceCents, currency: product.currency)
                    }
                }

                purchaseArea
            }
            .padding(16)
        }
        .background(Theme.paper)
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle(product.name)
        .navigationBarTitleDisplayMode(.inline)
        .sensoryFeedback(.success, trigger: purchaseSuccessCount)
        .alert("Kauf fehlgeschlagen", isPresented: purchaseErrorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(purchaseError ?? "")
        }
    }

    // MARK: - Bilder

    private var imageUrls: [String] {
        if product.images.isEmpty {
            return [product.coverUrl].compactMap { $0 }
        }
        return product.images
    }

    @ViewBuilder
    private var imagePager: some View {
        if imageUrls.isEmpty {
            Color.clear
                .aspectRatio(1, contentMode: .fit)
                .overlay {
                    AsyncImageView(url: nil)
                }
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        } else {
            TabView(selection: $currentImageIndex) {
                ForEach(Array(imageUrls.enumerated()), id: \.offset) { index, url in
                    Color.clear
                        .overlay {
                            AsyncImageView(url: url)
                        }
                        .clipped()
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: imageUrls.count > 1 ? .automatic : .never))
            .aspectRatio(1, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Theme.border, lineWidth: 1)
            )
        }
    }

    // MARK: - Kauf-Logik

    /// Preis groß nur, wenn er nicht auf einen Website-Kauf digitaler Inhalte
    /// hinweist (App-Store-Konformität); bei PHYSICAL und gekauften/kaufbaren
    /// Produkten wird er gezeigt.
    private var showsPrice: Bool {
        if product.owned { return true }
        if product.type == .physical { return true }
        return product.appleProductId != nil
    }

    @ViewBuilder
    private var purchaseArea: some View {
        if product.owned {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                    Text("Gekauft")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                }
                if let downloadUrl = product.downloadUrl, let url = URL(string: downloadUrl) {
                    Link(destination: url) {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.down.circle")
                            Text("Herunterladen")
                        }
                    }
                    .buttonStyle(.brand(fullWidth: true))
                }
            }
        } else if product.type == .physical || product.appleProductId == nil {
            websiteHintCard
        } else if !product.inStock {
            Text("Ausverkauft")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.ink.opacity(0.4))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Theme.softFill, in: .capsule)
        } else {
            Button {
                purchase()
            } label: {
                if appState.purchases.isPurchasing {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text("Kaufen · \(Format.price(cents: product.priceCents, currency: product.currency))")
                        .monospacedDigit()
                }
            }
            .buttonStyle(.brand(fullWidth: true))
            .disabled(appState.purchases.isPurchasing)
        }
    }

    private var websiteHintCard: some View {
        AeraCard(padding: 16) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: "safari")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(brand.color)
                Text("Auf der Website verfügbar")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.ink.opacity(0.75))
            }
        }
    }

    private var purchaseErrorBinding: Binding<Bool> {
        Binding(
            get: { purchaseError != nil },
            set: { if !$0 { purchaseError = nil } }
        )
    }

    private func purchase() {
        guard !appState.purchases.isPurchasing else { return }
        let unlock = Unlock(
            priceCents: product.priceCents,
            currency: product.currency,
            appleProductId: product.appleProductId,
            kind: .product,
            refId: product.id
        )
        Task {
            do {
                try await appState.purchases.purchase(unlock: unlock, tenantSlug: slug)
                product.owned = true
                purchaseSuccessCount += 1
                await reload()
            } catch {
                purchaseError = error.localizedDescription
            }
        }
    }
}
