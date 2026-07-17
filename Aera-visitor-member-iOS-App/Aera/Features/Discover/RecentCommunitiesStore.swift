import Foundation

/// Lokale „Zuletzt besucht"-Liste: bis zu 10 Community-Slugs in UserDefaults,
/// zuletzt besuchte zuerst. Die Entdecken-Seite hydriert die Slugs über
/// `GET /communities/cards`.
enum RecentCommunitiesStore {
    static let defaultsKey = "aera.recentCommunities"
    private static let maxCount = 10

    /// Merkt sich einen Besuch: Slug nach vorn, Duplikate raus, max. 10.
    static func record(slug: String) {
        let trimmed = slug.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var current = slugs()
        current.removeAll { $0 == trimmed }
        current.insert(trimmed, at: 0)
        UserDefaults.standard.set(Array(current.prefix(maxCount)), forKey: defaultsKey)
    }

    /// Gespeicherte Slugs, zuletzt besuchte zuerst.
    static func slugs() -> [String] {
        UserDefaults.standard.stringArray(forKey: defaultsKey) ?? []
    }
}
