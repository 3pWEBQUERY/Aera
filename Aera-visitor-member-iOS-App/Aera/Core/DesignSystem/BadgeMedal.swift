import SwiftUI

/// Gezeichnete Plakette einer Auszeichnung.
///
/// Es gibt bewusst keine Bilddatei: Form, Metallton und Symbol kommen als
/// drei Werte mit und werden hier gezeichnet — so bleibt jede Plakette
/// scharf, färbt sich mit der Community ein und kostet keinen Upload
/// (`lib/badges.ts`, `components/community/badge-medal.tsx`).
struct BadgeMedal: View {
    let badge: Badge
    var size: CGFloat = 34

    @Environment(\.brand) private var brand

    var body: some View {
        ZStack {
            shape
                .fill(
                    LinearGradient(
                        colors: [colors.light, colors.base, colors.dark],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay {
                    shape.strokeBorder(colors.rim.opacity(0.7), lineWidth: max(1, size * 0.045))
                }

            Image(systemName: symbolName)
                .font(.system(size: size * 0.42, weight: .semibold))
                .foregroundStyle(colors.ink)
        }
        .frame(width: size, height: size)
        .shadow(color: .black.opacity(0.12), radius: 3, y: 1)
        .accessibilityLabel(Text(badge.name))
    }

    // MARK: - Form

    private var shape: BadgePlaqueShape { BadgePlaqueShape(kind: badge.shape) }

    // MARK: - Metalltöne

    private struct Palette {
        let light: Color
        let base: Color
        let dark: Color
        let rim: Color
        let ink: Color
    }

    private var colors: Palette {
        switch badge.tier {
        case .gold:
            Palette(light: Color(hex: "#FFE9A8"), base: Color(hex: "#F5C13A"),
                    dark: Color(hex: "#C98A05"), rim: Color(hex: "#FFF6D8"),
                    ink: Color(hex: "#6B4A00"))
        case .silver:
            Palette(light: Color(hex: "#F2F5F8"), base: Color(hex: "#C3CBD4"),
                    dark: Color(hex: "#8B96A3"), rim: .white,
                    ink: Color(hex: "#41505F"))
        case .bronze:
            Palette(light: Color(hex: "#F6D3BC"), base: Color(hex: "#D89A72"),
                    dark: Color(hex: "#A76846"), rim: Color(hex: "#FBE7DA"),
                    ink: Color(hex: "#6B3B22"))
        case .brand:
            // BRAND übernimmt die Farbe der Community — dieselbe Regel wie im Web.
            Palette(light: brand.soft, base: brand.color, dark: brand.hover,
                    rim: .white, ink: .white)
        case .ink:
            Palette(light: Color(hex: "#5B5B57"), base: Color(hex: "#2B2B28"),
                    dark: Color(hex: "#131311"), rim: Color(hex: "#7A7A74"),
                    ink: .white)
        }
    }

    /// Web-Symbolname → SF Symbol.
    private var symbolName: String {
        switch badge.icon {
        case "trophy": "trophy.fill"
        case "medal": "medal.fill"
        case "crown": "crown.fill"
        case "sparkles": "sparkles"
        case "heart": "heart.fill"
        case "forum": "bubble.left.and.bubble.right.fill"
        case "feed": "square.text.square.fill"
        case "courses": "graduationcap.fill"
        case "members": "person.2.fill"
        case "bolt": "bolt.fill"
        case "check": "checkmark"
        case "music": "music.note"
        default: "star.fill"
        }
    }
}

/// Die vier Formen in einer Figur — eine Plakette ist immer genau eine davon,
/// und ein einziger Typ hält die Ränder (`strokeBorder`) sauber.
private struct BadgePlaqueShape: InsettableShape {
    let kind: Badge.Shape
    var inset: CGFloat = 0

    func path(in rect: CGRect) -> Path {
        let r = rect.insetBy(dx: inset, dy: inset)
        switch kind {
        case .coin:
            return Path(ellipseIn: r)
        case .medal:
            return Path(roundedRect: r, cornerRadius: r.width * 0.3, style: .continuous)
        case .seal:
            return Path(roundedRect: r, cornerRadius: r.width * 0.42, style: .continuous)
        case .hex:
            var path = Path()
            let center = CGPoint(x: r.midX, y: r.midY)
            let radius = min(r.width, r.height) / 2
            for corner in 0..<6 {
                let angle = CGFloat(corner) * .pi / 3 - .pi / 2
                let point = CGPoint(x: center.x + radius * cos(angle),
                                    y: center.y + radius * sin(angle))
                if corner == 0 {
                    path.move(to: point)
                } else {
                    path.addLine(to: point)
                }
            }
            path.closeSubpath()
            return path
        }
    }

    func inset(by amount: CGFloat) -> BadgePlaqueShape {
        var copy = self
        copy.inset += amount
        return copy
    }
}

/// Reihe der Auszeichnungen eines Mitglieds. Tippen zeigt Name und
/// Beschreibung — die Plakette allein sagt nicht, wofür sie steht.
struct BadgeRow: View {
    let badges: [Badge]
    var size: CGFloat = 26
    var limit: Int = 6

    @State private var selected: Badge?

    var body: some View {
        if !badges.isEmpty {
            HStack(spacing: 6) {
                ForEach(Array(badges.prefix(limit))) { badge in
                    Button {
                        selected = badge
                    } label: {
                        BadgeMedal(badge: badge, size: size)
                    }
                    .buttonStyle(.plain)
                }

                if badges.count > limit {
                    Text("+\(badges.count - limit)")
                        .font(.system(size: 11, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink.opacity(0.45))
                }
            }
            .popover(item: $selected) { badge in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        BadgeMedal(badge: badge, size: 40)
                        Text(badge.name)
                            .font(.displaySerif(18))
                            .foregroundStyle(Theme.ink)
                    }
                    if let description = badge.description, !description.isEmpty {
                        Text(description)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink.opacity(0.65))
                    }
                }
                .padding(16)
                .frame(maxWidth: 260)
                .presentationCompactAdaptation(.popover)
            }
        }
    }
}
