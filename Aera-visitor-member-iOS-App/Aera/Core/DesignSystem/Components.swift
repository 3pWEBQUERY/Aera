import SwiftUI

// MARK: - AeraCard

/// Weiße Karte: Radius 12/16, Hairline-Border, weicher Schatten, Padding 20.
struct AeraCard<Content: View>: View {
    var padding: CGFloat
    var cornerRadius: CGFloat
    private let content: Content

    init(padding: CGFloat = 20,
         cornerRadius: CGFloat = 12,
         @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card, in: shape)
            .overlay(shape.strokeBorder(Theme.border, lineWidth: 1))
            .shadow(color: .black.opacity(0.05), radius: 8, y: 2)
    }
}

// MARK: - AvatarView

/// Abgerundetes Quadrat (nie Kreis!), Corner-Radius = `size * 0.27`,
/// Ring `black @ 0.05`. Fallback: Initialen in `brand.color` auf `brand.soft`.
struct AvatarView: View {
    let url: String?
    let name: String
    var size: CGFloat = 36

    @Environment(\.brand) private var brand

    init(url: String?, name: String, size: CGFloat = 36) {
        self.url = url
        self.name = name
        self.size = size
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size * 0.27, style: .continuous)
        Group {
            if let url, let imageURL = URL(string: url) {
                AsyncImage(url: imageURL) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        initialsFallback
                    }
                }
            } else {
                initialsFallback
            }
        }
        .frame(width: size, height: size)
        .clipShape(shape)
        .overlay(shape.strokeBorder(.black.opacity(0.05), lineWidth: 1))
    }

    private var initialsFallback: some View {
        ZStack {
            brand.soft
            Text(initials)
                .font(.system(size: size * 0.38, weight: .semibold))
                .foregroundStyle(brand.color)
        }
    }

    private var initials: String {
        let letters = name
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
        return letters.isEmpty ? "?" : letters
    }
}

// MARK: - Button-Styles

/// Primär: Kapsel, Fill `brand.color`, weiß; gedrückt → `brand.hover`.
struct BrandButtonStyle: ButtonStyle {
    var fullWidth: Bool = false

    @Environment(\.brand) private var brand

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(configuration.isPressed ? brand.hover : brand.color, in: .capsule)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.snappy(duration: 0.25), value: configuration.isPressed)
    }
}

/// Sekundär: weiß + Hairline; gedrückt → `softFill`.
struct SecondaryButtonStyle: ButtonStyle {
    var fullWidth: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(configuration.isPressed ? Theme.softFill : Theme.card, in: .capsule)
            .overlay(Capsule().strokeBorder(Theme.border, lineWidth: 1))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.snappy(duration: 0.25), value: configuration.isPressed)
    }
}

/// Ghost: nur Text `ink @ 0.6`.
struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(Theme.ink.opacity(configuration.isPressed ? 0.35 : 0.6))
            .animation(.snappy(duration: 0.25), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == BrandButtonStyle {
    static var brand: BrandButtonStyle { BrandButtonStyle() }
    static func brand(fullWidth: Bool) -> BrandButtonStyle { BrandButtonStyle(fullWidth: fullWidth) }
}

extension ButtonStyle where Self == SecondaryButtonStyle {
    static var secondary: SecondaryButtonStyle { SecondaryButtonStyle() }
    static func secondary(fullWidth: Bool) -> SecondaryButtonStyle { SecondaryButtonStyle(fullWidth: fullWidth) }
}

extension ButtonStyle where Self == GhostButtonStyle {
    static var ghost: GhostButtonStyle { GhostButtonStyle() }
}

// MARK: - PillLabel & EyebrowLabel

/// Kapsel-Pill: `softFill`, 12 pt medium; `prominent` → Brand-Chip
/// (`brand.soft` + `brand.color` semibold, für Punkte/Level).
struct PillLabel: View {
    let text: String
    var systemImage: String?
    var prominent: Bool

    @Environment(\.brand) private var brand

    init(_ text: String, systemImage: String? = nil, prominent: Bool = false) {
        self.text = text
        self.systemImage = systemImage
        self.prominent = prominent
    }

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 11, weight: .medium))
            }
            Text(text)
                .font(.system(size: 12, weight: prominent ? .semibold : .medium))
                .monospacedDigit()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .foregroundStyle(prominent ? brand.color : Theme.ink.opacity(0.7))
        .background(prominent ? brand.soft : Theme.softFill, in: .capsule)
    }
}

/// Eyebrow-Überschrift (11 pt, uppercase, Kerning 1.6).
struct EyebrowLabel: View {
    let text: LocalizedStringKey

    init(_ text: LocalizedStringKey) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .eyebrowStyle()
    }
}

// MARK: - SectionHeader

/// Serif-Section-Header (22 pt) mit optionalem Trailing-Inhalt.
struct SectionHeader<Trailing: View>: View {
    let title: LocalizedStringKey
    private let trailing: Trailing

    init(_ title: LocalizedStringKey, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.displaySerif(22))
                .kerning(-0.4)
                .foregroundStyle(Theme.ink)
            Spacer()
            trailing
        }
    }
}

extension SectionHeader where Trailing == EmptyView {
    init(_ title: LocalizedStringKey) {
        self.init(title) { EmptyView() }
    }
}

// MARK: - EmptyStateView

/// Leerer Zustand: gestrichelte Border, Brand-Icon-Badge, Serif-Titel.
struct EmptyStateView: View {
    let icon: String
    let title: LocalizedStringKey
    let message: LocalizedStringKey

    @Environment(\.brand) private var brand

    init(icon: String, title: LocalizedStringKey, message: LocalizedStringKey) {
        self.icon = icon
        self.title = title
        self.message = message
    }

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(brand.color)
                .frame(width: 52, height: 52)
                .background(brand.soft, in: .circle)
            Text(title)
                .font(.displaySerif(20))
                .foregroundStyle(Theme.ink)
            Text(message)
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink.opacity(0.6))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.vertical, 40)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Theme.ink.opacity(0.15), style: StrokeStyle(lineWidth: 1, dash: [6, 5]))
        }
    }
}

// MARK: - PriceText

/// Formatierter Preis (28 pt bold, tight, monospacedDigit) mit optionalem
/// Intervall-Suffix („/Monat"). FREE → „Kostenlos".
struct PriceText: View {
    let cents: Int
    let currency: String
    var interval: TierInterval?
    var size: CGFloat

    init(cents: Int, currency: String, interval: TierInterval? = nil, size: CGFloat = 28) {
        self.cents = cents
        self.currency = currency
        self.interval = interval
        self.size = size
    }

    var body: some View {
        if interval == .free {
            Text("Kostenlos")
                .font(.system(size: size, weight: .bold))
                .kerning(-0.5)
                .foregroundStyle(Theme.ink)
        } else {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(Format.price(cents: cents, currency: currency))
                    .font(.system(size: size, weight: .bold))
                    .monospacedDigit()
                    .kerning(-0.5)
                    .foregroundStyle(Theme.ink)
                if let suffix = interval?.priceSuffix {
                    Text(suffix)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink.opacity(0.5))
                }
            }
        }
    }
}

// MARK: - LevelChip & RoleBadge

/// Brand-Chip für Level/Punkte.
struct LevelChip: View {
    let levelName: String
    var points: Int?

    @Environment(\.brand) private var brand

    init(levelName: String, points: Int? = nil) {
        self.levelName = levelName
        self.points = points
    }

    var body: some View {
        HStack(spacing: 5) {
            Text(levelName)
                .font(.system(size: 12, weight: .semibold))
            if let points {
                Text(Format.compactCount(points))
                    .font(.system(size: 12, weight: .semibold))
                    .monospacedDigit()
                    .opacity(0.75)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .foregroundStyle(brand.color)
        .background(brand.soft, in: .capsule)
    }
}

/// Rollen-Badge für OWNER/ADMIN/MODERATOR; für MEMBER wird nichts gerendert.
struct RoleBadge: View {
    let role: Role

    @Environment(\.brand) private var brand

    var body: some View {
        if let label {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .textCase(.uppercase)
                .kerning(0.8)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .foregroundStyle(role == .owner ? brand.color : Theme.ink.opacity(0.65))
                .background(role == .owner ? brand.soft : Theme.softFill, in: .capsule)
        }
    }

    private var label: String? {
        switch role {
        case .owner: String(localized: "Inhaber")
        case .admin: String(localized: "Admin")
        case .moderator: String(localized: "Moderator")
        case .member: nil
        }
    }
}

// MARK: - AsyncImageView

/// AsyncImage mit Paper-Placeholder (ProgressView) und Foto-Fallback.
/// Bei `contentMode == .fill` muss der Aufrufer clippen (`.clipShape`/`.clipped`).
struct AsyncImageView: View {
    let url: String?
    var contentMode: ContentMode = .fill

    init(url: String?, contentMode: ContentMode = .fill) {
        self.url = url
        self.contentMode = contentMode
    }

    var body: some View {
        if let url, let imageURL = URL(string: url) {
            AsyncImage(url: imageURL) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: contentMode)
                case .failure:
                    fallback
                default:
                    ZStack {
                        Theme.paper
                        ProgressView()
                    }
                }
            }
        } else {
            fallback
        }
    }

    private var fallback: some View {
        ZStack {
            Theme.paper
            Image(systemName: "photo")
                .font(.system(size: 22))
                .foregroundStyle(Theme.ink.opacity(0.2))
        }
    }
}

// MARK: - LockedOverlay

/// Paywall-Overlay für gesperrte Inhalte: `ultraThinMaterial` + Brand-Tint,
/// Glass-Lock-Kreis, darunter weißer Kapsel-Button „Freischalten ab X".
/// Ohne `appleProductId` (z. B. PHYSICAL) wird nur ein Hinweis gezeigt.
/// Als `.overlay` über dem Teaser/Cover verwenden.
struct LockedOverlay: View {
    let unlock: Unlock
    var onUnlock: (Unlock) -> Void

    @Environment(\.brand) private var brand

    init(unlock: Unlock, onUnlock: @escaping (Unlock) -> Void) {
        self.unlock = unlock
        self.onUnlock = onUnlock
    }

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.ultraThinMaterial)
            brand.color.opacity(0.25)
            VStack(spacing: 14) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 54, height: 54)
                    .glassEffect(.regular, in: .circle)
                if unlock.appleProductId != nil {
                    Button {
                        onUnlock(unlock)
                    } label: {
                        Text("Freischalten ab \(Format.price(cents: unlock.priceCents, currency: unlock.currency))")
                            .font(.system(size: 14, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(Theme.ink)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 10)
                            .background(.white, in: .capsule)
                    }
                    .buttonStyle(.plain)
                } else {
                    Text("Auf der Website verfügbar")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .glassEffect(.regular)
                }
            }
            .padding(16)
        }
    }
}
