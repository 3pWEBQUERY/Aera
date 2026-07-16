import SwiftUI

/// FORUM-Space: Tab-Umschalter „Top/Neu" (lädt via `api.space(tab:)` neu),
/// Zeilen als Karten mit `VoteControl` links (optimistisch) und Titel,
/// Body-Vorschau und Kommentarzahl rechts. Push ins Post-Detail.
///
/// Der Composer (mit Titelfeld) läuft über den Floating-Button des
/// `CommunityView`-Screens (`ComposeContextKey`, `withTitle: true`).
struct ForumSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: ForumContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var posts: [Post]
    @State private var tab: ForumTab
    @State private var nextCursor: String?
    @State private var isSwitchingTab = false
    @State private var isLoadingMore = false
    @State private var loadMoreFailed = false
    @State private var showLogin = false
    @State private var voteTrigger = 0
    @State private var actionError: String?

    init(slug: String,
         space: SpaceDetail,
         content: ForumContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
        self._posts = State(initialValue: content.posts)
        self._tab = State(initialValue: content.tab)
        self._nextCursor = State(initialValue: content.nextCursor)
    }

    var body: some View {
        VStack(spacing: 16) {
            Picker("Sortierung", selection: $tab) {
                Text("Top").tag(ForumTab.top)
                Text("Neu").tag(ForumTab.new)
            }
            .pickerStyle(.segmented)

            if isSwitchingTab {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
            } else if posts.isEmpty {
                EmptyStateView(
                    icon: "bubble.left.and.bubble.right",
                    title: "Noch keine Diskussionen",
                    message: "Starte die erste Diskussion in diesem Forum."
                )
            } else {
                LazyVStack(spacing: 12) {
                    ForEach(posts) { post in
                        forumRow(post)
                            .onAppear {
                                if post.id == posts.last?.id {
                                    loadMore()
                                }
                            }
                    }

                    paginationFooter
                }
            }
        }
        .padding(.horizontal, 16)
        .onChange(of: tab) { oldValue, newValue in
            guard oldValue != newValue else { return }
            switchTab(to: newValue)
        }
        .onChange(of: content) { _, newContent in
            posts = newContent.posts
            tab = newContent.tab
            nextCursor = newContent.nextCursor
            loadMoreFailed = false
        }
        .sheet(isPresented: $showLogin) {
            LoginSheetView()
        }
        .sensoryFeedback(.impact(weight: .light), trigger: voteTrigger)
        .alert("Fehler", isPresented: Binding(
            get: { actionError != nil },
            set: { if !$0 { actionError = nil } }
        )) {
            Button("OK", role: .cancel) { actionError = nil }
        } message: {
            Text(actionError ?? "")
        }
    }

    // MARK: - Zeile

    private func forumRow(_ post: Post) -> some View {
        AeraCard(padding: 14) {
            HStack(alignment: .top, spacing: 12) {
                VoteControl(score: post.score ?? 0, myVote: post.myVote) { dir in
                    vote(post: post, dir: dir)
                }

                NavigationLink {
                    PostDetailView(slug: slug, postId: post.id)
                        .brandTheme(brand)
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(post.title ?? String(localized: "Ohne Titel"))
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                            .multilineTextAlignment(.leading)

                        if let body = post.body, !body.isEmpty {
                            Text(body)
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.ink.opacity(0.6))
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                        }

                        HStack(spacing: 12) {
                            Text(post.author.name)
                                .lineLimit(1)
                            Text(post.publishedAt.relativeLabel)
                            Label {
                                Text(Format.compactCount(post.commentCount))
                                    .monospacedDigit()
                            } icon: {
                                Image(systemName: "bubble.right")
                            }
                        }
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.ink.opacity(0.5))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private var paginationFooter: some View {
        if nextCursor != nil {
            if loadMoreFailed {
                Button("Mehr laden") {
                    loadMoreFailed = false
                    loadMore()
                }
                .buttonStyle(.secondary)
                .padding(.vertical, 4)
            } else {
                ProgressView()
                    .padding(.vertical, 12)
            }
        }
    }

    // MARK: - Tab-Wechsel & Pagination

    private func switchTab(to newTab: ForumTab) {
        isSwitchingTab = true
        loadMoreFailed = false
        Task {
            do {
                let response = try await appState.api.space(slug: slug,
                                                            spaceSlug: space.slug,
                                                            tab: newTab)
                if case .forum(let forum) = response.content {
                    posts = forum.posts
                    nextCursor = forum.nextCursor
                }
            } catch {
                actionError = error.localizedDescription
            }
            isSwitchingTab = false
        }
    }

    private func loadMore() {
        guard !isLoadingMore, !loadMoreFailed, let cursor = nextCursor else { return }
        isLoadingMore = true
        Task {
            do {
                let response = try await appState.api.space(slug: slug,
                                                            spaceSlug: space.slug,
                                                            tab: tab,
                                                            cursor: cursor)
                if case .forum(let more) = response.content {
                    let known = Set(posts.map(\.id))
                    posts.append(contentsOf: more.posts.filter { !known.contains($0.id) })
                    nextCursor = more.nextCursor
                } else {
                    nextCursor = nil
                }
            } catch {
                loadMoreFailed = true
            }
            isLoadingMore = false
        }
    }

    // MARK: - Voting

    private func vote(post: Post, dir: VoteDirection) {
        guard appState.session.isLoggedIn else {
            showLogin = true
            return
        }
        guard let index = posts.firstIndex(where: { $0.id == post.id }) else { return }
        let original = posts[index]

        let optimistic = VoteMath.apply(score: original.score ?? 0,
                                        myVote: original.myVote,
                                        dir: dir)
        withAnimation(.snappy(duration: 0.25)) {
            posts[index].score = optimistic.score
            posts[index].myVote = optimistic.myVote
        }
        voteTrigger += 1

        Task {
            do {
                let response = try await appState.api.vote(slug: slug,
                                                           targetType: .post,
                                                           targetId: post.id,
                                                           postId: post.id,
                                                           dir: dir)
                if let current = posts.firstIndex(where: { $0.id == post.id }) {
                    posts[current].score = response.score
                    posts[current].myVote = response.myVote
                }
            } catch {
                if let current = posts.firstIndex(where: { $0.id == post.id }) {
                    withAnimation(.snappy(duration: 0.25)) {
                        posts[current].score = original.score
                        posts[current].myVote = original.myVote
                    }
                }
            }
        }
    }
}

// MARK: - VoteControl

/// Vertikale Vote-Spalte: Chevron hoch/runter, Score `monospacedDigit`,
/// eigene Stimme in Brand-Farbe. Auch für Kommentar-Voting im Post-Detail.
struct VoteControl: View {
    let score: Int
    let myVote: VoteDirection?
    var compact: Bool = false
    let onVote: (VoteDirection) -> Void

    @Environment(\.brand) private var brand

    init(score: Int,
         myVote: VoteDirection?,
         compact: Bool = false,
         onVote: @escaping (VoteDirection) -> Void) {
        self.score = score
        self.myVote = myVote
        self.compact = compact
        self.onVote = onVote
    }

    var body: some View {
        VStack(spacing: compact ? 1 : 3) {
            voteButton(.up, symbol: "chevron.up")
            Text("\(score)")
                .font(.system(size: compact ? 12 : 14, weight: .semibold))
                .monospacedDigit()
                .contentTransition(.numericText())
                .foregroundStyle(myVote != nil ? brand.color : Theme.ink.opacity(0.7))
            voteButton(.down, symbol: "chevron.down")
        }
    }

    private func voteButton(_ dir: VoteDirection, symbol: String) -> some View {
        Button {
            onVote(dir)
        } label: {
            Image(systemName: symbol)
                .font(.system(size: compact ? 12 : 14, weight: .semibold))
                .foregroundStyle(myVote == dir ? brand.color : Theme.ink.opacity(0.4))
                .frame(width: compact ? 24 : 30, height: compact ? 18 : 22)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(dir == .up ? "Hochwählen" : "Runterwählen"))
    }
}

// MARK: - VoteMath

/// Optimistische Score-Berechnung für Post-/Kommentar-Votes:
/// erneutes Wählen derselben Richtung entfernt die Stimme.
enum VoteMath {
    static func apply(score: Int,
                      myVote: VoteDirection?,
                      dir: VoteDirection) -> (score: Int, myVote: VoteDirection?) {
        var result = score
        if let myVote {
            result -= myVote == .up ? 1 : -1
        }
        if myVote == dir {
            return (result, nil)
        }
        result += dir == .up ? 1 : -1
        return (result, dir)
    }
}
