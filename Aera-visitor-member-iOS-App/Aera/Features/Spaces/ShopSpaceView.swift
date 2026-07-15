import SwiftUI

/// SHOP-Space: Produkt-Grid (2 Spalten). Tap öffnet das Produkt-Detail
/// (`ProductDetailView`).
struct ShopSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: ShopContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    private let gridColumns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    init(slug: String,
         space: SpaceDetail,
         content: ShopContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
    }

    var body: some View {
        Group {
            if content.products.isEmpty {
                EmptyStateView(
                    icon: "bag",
                    title: "Noch keine Produkte",
                    message: "Sobald hier Produkte angeboten werden, erscheinen sie an dieser Stelle."
                )
            } else {
                LazyVGrid(columns: gridColumns, spacing: 16) {
                    ForEach(content.products) { product in
                        NavigationLink {
                            ProductDetailView(slug: slug, product: product, reload: reload)
                        } label: {
                            productCell(for: product)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }

    private func productCell(for product: Product) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topLeading) {
                Color.clear
                    .aspectRatio(1, contentMode: .fit)
                    .overlay {
                        AsyncImageView(url: product.coverUrl ?? product.images.first)
                    }
                    .clipped()

                if !product.inStock {
                    Text("Ausverkauft")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Theme.rail.opacity(0.85), in: .capsule)
                        .padding(8)
                } else if product.owned {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white, .green)
                        .padding(8)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Theme.border, lineWidth: 1)
            )

            Text(product.name)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            PriceText(cents: product.priceCents, currency: product.currency, size: 15)
        }
        .opacity(product.inStock ? 1 : 0.55)
    }
}
