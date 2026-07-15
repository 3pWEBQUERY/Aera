import SwiftUI

/// Gated-Screen für nicht zugängliche Spaces (403 `not_member` /
/// `payment_required`): großes Schloss in Glass-Kreis auf Brand-Fläche,
/// Space-Name in Serif und ein kontextabhängiger Call-to-Action.
///
/// - Nicht Mitglied → „Werde Mitglied, um … zu sehen" + Beitreten-Button.
/// - Mitglied, aber PAID-gated → Hinweis auf zahlende Mitgliedschaften
///   + „Stufe ansehen"-Button.
///
/// Beide Buttons öffnen `JoinView` als Sheet; nach Beitritt/Kauf/Restore
/// wird `onChanged` aufgerufen (Aufrufer lädt den Space neu).
struct SpacePaywallView: View {
    let slug: String
    let space: SpaceSummary
    let viewer: Viewer
    let onChanged: () async -> Void

    @Environment(\.brand) private var brand
    @State private var showJoin = false

    var body: some View {
        VStack(spacing: 24) {
            lockHero

            VStack(spacing: 10) {
                EyebrowLabel("Gesperrter Bereich")
                Text(space.name)
                    .font(.displaySerif(26))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)
                    .multilineTextAlignment(.center)
                Text(message)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.ink.opacity(0.6))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8)
            }

            Button(buttonTitle) {
                showJoin = true
            }
            .buttonStyle(.brand)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 20)
        .padding(.vertical, 28)
        .sheet(isPresented: $showJoin) {
            JoinView(slug: slug, onJoined: onChanged)
        }
    }

    // MARK: - Hero

    private var lockHero: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [brand.color, brand.color.mixed(with: .black, amount: 0.25)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            // Dezente Akzent-Fläche wie im Web-Hero.
            Circle()
                .fill(brand.accent.opacity(0.35))
                .frame(width: 180, height: 180)
                .blur(radius: 60)
                .offset(x: 90, y: -50)

            Image(systemName: "lock.fill")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 84, height: 84)
                .glassEffect(.regular, in: .circle)
        }
        .frame(height: 200)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    // MARK: - Texte

    /// Mitglied, aber der Space ist zahlenden Mitgliedschaften vorbehalten.
    private var isPaidGate: Bool {
        viewer.isMember && space.visibility == .paid && !viewer.hasPaidEntitlement
    }

    private var message: String {
        if isPaidGate {
            String(localized: "Dieser Bereich ist zahlenden Mitgliedschaften vorbehalten.")
        } else {
            String(localized: "Werde Mitglied, um \(space.name) zu sehen.")
        }
    }

    private var buttonTitle: LocalizedStringKey {
        isPaidGate ? "Stufe ansehen" : "Beitreten"
    }
}
