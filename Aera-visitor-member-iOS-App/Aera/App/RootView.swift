import SwiftUI
import UIKit

/// Root-TabView (systemseitiges Liquid Glass).
///
/// Kein Auth-Gate: Die App ist für Besucher ohne Login nutzbar,
/// Login wird von den Features als Sheet ausgelöst.
///
/// Der „Konto"-Tab zeigt bei angemeldeten Nutzern das Profilbild —
/// wie im Web als **abgerundetes Quadrat** (Radius ≈ 27 %), nicht rund.
struct RootView: View {
    @Environment(AppState.self) private var appState

    @State private var avatarIcon: UIImage?

    var body: some View {
        TabView {
            Tab("Entdecken", systemImage: "sparkles") {
                DiscoverView()
            }
            Tab("Communities", systemImage: "person.2") {
                MyCommunitiesView()
            }
            Tab("Chat", systemImage: "message") {
                ChatTabView()
            }
            Tab {
                AccountView()
            } label: {
                if let avatarIcon {
                    Label {
                        Text("Konto")
                    } icon: {
                        Image(uiImage: avatarIcon)
                    }
                } else {
                    Label("Konto", systemImage: "person.crop.circle")
                }
            }
        }
        .task {
            await appState.refreshSession()
        }
        .task(id: avatarKey) {
            await loadAvatarIcon()
        }
    }

    /// Neu laden, sobald sich Login-Status oder Avatar-URL ändern.
    private var avatarKey: String {
        guard appState.session.isLoggedIn else { return "" }
        return appState.session.currentUser?.avatarUrl ?? ""
    }

    // MARK: - Avatar-Tab-Icon

    private func loadAvatarIcon() async {
        guard appState.session.isLoggedIn,
              let url = AppConfig.mediaURL(appState.session.currentUser?.avatarUrl) else {
            avatarIcon = nil
            return
        }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let image = UIImage(data: data) else {
                avatarIcon = nil
                return
            }
            avatarIcon = Self.roundedTabIcon(from: image)
        } catch {
            // Netzwerkfehler → System-Icon als Fallback behalten.
            avatarIcon = nil
        }
    }

    /// Rendert das Profilbild als Tab-Icon: aspect-fill in ein abgerundetes
    /// Quadrat (Corner-Radius = 27 % der Kantenlänge, wie `AvatarView`/Web),
    /// `.alwaysOriginal` damit die Tab-Bar es nicht als Template einfärbt.
    private static func roundedTabIcon(from source: UIImage, pointSize: CGFloat = 26) -> UIImage {
        let size = CGSize(width: pointSize, height: pointSize)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 3
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let icon = renderer.image { _ in
            let rect = CGRect(origin: .zero, size: size)
            UIBezierPath(roundedRect: rect, cornerRadius: pointSize * 0.27).addClip()

            guard source.size.width > 0, source.size.height > 0 else { return }
            let aspect = max(size.width / source.size.width, size.height / source.size.height)
            let drawSize = CGSize(width: source.size.width * aspect,
                                  height: source.size.height * aspect)
            let origin = CGPoint(x: (size.width - drawSize.width) / 2,
                                 y: (size.height - drawSize.height) / 2)
            source.draw(in: CGRect(origin: origin, size: drawSize))
        }
        return icon.withRenderingMode(.alwaysOriginal)
    }
}
