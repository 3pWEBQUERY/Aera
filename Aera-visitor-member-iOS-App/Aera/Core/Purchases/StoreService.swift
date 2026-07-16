import Foundation
import StoreKit

// MARK: - StoreError

/// Fehler der StoreKit-Schicht.
enum StoreError: Error, LocalizedError, Sendable {
    /// Nutzer hat den Kauf abgebrochen.
    /// Aufrufer zeigen dafür bewusst **keinen** Fehler-Alert.
    case cancelled
    /// Kauf wartet auf Freigabe (z. B. Ask to Buy). Der Abschluss kommt
    /// später über `Transaction.updates` und wird dann serverseitig validiert.
    case pending
    /// StoreKit konnte die Signatur der Transaktion nicht verifizieren.
    case unverified
    /// Produkt ist im App Store nicht verfügbar.
    case productNotFound(String)
    /// Unbekanntes Kaufergebnis (zukünftige StoreKit-Fälle).
    case unknown

    var errorDescription: String? {
        switch self {
        case .cancelled:
            String(localized: "Der Kauf wurde abgebrochen.")
        case .pending:
            String(localized: "Der Kauf wartet auf Bestätigung und wird danach automatisch abgeschlossen.")
        case .unverified:
            String(localized: "Die Kaufbestätigung konnte nicht verifiziert werden.")
        case .productNotFound:
            String(localized: "Dieses Produkt ist im App Store derzeit nicht verfügbar.")
        case .unknown:
            String(localized: "Der Kauf konnte nicht abgeschlossen werden.")
        }
    }
}

// MARK: - StoreService

/// Kapselt StoreKit 2: Produkt-Laden (mit Cache), Kauf mit Verifikation,
/// `Transaction.updates`-Listener und aktuelle Entitlements für Restore.
///
/// **Finish-Regel:** Transaktionen werden erst nach erfolgreicher
/// Server-Validierung (`POST /iap/validate`) abgeschlossen. Bis dahin bleiben
/// sie unfinished und werden von StoreKit über `Transaction.updates`
/// erneut geliefert (Retry).
@MainActor
final class StoreService {
    /// Callback für verifizierte Transaktionen aus `Transaction.updates`
    /// (Ask-to-Buy-Freigaben, Abo-Verlängerungen, Retries unfinished
    /// Transaktionen). Parameter: JWS-Repräsentation + Transaktion.
    /// Rückgabe `true` = Server-Validierung erfolgreich → der Service ruft
    /// `transaction.finish()` auf; `false` = Transaktion bleibt unfinished.
    typealias TransactionUpdateHandler = @MainActor (_ jws: String, _ transaction: Transaction) async -> Bool

    /// Wird vom `PurchaseCoordinator` gesetzt.
    var onTransactionUpdate: TransactionUpdateHandler?

    /// Produkt-Cache (Produkt-ID → StoreKit-Produkt).
    /// `StoreKit.Product` explizit, da das App-Modell `Product` (Models.swift)
    /// den importierten Typ sonst verschattet.
    private var productCache: [String: StoreKit.Product] = [:]

    /// Verifizierte, aber noch nicht abgeschlossene Kauf-Transaktionen
    /// (JWS → Transaktion), bis der Server validiert hat.
    private var pendingTransactions: [String: Transaction] = [:]

    private var updatesTask: Task<Void, Never>?

    init() {
        // Listener früh starten, damit keine Transaktion verpasst wird
        // (Ask-to-Buy-Freigabe, Verlängerung, unfinished Retries).
        updatesTask = Task { [weak self] in
            for await verification in Transaction.updates {
                guard let self else { return }
                await self.handle(update: verification)
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    // MARK: - Produkte

    /// Lädt StoreKit-Produkte für die gegebenen IDs; bereits geladene
    /// Produkte kommen aus dem Cache. Unbekannte IDs werden ausgelassen.
    func products(ids: [String]) async throws -> [StoreKit.Product] {
        let missing = ids.filter { productCache[$0] == nil }
        if !missing.isEmpty {
            let loaded = try await StoreKit.Product.products(for: missing)
            for product in loaded {
                productCache[product.id] = product
            }
        }
        return ids.compactMap { productCache[$0] }
    }

    // MARK: - Kauf

    /// Führt den Kauf aus und liefert die **JWS-Repräsentation** der
    /// verifizierten Transaktion (für `POST /iap/validate`).
    ///
    /// Die Transaktion wird dabei **nicht** abgeschlossen — nach erfolgreicher
    /// Server-Validierung `finishTransaction(matching:)` aufrufen.
    ///
    /// - Throws: `StoreError.cancelled` bei `.userCancelled`,
    ///   `StoreError.pending` bei `.pending` (Ask to Buy),
    ///   `StoreError.unverified` wenn StoreKit die Signatur nicht bestätigt.
    func purchase(productId: String) async throws -> String {
        guard let product = try await products(ids: [productId]).first else {
            throw StoreError.productNotFound(productId)
        }

        let result = try await product.purchase()
        switch result {
        case .success(let verification):
            switch verification {
            case .verified(let transaction):
                let jws = verification.jwsRepresentation
                pendingTransactions[jws] = transaction
                return jws
            case .unverified:
                throw StoreError.unverified
            }
        case .userCancelled:
            throw StoreError.cancelled
        case .pending:
            throw StoreError.pending
        @unknown default:
            throw StoreError.unknown
        }
    }

    /// Schließt die zum JWS gehörende Kauf-Transaktion ab — **nur** nach
    /// erfolgreicher Server-Validierung aufrufen.
    func finishTransaction(matching jws: String) async {
        guard let transaction = pendingTransactions.removeValue(forKey: jws) else { return }
        await transaction.finish()
    }

    // MARK: - Restore

    /// JWS-Repräsentationen aller aktuell gültigen, verifizierten
    /// Entitlements (Abos; Konsumierbare tauchen hier nie auf).
    func currentEntitlementsJWS() async -> [String] {
        await currentEntitlements().map(\.jws)
    }

    /// Wie `currentEntitlementsJWS()`, zusätzlich mit Transaktion
    /// (z. B. für Produkt-ID-Zuordnung beim Restore).
    func currentEntitlements() async -> [(transaction: Transaction, jws: String)] {
        var entitlements: [(transaction: Transaction, jws: String)] = []
        for await verification in Transaction.currentEntitlements {
            guard case .verified(let transaction) = verification else { continue }
            entitlements.append((transaction, verification.jwsRepresentation))
        }
        return entitlements
    }

    /// Synchronisiert Transaktionen mit dem App Store (Restore-Button).
    /// Abbruch/Fehler wird ignoriert — die lokalen Entitlements gelten dann.
    func sync() async {
        try? await AppStore.sync()
    }

    // MARK: - Transaction.updates

    private func handle(update verification: VerificationResult<Transaction>) async {
        // Nur verifizierte Transaktionen akzeptieren.
        guard case .verified(let transaction) = verification else { return }

        // Rückerstattete/widerrufene Käufe: kein Grant — der Server erfährt
        // davon über App Store Server Notifications. Nur abschließen.
        if transaction.revocationDate != nil {
            await transaction.finish()
            return
        }

        guard let onTransactionUpdate else { return }
        if await onTransactionUpdate(verification.jwsRepresentation, transaction) {
            await transaction.finish()
        }
        // Bei fehlgeschlagener Server-Validierung NICHT finishen:
        // StoreKit liefert die Transaktion später erneut (Retry).
    }
}
