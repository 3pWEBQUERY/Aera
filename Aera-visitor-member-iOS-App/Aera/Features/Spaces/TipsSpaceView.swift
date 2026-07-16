import SwiftUI

/// TIPS-Space: Spendenziel-Karte, Preset-Grid (2 Spalten) mit IAP-Kauf
/// (`aera.tip.{cents}`) und Unterstützer-Liste. Presets ohne
/// `appleProductId` werden ausgeblendet; fehlen alle, erscheint ein
/// Website-Hinweis.
struct TipsSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: TipsContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var pendingPreset: TipPreset?
    @State private var purchaseError: String?
    @State private var showSuccessOverlay = false
    @State private var successCount = 0

    private let gridColumns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    init(slug: String,
         space: SpaceDetail,
         content: TipsContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
    }

    private var purchasablePresets: [TipPreset] {
        content.presets.filter { $0.appleProductId != nil }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            if let goal = content.goal {
                goalCard(goal)
            }

            presetSection

            supportersSection
        }
        .padding(.horizontal, 16)
        .sensoryFeedback(.success, trigger: successCount)
        .overlay {
            if showSuccessOverlay {
                successOverlay
            }
        }
        .confirmationDialog(
            confirmationTitle,
            isPresented: Binding(
                get: { pendingPreset != nil },
                set: { if !$0 { pendingPreset = nil } }
            ),
            titleVisibility: .visible,
            presenting: pendingPreset
        ) { preset in
            Button("Senden") {
                purchase(preset)
            }
            Button("Abbrechen", role: .cancel) {}
        } message: { _ in
            Text("Dein Trinkgeld wird über Apple abgerechnet.")
        }
        .alert("Kauf fehlgeschlagen", isPresented: Binding(
            get: { purchaseError != nil },
            set: { if !$0 { purchaseError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(purchaseError ?? "")
        }
    }

    private var confirmationTitle: String {
        guard let preset = pendingPreset else {
            return String(localized: "Trinkgeld senden?")
        }
        let price = Format.price(cents: preset.amountCents, currency: "eur")
        return String(localized: "\(price) Trinkgeld senden?")
    }

    // MARK: - Spendenziel

    private func goalCard(_ goal: TipGoal) -> some View {
        AeraCard(cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 10) {
                Text(goal.title)
                    .font(.displaySerif(20))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)

                ProgressView(value: min(Double(goal.raisedCents), Double(goal.targetCents)),
                             total: Double(max(goal.targetCents, 1)))
                    .tint(brand.color)

                Text("\(Format.price(cents: goal.raisedCents, currency: "eur")) von \(Format.price(cents: goal.targetCents, currency: "eur"))")
                    .font(.system(size: 13, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(Theme.ink.opacity(0.6))
            }
        }
    }

    // MARK: - Presets

    @ViewBuilder
    private var presetSection: some View {
        if !purchasablePresets.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Trinkgeld senden")
                LazyVGrid(columns: gridColumns, spacing: 12) {
                    ForEach(purchasablePresets) { preset in
                        Button {
                            pendingPreset = preset
                        } label: {
                            AeraCard(padding: 18) {
                                VStack(spacing: 4) {
                                    Image(systemName: "heart.fill")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(brand.color)
                                    Text(Format.price(cents: preset.amountCents, currency: "eur"))
                                        .font(.system(size: 24, weight: .bold))
                                        .monospacedDigit()
                                        .kerning(-0.5)
                                        .foregroundStyle(Theme.ink)
                                }
                                .frame(maxWidth: .infinity)
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(appState.purchases.isPurchasing)
                    }
                }
            }
        } else if !content.presets.isEmpty {
            AeraCard {
                HStack(spacing: 10) {
                    Image(systemName: "globe")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.ink.opacity(0.5))
                    Text("Trinkgelder sind in der App nicht verfügbar. Du kannst auf der Website unterstützen.")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.ink.opacity(0.7))
                }
            }
        }
    }

    // MARK: - Unterstützer

    @ViewBuilder
    private var supportersSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Unterstützer")
            if content.tips.isEmpty {
                EmptyStateView(
                    icon: "heart",
                    title: "Noch keine Unterstützer",
                    message: "Sei die erste Person, die mit einem Trinkgeld unterstützt."
                )
            } else {
                ForEach(content.tips) { tip in
                    tipRow(tip)
                }
            }
        }
    }

    private func tipRow(_ tip: Tip) -> some View {
        AeraCard(padding: 14) {
            HStack(alignment: .top, spacing: 12) {
                AvatarView(url: tip.author?.avatarUrl,
                           name: tip.author?.name ?? String(localized: "Anonym"),
                           size: 36)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(tip.author?.name ?? String(localized: "Anonym"))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        Spacer()
                        Text(tip.createdAt.relativeLabel)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.ink.opacity(0.45))
                    }

                    PillLabel(Format.price(cents: tip.amountCents, currency: "eur"),
                              systemImage: "heart.fill",
                              prominent: true)

                    if let message = tip.message, !message.isEmpty {
                        Text(message)
                            .font(.system(size: 14))
                            .italic()
                            .foregroundStyle(Theme.ink.opacity(0.7))
                    }
                }
            }
        }
    }

    // MARK: - Erfolgs-Overlay

    private var successOverlay: some View {
        VStack(spacing: 10) {
            Image(systemName: "checkmark")
                .font(.system(size: 26, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 72, height: 72)
                .glassEffect(.regular.tint(brand.color), in: .circle)
            Text("Danke für deine Unterstützung")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.ink)
        }
        .padding(28)
        .glassEffect(.regular, in: .rect(cornerRadius: 24))
        .transition(.scale(scale: 0.85).combined(with: .opacity))
    }

    // MARK: - Kauf

    private func purchase(_ preset: TipPreset) {
        guard let productId = preset.appleProductId,
              !appState.purchases.isPurchasing else { return }
        Task {
            do {
                try await appState.purchases.purchaseTip(appleProductId: productId,
                                                         tenantSlug: slug,
                                                         refId: space.summary.slug)
                successCount += 1
                withAnimation(.snappy(duration: 0.25)) {
                    showSuccessOverlay = true
                }
                await reload()
                try? await Task.sleep(for: .seconds(1.5))
                withAnimation(.snappy(duration: 0.25)) {
                    showSuccessOverlay = false
                }
            } catch StoreError.cancelled {
                // Nutzer-Abbruch: bewusst kein Alert.
            } catch {
                purchaseError = error.localizedDescription
            }
        }
    }
}
