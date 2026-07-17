import Foundation

// MARK: - APIError

/// Einheitlicher Fehler des `APIClient`. Server-Fehler (`{ error: { code, message } }`)
/// werden auf `code` gemappt; Transport- und Decoding-Fehler auf `.network`/`.decoding`.
struct APIError: Error, LocalizedError, Sendable {
    enum Code: String, Sendable {
        // Server-Codes (API-CONTRACT.md)
        case invalidCredentials = "invalid_credentials"
        case totpRequired = "totp_required"
        case emailAlreadyRegistered = "email_already_registered"
        case rateLimited = "rate_limited"
        case notMember = "not_member"
        case paymentRequired = "payment_required"
        case banned = "banned"
        case notFound = "not_found"
        case validation = "validation"
        case iapInvalid = "iap_invalid"
        case iapProductMismatch = "iap_product_mismatch"
        case physicalNotSupported = "physical_not_supported"
        case manageOnWeb = "manage_on_web"
        case nameTaken = "name_taken"
        case addressTaken = "address_taken"
        // Client-seitige Codes
        case unauthorized = "unauthorized"
        case network = "network_error"
        case decoding = "decoding_error"
        case unknown = "unknown"
    }

    let code: Code
    let message: String
    /// HTTP-Status; 0 bei Transportfehlern.
    let status: Int
    /// Roher Antwort-Body (z. B. für `GatedSpacePayload` bei 403).
    let responseBody: Data?

    var errorDescription: String? { message }

    /// Dekodiert zusätzliche Payload-Felder aus dem Fehler-Body,
    /// z. B. `decodeDetails(GatedSpacePayload.self)?.space` bei gesperrten Spaces.
    func decodeDetails<T: Decodable>(_ type: T.Type) -> T? {
        guard let responseBody else { return nil }
        return try? JSONDecoder.aera.decode(T.self, from: responseBody)
    }
}

// MARK: - APIClient

/// Typisierter Client für die Aera Mobile API (`/api/mobile/v1`).
/// Eine Methode pro Vertrags-Route; Bearer-Token kommt aus dem `SessionStore`.
@MainActor
final class APIClient {
    private let sessionStore: SessionStore
    private let urlSession: URLSession

    init(sessionStore: SessionStore, urlSession: URLSession = .shared) {
        self.sessionStore = sessionStore
        self.urlSession = urlSession
    }

    // MARK: - Auth

    /// `POST /auth/signup` — Rate-Limit 5/h/IP (`rate_limited`).
    /// Session anschließend via `session.apply(token:user:)` setzen.
    func signup(name: String, email: String, password: String) async throws -> AuthResponse {
        try await send(Endpoint(.post, "auth/signup"),
                       body: SignupBody(name: name, email: email, password: password))
    }

    /// `POST /auth/login` — bei aktivem TOTP ohne/mit falschem Code:
    /// 401 mit `code == .totpRequired`.
    func login(email: String, password: String, totp: String? = nil) async throws -> AuthResponse {
        try await send(Endpoint(.post, "auth/login"),
                       body: LoginBody(email: email, password: password, totp: totp))
    }

    /// `POST /auth/password-reset` — antwortet immer `{ ok: true }` (keine Enumeration).
    func requestPasswordReset(email: String) async throws {
        let _: OKEnvelope = try await send(Endpoint(.post, "auth/password-reset"),
                                           body: EmailBody(email: email))
    }

    /// `GET /auth/me`
    func me() async throws -> MeResponse {
        try await send(Endpoint(.get, "auth/me"))
    }

    /// `PATCH /auth/profile`
    func updateProfile(name: String? = nil, avatarUrl: String? = nil) async throws -> User {
        let envelope: UserEnvelope = try await send(Endpoint(.patch, "auth/profile"),
                                                    body: ProfileBody(name: name, avatarUrl: avatarUrl))
        return envelope.user
    }

    /// `POST /auth/change-password` — liefert ein neues JWT (alte Sessions invalidiert).
    /// Anschließend `session.apply(token:)` aufrufen.
    func changePassword(currentPassword: String, newPassword: String) async throws -> String {
        let envelope: TokenEnvelope = try await send(
            Endpoint(.post, "auth/change-password"),
            body: ChangePasswordBody(currentPassword: currentPassword, newPassword: newPassword)
        )
        return envelope.token
    }

    /// `POST /auth/avatar` — Multipart-Upload (`file` + `tenant`-Slug einer Mitgliedschaft).
    /// Liefert die URL des hochgeladenen Bilds.
    func uploadAvatar(imageData: Data, mimeType: String = "image/jpeg", tenant: String) async throws -> String {
        var form = MultipartFormData()
        form.addField(name: "tenant", value: tenant)
        let fileExtension = mimeType == "image/png" ? "png" : "jpg"
        form.addFile(name: "file", filename: "avatar.\(fileExtension)", mimeType: mimeType, data: imageData)

        var request = makeRequest(Endpoint(.post, "auth/avatar"))
        request.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = form.encoded()

        let envelope: URLEnvelope = try await perform(request)
        return envelope.url
    }

    // MARK: - Discover (Token optional)

    /// `GET /discover` — personalisiert, wenn ein Token vorhanden ist.
    func discover() async throws -> DiscoverResponse {
        try await send(Endpoint(.get, "discover"))
    }

    /// `GET /discover/search?q=&category=`
    func searchCommunities(query: String, category: String? = nil) async throws -> [CommunityCard] {
        var items = [URLQueryItem(name: "q", value: query)]
        if let category, !category.isEmpty {
            items.append(URLQueryItem(name: "category", value: category))
        }
        let envelope: DataResponse<CommunityCard> = try await send(
            Endpoint(.get, "discover/search", query: items)
        )
        return envelope.data
    }

    // MARK: - Community erstellen

    /// `GET /communities/name-check?name=` — Live-Verfügbarkeit eines
    /// Community-Namens. Liefert den Status-String:
    /// `"available"`, `"taken"`, `"short"` oder `"long"`.
    func checkCommunityName(_ name: String) async throws -> String {
        let envelope: NameStatusEnvelope = try await send(
            Endpoint(.get, "communities/name-check",
                     query: [URLQueryItem(name: "name", value: name)])
        )
        return envelope.status
    }

    /// `POST /communities` — legt eine neue Community an (Owner-Membership,
    /// Free-Tier und Default-Spaces werden serverseitig geseedet) und liefert
    /// den Slug. Fehler: 409 `name_taken`/`address_taken`.
    /// `locale` steuert die Sprache der geseedeten Inhalte.
    func createCommunity(name: String,
                         tagline: String? = nil,
                         category: String? = nil,
                         locale: String = Locale.current.language.languageCode?.identifier ?? "de") async throws -> String {
        let envelope: SlugEnvelope = try await send(
            Endpoint(.post, "communities"),
            body: CreateCommunityBody(name: name, tagline: tagline, category: category, locale: locale)
        )
        return envelope.slug
    }

    // MARK: - Community

    /// `GET /c/{slug}` — Token optional, gated je nach Viewer.
    func community(slug: String) async throws -> CommunityResponse {
        try await send(Endpoint(.get, "c/\(slug)"))
    }

    /// `POST /c/{slug}/join-free` — 409 `payment_required` wenn kein Free-Tier
    /// existiert, 403 `banned`.
    func joinFree(slug: String) async throws -> Viewer {
        let envelope: ViewerEnvelope = try await send(Endpoint(.post, "c/\(slug)/join-free"))
        return envelope.viewer
    }

    /// `GET /c/{slug}/tiers`
    func tiers(slug: String) async throws -> [Tier] {
        let envelope: DataResponse<Tier> = try await send(Endpoint(.get, "c/\(slug)/tiers"))
        return envelope.data
    }

    /// `POST /c/{slug}/membership/cancel` — nur für nicht-Apple-Abos;
    /// Stripe-Abos antworten mit 409 `manage_on_web`.
    /// Apple-Abos werden über die iOS-Abo-Verwaltung gekündigt.
    func cancelMembership(slug: String) async throws {
        let _: OKEnvelope = try await send(Endpoint(.post, "c/\(slug)/membership/cancel"))
    }

    /// `GET /c/{slug}/space/{spaceSlug}?q=&tab=&cursor=&page=`
    ///
    /// Bei nicht zugänglichem Space wirft die Methode `APIError` mit
    /// `.notMember`/`.paymentRequired`; der Server liefert `space` trotzdem —
    /// über `error.decodeDetails(GatedSpacePayload.self)?.space` für die Paywall-UI.
    ///
    /// `page` wird nur von BLOG-Spaces ausgewertet (seitenbasiertes Paging),
    /// `cursor` von FEED/FORUM/VIDEOS/PODCAST (Cursor-Paging).
    func space(slug: String,
               spaceSlug: String,
               q: String? = nil,
               tab: ForumTab? = nil,
               cursor: String? = nil,
               page: Int? = nil) async throws -> SpaceResponse {
        var items: [URLQueryItem] = []
        if let q, !q.isEmpty { items.append(URLQueryItem(name: "q", value: q)) }
        if let tab { items.append(URLQueryItem(name: "tab", value: tab.rawValue)) }
        if let cursor { items.append(URLQueryItem(name: "cursor", value: cursor)) }
        if let page { items.append(URLQueryItem(name: "page", value: String(page))) }
        return try await send(Endpoint(.get, "c/\(slug)/space/\(spaceSlug)", query: items))
    }

    // MARK: - Posts & Engagement

    /// `GET /c/{slug}/posts/{postId}` — Kommentare verschachtelt;
    /// gated Post → Felder genullt + `locked`.
    func post(slug: String, postId: String) async throws -> PostDetailResponse {
        try await send(Endpoint(.get, "c/\(slug)/posts/\(postId)"))
    }

    /// `POST /c/{slug}/posts`
    func createPost(slug: String, spaceSlug: String, title: String? = nil, body: String) async throws -> Post {
        let envelope: PostEnvelope = try await send(
            Endpoint(.post, "c/\(slug)/posts"),
            body: CreatePostBody(spaceSlug: spaceSlug, title: title, body: body)
        )
        return envelope.post
    }

    /// `POST /c/{slug}/comments`
    func createComment(slug: String, postId: String, body: String, parentId: String? = nil) async throws -> Comment {
        let envelope: CommentEnvelope = try await send(
            Endpoint(.post, "c/\(slug)/comments"),
            body: CreateCommentBody(postId: postId, body: body, parentId: parentId)
        )
        return envelope.comment
    }

    /// `POST /c/{slug}/reactions/toggle`
    func toggleReaction(slug: String, postId: String) async throws -> ReactionResponse {
        try await send(Endpoint(.post, "c/\(slug)/reactions/toggle"),
                       body: PostIdBody(postId: postId))
    }

    /// `POST /c/{slug}/vote`
    func vote(slug: String,
              targetType: VoteTargetType,
              targetId: String,
              postId: String,
              dir: VoteDirection) async throws -> VoteResponse {
        try await send(Endpoint(.post, "c/\(slug)/vote"),
                       body: VoteBody(targetType: targetType, targetId: targetId, postId: postId, dir: dir))
    }

    /// `POST /c/{slug}/events/{eventId}/rsvp`
    func rsvp(slug: String, eventId: String) async throws -> RSVPResponse {
        try await send(Endpoint(.post, "c/\(slug)/events/\(eventId)/rsvp"))
    }

    /// `POST /c/{slug}/lessons/{lessonId}/complete`
    func completeLesson(slug: String, lessonId: String) async throws -> LessonCompletionResponse {
        try await send(Endpoint(.post, "c/\(slug)/lessons/\(lessonId)/complete"))
    }

    /// `POST /c/{slug}/requests`
    func createRequest(slug: String, title: String, body: String) async throws -> MemberRequest {
        try await send(Endpoint(.post, "c/\(slug)/requests"),
                       body: CreateRequestBody(title: title, body: body))
    }

    /// `POST /c/{slug}/requests/{id}/vote`
    func voteRequest(slug: String, requestId: String, dir: VoteDirection) async throws -> VoteResponse {
        try await send(Endpoint(.post, "c/\(slug)/requests/\(requestId)/vote"),
                       body: DirBody(dir: dir))
    }

    /// `POST /c/{slug}/booking/{slotId}/reserve` — nur freie Slots
    /// (bezahlte Slots laufen über den IAP-Flow + `validateIAP`).
    func reserveBookingSlot(slug: String, slotId: String) async throws -> ReservationStatus {
        let envelope: ReservationEnvelope = try await send(
            Endpoint(.post, "c/\(slug)/booking/\(slotId)/reserve")
        )
        return envelope.status
    }

    // MARK: - Chat & Live

    /// `GET /c/{slug}/chat`
    func conversations(slug: String) async throws -> [Conversation] {
        let envelope: ConversationsEnvelope = try await send(Endpoint(.get, "c/\(slug)/chat"))
        return envelope.conversations
    }

    /// `GET /c/{slug}/chat/{conversationId}?after={messageId}` — Polling, aufsteigend.
    func messages(slug: String, conversationId: String, after: String? = nil) async throws -> [ChatMessage] {
        var items: [URLQueryItem] = []
        if let after { items.append(URLQueryItem(name: "after", value: after)) }
        let envelope: MessagesEnvelope = try await send(
            Endpoint(.get, "c/\(slug)/chat/\(conversationId)", query: items)
        )
        return envelope.messages
    }

    /// `POST /c/{slug}/chat/{conversationId}`
    func sendMessage(slug: String, conversationId: String, body: String) async throws -> ChatMessage {
        let envelope: MessageEnvelope = try await send(
            Endpoint(.post, "c/\(slug)/chat/\(conversationId)"),
            body: MessageBody(body: body)
        )
        return envelope.message
    }

    /// `POST /c/{slug}/chat/direct`
    func openDirectConversation(slug: String, userId: String) async throws -> Conversation {
        let envelope: ConversationEnvelope = try await send(
            Endpoint(.post, "c/\(slug)/chat/direct"),
            body: UserIdBody(userId: userId)
        )
        return envelope.conversation
    }

    /// `GET /c/{slug}/live/{sessionId}?after=`
    func liveSession(slug: String, sessionId: String, after: String? = nil) async throws -> LiveSessionResponse {
        var items: [URLQueryItem] = []
        if let after { items.append(URLQueryItem(name: "after", value: after)) }
        return try await send(Endpoint(.get, "c/\(slug)/live/\(sessionId)", query: items))
    }

    /// `POST /c/{slug}/live/{sessionId}`
    func sendLiveMessage(slug: String, sessionId: String, body: String) async throws -> ChatMessage {
        let envelope: MessageEnvelope = try await send(
            Endpoint(.post, "c/\(slug)/live/\(sessionId)"),
            body: MessageBody(body: body)
        )
        return envelope.message
    }

    // MARK: - Member-Bereich

    /// `GET /c/{slug}/leaderboard`
    func leaderboard(slug: String) async throws -> LeaderboardResponse {
        try await send(Endpoint(.get, "c/\(slug)/leaderboard"))
    }

    /// `GET /c/{slug}/members?cursor=`
    func members(slug: String, cursor: String? = nil) async throws -> MembersResponse {
        var items: [URLQueryItem] = []
        if let cursor { items.append(URLQueryItem(name: "cursor", value: cursor)) }
        return try await send(Endpoint(.get, "c/\(slug)/members", query: items))
    }

    /// `GET /c/{slug}/library`
    func library(slug: String) async throws -> LibraryResponse {
        try await send(Endpoint(.get, "c/\(slug)/library"))
    }

    /// `GET /c/{slug}/search?q=` — je Kategorie max. 10 Treffer.
    func searchCommunity(slug: String, query: String) async throws -> CommunitySearchResponse {
        try await send(Endpoint(.get, "c/\(slug)/search",
                                query: [URLQueryItem(name: "q", value: query)]))
    }

    /// `GET /c/{slug}/notifications` — markiert danach alle als gelesen.
    func notifications(slug: String) async throws -> [AppNotification] {
        let envelope: DataResponse<AppNotification> = try await send(
            Endpoint(.get, "c/\(slug)/notifications")
        )
        return envelope.data
    }

    /// `GET /me/orders` — über alle Tenants (`Order.communityName` gesetzt).
    func myOrders() async throws -> [Order] {
        let envelope: DataResponse<Order> = try await send(Endpoint(.get, "me/orders"))
        return envelope.data
    }

    // MARK: - Apple In-App-Purchases

    /// `POST /iap/validate` — sendet die JWS-signierte StoreKit-2-Transaktion.
    /// Fehler: 400 `iap_invalid` / `iap_product_mismatch`.
    /// `refId` ist nur bei `kind == .tier` optional (Restore ohne lokalen
    /// Kaufkontext): der Server leitet das Tier dann aus der `productId` ab.
    func validateIAP(tenantSlug: String,
                     jws: String,
                     kind: IAPPurchaseKind,
                     refId: String? = nil) async throws -> IAPValidateResponse {
        try await send(Endpoint(.post, "iap/validate"),
                       body: IAPValidateBody(tenantSlug: tenantSlug, jws: jws, kind: kind, refId: refId))
    }

    // MARK: - Studio (Creator-Verwaltung)

    /// `GET /studio` — alle Tenants, in denen der User OWNER/ADMIN/MODERATOR ist.
    func studioCommunities() async throws -> [StudioCommunity] {
        let envelope: StudioCommunitiesResponse = try await send(Endpoint(.get, "studio"))
        return envelope.communities
    }

    /// `GET /studio/{slug}/overview` — Kennzahlen + letzte Aktivität.
    func studioOverview(slug: String) async throws -> StudioOverview {
        try await send(Endpoint(.get, "studio/\(slug)/overview"))
    }

    /// `GET /studio/{slug}/posts?filter=&cursor=` — `scheduled` aufsteigend
    /// nach Go-live, `published` absteigend nach `publishedAt`.
    func studioPosts(slug: String,
                     filter: StudioPostFilter? = nil,
                     cursor: String? = nil) async throws -> DataResponse<StudioPost> {
        var items: [URLQueryItem] = []
        if let filter { items.append(URLQueryItem(name: "filter", value: filter.rawValue)) }
        if let cursor { items.append(URLQueryItem(name: "cursor", value: cursor)) }
        return try await send(Endpoint(.get, "studio/\(slug)/posts", query: items))
    }

    /// `POST /studio/{slug}/posts` — `publishedAt` in der Zukunft ⇒ geplanter
    /// Post (Cron veröffentlicht); fehlend/vergangen ⇒ sofort live.
    func createStudioPost(slug: String,
                          spaceSlug: String,
                          title: String? = nil,
                          body: String,
                          publishedAt: Date? = nil) async throws -> StudioPost {
        try await send(
            Endpoint(.post, "studio/\(slug)/posts"),
            body: CreateStudioPostBody(
                spaceSlug: spaceSlug,
                title: title,
                body: body,
                publishedAt: publishedAt.map { AeraDateParser.standard.string(from: $0) }
            )
        )
    }

    /// `DELETE /studio/{slug}/posts/{postId}` — Rolle ≥ MODERATOR;
    /// entfernt Post + Suchindex-Eintrag.
    func deleteStudioPost(slug: String, postId: String) async throws {
        let _: OKEnvelope = try await send(Endpoint(.delete, "studio/\(slug)/posts/\(postId)"))
    }

    /// `POST /studio/{slug}/posts/{postId}/pin` — Toggle, liefert den neuen Zustand.
    func togglePinStudioPost(slug: String, postId: String) async throws -> Bool {
        let envelope: PinEnvelope = try await send(
            Endpoint(.post, "studio/\(slug)/posts/\(postId)/pin")
        )
        return envelope.isPinned
    }

    /// `GET /studio/{slug}/members?status=&q=&cursor=` — aufsteigend nach
    /// `joinedAt`; Cursor = interne Membership-ID aus `nextCursor`.
    func studioMembers(slug: String,
                       status: MemberStatus? = nil,
                       query: String? = nil,
                       cursor: String? = nil) async throws -> DataResponse<StudioMember> {
        var items: [URLQueryItem] = []
        if let status { items.append(URLQueryItem(name: "status", value: status.rawValue)) }
        if let query, !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
        if let cursor { items.append(URLQueryItem(name: "cursor", value: cursor)) }
        return try await send(Endpoint(.get, "studio/\(slug)/members", query: items))
    }

    /// `POST /studio/{slug}/members/{userId}` — approve/ban/unban.
    /// OWNER und die eigene Membership sind serverseitig geschützt (403).
    func memberAction(slug: String,
                      userId: String,
                      action: StudioMemberAction) async throws -> StudioMember {
        let envelope: StudioMemberEnvelope = try await send(
            Endpoint(.post, "studio/\(slug)/members/\(userId)"),
            body: StudioMemberActionBody(action: action)
        )
        return envelope.member
    }

    /// `GET /studio/{slug}/requests?status=` — alle Requests inkl. DECLINED
    /// (max. 100), sortiert wie im Web (score desc, createdAt desc).
    func studioRequests(slug: String, status: RequestStatus? = nil) async throws -> [StudioRequest] {
        var items: [URLQueryItem] = []
        if let status { items.append(URLQueryItem(name: "status", value: status.rawValue)) }
        let envelope: DataResponse<StudioRequest> = try await send(
            Endpoint(.get, "studio/\(slug)/requests", query: items)
        )
        return envelope.data
    }

    /// `POST /studio/{slug}/requests/{requestId}` — accept/decline/fulfill;
    /// liefert den aktualisierten Request.
    func requestAction(slug: String,
                       requestId: String,
                       action: StudioRequestAction) async throws -> StudioRequest {
        try await send(Endpoint(.post, "studio/\(slug)/requests/\(requestId)"),
                       body: StudioRequestActionBody(action: action))
    }

    /// `GET /studio/{slug}/orders?status=&cursor=` — absteigend nach `createdAt`.
    func studioOrders(slug: String,
                      status: OrderStatus? = nil,
                      cursor: String? = nil) async throws -> DataResponse<StudioOrder> {
        var items: [URLQueryItem] = []
        if let status { items.append(URLQueryItem(name: "status", value: status.rawValue)) }
        if let cursor { items.append(URLQueryItem(name: "cursor", value: cursor)) }
        return try await send(Endpoint(.get, "studio/\(slug)/orders", query: items))
    }

    /// `POST /studio/{slug}/orders/{orderId}/fulfill` — markiert die
    /// Bestellung als erfüllt/versendet (idempotent).
    func fulfillOrder(slug: String, orderId: String) async throws {
        let _: FulfilledEnvelope = try await send(
            Endpoint(.post, "studio/\(slug)/orders/\(orderId)/fulfill")
        )
    }

    /// `POST /studio/{slug}/events` — legt ein Event an; Space-Ermittlung wie
    /// im Web-Dashboard (expliziter/erster EVENTS-Space, sonst Auto-Anlage).
    func createStudioEvent(slug: String,
                           spaceSlug: String? = nil,
                           title: String,
                           description: String? = nil,
                           startsAt: Date,
                           endsAt: Date? = nil,
                           location: String? = nil,
                           isOnline: Bool = false,
                           meetingUrl: String? = nil,
                           capacity: Int? = nil) async throws -> Event {
        try await send(
            Endpoint(.post, "studio/\(slug)/events"),
            body: CreateStudioEventBody(
                spaceSlug: spaceSlug,
                title: title,
                description: description,
                startsAt: AeraDateParser.standard.string(from: startsAt),
                endsAt: endsAt.map { AeraDateParser.standard.string(from: $0) },
                location: location,
                isOnline: isOnline,
                meetingUrl: meetingUrl,
                capacity: capacity
            )
        )
    }

    /// `DELETE /studio/{slug}/events/{eventId}` — entfernt Event + Suchindex-Eintrag.
    func deleteStudioEvent(slug: String, eventId: String) async throws {
        let _: OKEnvelope = try await send(Endpoint(.delete, "studio/\(slug)/events/\(eventId)"))
    }

    // MARK: - Kern

    private func makeRequest(_ endpoint: Endpoint) -> URLRequest {
        var request = URLRequest(url: endpoint.url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = sessionStore.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func send<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        try await perform(makeRequest(endpoint))
    }

    private func send<T: Decodable, B: Encodable>(_ endpoint: Endpoint, body: B) async throws -> T {
        var request = makeRequest(endpoint)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            request.httpBody = try JSONEncoder().encode(body)
        } catch {
            throw APIError(code: .unknown,
                           message: String(localized: "Anfrage konnte nicht erstellt werden."),
                           status: 0,
                           responseBody: nil)
        }
        return try await perform(request)
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            throw APIError(code: .network,
                           message: error.localizedDescription,
                           status: 0,
                           responseBody: nil)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError(code: .unknown,
                           message: String(localized: "Ungültige Serverantwort."),
                           status: 0,
                           responseBody: nil)
        }

        guard (200..<300).contains(http.statusCode) else {
            if let envelope = try? JSONDecoder.aera.decode(ErrorEnvelope.self, from: data) {
                let code = APIError.Code(rawValue: envelope.error.code) ?? .unknown
                throw APIError(code: code,
                               message: envelope.error.message,
                               status: http.statusCode,
                               responseBody: data)
            }
            throw APIError(code: http.statusCode == 401 ? .unauthorized : .unknown,
                           message: String(localized: "Serverfehler (\(http.statusCode))."),
                           status: http.statusCode,
                           responseBody: data)
        }

        do {
            return try JSONDecoder.aera.decode(T.self, from: data)
        } catch {
            throw APIError(code: .decoding,
                           message: String(localized: "Antwort konnte nicht gelesen werden."),
                           status: http.statusCode,
                           responseBody: data)
        }
    }
}

// MARK: - Request-Bodies & Envelopes (privat)

private struct SignupBody: Encodable {
    let name: String
    let email: String
    let password: String
}

private struct LoginBody: Encodable {
    let email: String
    let password: String
    let totp: String?
}

private struct EmailBody: Encodable {
    let email: String
}

private struct ProfileBody: Encodable {
    let name: String?
    let avatarUrl: String?
}

private struct ChangePasswordBody: Encodable {
    let currentPassword: String
    let newPassword: String
}

private struct CreateCommunityBody: Encodable {
    let name: String
    /// `nil` → Feld wird weggelassen (synthetisiertes `encodeIfPresent`).
    let tagline: String?
    let category: String?
    let locale: String
}

private struct CreatePostBody: Encodable {
    let spaceSlug: String
    let title: String?
    let body: String
}

private struct CreateCommentBody: Encodable {
    let postId: String
    let body: String
    let parentId: String?
}

private struct PostIdBody: Encodable {
    let postId: String
}

private struct VoteBody: Encodable {
    let targetType: VoteTargetType
    let targetId: String
    let postId: String
    let dir: VoteDirection
}

private struct CreateRequestBody: Encodable {
    let title: String
    let body: String
}

private struct DirBody: Encodable {
    let dir: VoteDirection
}

private struct MessageBody: Encodable {
    let body: String
}

private struct UserIdBody: Encodable {
    let userId: String
}

private struct CreateStudioPostBody: Encodable {
    let spaceSlug: String
    /// `nil` → Feld wird weggelassen (synthetisiertes `encodeIfPresent`).
    let title: String?
    let body: String
    /// ISO-8601; in der Zukunft ⇒ geplanter Post.
    let publishedAt: String?
}

private struct StudioMemberActionBody: Encodable {
    let action: StudioMemberAction
}

private struct StudioRequestActionBody: Encodable {
    let action: StudioRequestAction
}

private struct CreateStudioEventBody: Encodable {
    /// `nil` → Feld wird weggelassen (synthetisiertes `encodeIfPresent`).
    let spaceSlug: String?
    let title: String
    let description: String?
    let startsAt: String
    let endsAt: String?
    let location: String?
    let isOnline: Bool
    let meetingUrl: String?
    let capacity: Int?
}

private struct IAPValidateBody: Encodable {
    let tenantSlug: String
    let jws: String
    let kind: IAPPurchaseKind
    /// `nil` → Feld wird weggelassen (synthetisiertes `encodeIfPresent`).
    let refId: String?
}

private struct ErrorEnvelope: Decodable {
    struct Payload: Decodable {
        let code: String
        let message: String
    }

    let error: Payload
}

private struct OKEnvelope: Decodable {
    let ok: Bool
}

private struct UserEnvelope: Decodable {
    let user: User
}

private struct TokenEnvelope: Decodable {
    let token: String
}

private struct URLEnvelope: Decodable {
    let url: String
}

private struct ViewerEnvelope: Decodable {
    let viewer: Viewer
}

private struct NameStatusEnvelope: Decodable {
    let status: String
}

private struct SlugEnvelope: Decodable {
    let slug: String
}

private struct PostEnvelope: Decodable {
    let post: Post
}

private struct CommentEnvelope: Decodable {
    let comment: Comment
}

private struct ConversationsEnvelope: Decodable {
    let conversations: [Conversation]
}

private struct ConversationEnvelope: Decodable {
    let conversation: Conversation
}

private struct MessagesEnvelope: Decodable {
    let messages: [ChatMessage]
}

private struct MessageEnvelope: Decodable {
    let message: ChatMessage
}

private struct ReservationEnvelope: Decodable {
    let status: ReservationStatus
}

private struct PinEnvelope: Decodable {
    let isPinned: Bool
}

private struct StudioMemberEnvelope: Decodable {
    let member: StudioMember
}

private struct FulfilledEnvelope: Decodable {
    let fulfilled: Bool
}
