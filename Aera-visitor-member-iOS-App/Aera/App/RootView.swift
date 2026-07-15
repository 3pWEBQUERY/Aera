import SwiftUI

/// Root-TabView (systemseitiges Liquid Glass).
///
/// Kein Auth-Gate: Die App ist für Besucher ohne Login nutzbar,
/// Login wird von den Features als Sheet ausgelöst.
struct RootView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        TabView {
            Tab("Entdecken", systemImage: "sparkles") {
                DiscoverView()
            }
            Tab("Communities", systemImage: "person.2") {
                MyCommunitiesView()
            }
            Tab("Konto", systemImage: "person.crop.circle") {
                AccountView()
            }
        }
        .task {
            await appState.refreshSession()
        }
    }
}
