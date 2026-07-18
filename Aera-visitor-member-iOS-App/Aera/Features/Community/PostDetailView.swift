import SwiftUI

/// Post-Detail (`GET /c/{slug}/posts/{postId}`): Layout je nach Space-Typ
/// (BLOG → Magazin, FORUM → Voting, sonst Feed-Karte), verschachtelte
/// Kommentare mit Antworten und Eingabeleiste für Mitglieder.
struct PostDetailView: View {
    let slug: String
    let postId: String

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var detail: PostDetailResponse?
    @State private var viewer: Viewer?
    /// Brand der Community — selbst geladen, da gepushte Ziele das
    /// `.brandTheme` des Community-Screens nicht automatisch erben.
    @State private var communityBrand: BrandTheme?
    @State private var loadErrorMessage: String?

    @State private var commentText = ""
    @State private var replyTo: Comment?
    @State private var isSendingComment = false

    @State private var showLogin = false
    @State private var showJoin = false
    @State private var actionError: String?
    @State private var likeTrigger = 0
    @State private var successTrigger = 0

    @FocusState private var commentFieldFocused: Bool

    /// Geladenes Community-Brand vor dem geerbten Environment-Brand —
    /// eigene Body-Helfer sehen den selbst gesetzten `.brandTheme` nicht.
    private var activeBrand: BrandTheme { communityBrand ?? brand }

    init(slug: String, postId: String) {
        self.slug = slug
        self.postId = postId
    }

    var body: some View {
        Group {
            if let detail {
                content(detail)
            } else if let loadErrorMessage {
                errorView(loadErrorMessage)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .brandTheme(communityBrand ?? brand)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if detail != nil {
                commentBar
            }
        }
        .task {
            if detail == nil {
                await load()
            }
        }
        .sheet(isPresented: $showLogin) {
            LoginSheetView {
                Task { await load() }
            }
        }
        .sheet(isPresented: $showJoin) {
            JoinView(slug: slug) {
                await load()
            }
        }
        .sensoryFeedback(.impact(weight: .light), trigger: likeTrigger)
        .sensoryFeedback(.success, trigger: successTrigger)
        .alert("Fehler", isPresented: Binding(
            get: { actionError != nil },
            set: { if !$0 { actionError = nil } }
        )) {
            Button("OK", role: .cancel) { actionError = nil }
        } message: {
            Text(actionError ?? "")
        }
    }

    // MARK: - Inhalt

    private func content(_ detail: PostDetailResponse) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                switch detail.post.spaceType {
                case .blog:
                    blogLayout(detail.post)
                case .forum:
                    forumLayout(detail.post)
                default:
                    defaultLayout(detail.post)
                }

                commentsSection(detail)
                    .padding(.horizontal, 16)
            }
            .padding(.bottom, 24)
        }
        .scrollEdgeEffectStyle(.soft, for: .top)
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await load() }
    }

    // MARK: - BLOG (Magazin)

    private func blogLayout(_ post: Post) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if !post.locked, post.imageUrl != nil {
                Color.clear
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .overlay {
                        AsyncImageView(url: post.imageUrl)
                    }
                    .clipped()
            }

            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(post.publishedAt.formatted(date: .long, time: .omitted))
                        .eyebrowStyle()
                    Text(post.title ?? String(localized: "Ohne Titel"))
                        .font(.displaySerif(26))
                        .kerning(-0.4)
                        .foregroundStyle(Theme.ink)
                }

                authorRow(post)
                likeRow(post)

                if post.locked {
                    lockedMedia(post)
                } else {
                    articleBody(post)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
        }
    }

    @ViewBuilder
    private func articleBody(_ post: Post) -> some View {
        if let html = post.bodyHtml, !html.isEmpty {
            HTMLTextView(html: html)
        } else if let body = post.body, !body.isEmpty {
            Text(body)
                .font(.system(size: 17, design: .serif))
                .lineSpacing(7)
                .foregroundStyle(Theme.ink.opacity(0.85))
        }
    }

    // MARK: - FORUM

    private func forumLayout(_ post: Post) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                VoteControl(score: post.score ?? 0, myVote: post.myVote) { dir in
                    votePost(dir: dir)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text(post.title ?? String(localized: "Ohne Titel"))
                        .font(.displaySerif(24))
                        .kerning(-0.4)
                        .foregroundStyle(Theme.ink)
                    authorRow(post)
                }
            }

            if post.locked {
                lockedMedia(post)
            } else {
                if let body = post.body, !body.isEmpty {
                    Text(body)
                        .font(.system(size: 15))
                        .lineSpacing(4)
                        .foregroundStyle(Theme.ink.opacity(0.85))
                }
                postMedia(post)
            }

            likeRow(post)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    // MARK: - Standard (Feed/Videos/Podcast …)

    private func defaultLayout(_ post: Post) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            authorRow(post)

            if let title = post.title, !title.isEmpty {
                Text(title)
                    .font(.displaySerif(24))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)
            }

            if post.locked {
                lockedMedia(post)
            } else {
                if let body = post.body, !body.isEmpty {
                    Text(body)
                        .font(.system(size: 15))
                        .lineSpacing(4)
                        .foregroundStyle(Theme.ink.opacity(0.85))
                }
                postMedia(post)
            }

            likeRow(post)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    // MARK: - Bausteine

    private func authorRow(_ post: Post) -> some View {
        HStack(spacing: 10) {
            AvatarView(url: post.author.avatarUrl, name: post.author.name, size: 32)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(post.author.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    if let role = post.author.role {
                        RoleBadge(role: role)
                    }
                }
                HStack(spacing: 6) {
                    Text(post.publishedAt.relativeLabel)
                    if let minutes = post.readingMinutes {
                        Text("·")
                        Text("\(minutes) Min. Lesezeit")
                            .monospacedDigit()
                    }
                }
                .font(.system(size: 12))
                .foregroundStyle(Theme.ink.opacity(0.5))
            }
            Spacer(minLength: 0)
            if post.isPinned {
                PillLabel(String(localized: "Angepinnt"), systemImage: "pin.fill", prominent: true)
            }
        }
    }

    private func likeRow(_ post: Post) -> some View {
        HStack(spacing: 18) {
            Button {
                toggleLike()
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: post.likedByMe ? "heart.fill" : "heart")
                        .foregroundStyle(post.likedByMe ? activeBrand.color : Theme.ink.opacity(0.5))
                    Text(Format.compactCount(post.likeCount))
                        .monospacedDigit()
                        .contentTransition(.numericText())
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(post.likedByMe ? "Gefällt mir entfernen" : "Gefällt mir"))

            HStack(spacing: 5) {
                Image(systemName: "bubble.right")
                Text(Format.compactCount(post.commentCount))
                    .monospacedDigit()
                    .contentTransition(.numericText())
            }

            Spacer()
        }
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(Theme.ink.opacity(0.5))
    }

    @ViewBuilder
    private func postMedia(_ post: Post) -> some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        if let videoUrl = post.videoUrl, let url = AppConfig.mediaURL(videoUrl) {
            RemoteVideoPlayer(url: url)
                .aspectRatio(16 / 9, contentMode: .fit)
                .clipShape(shape)
        } else if post.imageUrl != nil {
            Color.clear
                .aspectRatio(16 / 9, contentMode: .fit)
                .overlay {
                    AsyncImageView(url: post.imageUrl)
                }
                .clipShape(shape)
        }
    }

    /// Gesperrter Inhalt: Teaser + `LockedOverlay` (Kauf) bzw. Mitglieds-Hinweis.
    private func lockedMedia(_ post: Post) -> some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        return Color.clear
            .aspectRatio(16 / 9, contentMode: .fit)
            .overlay {
                AsyncImageView(url: post.teaserUrl ?? post.imageUrl)
            }
            .overlay {
                if let unlock = post.unlock {
                    LockedOverlay(unlock: unlock) { unlock in
                        purchase(unlock)
                    }
                } else {
                    ZStack {
                        Rectangle().fill(.ultraThinMaterial)
                        activeBrand.color.opacity(0.25)
                        VStack(spacing: 10) {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 54, height: 54)
                                .glassEffect(.regular, in: .circle)
                            Text("Mit Mitgliedschaft verfügbar")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(.white)
                        }
                    }
                }
            }
            .clipShape(shape)
    }

    // MARK: - Kommentare

    private func commentsSection(_ detail: PostDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader("Kommentare") {
                Text(Format.compactCount(detail.post.commentCount))
                    .font(.system(size: 14, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(Theme.ink.opacity(0.5))
            }

            if detail.comments.isEmpty {
                Text("Noch keine Kommentare. Schreib den ersten.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.ink.opacity(0.5))
                    .padding(.vertical, 8)
            } else {
                LazyVStack(alignment: .leading, spacing: 16) {
                    ForEach(detail.comments) { comment in
                        CommentNodeView(comment: comment,
                                        depth: 0,
                                        showsVoting: detail.post.spaceType == .forum,
                                        onVote: { comment, dir in voteComment(comment, dir: dir) },
                                        onReply: { comment in beginReply(to: comment) })
                    }
                }
            }
        }
    }

    private func beginReply(to comment: Comment) {
        guard canComment else {
            requestCommentAccess()
            return
        }
        replyTo = comment
        commentFieldFocused = true
    }

    // MARK: - Eingabeleiste

    private var canComment: Bool {
        viewer?.isMember == true && viewer?.status == .active
    }

    @ViewBuilder
    private var commentBar: some View {
        VStack(spacing: 0) {
            Divider()
                .overlay(Theme.border)

            if canComment {
                VStack(alignment: .leading, spacing: 8) {
                    if let replyTo {
                        HStack(spacing: 6) {
                            Text("Antwort an \(replyTo.author.name)")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(activeBrand.color)
                            Button {
                                self.replyTo = nil
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.ink.opacity(0.4))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(Text("Antwort verwerfen"))
                        }
                    }

                    HStack(alignment: .bottom, spacing: 10) {
                        TextField("Kommentar schreiben", text: $commentText, axis: .vertical)
                            .lineLimit(1...4)
                            .font(.system(size: 15))
                            .focused($commentFieldFocused)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 9)
                            .background(Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .strokeBorder(Theme.border, lineWidth: 1)
                            )

                        Button {
                            sendComment()
                        } label: {
                            if isSendingComment {
                                ProgressView()
                                    .frame(width: 34, height: 34)
                            } else {
                                Image(systemName: "arrow.up.circle.fill")
                                    .font(.system(size: 30))
                                    .foregroundStyle(canSendComment ? activeBrand.color : Theme.ink.opacity(0.25))
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(!canSendComment || isSendingComment)
                        .accessibilityLabel(Text("Kommentar senden"))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            } else {
                HStack(spacing: 10) {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(activeBrand.color)
                    Text(appState.session.isLoggedIn
                         ? "Nur Mitglieder können kommentieren."
                         : "Melde dich an, um mitzudiskutieren.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.ink.opacity(0.65))
                    Spacer(minLength: 8)
                    Button(appState.session.isLoggedIn ? "Beitreten" : "Anmelden") {
                        requestCommentAccess()
                    }
                    .buttonStyle(.brand)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
        }
        .background(.regularMaterial)
    }

    private var canSendComment: Bool {
        !commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func requestCommentAccess() {
        if appState.session.isLoggedIn {
            showJoin = true
        } else {
            showLogin = true
        }
    }

    private func sendComment() {
        let body = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !isSendingComment else { return }
        isSendingComment = true
        let parentId = replyTo?.id

        Task {
            do {
                let comment = try await appState.api.createComment(slug: slug,
                                                                   postId: postId,
                                                                   body: body,
                                                                   parentId: parentId)
                insertComment(comment)
                commentText = ""
                replyTo = nil
                successTrigger += 1
            } catch {
                actionError = error.localizedDescription
            }
            isSendingComment = false
        }
    }

    /// Fügt den neuen Kommentar lokal in den Baum ein (ohne Neu-Laden).
    private func insertComment(_ comment: Comment) {
        guard var detail else { return }
        if let parentId = comment.parentId {
            if !Self.insert(comment, parentId: parentId, into: &detail.comments) {
                detail.comments.append(comment)
            }
        } else {
            detail.comments.append(comment)
        }
        detail.post.commentCount += 1
        withAnimation(.snappy(duration: 0.25)) {
            self.detail = detail
        }
    }

    private static func insert(_ comment: Comment,
                               parentId: String,
                               into comments: inout [Comment]) -> Bool {
        for index in comments.indices {
            if comments[index].id == parentId {
                comments[index].children.append(comment)
                return true
            }
            if insert(comment, parentId: parentId, into: &comments[index].children) {
                return true
            }
        }
        return false
    }

    private static func update(commentId: String,
                               in comments: inout [Comment],
                               transform: (inout Comment) -> Void) -> Bool {
        for index in comments.indices {
            if comments[index].id == commentId {
                transform(&comments[index])
                return true
            }
            if update(commentId: commentId, in: &comments[index].children, transform: transform) {
                return true
            }
        }
        return false
    }

    // MARK: - Aktionen

    private func toggleLike() {
        guard appState.session.isLoggedIn else {
            showLogin = true
            return
        }
        guard var detail else { return }
        let original = detail.post

        withAnimation(.snappy(duration: 0.25)) {
            detail.post.likedByMe.toggle()
            detail.post.likeCount += detail.post.likedByMe ? 1 : -1
            self.detail = detail
        }
        likeTrigger += 1

        Task {
            do {
                let response = try await appState.api.toggleReaction(slug: slug, postId: postId)
                self.detail?.post.likedByMe = response.liked
                self.detail?.post.likeCount = response.likeCount
            } catch {
                withAnimation(.snappy(duration: 0.25)) {
                    self.detail?.post.likedByMe = original.likedByMe
                    self.detail?.post.likeCount = original.likeCount
                }
            }
        }
    }

    private func votePost(dir: VoteDirection) {
        guard appState.session.isLoggedIn else {
            showLogin = true
            return
        }
        guard var detail else { return }
        let original = detail.post

        let optimistic = VoteMath.apply(score: original.score ?? 0,
                                        myVote: original.myVote,
                                        dir: dir)
        withAnimation(.snappy(duration: 0.25)) {
            detail.post.score = optimistic.score
            detail.post.myVote = optimistic.myVote
            self.detail = detail
        }
        likeTrigger += 1

        Task {
            do {
                let response = try await appState.api.vote(slug: slug,
                                                           targetType: .post,
                                                           targetId: postId,
                                                           postId: postId,
                                                           dir: dir)
                self.detail?.post.score = response.score
                self.detail?.post.myVote = response.myVote
            } catch {
                withAnimation(.snappy(duration: 0.25)) {
                    self.detail?.post.score = original.score
                    self.detail?.post.myVote = original.myVote
                }
            }
        }
    }

    private func voteComment(_ comment: Comment, dir: VoteDirection) {
        guard appState.session.isLoggedIn else {
            showLogin = true
            return
        }
        guard var detail else { return }
        let originalScore = comment.score
        let originalVote = comment.myVote

        let optimistic = VoteMath.apply(score: comment.score, myVote: comment.myVote, dir: dir)
        _ = Self.update(commentId: comment.id, in: &detail.comments) { current in
            current.score = optimistic.score
            current.myVote = optimistic.myVote
        }
        withAnimation(.snappy(duration: 0.25)) {
            self.detail = detail
        }
        likeTrigger += 1

        Task {
            do {
                let response = try await appState.api.vote(slug: slug,
                                                           targetType: .comment,
                                                           targetId: comment.id,
                                                           postId: postId,
                                                           dir: dir)
                applyCommentVote(commentId: comment.id, score: response.score, myVote: response.myVote)
            } catch {
                applyCommentVote(commentId: comment.id, score: originalScore, myVote: originalVote)
            }
        }
    }

    private func applyCommentVote(commentId: String, score: Int, myVote: VoteDirection?) {
        guard var detail else { return }
        _ = Self.update(commentId: commentId, in: &detail.comments) { current in
            current.score = score
            current.myVote = myVote
        }
        self.detail = detail
    }

    private func purchase(_ unlock: Unlock) {
        guard !appState.purchases.isPurchasing else { return }
        Task {
            do {
                try await appState.purchases.purchase(unlock: unlock, tenantSlug: slug)
                successTrigger += 1
                await load()
            } catch StoreError.cancelled {
                // Nutzer-Abbruch: bewusst kein Alert.
            } catch {
                actionError = error.localizedDescription
            }
        }
    }

    // MARK: - Laden

    private func load() async {
        do {
            async let postResponse = appState.api.post(slug: slug, postId: postId)
            // Viewer + Branding (Mitgliedsstatus, Community-Farben) parallel
            // laden; Fehler hier blockieren das Post-Detail nicht.
            async let loadedContext = loadCommunityContext()
            detail = try await postResponse
            let (loadedViewer, loadedBrand) = await loadedContext
            viewer = loadedViewer
            if let loadedBrand {
                communityBrand = loadedBrand
            }
            loadErrorMessage = nil
        } catch {
            if detail == nil {
                loadErrorMessage = error.localizedDescription
            }
        }
    }

    private func loadCommunityContext() async -> (Viewer?, BrandTheme?) {
        guard let response = try? await appState.api.community(slug: slug) else {
            return (nil, nil)
        }
        let theme = BrandTheme(primaryHex: response.community.primaryColor,
                               accentHex: response.community.accentColor)
        return (response.viewer, theme)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
            EmptyStateView(icon: "wifi.exclamationmark",
                           title: "Laden fehlgeschlagen",
                           message: LocalizedStringKey(message))
            Button("Erneut versuchen") {
                loadErrorMessage = nil
                Task { await load() }
            }
            .buttonStyle(.secondary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

// MARK: - CommentNodeView

/// Ein Kommentar mit rekursiv gerenderten Antworten; Einrückung bis
/// maximal drei Ebenen, optional mit kompaktem Vote-Control (FORUM).
private struct CommentNodeView: View {
    let comment: Comment
    let depth: Int
    let showsVoting: Bool
    let onVote: (Comment, VoteDirection) -> Void
    let onReply: (Comment) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                if showsVoting {
                    VoteControl(score: comment.score, myVote: comment.myVote, compact: true) { dir in
                        onVote(comment, dir)
                    }
                }

                AvatarView(url: comment.author.avatarUrl, name: comment.author.name, size: 28)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(comment.author.name)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        if let role = comment.author.role {
                            RoleBadge(role: role)
                        }
                        Text(comment.createdAt.relativeLabel)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.ink.opacity(0.45))
                    }

                    Text(comment.body)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.ink.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)

                    Button("Antworten") {
                        onReply(comment)
                    }
                    .buttonStyle(.ghost)
                    .font(.system(size: 12, weight: .medium))
                }

                Spacer(minLength: 0)
            }

            if !comment.children.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(comment.children) { child in
                        CommentNodeView(comment: child,
                                        depth: depth + 1,
                                        showsVoting: showsVoting,
                                        onVote: onVote,
                                        onReply: onReply)
                    }
                }
                .padding(.leading, depth < 3 ? 20 : 0)
            }
        }
    }
}
