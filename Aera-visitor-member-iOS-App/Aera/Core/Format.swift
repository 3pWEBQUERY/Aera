import Foundation

// MARK: - Formatierungs-Helper

enum Format {
    /// Cents + lowercase-ISO-Währung → lokalisierter Preis, z. B. `"4,99 €"`.
    static func price(cents: Int, currency: String) -> String {
        let amount = Decimal(cents) / Decimal(100)
        return amount.formatted(.currency(code: currency.uppercased()))
    }

    /// Kompakte Zahl für Mitglieder-/Like-Zähler, z. B. `"1,2 Tsd."`.
    static func compactCount(_ value: Int) -> String {
        value.formatted(.number.notation(.compactName).precision(.fractionLength(0...1)))
    }

    /// Dauer als `m:ss` bzw. `h:mm:ss`.
    static func duration(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let total = Int(seconds.rounded())
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }

    /// Dauer aus Sekunden (Int), z. B. `Lesson.durationSec`.
    static func duration(seconds: Int) -> String {
        duration(Double(seconds))
    }
}

// MARK: - Relative Daten

extension Date {
    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter
    }()

    /// „vor 2 Std.", „in 3 Tagen"; unter einer Minute „gerade eben".
    var relativeLabel: String {
        if abs(Date.now.timeIntervalSince(self)) < 60 {
            return String(localized: "gerade eben")
        }
        return Self.relativeFormatter.localizedString(for: self, relativeTo: .now)
    }
}

// MARK: - Tier-Intervalle

extension TierInterval {
    /// Suffix hinter dem Preis („/Monat"); `nil` für FREE.
    var priceSuffix: String? {
        switch self {
        case .free: nil
        case .month: String(localized: "/Monat")
        case .year: String(localized: "/Jahr")
        case .oneTime: String(localized: "einmalig")
        }
    }

    var displayLabel: String {
        switch self {
        case .free: String(localized: "Kostenlos")
        case .month: String(localized: "Monatlich")
        case .year: String(localized: "Jährlich")
        case .oneTime: String(localized: "Einmalig")
        }
    }
}
