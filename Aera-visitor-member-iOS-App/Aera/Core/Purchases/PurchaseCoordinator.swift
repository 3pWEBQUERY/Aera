import Foundation
import Observation
import StoreKit

// MARK: - PurchaseError

/// Fehler des Kauf-Flows oberhalb von StoreKit.
enum PurchaseError: Error, LocalizedError, Sendable {
    /// Kein `appleProductId` vorhanden (z. B. PHYSICAL-Produkte oder Preise
    /// außerhalb der Produkt-Pools) — Kauf nur über die Website möglich.
    case notAvailableOnIOS
    /// Restore: keine gültigen Entitlements gefunden.
    case nothingToRestore
    /// Restore: kein einziges Entitlement konnte serverseitig validiert werden.
    case restoreFailed

    var errorDescription: String? {
        switch self {
        case .notAvailableOnIOS:
            String(localized: "Dieser Kauf ist nur auf der Website verfügbar.")
        case .nothingToRestore:
            String(localized: "Es wurden keine wiederherstellbaren Käufe gefunden.")
        case .restoreFailed:
            String(localized: "Die Käufe konnten nicht wiederhergestellt werden. Bitte versuche es später erneut.")
        }
    }
}

// MARK: - PurchaseCoordinator

/// Orchestriert Apple-In-App-Käufe: StoreKit-Kauf → Server-Validierung
/// (`POST /iap/validate`) → `transaction.finish()`.
///
/// **Finish-Regel:** `finish()` wird nur nach erfolgreicher Server-Validierung
/// aufgerufen. Schlägt die Validierung fehl, bleibt die Transaktion unfinished
/// und wird über `Transaction.updates` erneut zugestellt (automatischer Retry).
///
/// **Abbruch:** Bricht der Nutzer den Kauf ab, wird `StoreError.cancelled`
/// geworfen. Aufrufer fangen diesen Fall ab und zeigen **keinen** Fehler-Alert:
/// ```swift
/// do { try await purchases.purchaseTier(tier, tenantSlug: slug) }
/// catch StoreError.cancelled { /* bewusst ignorieren */ }
/// catch { self.errorMessage = error.localizedDescription }
/// ```
@MainActor
@Observable
final class PurchaseCoordinator {
    /// `true`, solange ein Kauf/Restore läuft (für ProgressView-Overlays).
    private(set) var isPurchasing = false

    /// StoreKit-Schicht — für Views zugänglich, um lokalisierte Preise
    /// (`Product.displayPrice`) zu laden.
    let store: StoreService

    @ObservationIgnored
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
        self.store = StoreService()

        // Transaktionen aus `Transaction.updates` (Ask-to-Buy-Freigabe,
        // Abo-Verlängerung während der App-Laufzeit, Retries unfinished
        // Transaktionen) serverseitig validieren; `true` → finish.
        store.onTransactionUpdate = { [weak self] jws, transaction in
            guard let self else { return false }
            return await self.validateUpdatedTransaction(jws: jws, productId: transaction.productID)
        }
    }

    // MARK: - Öffentliche Kauf-API

    /// Kauft ein One-Time-Unlock (Post, Medien, Produkt, Request, Booking).
    /// - Throws: `PurchaseError.notAvailableOnIOS` wenn `appleProductId == nil`,
    ///   `StoreError.cancelled` bei Nutzer-Abbruch (keinen Alert zeigen).
    func purchase(unlock: Unlock, tenantSlug: String) async throws {
        guard let productId = unlock.appleProductId else {
            throw PurchaseError.notAvailableOnIOS
        }
        try await performPurchase(productId: productId,
                                  tenantSlug: tenantSlug,
                                  kind: unlock.iapKind,
                                  refId: unlock.refId)
    }

    /// Kauft eine Mitgliedschaftsstufe (Abo bzw. ONE_TIME).
    /// - Throws: `PurchaseError.notAvailableOnIOS` wenn `appleProductId == nil`,
    ///   `StoreError.cancelled` bei Nutzer-Abbruch (keinen Alert zeigen).
    func purchaseTier(_ tier: Tier, tenantSlug: String) async throws {
        guard let productId = tier.appleProductId else {
            throw PurchaseError.notAvailableOnIOS
        }
        try await performPurchase(productId: productId,
                                  tenantSlug: tenantSlug,
                                  kind: .tier,
                                  refId: tier.id)
    }

    /// Kauft ein Trinkgeld (`aera.tip.{cents}`).
    /// - Throws: `StoreError.cancelled` bei Nutzer-Abbruch (keinen Alert zeigen).
    func purchaseTip(appleProductId: String, tenantSlug: String, refId: String) async throws {
        try await performPurchase(productId: appleProductId,
                                  tenantSlug: tenantSlug,
                                  kind: .tip,
                                  refId: refId)
    }

    /// Stellt Käufe wieder her: synct mit dem App Store, validiert jedes
    /// aktuelle Entitlement einzeln am Server (Fehler werden pro Entitlement
    /// geschluckt); mindestens ein Erfolg → ok.
    /// - Throws: `PurchaseError.nothingToRestore` / `.restoreFailed`.
    func restore(tenantSlug: String) async throws {
        isPurchasing = true
        defer { isPurchasing = false }

        await store.sync()
        let entitlements = await store.currentEntitlements()
        guard !entitlements.isEmpty else {
            throw PurchaseError.nothingToRestore
        }

        var succeeded = 0
        for entitlement in entitlements {
            let productId = entitlement.transaction.productID
            let context = purchaseContext(for: productId)
            let isTierSubscription = productId.hasPrefix("aera.sub.") || context?.kind == .tier
            do {
                if isTierSubscription {
                    // Abo: refId weglassen — der Server leitet das Tier aus
                    // der productId ab (Restore z. B. nach Gerätewechsel
                    // ohne lokal persistierten Kaufkontext).
                    _ = try await api.validateIAP(tenantSlug: tenantSlug,
                                                  jws: entitlement.jws,
                                                  kind: .tier)
                } else if let context {
                    _ = try await api.validateIAP(tenantSlug: tenantSlug,
                                                  jws: entitlement.jws,
                                                  kind: context.kind,
                                                  refId: context.refId)
                } else {
                    // Nicht-Abo ohne Kontext: keinem Inhalt zuordenbar —
                    // still überspringen.
                    continue
                }
                succeeded += 1
            } catch {
                // Einzelne Fehler bewusst schlucken (z. B. Entitlement
                // einer anderen Community).
                continue
            }
        }

        guard succeeded > 0 else {
            throw PurchaseError.restoreFailed
        }
    }

    // MARK: - Kern-Flow

    private func performPurchase(productId: String,
                                 tenantSlug: String,
                                 kind: IAPPurchaseKind,
                                 refId: String) async throws {
        isPurchasing = true
        defer { isPurchasing = false }

        // Kontext persistieren, damit spätere `Transaction.updates`
        // (Ask to Buy nach App-Neustart, Abo-Verlängerung, Retries)
        // dem richtigen Tenant/Kind/RefId zugeordnet werden können.
        savePurchaseContext(PurchaseContext(tenantSlug: tenantSlug, kind: kind, refId: refId),
                            for: productId)

        let jws = try await store.purchase(productId: productId)
        // Server-Validierung: vergibt Membership/Entitlement/Order.
        // Wirft der Server einen Fehler, wird NICHT gefinisht —
        // Retry kommt automatisch über `Transaction.updates`.
        _ = try await api.validateIAP(tenantSlug: tenantSlug, jws: jws, kind: kind, refId: refId)
        await store.finishTransaction(matching: jws)
    }

    private func validateUpdatedTransaction(jws: String, productId: String) async -> Bool {
        guard let context = purchaseContext(for: productId) else {
            // Kein bekannter Kontext (z. B. Neuinstallation): unfinished
            // lassen; ein späterer Restore/Neukauf liefert den Kontext.
            return false
        }
        do {
            _ = try await api.validateIAP(tenantSlug: context.tenantSlug,
                                          jws: jws,
                                          kind: context.kind,
                                          refId: context.refId)
            return true
        } catch {
            return false
        }
    }

    // MARK: - Kauf-Kontext (persistiert pro Produkt-ID)

    private struct PurchaseContext: Codable {
        let tenantSlug: String
        let kind: IAPPurchaseKind
        let refId: String
    }

    private static let contextsDefaultsKey = "aera.iap.purchaseContexts"

    private func loadPurchaseContexts() -> [String: PurchaseContext] {
        guard let data = UserDefaults.standard.data(forKey: Self.contextsDefaultsKey),
              let contexts = try? JSONDecoder().decode([String: PurchaseContext].self, from: data) else {
            return [:]
        }
        return contexts
    }

    private func purchaseContext(for productId: String) -> PurchaseContext? {
        loadPurchaseContexts()[productId]
    }

    private func savePurchaseContext(_ context: PurchaseContext, for productId: String) {
        var contexts = loadPurchaseContexts()
        contexts[productId] = context
        if let data = try? JSONEncoder().encode(contexts) {
            UserDefaults.standard.set(data, forKey: Self.contextsDefaultsKey)
        }
    }
}
