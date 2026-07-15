import Foundation
import Observation

/// Zentraler App-Zustand: Session und API-Client.
///
/// Wird in `AeraApp` erzeugt und über `.environment(appState)` injiziert.
/// Zugriff in Views:
/// ```swift
/// @Environment(AppState.self) private var appState
/// ```
@MainActor
@Observable
final class AppState {
    let session: SessionStore
    let api: APIClient
    let purchases: PurchaseCoordinator

    init() {
        let session = SessionStore()
        self.session = session
        self.api = APIClient(sessionStore: session)
        self.purchases = PurchaseCoordinator(api: api)
    }

    /// Meldet den Nutzer lokal ab (Token und gecachter Nutzer werden entfernt).
    func logout() {
        session.clear()
    }

    /// Aktualisiert den gecachten Nutzer über `GET /auth/me`.
    /// Bei ungültiger Session (401) wird lokal abgemeldet;
    /// bei Netzwerkfehlern bleibt der gecachte Nutzer erhalten.
    func refreshSession() async {
        guard session.isLoggedIn else { return }
        do {
            let response = try await api.me()
            session.update(user: response.user)
        } catch let error as APIError where error.status == 401 {
            session.clear()
        } catch {
            // Netzwerk-/Serverfehler: gecachten Nutzer behalten.
        }
    }
}
