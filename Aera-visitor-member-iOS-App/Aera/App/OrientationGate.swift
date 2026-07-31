import SwiftUI
import UIKit

/// App-Delegate — hält nur die erlaubten Bildschirmlagen.
///
/// Die App ist eine Hochkant-App: Listen, Karten und Composer sind darauf
/// gebaut. Genau eine Ansicht darf mitdrehen, der Live-Raum — ein Stream im
/// Querformat ist der Grund, warum man das Telefon dreht.
final class AeraAppDelegate: NSObject, UIApplicationDelegate {
    /// Wird ausschließlich über `OrientationGate` gesetzt.
    nonisolated(unsafe) static var supported: UIInterfaceOrientationMask = .portrait

    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        Self.supported
    }
}

/// Schaltet das Querformat für eine einzelne Ansicht frei.
@MainActor
enum OrientationGate {
    static func allowLandscape(_ allow: Bool) {
        let mask: UIInterfaceOrientationMask = allow ? .allButUpsideDown : .portrait
        AeraAppDelegate.supported = mask

        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive })
        else { return }

        scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask))
        // Ohne diesen Anstoß bleibt eine bereits gedrehte Ansicht quer stehen,
        // wenn man sie verlässt.
        scene.keyWindow?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
    }
}

extension View {
    /// Erlaubt Querformat, solange diese Ansicht sichtbar ist.
    func allowsLandscape() -> some View {
        onAppear { OrientationGate.allowLandscape(true) }
            .onDisappear { OrientationGate.allowLandscape(false) }
    }
}
