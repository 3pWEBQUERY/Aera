import SwiftUI
import UIKit

// MARK: - Color-Helper

extension Color {
    /// Parst `#RRGGBB`, `RRGGBB` oder `#RGB`; `nil` bei ungültigem Wert.
    init?(validatingHex hex: String) {
        var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") {
            value.removeFirst()
        }
        if value.count == 3 {
            value = value.map { "\($0)\($0)" }.joined()
        }
        guard value.count == 6, let rgb = UInt64(value, radix: 16) else {
            return nil
        }
        self.init(
            .sRGB,
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255,
            opacity: 1
        )
    }

    /// Wie `init(validatingHex:)`, fällt bei ungültigem Wert auf Schwarz zurück.
    /// Für statische, geprüfte Token-Werte gedacht.
    init(hex: String) {
        self = Color(validatingHex: hex) ?? Color(.sRGB, red: 0, green: 0, blue: 0, opacity: 1)
    }

    /// Mischt die Farbe mit `other`; `amount` = Anteil von `other` (0…1).
    func mixed(with other: Color, amount: Double) -> Color {
        let t = min(max(amount, 0), 1)
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        guard UIColor(self).getRed(&r1, green: &g1, blue: &b1, alpha: &a1),
              UIColor(other).getRed(&r2, green: &g2, blue: &b2, alpha: &a2) else {
            return self
        }
        return Color(
            .sRGB,
            red: Double(r1 + (r2 - r1) * t),
            green: Double(g1 + (g2 - g1) * t),
            blue: Double(b1 + (b2 - b1) * t),
            opacity: Double(a1 + (a2 - a1) * t)
        )
    }
}

// MARK: - Theme-Tokens (DESIGN.md §1)

enum Theme {
    /// App-/Screen-Hintergrund (alle Community-Screens).
    static let paper = Color(hex: "#F4F1EA")
    /// Primärtext; Abstufungen via `.opacity(0.8/0.7/0.55/0.5/0.45)`.
    static let ink = Color(hex: "#161613")
    /// Karten.
    static let card = Color(hex: "#FFFFFF")
    /// Dunkle Kontrastflächen (Upsell-Banner, Podium).
    static let rail = Color(hex: "#0F0F0D")
    /// Hairlines/Karten-Border.
    static let border = ink.opacity(0.10)
    /// Chips, Hover-Flächen.
    static let softFill = ink.opacity(0.05)
    /// Fallback-Brand (Aera-Violett).
    static let defaultBrand = Color(hex: "#6D28D9")
    /// Fallback-Akzent.
    static let defaultAccent = Color(hex: "#EC4899")
    /// Destruktiv.
    static let danger = Color(hex: "#DC2626")
    /// Hinweise (amber-50/200/800).
    static let amber50 = Color(hex: "#FFFBEB")
    static let amber200 = Color(hex: "#FDE68A")
    static let amber800 = Color(hex: "#92400E")
}

// MARK: - BrandTheme (Tenant-Branding)

/// Tenant-Branding, abgeleitet wie im Web:
/// `soft` = Brand @ 12 % auf Weiß gemischt, `hover` = Brand @ 85 % auf Schwarz.
struct BrandTheme: Hashable, Sendable {
    let color: Color
    let accent: Color
    let soft: Color
    let hover: Color

    init(color: Color, accent: Color) {
        self.color = color
        self.accent = accent
        self.soft = Color.white.mixed(with: color, amount: 0.12)
        self.hover = Color.black.mixed(with: color, amount: 0.85)
    }

    /// Init aus Hex-Strings (`primaryColor`/`accentColor` der Community);
    /// ungültige Werte fallen auf die Aera-Defaults zurück.
    init(primaryHex: String?, accentHex: String?) {
        let primary = primaryHex.flatMap { Color(validatingHex: $0) } ?? Theme.defaultBrand
        let accent = accentHex.flatMap { Color(validatingHex: $0) } ?? Theme.defaultAccent
        self.init(color: primary, accent: accent)
    }

    /// Aera-Default-Branding.
    static let aera = BrandTheme(color: Theme.defaultBrand, accent: Theme.defaultAccent)
}

extension EnvironmentValues {
    @Entry var brand: BrandTheme = .aera
}

extension View {
    /// Setzt das Tenant-Branding für den gesamten Teilbaum
    /// (Environment `\.brand` + `.tint`, färbt native Controls und Glass-Interaktionen).
    func brandTheme(_ theme: BrandTheme) -> some View {
        environment(\.brand, theme)
            .tint(theme.color)
    }
}

// MARK: - Typografie (DESIGN.md §2)

extension Font {
    /// Display-Serif (New York): Hero 34, Detail-Titel 26, Section 22, Post-Titel 20.
    /// Bei großen Titeln zusätzlich `.kerning(-0.4)`.
    static func displaySerif(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }
}

private struct EyebrowStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: 11, weight: .semibold))
            .textCase(.uppercase)
            .kerning(1.6)
            .foregroundStyle(Theme.ink.opacity(0.55))
    }
}

extension View {
    /// Eyebrow-Label: 11 pt semibold, uppercase, Kerning 1.6, `ink @ 0.55`.
    func eyebrowStyle() -> some View {
        modifier(EyebrowStyle())
    }
}
