import SwiftUI

/// Bestellungen des Tenants: Filter (Alle/Bezahlt/Offen), Karten mit Kunde,
/// Betrag, Status und aufklappbarer Versandadresse; bezahlte, unerfüllte
/// Bestellungen lassen sich als versendet markieren
/// (`GET /studio/{slug}/orders` + `POST …/fulfill`). Cursor-Pagination.
struct StudioOrdersView: View {
    let community: StudioCommunity

    @Environment(AppState.self) private var appState

    @State private var statusFilter: OrderStatus?
    @State private var orders: [StudioOrder]?
    @State private var nextCursor: String?
    @State private var isLoadingMore = false
    @State private var loadErrorMessage: String?
    @State private var actionError: String?
    @State private var expandedOrderIds: Set<String> = []
    @State private var busyOrderIds: Set<String> = []
    @State private var successCount = 0

    private var slug: String { community.community.slug }

    private var brandTheme: BrandTheme {
        BrandTheme(primaryHex: community.community.primaryColor,
                   accentHex: community.community.accentColor)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Bestellungen")
                    .font(.displaySerif(26))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)

                filterChips

                content
            }
            .padding(16)
        }
        .background(Theme.paper.ignoresSafeArea())
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle("Bestellungen")
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

    // MARK: - Filter

    private var filterChips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                filterChip(label: String(localized: "Alle"), value: nil)
                filterChip(label: String(localized: "Bezahlt"), value: .paid)
                filterChip(label: String(localized: "Offen"), value: .pending)
            }
        }
        .scrollIndicators(.hidden)
    }

    private func filterChip(label: String, value: OrderStatus?) -> some View {
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

    // MARK: - Inhalt

    @ViewBuilder
    private var content: some View {
        if let orders {
            if orders.isEmpty {
                EmptyStateView(
                    icon: "shippingbox",
                    title: "Keine Bestellungen",
                    message: "Verkäufe deiner Community erscheinen hier."
                )
            } else {
                LazyVStack(spacing: 12) {
                    ForEach(orders) { order in
                        orderCard(order)
                            .onAppear {
                                if order.id == orders.last?.id {
                                    Task { await loadMore() }
                                }
                            }
                    }
                    if isLoadingMore {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
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

    private func orderCard(_ order: StudioOrder) -> some View {
        AeraCard(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(order.description)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                        Text("\(order.customer.name) · \(order.customer.email)")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.ink.opacity(0.5))
                            .lineLimit(1)
                        Text(order.createdAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.system(size: 12))
                            .monospacedDigit()
                            .foregroundStyle(Theme.ink.opacity(0.5))
                    }
                    Spacer(minLength: 8)
                    Text(Format.price(cents: order.amountCents, currency: order.currency))
                        .font(.system(size: 14, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink)
                }

                HStack(spacing: 8) {
                    OrderStatusPill(status: order.status)
                    if order.fulfilled {
                        PillLabel(String(localized: "Erfüllt"), systemImage: "checkmark")
                    }
                    if order.requiresShipping {
                        shippingToggle(order)
                    }
                }

                if expandedOrderIds.contains(order.id) {
                    shippingArea(order)
                }

                if order.status == .paid, !order.fulfilled {
                    fulfillButton(order)
                }
            }
        }
    }

    private func shippingToggle(_ order: StudioOrder) -> some View {
        let isExpanded = expandedOrderIds.contains(order.id)
        return Button {
            withAnimation(.snappy(duration: 0.25)) {
                if isExpanded {
                    expandedOrderIds.remove(order.id)
                } else {
                    expandedOrderIds.insert(order.id)
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "shippingbox")
                    .font(.system(size: 11, weight: .medium))
                Text("Versand")
                    .font(.system(size: 12, weight: .medium))
                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
                    .rotationEffect(.degrees(isExpanded ? 180 : 0))
            }
            .foregroundStyle(Theme.ink.opacity(0.7))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Theme.softFill, in: .capsule)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func shippingArea(_ order: StudioOrder) -> some View {
        let lines = shippingLines(order)
        VStack(alignment: .leading, spacing: 3) {
            EyebrowLabel("Versandadresse")
            if lines.isEmpty {
                Text("Keine Versandadresse hinterlegt.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink.opacity(0.5))
            } else {
                ForEach(lines, id: \.self) { line in
                    Text(line)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink.opacity(0.75))
                        .textSelection(.enabled)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.softFill, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func shippingLines(_ order: StudioOrder) -> [String] {
        guard let details = order.shippingDetails else { return [] }
        var lines: [String] = []
        if let name = details.name, !name.isEmpty {
            lines.append(name)
        }
        if let address = details.address {
            if let line1 = address.line1, !line1.isEmpty { lines.append(line1) }
            if let line2 = address.line2, !line2.isEmpty { lines.append(line2) }
            let cityParts = [address.postalCode, address.city]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
            if !cityParts.isEmpty { lines.append(cityParts.joined(separator: " ")) }
            let regionParts = [address.state, address.country]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
            if !regionParts.isEmpty { lines.append(regionParts.joined(separator: ", ")) }
        }
        return lines
    }

    @ViewBuilder
    private func fulfillButton(_ order: StudioOrder) -> some View {
        if busyOrderIds.contains(order.id) {
            ProgressView()
                .frame(maxWidth: .infinity)
        } else {
            Button {
                fulfill(order)
            } label: {
                Label(order.requiresShipping ? "Als versendet markieren" : "Als erfüllt markieren",
                      systemImage: "checkmark")
                    .font(.system(size: 13, weight: .semibold))
            }
            .buttonStyle(.secondary)
        }
    }

    // MARK: - Aktionen

    private func fulfill(_ order: StudioOrder) {
        guard !busyOrderIds.contains(order.id) else { return }
        busyOrderIds.insert(order.id)
        Task {
            defer { busyOrderIds.remove(order.id) }
            do {
                try await appState.api.fulfillOrder(slug: slug, orderId: order.id)
                if let index = orders?.firstIndex(where: { $0.id == order.id }) {
                    withAnimation(.snappy(duration: 0.25)) {
                        orders?[index].fulfilled = true
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
        nextCursor = nil
        do {
            let response = try await appState.api.studioOrders(slug: slug, status: statusFilter)
            orders = response.data
            nextCursor = response.nextCursor
            loadErrorMessage = nil
        } catch {
            if orders == nil {
                loadErrorMessage = error.localizedDescription
            } else {
                actionError = error.localizedDescription
            }
        }
    }

    private func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let response = try await appState.api.studioOrders(slug: slug,
                                                               status: statusFilter,
                                                               cursor: cursor)
            let known = Set((orders ?? []).map(\.id))
            orders?.append(contentsOf: response.data.filter { !known.contains($0.id) })
            nextCursor = response.nextCursor
        } catch {
            actionError = error.localizedDescription
        }
    }
}
