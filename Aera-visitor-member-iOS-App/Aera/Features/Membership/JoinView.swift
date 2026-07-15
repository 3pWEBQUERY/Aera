import SwiftUI

// MARK: - JoinView

/// Paywall „Mitglied werden": lädt Tiers und Community-Branding, bietet
/// Free-Beitritt (`POST /c/{slug}/join-free`) bzw. IAP-Kauf über den
/// `PurchaseCoordinator` an. Als Sheet präsentieren.
///
/// `StoreError.cancelled` (Nutzer-Abbruch) wird bewusst ohne Alert ignoriert.
struct JoinView: View {
    let slug: String
    let onJoined: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var community: CommunityDetail?
    @State private var tiers: [Tier]?
    /// Produkt-ID → lokalisierter StoreKit-Preis (`Product.displayPrice`).
    @State private var displayPrices: [String: String] = [:]
    @State private var loadFailed = false
    @State private var actionError: String?
    @State private var showLogin = false
    @State private var pendingAction: PendingAction?

    private enum PendingAction {
        case joinFree(Tier)
        case purchase(Tier)
        case restore
    }

    var body: some View {
        NavigationStack {
            Group {
                if let tiers {
                    content(tiers: tiers)
                } else if loadFailed {
                    loadErrorView
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .background(Theme.paper.ignoresSafeArea())
            .scrollEdgeEffectStyle(.soft, for: .top)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.ink.opacity(0.6))
                    }
                    .accessibilityLabel(Text("Schließen"))
                }
            }
        }
        .brandTheme(brand)
        .preferredColorScheme(.light)
        .overlay {
            if appState.purchases.isPurchasing {
                purchasingOverlay
            }
        }
        .alert("Fehler", isPresented: Binding(
            get: { actionError != nil },
            set: { if !$0 { actionError = nil } }
        )) {
            Button("OK", role: .cancel) { actionError = nil }
        } message: {
            Text(actionError ?? "")
        }
        .sheet(isPresented: $showLogin) {
            LoginSheetView(onSuccess: {
                showLogin = false
                runPendingAction()
            })
        }
        .task { await load() }
    }

    private var brand: BrandTheme {
        BrandTheme(primaryHex: community?.primaryColor, accentHex: community?.accentColor)
    }

    // MARK: - Inhalt

    private func content(tiers: [Tier]) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                ForEach(tiers) { tier in
                    TierCardView(tier: tier,
                                 displayPrice: tier.appleProductId.flatMap { displayPrices[$0] },
                                 onJoinFree: { requestJoinFree(tier) },
                                 onPurchase: { requestPurchase(tier) })
                }
                footer
            }
            .padding(20)
        }
        .refreshable { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let community {
                EyebrowLabel(LocalizedStringKey(community.name))
            }
            Text("Mitglied werden")
                .font(.displaySerif(30))
                .kerning(-0.4)
                .foregroundStyle(Theme.ink)
            Text("Wähle eine Stufe und werde Teil der Community.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink.opacity(0.55))
        }
        .padding(.top, 4)
    }

    private var footer: some View {
        VStack(spacing: 12) {
            Button("Käufe wiederherstellen") {
                requestRestore()
            }
            .buttonStyle(.ghost)

            Text("Käufe rechnen über Apple ab. Abos verlängern sich automatisch und sind in den App-Store-Einstellungen kündbar.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.ink.opacity(0.5))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private var loadErrorView: some View {
        VStack(spacing: 16) {
            EmptyStateView(icon: "wifi.exclamationmark",
                           title: "Laden fehlgeschlagen",
                           message: "Die Mitgliedschaftsstufen konnten nicht geladen werden.")
            Button("Erneut versuchen") {
                loadFailed = false
                Task { await load() }
            }
            .buttonStyle(.secondary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var purchasingOverlay: some View {
        ZStack {
            Color.black.opacity(0.2).ignoresSafeArea()
            ProgressView()
                .controlSize(.large)
                .tint(.white)
                .padding(28)
                .glassEffect(.regular, in: .rect(cornerRadius: 20))
        }
        .transition(.opacity)
    }

    // MARK: - Laden

    private func load() async {
        do {
            async let communityResponse = appState.api.community(slug: slug)
            async let loadedTiers = appState.api.tiers(slug: slug)
            let (response, tierList) = try await (communityResponse, loadedTiers)
            community = response.community
            tiers = tierList
            loadFailed = false
            await loadDisplayPrices(for: tierList)
        } catch {
            if tiers == nil { loadFailed = true }
        }
    }

    private func loadDisplayPrices(for tiers: [Tier]) async {
        let productIds = tiers.compactMap(\.appleProductId)
        guard !productIds.isEmpty else { return }
        do {
            let products = try await appState.purchases.store.products(ids: productIds)
            for product in products {
                displayPrices[product.id] = product.displayPrice
            }
        } catch {
            // Kein Blocker: Buttons fallen auf den Vertragspreis zurück.
        }
    }

    // MARK: - Aktionen

    private func requestJoinFree(_ tier: Tier) {
        guard appState.session.isLoggedIn else {
            pendingAction = .joinFree(tier)
            showLogin = true
            return
        }
        Task { await joinFree(tier) }
    }

    private func requestPurchase(_ tier: Tier) {
        guard appState.session.isLoggedIn else {
            pendingAction = .purchase(tier)
            showLogin = true
            return
        }
        Task { await purchase(tier) }
    }

    private func requestRestore() {
        guard appState.session.isLoggedIn else {
            pendingAction = .restore
            showLogin = true
            return
        }
        Task { await restore() }
    }

    private func runPendingAction() {
        guard let pendingAction else { return }
        self.pendingAction = nil
        Task {
            switch pendingAction {
            case .joinFree(let tier): await joinFree(tier)
            case .purchase(let tier): await purchase(tier)
            case .restore: await restore()
            }
        }
    }

    private func joinFree(_ tier: Tier) async {
        guard tier.interval == .free else { return }
        do {
            _ = try await appState.api.joinFree(slug: slug)
            await onJoined()
            dismiss()
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func purchase(_ tier: Tier) async {
        do {
            try await appState.purchases.purchaseTier(tier, tenantSlug: slug)
            await onJoined()
            dismiss()
        } catch StoreError.cancelled {
            // Nutzer-Abbruch: bewusst kein Alert.
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func restore() async {
        do {
            try await appState.purchases.restore(tenantSlug: slug)
            await onJoined()
        } catch StoreError.cancelled {
            // Nutzer-Abbruch: bewusst kein Alert.
        } catch {
            actionError = error.localizedDescription
        }
    }
}

// MARK: - TierCardView

/// Tier-Karte nach DESIGN.md: Radius 16, Cover, Serif-Name, großer Preis,
/// Benefits mit Brand-Häkchen, „Empfohlen"-/„Deine Stufe"-Banner.
private struct TierCardView: View {
    let tier: Tier
    /// Lokalisierter StoreKit-Preis (`Product.displayPrice`), falls geladen.
    let displayPrice: String?
    let onJoinFree: () -> Void
    let onPurchase: () -> Void

    @Environment(\.brand) private var brand

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
        VStack(alignment: .leading, spacing: 0) {
            banner
            cover
            details
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.card)
        .clipShape(shape)
        .overlay {
            shape.strokeBorder(tier.isRecommended ? brand.color.opacity(0.55) : Theme.border,
                               lineWidth: tier.isRecommended ? 1.5 : 1)
        }
        .shadow(color: .black.opacity(0.05), radius: 8, y: 2)
    }

    @ViewBuilder
    private var banner: some View {
        if tier.isCurrent {
            bannerLabel("Deine Stufe", background: Theme.rail)
        } else if tier.isRecommended {
            bannerLabel("Empfohlen", background: brand.color)
        }
    }

    private func bannerLabel(_ text: LocalizedStringKey, background: Color) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .textCase(.uppercase)
            .kerning(1.6)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .background(background)
    }

    @ViewBuilder
    private var cover: some View {
        if tier.coverUrl != nil {
            AsyncImageView(url: tier.coverUrl)
                .frame(height: 120)
                .frame(maxWidth: .infinity)
                .clipped()
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(tier.name)
                    .font(.displaySerif(20))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)
                PriceText(cents: tier.priceCents,
                          currency: tier.currency,
                          interval: tier.interval)
            }

            if let description = tier.description, !description.isEmpty, tier.benefits.isEmpty {
                Text(description)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.ink.opacity(0.7))
            }

            if !tier.benefits.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(tier.benefits, id: \.self) { benefit in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(brand.color)
                            Text(benefit)
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.ink.opacity(0.8))
                        }
                    }
                }
            }

            if tier.memberCount > 0 {
                PillLabel(String(localized: "\(tier.memberCount) Mitglieder"), systemImage: "person.2")
            }

            actionArea
        }
        .padding(20)
    }

    @ViewBuilder
    private var actionArea: some View {
        if tier.isCurrent {
            EmptyView()
        } else if tier.interval == .free {
            Button("Kostenlos beitreten", action: onJoinFree)
                .buttonStyle(.secondary(fullWidth: true))
        } else if tier.appleProductId != nil {
            Button(action: onPurchase) {
                Text(purchaseTitle)
                    .monospacedDigit()
            }
            .buttonStyle(.brand(fullWidth: true))
        } else {
            HStack(spacing: 6) {
                Image(systemName: "globe")
                    .font(.system(size: 12, weight: .medium))
                Text("Auf der Website verfügbar")
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundStyle(Theme.ink.opacity(0.6))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .background(Theme.softFill, in: .capsule)
        }
    }

    private var purchaseTitle: String {
        let price = displayPrice ?? Format.price(cents: tier.priceCents, currency: tier.currency)
        switch tier.interval {
        case .month:
            return String(localized: "Beitreten für \(price)/Monat")
        case .year:
            return String(localized: "Beitreten für \(price)/Jahr")
        case .oneTime:
            return String(localized: "Beitreten für \(price) einmalig")
        case .free:
            return String(localized: "Kostenlos beitreten")
        }
    }
}
