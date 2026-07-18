import SwiftUI

/// COURSE-Space: Kurs-Karten mit 16:9-Cover, Format-Pill und Fortschritt.
/// Tap öffnet das Kurs-Detail (`CourseDetailView`).
struct CoursesSpaceView: View {
    let slug: String
    let space: SpaceDetail
    let content: CoursesContent
    let viewer: Viewer
    let reload: () async -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.brand) private var brand

    init(slug: String,
         space: SpaceDetail,
         content: CoursesContent,
         viewer: Viewer,
         reload: @escaping () async -> Void) {
        self.slug = slug
        self.space = space
        self.content = content
        self.viewer = viewer
        self.reload = reload
    }

    var body: some View {
        LazyVStack(spacing: 16) {
            if content.courses.isEmpty {
                EmptyStateView(
                    icon: "graduationcap",
                    title: "Noch keine Kurse",
                    message: "Sobald hier Kurse veröffentlicht werden, erscheinen sie an dieser Stelle."
                )
            } else {
                ForEach(content.courses) { course in
                    NavigationLink {
                        CourseDetailView(slug: slug, course: course, reload: reload)
                    } label: {
                        courseCard(for: course)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 16)
    }

    private func courseCard(for course: Course) -> some View {
        AeraCard(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Color.clear
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .overlay {
                        AsyncImageView(url: course.coverUrl)
                    }
                    .overlay(alignment: .topLeading) {
                        if !course.accessible {
                            HStack(spacing: 4) {
                                Image(systemName: "lock.fill")
                                    .font(.system(size: 10, weight: .semibold))
                                Text("Gesperrt")
                                    .font(.system(size: 11, weight: .semibold))
                            }
                            .foregroundStyle(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Theme.rail.opacity(0.85), in: .capsule)
                            .padding(8)
                        }
                    }
                    .clipped()
                    .clipShape(
                        UnevenRoundedRectangle(
                            topLeadingRadius: 12,
                            topTrailingRadius: 12
                        )
                    )

                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(course.title)
                            .font(.displaySerif(20))
                            .kerning(-0.4)
                            .foregroundStyle(Theme.ink)
                        Spacer(minLength: 0)
                        PillLabel(
                            course.format == .online
                                ? String(localized: "Online")
                                : String(localized: "Vor Ort"),
                            systemImage: course.format == .online ? "play.circle" : "mappin.circle"
                        )
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        ProgressView(value: progressValue(for: course))
                            .tint(brand.color)
                        Text("\(course.progress.completed)/\(course.progress.total) Lektionen")
                            .font(.system(size: 13, weight: .medium))
                            .monospacedDigit()
                            .foregroundStyle(Theme.ink.opacity(0.55))
                    }
                }
                .padding(16)
            }
        }
    }

    private func progressValue(for course: Course) -> Double {
        guard course.progress.total > 0 else { return 0 }
        return Double(course.progress.completed) / Double(course.progress.total)
    }
}
