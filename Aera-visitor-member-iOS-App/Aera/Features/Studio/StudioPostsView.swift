import SwiftUI

/// „Beiträge & Planung": geplante und veröffentlichte Beiträge des Tenants
/// (`GET /studio/{slug}/posts`), Pin-Toggle und Löschen per Kontextmenü,
/// Erstellen (inkl. Planung) über ein Compose-Sheet. Cursor-Pagination.
struct StudioPostsView: View {
    let community: StudioCommunity

    @Environment(AppState.self) private var appState

    @State private var filter: StudioPostFilter = .scheduled
    @State private var posts: [StudioPost]?
    @State private var nextCursor: String?
    @State private var isLoadingMore = false
    @State private var loadErrorMessage: String?
    @State private var actionError: String?
    @State private var deleteTarget: StudioPost?
    @State private var showComposeSheet = false
    @State private var successCount = 0

    private var slug: String { community.community.slug }

    private var brandTheme: BrandTheme {
        BrandTheme(primaryHex: community.community.primaryColor,
                   accentHex: community.community.accentColor)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Beiträge & Planung")
                    .font(.displaySerif(26))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)

                Picker("Filter", selection: $filter) {
                    Text("Geplant").tag(StudioPostFilter.scheduled)
                    Text("Veröffentlicht").tag(StudioPostFilter.published)
                }
                .pickerStyle(.segmented)

                content
            }
            .padding(16)
        }
        .background(Theme.paper.ignoresSafeArea())
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle("Beiträge")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showComposeSheet = true
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .semibold))
                }
                .accessibilityLabel(Text("Neuer Beitrag"))
            }
        }
        .refreshable { await load(reset: true) }
        .task(id: filter) { await load(reset: true) }
        .sensoryFeedback(.success, trigger: successCount)
        .sheet(isPresented: $showComposeSheet) {
            StudioPostComposeSheet(slug: slug) { post in
                handleCreated(post)
            }
            .brandTheme(brandTheme)
        }
        .alert("Fehler", isPresented: Binding(
            get: { actionError != nil },
            set: { if !$0 { actionError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(actionError ?? "")
        }
        .confirmationDialog(
            "Beitrag löschen?",
            isPresented: Binding(
                get: { deleteTarget != nil },
                set: { if !$0 { deleteTarget = nil } }
            ),
            titleVisibility: .visible,
            presenting: deleteTarget
        ) { post in
            Button("Löschen", role: .destructive) {
                delete(post)
            }
            Button("Abbrechen", role: .cancel) {}
        } message: { _ in
            Text("Der Beitrag wird dauerhaft entfernt.")
        }
        .brandTheme(brandTheme)
    }

    // MARK: - Inhalt

    @ViewBuilder
    private var content: some View {
        if let posts {
            if posts.isEmpty {
                EmptyStateView(
                    icon: filter == .scheduled ? "clock" : "square.text.square",
                    title: filter == .scheduled ? "Nichts geplant" : "Noch keine Beiträge",
                    message: filter == .scheduled
                        ? "Plane Beiträge, die automatisch zum gewählten Zeitpunkt erscheinen."
                        : "Veröffentlichte Beiträge erscheinen hier."
                )
            } else {
                LazyVStack(spacing: 12) {
                    ForEach(posts) { post in
                        postCard(post)
                            .onAppear {
                                if post.id == posts.last?.id {
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
                    Task { await load(reset: true) }
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

    private func postCard(_ post: StudioPost) -> some View {
        AeraCard(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    PillLabel(post.spaceName, systemImage: post.spaceType.symbolName)
                    Spacer(minLength: 0)
                    if post.isPinned {
                        Image(systemName: "pin.fill")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(brandTheme.color)
                            .accessibilityLabel(Text("Angepinnt"))
                    }
                }

                if let title = post.title, !title.isEmpty {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                }

                if !post.body.isEmpty {
                    Text(post.body)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink.opacity(0.65))
                        .multilineTextAlignment(.leading)
                        .lineLimit(3)
                }

                if post.isScheduled {
                    HStack(spacing: 5) {
                        Image(systemName: "clock")
                            .font(.system(size: 11, weight: .semibold))
                        Text("Erscheint am \(post.publishedAt.formatted(date: .abbreviated, time: .shortened))")
                            .font(.system(size: 12, weight: .semibold))
                            .monospacedDigit()
                    }
                    .foregroundStyle(brandTheme.color)
                } else {
                    HStack(spacing: 10) {
                        metaItem(icon: "heart", value: post.likeCount)
                        metaItem(icon: "bubble.left", value: post.commentCount)
                        Text(post.publishedAt.relativeLabel)
                            .font(.system(size: 12))
                            .monospacedDigit()
                            .foregroundStyle(Theme.ink.opacity(0.45))
                    }
                }
            }
        }
        .contextMenu {
            if !post.isScheduled {
                Button {
                    togglePin(post)
                } label: {
                    Label(post.isPinned ? "Loslösen" : "Anpinnen",
                          systemImage: post.isPinned ? "pin.slash" : "pin")
                }
            }
            Button(role: .destructive) {
                deleteTarget = post
            } label: {
                Label("Löschen", systemImage: "trash")
            }
        }
    }

    private func metaItem(icon: String, value: Int) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .medium))
            Text(Format.compactCount(value))
                .font(.system(size: 12, weight: .medium))
                .monospacedDigit()
        }
        .foregroundStyle(Theme.ink.opacity(0.55))
    }

    // MARK: - Aktionen

    private func togglePin(_ post: StudioPost) {
        Task {
            do {
                let isPinned = try await appState.api.togglePinStudioPost(slug: slug, postId: post.id)
                if let index = posts?.firstIndex(where: { $0.id == post.id }) {
                    withAnimation(.snappy(duration: 0.25)) {
                        posts?[index].isPinned = isPinned
                    }
                }
                successCount += 1
            } catch {
                actionError = error.localizedDescription
            }
        }
    }

    private func delete(_ post: StudioPost) {
        Task {
            do {
                try await appState.api.deleteStudioPost(slug: slug, postId: post.id)
                withAnimation(.snappy(duration: 0.25)) {
                    posts?.removeAll { $0.id == post.id }
                }
                successCount += 1
            } catch {
                actionError = error.localizedDescription
            }
        }
    }

    private func handleCreated(_ post: StudioPost) {
        successCount += 1
        // Neuen Beitrag nur einsortieren, wenn er zum aktiven Filter passt;
        // sonst Segment wechseln, damit der Beitrag sichtbar ist.
        if post.isScheduled == (filter == .scheduled) {
            withAnimation(.snappy(duration: 0.25)) {
                posts?.insert(post, at: 0)
            }
        } else {
            filter = post.isScheduled ? .scheduled : .published
        }
    }

    // MARK: - Laden

    private func load(reset: Bool) async {
        if reset {
            nextCursor = nil
        }
        do {
            let response = try await appState.api.studioPosts(slug: slug, filter: filter)
            posts = response.data
            nextCursor = response.nextCursor
            loadErrorMessage = nil
        } catch {
            if posts == nil {
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
            let response = try await appState.api.studioPosts(slug: slug, filter: filter, cursor: cursor)
            let known = Set((posts ?? []).map(\.id))
            posts?.append(contentsOf: response.data.filter { !known.contains($0.id) })
            nextCursor = response.nextCursor
        } catch {
            actionError = error.localizedDescription
        }
    }
}

// MARK: - StudioPostComposeSheet

/// Sheet zum Erstellen eines Beitrags: Space-Picker (content-fähige Spaces
/// aus `GET /c/{slug}`), optionaler Titel, Text und optionale Planung
/// (Datum in der Zukunft) → `POST /studio/{slug}/posts`.
private struct StudioPostComposeSheet: View {
    let slug: String
    let onCreated: (StudioPost) -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var spaces: [SpaceSummary]?
    @State private var spacesErrorMessage: String?
    @State private var selectedSpaceSlug: String?
    @State private var title = ""
    @State private var body_ = ""
    @State private var isScheduling = false
    @State private var publishDate = Self.defaultPublishDate
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    /// Space-Typen, in denen Beiträge erstellt werden können.
    private static let composableTypes: Set<SpaceType> = [.feed, .forum, .blog, .videos, .podcast]

    private static var defaultPublishDate: Date {
        Calendar.current.date(byAdding: .hour, value: 1, to: .now) ?? .now.addingTimeInterval(3600)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    spaceSection

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Titel (optional)")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.ink.opacity(0.7))
                        TextField("Überschrift", text: $title)
                            .authInputStyle()
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Beitrag")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.ink.opacity(0.7))
                        TextField("Was möchtest du teilen?", text: $body_, axis: .vertical)
                            .lineLimit(6...14)
                            .authInputStyle()
                    }

                    scheduleSection

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.danger)
                    }
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Neuer Beitrag")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                    .disabled(isSubmitting)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        submit()
                    } label: {
                        if isSubmitting {
                            ProgressView()
                        } else {
                            Text(isScheduling ? "Planen" : "Veröffentlichen")
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(!canSubmit || isSubmitting)
                }
            }
        }
        .interactiveDismissDisabled(isSubmitting)
        .task { await loadSpaces() }
    }

    // MARK: - Space-Auswahl

    @ViewBuilder
    private var spaceSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Space")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.ink.opacity(0.7))

            if let spaces {
                if spaces.isEmpty {
                    Text("Diese Community hat keinen Space, in dem Beiträge erstellt werden können.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink.opacity(0.55))
                } else {
                    Picker("Space", selection: $selectedSpaceSlug) {
                        ForEach(spaces) { space in
                            Label(space.name, systemImage: space.type.symbolName)
                                .tag(Optional(space.slug))
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(Theme.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .authInputStyle()
                }
            } else if let spacesErrorMessage {
                VStack(alignment: .leading, spacing: 8) {
                    Text(spacesErrorMessage)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.danger)
                    Button("Erneut versuchen") {
                        self.spacesErrorMessage = nil
                        Task { await loadSpaces() }
                    }
                    .buttonStyle(.secondary)
                }
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
        }
    }

    // MARK: - Planung

    private var scheduleSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(isOn: $isScheduling.animation(.snappy(duration: 0.25))) {
                Text("Planen")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.ink)
            }

            if isScheduling {
                DatePicker(
                    "Veröffentlichung",
                    selection: $publishDate,
                    in: Date.now.addingTimeInterval(60)...,
                    displayedComponents: [.date, .hourAndMinute]
                )
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink)

                Text("Der Beitrag erscheint automatisch zum gewählten Zeitpunkt.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.ink.opacity(0.5))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Theme.border, lineWidth: 1)
        )
    }

    // MARK: - Absenden

    private var canSubmit: Bool {
        selectedSpaceSlug != nil
            && !body_.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (!isScheduling || publishDate > .now)
    }

    private func submit() {
        guard canSubmit, !isSubmitting, let spaceSlug = selectedSpaceSlug else { return }
        isSubmitting = true
        errorMessage = nil
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = body_.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            do {
                let post = try await appState.api.createStudioPost(
                    slug: slug,
                    spaceSlug: spaceSlug,
                    title: trimmedTitle.isEmpty ? nil : trimmedTitle,
                    body: trimmedBody,
                    publishedAt: isScheduling ? publishDate : nil
                )
                onCreated(post)
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
                isSubmitting = false
            }
        }
    }

    // MARK: - Spaces laden

    private func loadSpaces() async {
        do {
            let response = try await appState.api.community(slug: slug)
            let composable = response.spaces
                .filter { Self.composableTypes.contains($0.type) }
                .sorted { $0.sortOrder < $1.sortOrder }
            spaces = composable
            if selectedSpaceSlug == nil {
                selectedSpaceSlug = composable.first?.slug
            }
            spacesErrorMessage = nil
        } catch {
            if spaces == nil {
                spacesErrorMessage = error.localizedDescription
            }
        }
    }
}
