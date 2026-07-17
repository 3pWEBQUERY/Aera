import SwiftUI

/// Wünsche-Verwaltung: Status-Filter-Chips, Karten mit Autor, Score und
/// Status-Pill sowie Aktionen (Annehmen/Ablehnen/Als erfüllt markieren)
/// über `GET/POST /studio/{slug}/requests`. Bepreisen bleibt dem Web vorbehalten.
struct StudioRequestsView: View {
    let community: StudioCommunity

    @Environment(AppState.self) private var appState

    @State private var statusFilter: RequestStatus = .open
    @State private var requests: [StudioRequest]?
    @State private var loadErrorMessage: String?
    @State private var actionError: String?
    @State private var busyRequestIds: Set<String> = []
    @State private var successCount = 0

    private var slug: String { community.community.slug }

    private var brandTheme: BrandTheme {
        BrandTheme(primaryHex: community.community.primaryColor,
                   accentHex: community.community.accentColor)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Wünsche")
                    .font(.displaySerif(26))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)

                filterChips

                webHint

                content
            }
            .padding(16)
        }
        .background(Theme.paper.ignoresSafeArea())
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle("Wünsche")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: statusFilter) { await load() }
        .sensoryFeedback(.success, trigger: successCount)
        .alert("Fehler", isPresented: Binding(
            get: { actionError != nil },
            set: { if !$0 { actionError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(actionError ?? "")
        }
        .brandTheme(brandTheme)
    }

    // MARK: - Filter & Hinweis

    private var filterChips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                filterChip(label: String(localized: "Offen"), value: .open)
                filterChip(label: String(localized: "Angenommen"), value: .accepted)
                filterChip(label: String(localized: "Bepreist"), value: .priced)
                filterChip(label: String(localized: "Erfüllt"), value: .fulfilled)
                filterChip(label: String(localized: "Abgelehnt"), value: .declined)
            }
        }
        .scrollIndicators(.hidden)
    }

    private func filterChip(label: String, value: RequestStatus) -> some View {
        let isActive = statusFilter == value
        return Button {
            withAnimation(.snappy(duration: 0.25)) {
                statusFilter = value
            }
        } label: {
            Text(label)
                .font(.system(size: 13, weight: isActive ? .semibold : .medium))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .foregroundStyle(isActive ? .white : Theme.ink)
                .background(isActive ? AnyShapeStyle(brandTheme.color) : AnyShapeStyle(Theme.card),
                            in: .capsule)
                .overlay {
                    if !isActive {
                        Capsule().strokeBorder(Theme.border, lineWidth: 1)
                    }
                }
        }
        .buttonStyle(.plain)
    }

    private var webHint: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "info.circle")
                .font(.system(size: 12, weight: .medium))
            Text("Bepreisen kannst du Wünsche im Web-Dashboard.")
                .font(.system(size: 13))
        }
        .foregroundStyle(Theme.ink.opacity(0.55))
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.softFill, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // MARK: - Inhalt

    @ViewBuilder
    private var content: some View {
        if let requests {
            if requests.isEmpty {
                EmptyStateView(
                    icon: "lightbulb",
                    title: "Keine Wünsche",
                    message: "In diesem Status liegen aktuell keine Wünsche vor."
                )
            } else {
                LazyVStack(spacing: 12) {
                    ForEach(requests) { request in
                        requestCard(request)
                    }
                }
            }
        } else if let loadErrorMessage {
            VStack(spacing: 16) {
                EmptyStateView(
                    icon: "wifi.exclamationmark",
                    title: "Laden fehlgeschlagen",
                    message: LocalizedStringKey(loadErrorMessage)
                )
                Button("Erneut versuchen") {
                    self.loadErrorMessage = nil
                    Task { await load() }
                }
                .buttonStyle(.secondary)
            }
        } else {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
        }
    }

    // MARK: - Karte

    private func requestCard(_ request: StudioRequest) -> some View {
        AeraCard(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 8) {
                    Text(request.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 8)
                    statusPill(request.status)
                }

                if !request.body.isEmpty {
                    Text(request.body)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.ink.opacity(0.7))
                        .lineLimit(4)
                        .multilineTextAlignment(.leading)
                }

                HStack(spacing: 10) {
                    AvatarView(url: request.author.avatarUrl, name: request.author.name, size: 28)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(request.author.name)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Theme.ink.opacity(0.7))
                            .lineLimit(1)
                        Text(request.author.email)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.ink.opacity(0.45))
                            .lineLimit(1)
                    }

                    Spacer(minLength: 8)

                    scoreBadge(request)

                    Text(request.createdAt.relativeLabel)
                        .font(.system(size: 11))
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink.opacity(0.45))
                }

                if let priceCents = request.priceCents, request.status == .priced {
                    PriceText(cents: priceCents, currency: "eur", size: 18)
                }

                actionArea(for: request)
            }
        }
    }

    /// Score nur lesend (Staff stimmt hier nicht ab).
    private func scoreBadge(_ request: StudioRequest) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "chevron.up")
                .font(.system(size: 10, weight: .semibold))
            Text("\(request.score)")
                .font(.system(size: 12, weight: .semibold))
                .monospacedDigit()
        }
        .foregroundStyle(request.myVote != nil ? brandTheme.color : Theme.ink.opacity(0.6))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Theme.softFill, in: .capsule)
        .accessibilityLabel(Text("Bewertung \(request.score)"))
    }

    @ViewBuilder
    private func statusPill(_ status: RequestStatus) -> some View {
        switch status {
        case .open:
            PillLabel(String(localized: "Offen"))
        case .accepted:
            PillLabel(String(localized: "Angenommen"), prominent: true)
        case .priced:
            PillLabel(String(localized: "Bepreist"), systemImage: "tag", prominent: true)
        case .fulfilled:
            PillLabel(String(localized: "Erfüllt"), systemImage: "checkmark")
        case .declined:
            PillLabel(String(localized: "Abgelehnt"), systemImage: "xmark")
        }
    }

    @ViewBuilder
    private func actionArea(for request: StudioRequest) -> some View {
        if busyRequestIds.contains(request.id) {
            ProgressView()
                .frame(maxWidth: .infinity)
        } else {
            switch request.status {
            case .open:
                HStack(spacing: 10) {
                    Button("Annehmen") {
                        perform(.accept, on: request)
                    }
                    .buttonStyle(.brand)

                    Button {
                        perform(.decline, on: request)
                    } label: {
                        Text("Ablehnen")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.danger)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 12)
                            .background(Theme.card, in: .capsule)
                            .overlay(Capsule().strokeBorder(Theme.danger.opacity(0.3), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            case .accepted, .priced:
                Button {
                    perform(.fulfill, on: request)
                } label: {
                    Label("Als erfüllt markieren", systemImage: "checkmark")
                        .font(.system(size: 13, weight: .semibold))
                }
                .buttonStyle(.secondary)
            case .fulfilled, .declined:
                EmptyView()
            }
        }
    }

    // MARK: - Aktionen

    private func perform(_ action: StudioRequestAction, on request: StudioRequest) {
        guard !busyRequestIds.contains(request.id) else { return }
        busyRequestIds.insert(request.id)
        Task {
            defer { busyRequestIds.remove(request.id) }
            do {
                let updated = try await appState.api.requestAction(slug: slug,
                                                                   requestId: request.id,
                                                                   action: action)
                withAnimation(.snappy(duration: 0.25)) {
                    if updated.status != statusFilter {
                        requests?.removeAll { $0.id == updated.id }
                    } else if let index = requests?.firstIndex(where: { $0.id == updated.id }) {
                        requests?[index] = updated
                    }
                }
                successCount += 1
            } catch {
                actionError = error.localizedDescription
            }
        }
    }

    // MARK: - Laden

    private func load() async {
        do {
            requests = try await appState.api.studioRequests(slug: slug, status: statusFilter)
            loadErrorMessage = nil
        } catch {
            if requests == nil {
                loadErrorMessage = error.localizedDescription
            } else {
                actionError = error.localizedDescription
            }
        }
    }
}
