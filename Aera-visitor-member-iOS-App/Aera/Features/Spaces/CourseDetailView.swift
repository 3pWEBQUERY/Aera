import SwiftUI

/// Kurs-Detail: Header (Video/Stream bei ONLINE, Infokarte bei OFFLINE),
/// Lektionsliste mit Nummer-Badge, Dauer, Zustand (abgeschlossen/offen/
/// Drip-gesperrt/Preview). Lektionen sind aufklappbar (Text + Video).
struct CourseDetailView: View {
    let slug: String
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    @State private var course: Course
    @State private var expandedLessonIds: Set<String> = []
    @State private var completingLessonId: String?
    @State private var errorMessage: String?
    @State private var completionSuccessCount = 0

    init(slug: String, course: Course, reload: @escaping () async -> Void) {
        self.slug = slug
        self.reload = reload
        self._course = State(initialValue: course)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header

                Text(course.title)
                    .font(.displaySerif(26))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)

                if let description = course.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.ink.opacity(0.7))
                }

                if !course.accessible {
                    inaccessibleHint
                }

                progressCard

                if course.lessons.isEmpty {
                    EmptyStateView(
                        icon: "graduationcap",
                        title: "Noch keine Lektionen",
                        message: "Dieser Kurs enthält noch keine Lektionen."
                    )
                } else {
                    SectionHeader("Lektionen")
                    VStack(spacing: 10) {
                        ForEach(Array(course.lessons.enumerated()), id: \.element.id) { index, lesson in
                            lessonRow(lesson, number: index + 1)
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.paper)
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationTitle(course.title)
        .navigationBarTitleDisplayMode(.inline)
        .sensoryFeedback(.success, trigger: completionSuccessCount)
        .alert("Aktion fehlgeschlagen", isPresented: errorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    // MARK: - Header

    @ViewBuilder
    private var header: some View {
        if course.format == .online {
            if let videoUrl = course.videoUrl, let url = AppConfig.mediaURL(videoUrl) {
                RemoteVideoPlayer(url: url)
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else if let streamUrl = course.streamUrl, let url = AppConfig.mediaURL(streamUrl) {
                Link(destination: url) {
                    HStack(spacing: 8) {
                        Image(systemName: "dot.radiowaves.left.and.right")
                        Text("Zum Livestream")
                    }
                }
                .buttonStyle(.brand(fullWidth: true))
            } else if let coverUrl = course.coverUrl {
                Color.clear
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .overlay {
                        AsyncImageView(url: coverUrl)
                    }
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        } else {
            offlineInfoCard
        }
    }

    /// OFFLINE-Kurs: Infokarte mit Ort, Adresse und Termin.
    private var offlineInfoCard: some View {
        AeraCard(padding: 16, cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 12) {
                EyebrowLabel("Vor-Ort-Kurs")
                if let location = course.location, !location.isEmpty {
                    infoRow(icon: "mappin.and.ellipse", text: location)
                }
                if let address = course.address, !address.isEmpty {
                    infoRow(icon: "signpost.right", text: address)
                }
                if let startsAt = course.startsAt {
                    infoRow(
                        icon: "calendar",
                        text: startsAt.formatted(date: .long, time: .shortened)
                    )
                }
                if course.location == nil && course.address == nil && course.startsAt == nil {
                    Text("Details zu Ort und Termin folgen.")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.ink.opacity(0.55))
                }
            }
        }
    }

    private func infoRow(icon: String, text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(brand.color)
                .frame(width: 20)
            Text(text)
                .font(.system(size: 15))
                .foregroundStyle(Theme.ink.opacity(0.8))
        }
    }

    /// Hinweis-Karte, wenn der Kurs nicht in der Mitgliedschaft enthalten ist.
    private var inaccessibleHint: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: "lock.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.amber800)
            Text("Dieser Kurs ist in deiner Mitgliedschaft nicht enthalten. Vorschau-Lektionen kannst du trotzdem ansehen.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.amber800)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.amber50, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Theme.amber200, lineWidth: 1)
        )
    }

    private var progressCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            ProgressView(value: progressValue)
                .tint(brand.color)
            Text("\(course.progress.completed)/\(course.progress.total) Lektionen abgeschlossen")
                .font(.system(size: 13, weight: .medium))
                .monospacedDigit()
                .foregroundStyle(Theme.ink.opacity(0.55))
        }
    }

    private var progressValue: Double {
        guard course.progress.total > 0 else { return 0 }
        return Double(course.progress.completed) / Double(course.progress.total)
    }

    // MARK: - Lektionen

    private func lessonRow(_ lesson: Lesson, number: Int) -> some View {
        let isExpanded = expandedLessonIds.contains(lesson.id)
        let canExpand = lesson.unlocked && (hasContent(lesson) || hasVideo(lesson))

        return AeraCard(padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center, spacing: 12) {
                    numberBadge(number, lesson: lesson)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(lesson.title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.ink.opacity(lesson.unlocked ? 1 : 0.45))
                        HStack(spacing: 8) {
                            if let durationSec = lesson.durationSec {
                                HStack(spacing: 3) {
                                    Image(systemName: "clock")
                                        .font(.system(size: 10, weight: .medium))
                                    Text(Format.duration(seconds: durationSec))
                                        .monospacedDigit()
                                }
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.ink.opacity(0.5))
                            }
                            if lesson.isPreview {
                                PillLabel(String(localized: "Preview"), prominent: true)
                            }
                        }
                    }

                    Spacer(minLength: 8)

                    lessonStateControl(for: lesson)

                    if canExpand {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.ink.opacity(0.4))
                            .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    }
                }
                .contentShape(.rect)
                .onTapGesture {
                    guard canExpand else { return }
                    withAnimation(.snappy(duration: 0.25)) {
                        if isExpanded {
                            expandedLessonIds.remove(lesson.id)
                        } else {
                            expandedLessonIds.insert(lesson.id)
                        }
                    }
                }

                if isExpanded {
                    VStack(alignment: .leading, spacing: 12) {
                        if let videoUrl = lesson.videoUrl, let url = AppConfig.mediaURL(videoUrl) {
                            RemoteVideoPlayer(url: url)
                                .aspectRatio(16 / 9, contentMode: .fit)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                        if let content = lesson.content, !content.isEmpty {
                            Text(content)
                                .font(.system(size: 15))
                                .foregroundStyle(Theme.ink.opacity(0.8))
                        }
                    }
                }
            }
        }
    }

    private func numberBadge(_ number: Int, lesson: Lesson) -> some View {
        Text("\(number)")
            .font(.system(size: 13, weight: .semibold))
            .monospacedDigit()
            .foregroundStyle(lesson.completed ? .white : brand.color)
            .frame(width: 30, height: 30)
            .background(lesson.completed ? brand.color : brand.soft, in: .circle)
    }

    @ViewBuilder
    private func lessonStateControl(for lesson: Lesson) -> some View {
        if lesson.completed {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(brand.color)
        } else if !lesson.unlocked {
            HStack(spacing: 4) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 10, weight: .semibold))
                if let days = lesson.daysUntilUnlock {
                    Text(days == 1 ? String(localized: "In 1 Tag") : String(localized: "In \(days) Tagen"))
                        .monospacedDigit()
                }
            }
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Theme.ink.opacity(0.45))
        } else if completingLessonId == lesson.id {
            ProgressView()
                .controlSize(.small)
        } else {
            Button {
                complete(lesson)
            } label: {
                Text("Abschließen")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(brand.color)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(brand.soft, in: .capsule)
            }
            .buttonStyle(.plain)
            .disabled(completingLessonId != nil)
        }
    }

    private func hasContent(_ lesson: Lesson) -> Bool {
        guard let content = lesson.content else { return false }
        return !content.isEmpty
    }

    private func hasVideo(_ lesson: Lesson) -> Bool {
        guard let videoUrl = lesson.videoUrl else { return false }
        return AppConfig.mediaURL(videoUrl) != nil
    }

    // MARK: - Abschließen

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )
    }

    private func complete(_ lesson: Lesson) {
        guard completingLessonId == nil else { return }
        completingLessonId = lesson.id
        Task {
            do {
                let response = try await appState.api.completeLesson(slug: slug, lessonId: lesson.id)
                if let index = course.lessons.firstIndex(where: { $0.id == lesson.id }) {
                    course.lessons[index].completed = true
                }
                course.progress = response.progress
                completionSuccessCount += 1
                await reload()
            } catch {
                errorMessage = error.localizedDescription
            }
            completingLessonId = nil
        }
    }
}
