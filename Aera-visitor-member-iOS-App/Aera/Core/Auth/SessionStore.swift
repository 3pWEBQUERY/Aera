import Foundation
import Observation
import Security

/// Hält Token (Keychain) und den aktuellen Nutzer (UserDefaults-Cache
/// für schnellen Start, Refresh über `GET /auth/me` via `AppState.refreshSession()`).
@MainActor
@Observable
final class SessionStore {
    private(set) var token: String?
    private(set) var currentUser: User?

    var isLoggedIn: Bool { token != nil }

    private static let userDefaultsKey = "aera.currentUser"

    init() {
        token = KeychainStorage.readToken()
        if token != nil,
           let data = UserDefaults.standard.data(forKey: Self.userDefaultsKey) {
            currentUser = try? JSONDecoder().decode(User.self, from: data)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.userDefaultsKey)
        }
    }

    /// Setzt Session nach Login/Signup.
    func apply(token: String, user: User) {
        self.token = token
        KeychainStorage.save(token: token)
        update(user: user)
    }

    /// Ersetzt nur das Token (z. B. nach Passwortänderung — der Server
    /// invalidiert alte Sessions und liefert ein neues JWT).
    func apply(token: String) {
        self.token = token
        KeychainStorage.save(token: token)
    }

    /// Aktualisiert den gecachten Nutzer (Profil-Update, /auth/me-Refresh).
    func update(user: User) {
        currentUser = user
        if let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: Self.userDefaultsKey)
        }
    }

    /// Entfernt Token und gecachten Nutzer (Logout).
    func clear() {
        token = nil
        currentUser = nil
        KeychainStorage.deleteToken()
        UserDefaults.standard.removeObject(forKey: Self.userDefaultsKey)
    }
}

// MARK: - Keychain

private enum KeychainStorage {
    private static let service = "so.aera.app.session"
    private static let account = "auth-token"

    static func save(token: String) {
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let update: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = query
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    static func readToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func deleteToken() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
