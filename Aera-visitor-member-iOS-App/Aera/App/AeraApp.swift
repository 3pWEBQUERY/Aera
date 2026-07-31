import SwiftUI

@main
struct AeraApp: App {
    /// Der Delegate hält nur die erlaubten Bildschirmlagen fest (siehe
    /// `OrientationGate`): hochkant überall, quer allein im Live-Raum.
    @UIApplicationDelegateAdaptor(AeraAppDelegate.self) private var appDelegate
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
                .preferredColorScheme(.light)
                .tint(Theme.defaultBrand)
        }
    }
}
