import SwiftUI
import PhotosUI

/// Konto-Tab: Profil (Avatar-Upload via PhotosPicker), Mitgliedschaften
/// (inkl. Abo-Verwaltung), Bestellungen, Einstellungen (Name, Passwort,
/// Debug-Basis-URL) und Abmelden. Ohne Login: Hero mit Anmelde-Einstieg.
struct AccountView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand
    @Environment(\.openURL) private var openURL

    @State private var memberships: [MembershipHome] = []
    @State private var orders: [Order] = []
    @State private var isLoaded = false

    @State private var showLogin = false
    @State private var avatarPickerItem: PhotosPickerItem?
    @State private var isUploadingAvatar = false

    @State private var showNameAlert = false
    @State private var nameDraft = ""
    @State private var showPasswordSheet = false
    @State private var cancelTarget: MembershipHome?
    @State private var showLogoutConfirmation = false

    @State private var errorMessage: String?
    @State private var infoMessage: String?
    @State private var successCount = 0

    #if DEBUG
    @AppStorage(AppConfig.baseURLDefaultsKey) private var baseURLOverride = ""
    #endif

    private static let appleSubscriptionsURL = URL(string: "https://apps.apple.com/account/subscriptions")

    var body: some View {
        NavigationStack {
            Group {
                if appState.session.isLoggedIn {
                    loggedInContent
                } else {
                    loggedOutContent
                }
            }
            .background(Theme.paper.ignoresSafeArea())
            .scrollEdgeEffectStyle(.soft, for: .top)
            .navigationTitle("Konto")
        }
        .sensoryFeedback(.success, trigger: successCount)
        .sheet(isPresented: $showLogin) {
            LoginSheetView()
        }
        .sheet(isPresented: $showPasswordSheet) {
            ChangePasswordSheet()
        }
        .alert("Name ändern", isPresented: $showNameAlert) {
            TextField("Name", text: $nameDraft)
            Button("Speichern") { saveName() }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Wie sollen andere Mitglieder dich sehen?")
        }
        .alert("Fehler", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
        .alert("Hinweis", isPresented: Binding(
            get: { infoMessage != nil },
            set: { if !$0 { infoMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(infoMessage ?? "")
        }
        .confirmationDialog(
            "Mitgliedschaft kündigen?",
            isPresented: Binding(
                get: { cancelTarget != nil },
                set: { if !$0 { cancelTarget = nil } }
            ),
            titleVisibility: .visible,
            presenting: cancelTarget
        ) { membership in
            Button("Mitgliedschaft kündigen", role: .destructive) {
                cancelMembership(membership)
            }
            Button("Abbrechen", role: .cancel) {}
        } message: { membership in
            Text("Deine Mitgliedschaft bei \(membership.community.name) wird zum Ende der Laufzeit beendet.")
        }
        .confirmationDialog(
            "Wirklich abmelden?",
            isPresented: $showLogoutConfirmation,
            titleVisibility: .visible
        ) {
            Button("Abmelden", role: .destructive) {
                appState.logout()
                memberships = []
                orders = []
                isLoaded = false
            }
            Button("Abbrechen", role: .cancel) {}
        }
        .task(id: appState.session.isLoggedIn) {
            await load()
        }
        .onChange(of: avatarPickerItem) { _, item in
            guard let item else { return }
            Task { await uploadAvatar(item) }
        }
    }

    // MARK: - Nicht eingeloggt

    private var loggedOutContent: some View {
        ScrollView {
            VStack(spacing: 16) {
                Image(systemName: "person.crop.circle")
                    .font(.system(size: 30, weight: .medium))
                    .foregroundStyle(brand.color)
                    .frame(width: 72, height: 72)
                    .background(brand.soft, in: .circle)
                    .padding(.top, 48)

                Text("Bei Aera anmelden")
                    .font(.displaySerif(28))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)

                Text("Melde dich an, um deine Mitgliedschaften, Käufe und dein Profil zu verwalten.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.ink.opacity(0.6))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                VStack(spacing: 10) {
                    Button("Anmelden") {
                        showLogin = true
                    }
                    .buttonStyle(.brand(fullWidth: true))

                    Button("Konto erstellen") {
                        showLogin = true
                    }
                    .buttonStyle(.secondary(fullWidth: true))
                }
                .padding(.horizontal, 32)
                .padding(.top, 8)
            }
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Eingeloggt

    private var loggedInContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                profileHeader

                membershipsSection

                ordersSection

                settingsSection

                #if DEBUG
                developerSection
                #endif

                logoutButton

                versionFooter
            }
            .padding(16)
        }
        .refreshable { await load(force: true) }
    }

    // MARK: - Profil-Header

    private var profileHeader: some View {
        HStack(spacing: 16) {
            PhotosPicker(selection: $avatarPickerItem, matching: .images) {
                ZStack(alignment: .bottomTrailing) {
                    AvatarView(url: appState.session.currentUser?.avatarUrl,
                               name: appState.session.currentUser?.name ?? "?",
                               size: 72)
                        .overlay {
                            if isUploadingAvatar {
                                RoundedRectangle(cornerRadius: 72 * 0.27, style: .continuous)
                                    .fill(.black.opacity(0.35))
                                ProgressView()
                                    .tint(.white)
                            }
                        }

                    Image(systemName: "camera.fill")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(brand.color, in: .circle)
                        .overlay(Circle().strokeBorder(.white, lineWidth: 2))
                        .offset(x: 5, y: 5)
                }
            }
            .disabled(isUploadingAvatar)
            .accessibilityLabel(Text("Profilbild ändern"))

            VStack(alignment: .leading, spacing: 4) {
                Text(appState.session.currentUser?.name ?? "")
                    .font(.displaySerif(24))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                Text(appState.session.currentUser?.email ?? "")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.ink.opacity(0.5))
                    .lineLimit(1)
            }
        }
    }

    // MARK: - Mitgliedschaften

    private var membershipsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Mitgliedschaften")
            if !isLoaded {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
            } else if memberships.isEmpty {
                EmptyStateView(
                    icon: "person.2",
                    title: "Keine Mitgliedschaften",
                    message: "Entdecke Communities und werde Mitglied."
                )
            } else {
                ForEach(memberships) { membership in
                    membershipCard(membership)
                }
            }
        }
    }

    private func membershipCard(_ membership: MembershipHome) -> some View {
        AeraCard(padding: 16, cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 12) {
                NavigationLink {
                    CommunityView(slug: membership.community.slug)
                } label: {
                    HStack(spacing: 12) {
                        AvatarView(url: membership.community.logoUrl,
                                   name: membership.community.name,
                                   size: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(membership.community.name)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Theme.ink)
                                .lineLimit(1)
                            if let tier = membership.tier {
                                Text(tierLabel(tier))
                                    .font(.system(size: 13))
                                    .monospacedDigit()
                                    .foregroundStyle(Theme.ink.opacity(0.55))
                            }
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.ink.opacity(0.3))
                    }
                }
                .buttonStyle(.plain)

                if let subscription = membership.subscription {
                    subscriptionArea(subscription, membership: membership)
                }
            }
        }
    }

    private func tierLabel(_ tier: MembershipHome.TierSummary) -> String {
        if tier.priceCents <= 0 || tier.interval == .free {
            return String(localized: "\(tier.name) · Kostenlos")
        }
        let price = Format.price(cents: tier.priceCents, currency: "eur")
        if let suffix = tier.interval.priceSuffix {
            return "\(tier.name) · \(price)\(suffix)"
        }
        return "\(tier.name) · \(price)"
    }

    @ViewBuilder
    private func subscriptionArea(_ subscription: MembershipHome.SubscriptionInfo,
                                  membership: MembershipHome) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if subscription.cancelAtPeriodEnd, let end = subscription.currentPeriodEnd {
                statusLine(icon: "calendar.badge.minus",
                           text: String(localized: "Endet am \(end.formatted(date: .abbreviated, time: .omitted))"))
            } else if let end = subscription.currentPeriodEnd {
                statusLine(icon: "arrow.trianglehead.2.clockwise",
                           text: String(localized: "Verlängert sich am \(end.formatted(date: .abbreviated, time: .omitted))"))
            }

            if subscription.isApple {
                Button {
                    if let url = Self.appleSubscriptionsURL {
                        openURL(url)
                    }
                } label: {
                    Label("Abo verwalten", systemImage: "gearshape")
                        .font(.system(size: 13, weight: .semibold))
                }
                .buttonStyle(.secondary)
            } else {
                statusLine(icon: "globe",
                           text: String(localized: "Auf der Website verwalten"))

                if !subscription.cancelAtPeriodEnd {
                    Button {
                        cancelTarget = membership
                    } label: {
                        Text("Kündigen")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.danger)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func statusLine(icon: String, text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .medium))
            Text(text)
                .font(.system(size: 13))
                .monospacedDigit()
        }
        .foregroundStyle(Theme.ink.opacity(0.6))
    }

    // MARK: - Bestellungen

    private var ordersSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Bestellungen")
            if !isLoaded {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
            } else if orders.isEmpty {
                Text("Noch keine Bestellungen.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.ink.opacity(0.5))
            } else {
                ForEach(orders) { order in
                    orderRow(order)
                }
            }
        }
    }

    private func orderRow(_ order: Order) -> some View {
        AeraCard(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(order.description)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                        HStack(spacing: 6) {
                            if let communityName = order.communityName {
                                Text(communityName)
                                Text("·")
                            }
                            Text(order.createdAt.formatted(date: .abbreviated, time: .omitted))
                                .monospacedDigit()
                        }
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.ink.opacity(0.5))
                    }
                    Spacer()
                    Text(Format.price(cents: order.amountCents, currency: order.currency))
                        .font(.system(size: 14, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink)
                }

                HStack(spacing: 10) {
                    OrderStatusPill(status: order.status)
                    if let downloadUrl = order.downloadUrl, let url = AppConfig.mediaURL(downloadUrl) {
                        Button {
                            openURL(url)
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "arrow.down.circle")
                                    .font(.system(size: 12, weight: .semibold))
                                Text("Download")
                                    .font(.system(size: 12, weight: .semibold))
                            }
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Theme.ink)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Theme.card, in: .capsule)
                        .overlay(Capsule().strokeBorder(Theme.border, lineWidth: 1))
                    }
                }
            }
        }
    }

    // MARK: - Einstellungen

    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Einstellungen")
            AeraCard(padding: 0) {
                VStack(spacing: 0) {
                    settingsRow(icon: "person.text.rectangle", title: "Name ändern") {
                        nameDraft = appState.session.currentUser?.name ?? ""
                        showNameAlert = true
                    }
                    Divider().padding(.leading, 52)
                    settingsRow(icon: "key", title: "Passwort ändern") {
                        showPasswordSheet = true
                    }
                }
            }
        }
    }

    private func settingsRow(icon: String, title: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(brand.color)
                    .frame(width: 28)
                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.ink)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.ink.opacity(0.3))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    #if DEBUG
    private var developerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader("Entwickler")
            AeraCard(padding: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Basis-URL")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.ink.opacity(0.7))
                    TextField("https://aera.so", text: $baseURLOverride)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .authInputStyle()
                    Text("Leer lassen für die Produktions-URL. Änderungen gelten für neue Anfragen.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.ink.opacity(0.5))
                }
            }
        }
    }
    #endif

    // MARK: - Abmelden & Fußzeile

    private var logoutButton: some View {
        Button {
            showLogoutConfirmation = true
        } label: {
            Text("Abmelden")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.danger)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Theme.card, in: .capsule)
                .overlay(Capsule().strokeBorder(Theme.danger.opacity(0.3), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var versionFooter: some View {
        Text(versionLabel)
            .font(.system(size: 12))
            .monospacedDigit()
            .foregroundStyle(Theme.ink.opacity(0.4))
            .frame(maxWidth: .infinity)
            .padding(.bottom, 8)
    }

    private var versionLabel: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return String(localized: "Aera \(version) (\(build))")
    }

    // MARK: - Laden

    private func load(force: Bool = false) async {
        guard appState.session.isLoggedIn else {
            memberships = []
            orders = []
            isLoaded = false
            return
        }
        if isLoaded && !force { return }
        do {
            async let meResponse = appState.api.me()
            async let myOrders = appState.api.myOrders()
            let (me, loadedOrders) = try await (meResponse, myOrders)
            appState.session.update(user: me.user)
            memberships = me.memberships
            orders = loadedOrders
            isLoaded = true
        } catch let error as APIError where error.status == 401 {
            appState.session.clear()
        } catch {
            if !isLoaded {
                memberships = []
                orders = []
                isLoaded = true
                errorMessage = String(localized: "Dein Konto konnte nicht geladen werden. Ziehe zum Aktualisieren nach unten.")
            }
        }
    }

    // MARK: - Avatar-Upload

    private func uploadAvatar(_ item: PhotosPickerItem) async {
        defer { avatarPickerItem = nil }

        guard let tenant = memberships.first?.community.slug else {
            infoMessage = String(localized: "Um ein Profilbild hochzuladen, tritt zuerst einer Community bei.")
            return
        }

        isUploadingAvatar = true
        defer { isUploadingAvatar = false }

        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data),
                  let jpegData = image.aeraResized(maxDimension: 1600).jpegData(compressionQuality: 0.8) else {
                errorMessage = String(localized: "Das Bild konnte nicht verarbeitet werden.")
                return
            }
            let url = try await appState.api.uploadAvatar(imageData: jpegData, tenant: tenant)
            let user = try await appState.api.updateProfile(avatarUrl: url)
            appState.session.update(user: user)
            successCount += 1
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Name & Kündigung

    private func saveName() {
        let trimmed = nameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != appState.session.currentUser?.name else { return }
        Task {
            do {
                let user = try await appState.api.updateProfile(name: trimmed)
                appState.session.update(user: user)
                successCount += 1
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func cancelMembership(_ membership: MembershipHome) {
        Task {
            do {
                try await appState.api.cancelMembership(slug: membership.community.slug)
                successCount += 1
                await load(force: true)
            } catch let error as APIError where error.code == .manageOnWeb {
                infoMessage = String(localized: "Dieses Abo kann nur auf der Website verwaltet werden.")
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

// MARK: - ChangePasswordSheet

/// Passwort ändern: aktuelles + neues Passwort (mit Wiederholung).
/// Der Server liefert ein neues JWT → `session.apply(token:)`.
private struct ChangePasswordSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var repeatedPassword = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var successCount = 0

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    field("Aktuelles Passwort", text: $currentPassword, contentType: .password)
                    field("Neues Passwort", text: $newPassword, contentType: .newPassword)
                    field("Neues Passwort wiederholen", text: $repeatedPassword, contentType: .newPassword)

                    if let validationHint {
                        Text(validationHint)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.ink.opacity(0.5))
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.danger)
                    }

                    Button {
                        submit()
                    } label: {
                        Group {
                            if isSubmitting {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Text("Passwort ändern")
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.brand(fullWidth: true))
                    .disabled(!canSubmit || isSubmitting)
                    .opacity(canSubmit ? 1 : 0.55)
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Passwort ändern")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                    .disabled(isSubmitting)
                }
            }
        }
        .sensoryFeedback(.success, trigger: successCount)
        .interactiveDismissDisabled(isSubmitting)
    }

    private func field(_ label: LocalizedStringKey,
                       text: Binding<String>,
                       contentType: UITextContentType) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.ink.opacity(0.7))
            SecureField("", text: text)
                .textContentType(contentType)
                .authInputStyle()
        }
    }

    private var validationHint: String? {
        if !newPassword.isEmpty && newPassword.count < 8 {
            return String(localized: "Das neue Passwort muss mindestens 8 Zeichen haben.")
        }
        if !repeatedPassword.isEmpty && newPassword != repeatedPassword {
            return String(localized: "Die Passwörter stimmen nicht überein.")
        }
        return nil
    }

    private var canSubmit: Bool {
        !currentPassword.isEmpty
            && newPassword.count >= 8
            && newPassword == repeatedPassword
    }

    private func submit() {
        guard canSubmit, !isSubmitting else { return }
        isSubmitting = true
        errorMessage = nil
        Task {
            do {
                let token = try await appState.api.changePassword(currentPassword: currentPassword,
                                                                  newPassword: newPassword)
                appState.session.apply(token: token)
                successCount += 1
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
                isSubmitting = false
            }
        }
    }
}

// MARK: - UIImage-Resize

private extension UIImage {
    /// Skaliert das Bild proportional, sodass die längste Kante
    /// `maxDimension` nicht überschreitet (für den Avatar-Upload).
    func aeraResized(maxDimension: CGFloat) -> UIImage {
        let largestSide = max(size.width, size.height)
        guard largestSide > maxDimension, largestSide > 0 else { return self }
        let scaleFactor = maxDimension / largestSide
        let newSize = CGSize(width: size.width * scaleFactor,
                             height: size.height * scaleFactor)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: newSize, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
