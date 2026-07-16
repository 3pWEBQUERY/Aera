import SwiftUI

/// Chat-Thread: Nachrichtenliste mit Datums-Trennern, Polling alle 3 Sekunden
/// (`GET /c/{slug}/chat/{id}?after=`) und Glass-Eingabeleiste unten.
/// Eigene Nachrichten rechts (Brand-Fill), fremde links (weiße Karte + Avatar).
struct ChatThreadView: View {
    let slug: String
    let conversation: Conversation

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var messages: [ChatMessage] = []
    @State private var knownIds: Set<String> = []
    @State private var isLoaded = false
    @State private var loadFailed = false
    @State private var draft = ""
    @State private var isSending = false
    @State private var sendError: String?
    @State private var sendSuccessCount = 0

    init(slug: String, conversation: Conversation) {
        self.slug = slug
        self.conversation = conversation
    }

    var body: some View {
        Group {
            if isLoaded {
                messageList
            } else if loadFailed {
                loadErrorView
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationTitle(conversation.title)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            ChatInputBar(text: $draft, isSending: isSending, onSend: send)
        }
        .sensoryFeedback(.success, trigger: sendSuccessCount)
        .alert("Senden fehlgeschlagen", isPresented: Binding(
            get: { sendError != nil },
            set: { if !$0 { sendError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(sendError ?? "")
        }
        .task {
            await initialLoad()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                guard !Task.isCancelled else { break }
                await pollNewMessages()
            }
        }
    }

    // MARK: - Liste

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 10) {
                    if messages.isEmpty {
                        EmptyStateView(
                            icon: "message",
                            title: "Noch keine Nachrichten",
                            message: "Schreibe die erste Nachricht in diese Unterhaltung."
                        )
                        .padding(.top, 24)
                    } else {
                        ForEach(ChatTimelineRow.rows(for: messages)) { row in
                            switch row {
                            case .separator(let date):
                                ChatDateSeparator(date: date)
                            case .message(let message):
                                ChatBubbleRow(message: message)
                                    .id(message.id)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: messages.count) {
                if let lastId = messages.last?.id {
                    withAnimation(.snappy(duration: 0.25)) {
                        proxy.scrollTo(lastId, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var loadErrorView: some View {
        VStack(spacing: 16) {
            EmptyStateView(
                icon: "wifi.exclamationmark",
                title: "Laden fehlgeschlagen",
                message: "Die Nachrichten konnten nicht geladen werden."
            )
            Button("Erneut versuchen") {
                loadFailed = false
                Task { await initialLoad() }
            }
            .buttonStyle(.secondary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Laden & Polling

    private func initialLoad() async {
        guard !isLoaded else { return }
        do {
            let loaded = try await appState.api.messages(slug: slug, conversationId: conversation.id)
            append(loaded)
            isLoaded = true
            loadFailed = false
        } catch {
            if !isLoaded { loadFailed = true }
        }
    }

    private func pollNewMessages() async {
        guard isLoaded else {
            await initialLoad()
            return
        }
        do {
            let fresh = try await appState.api.messages(slug: slug,
                                                        conversationId: conversation.id,
                                                        after: messages.last?.id)
            append(fresh)
        } catch {
            // Polling-Fehler bewusst still: nächster Versuch in 3 Sekunden.
        }
    }

    private func append(_ new: [ChatMessage]) {
        let unseen = new.filter { !knownIds.contains($0.id) }
        guard !unseen.isEmpty else { return }
        messages.append(contentsOf: unseen)
        knownIds.formUnion(unseen.map(\.id))
    }

    // MARK: - Senden

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }
        isSending = true
        Task {
            do {
                let message = try await appState.api.sendMessage(slug: slug,
                                                                 conversationId: conversation.id,
                                                                 body: text)
                append([message])
                draft = ""
                sendSuccessCount += 1
            } catch {
                sendError = error.localizedDescription
            }
            isSending = false
        }
    }
}

// MARK: - ChatTimelineRow

/// Zeile der Chat-Timeline: Datums-Trenner oder Nachricht.
/// Wird auch von `LiveRoomView` verwendet.
enum ChatTimelineRow: Identifiable {
    case separator(Date)
    case message(ChatMessage)

    var id: String {
        switch self {
        case .separator(let date): "separator-\(date.timeIntervalSinceReferenceDate)"
        case .message(let message): "message-\(message.id)"
        }
    }

    /// Fügt vor dem jeweils ersten Beitrag eines Tages einen Trenner ein.
    static func rows(for messages: [ChatMessage]) -> [ChatTimelineRow] {
        var rows: [ChatTimelineRow] = []
        var currentDay: Date?
        let calendar = Calendar.current
        for message in messages {
            let day = calendar.startOfDay(for: message.createdAt)
            if day != currentDay {
                rows.append(.separator(day))
                currentDay = day
            }
            rows.append(.message(message))
        }
        return rows
    }
}

// MARK: - ChatDateSeparator

/// Datums-Trenner: „Heute", „Gestern" oder „Mittwoch, 15. Juli".
struct ChatDateSeparator: View {
    let date: Date

    var body: some View {
        Text(label)
            .font(.system(size: 11, weight: .semibold))
            .textCase(.uppercase)
            .kerning(1.2)
            .foregroundStyle(Theme.ink.opacity(0.45))
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(Theme.softFill, in: .capsule)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
    }

    private var label: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            return String(localized: "Heute")
        }
        if calendar.isDateInYesterday(date) {
            return String(localized: "Gestern")
        }
        return date.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }
}

// MARK: - ChatBubbleRow

/// Nachrichtenzeile: eigene rechts (Brand-Fill, weißer Text, Radius 16),
/// fremde links (weiße Karte, Avatar 28 + Name klein).
struct ChatBubbleRow: View {
    let message: ChatMessage

    @Environment(\.brand) private var brand

    var body: some View {
        if message.mine {
            HStack(alignment: .bottom, spacing: 8) {
                Spacer(minLength: 48)
                timestamp
                Text(message.body)
                    .font(.system(size: 15))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(brand.color, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        } else {
            HStack(alignment: .top, spacing: 8) {
                AvatarView(url: message.author.avatarUrl, name: message.author.name, size: 28)
                VStack(alignment: .leading, spacing: 3) {
                    Text(message.author.name)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.ink.opacity(0.5))
                    HStack(alignment: .bottom, spacing: 8) {
                        Text(message.body)
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.ink)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .strokeBorder(Theme.border, lineWidth: 1)
                            )
                        timestamp
                    }
                }
                Spacer(minLength: 48)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var timestamp: some View {
        Text(message.createdAt.formatted(date: .omitted, time: .shortened))
            .font(.system(size: 10))
            .monospacedDigit()
            .foregroundStyle(Theme.ink.opacity(0.4))
    }
}

// MARK: - ChatInputBar

/// Eingabeleiste: TextField im Glass-Container + Senden-Pfeil (Brand-Kreis).
/// Der Senden-Button ist deaktiviert, solange die Eingabe leer ist.
struct ChatInputBar: View {
    @Binding var text: String
    let isSending: Bool
    let onSend: () -> Void

    @Environment(\.brand) private var brand

    private var trimmed: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        HStack(spacing: 10) {
            TextField("Nachricht schreiben", text: $text, axis: .vertical)
                .lineLimit(1...4)
                .font(.system(size: 15))
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .glassEffect(.regular, in: .rect(cornerRadius: 20))
                .onSubmit(onSend)

            Button(action: onSend) {
                Group {
                    if isSending {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: 40, height: 40)
                .background(brand.color, in: .circle)
                .opacity(trimmed.isEmpty ? 0.45 : 1)
            }
            .buttonStyle(.plain)
            .disabled(trimmed.isEmpty || isSending)
            .accessibilityLabel(Text("Senden"))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}
