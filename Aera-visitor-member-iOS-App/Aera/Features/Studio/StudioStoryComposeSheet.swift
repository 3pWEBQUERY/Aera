import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/// Sheet „Story veröffentlichen": Bild ODER Video über den PhotosPicker,
/// Vorschau, optionale Caption (≤ 280 Zeichen). Veröffentlichen lädt das
/// Medium über `POST /studio/{slug}/upload` (purpose `story`) hoch und legt
/// die Story über `POST /studio/{slug}/stories` an (24 h sichtbar).
/// Gleiches Sheet-Muster wie `StudioEventComposeSheet`.
struct StudioStoryComposeSheet: View {
    let slug: String
    let onPublished: () -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    /// Ausgewähltes, fertig aufbereitetes Medium.
    private struct PickedMedia {
        var data: Data
        var mediaType: MediaType
        var mimeType: String
        var filename: String
        /// Nur bei Bildern: Vorschau.
        var previewImage: UIImage?
    }

    @State private var pickerItem: PhotosPickerItem?
    @State private var media: PickedMedia?
    @State private var isLoadingMedia = false
    @State private var caption = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private static let captionLimit = 280
    /// Upload-Limit des Servers für Videos (512 MB).
    private static let maxVideoBytes = 512 * 1024 * 1024

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    mediaSection

                    captionSection

                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Image(systemName: "clock")
                            .font(.system(size: 11, weight: .medium))
                        Text("Stories sind 24 Stunden sichtbar.")
                            .font(.system(size: 12))
                    }
                    .foregroundStyle(Theme.ink.opacity(0.5))

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
            .navigationTitle("Story veröffentlichen")
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
                            Text("Veröffentlichen")
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(!canSubmit || isSubmitting)
                }
            }
        }
        .interactiveDismissDisabled(isSubmitting)
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { await loadMedia(item) }
        }
    }

    // MARK: - Medium

    @ViewBuilder
    private var mediaSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Bild oder Video")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.ink.opacity(0.7))

            if isLoadingMedia {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Theme.softFill)
                    ProgressView()
                }
                .frame(height: 220)
            } else if let media {
                ZStack(alignment: .topTrailing) {
                    mediaPreview(media)

                    Button {
                        withAnimation(.snappy(duration: 0.25)) {
                            removeMedia()
                        }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 26, height: 26)
                            .background(.black.opacity(0.55), in: .circle)
                    }
                    .buttonStyle(.plain)
                    .padding(8)
                    .disabled(isSubmitting)
                    .accessibilityLabel(Text("Medium entfernen"))
                }
            } else {
                PhotosPicker(selection: $pickerItem,
                             matching: .any(of: [.images, .videos])) {
                    VStack(spacing: 10) {
                        Image(systemName: "photo.badge.plus")
                            .font(.system(size: 22, weight: .medium))
                            .foregroundStyle(Theme.ink.opacity(0.5))
                        Text("Bild oder Video auswählen")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Theme.ink.opacity(0.7))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 160)
                    .background {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(Theme.ink.opacity(0.15),
                                          style: StrokeStyle(lineWidth: 1, dash: [6, 5]))
                    }
                }
                .disabled(isSubmitting)
            }
        }
    }

    @ViewBuilder
    private func mediaPreview(_ media: PickedMedia) -> some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        if let image = media.previewImage {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity)
                .frame(height: 260)
                .clipShape(shape)
                .overlay(shape.strokeBorder(Theme.border, lineWidth: 1))
        } else {
            ZStack {
                shape.fill(Theme.rail)
                VStack(spacing: 8) {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 34, weight: .medium))
                        .foregroundStyle(.white)
                    Text("Video · \(Self.byteLabel(media.data.count))")
                        .font(.system(size: 13, weight: .medium))
                        .monospacedDigit()
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
            .frame(height: 200)
        }
    }

    private func removeMedia() {
        pickerItem = nil
        media = nil
    }

    private static func byteLabel(_ bytes: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }

    // MARK: - Caption

    private var captionSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Caption (optional)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.ink.opacity(0.7))
                Spacer()
                Text("\(trimmedCaption.count)/\(Self.captionLimit)")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(trimmedCaption.count > Self.captionLimit
                                     ? Theme.danger
                                     : Theme.ink.opacity(0.45))
            }
            TextField("Was gibt es Neues?", text: $caption, axis: .vertical)
                .lineLimit(2...5)
                .authInputStyle()
        }
    }

    private var trimmedCaption: String {
        caption.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Medium laden

    private func loadMedia(_ item: PhotosPickerItem) async {
        defer { pickerItem = nil }
        isLoadingMedia = true
        defer { isLoadingMedia = false }

        guard let data = try? await item.loadTransferable(type: Data.self) else {
            errorMessage = String(localized: "Das Medium konnte nicht geladen werden.")
            return
        }

        let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
        if isVideo {
            guard data.count <= Self.maxVideoBytes else {
                errorMessage = String(localized: "Das Video ist zu groß (max. 512 MB).")
                return
            }
            let mimeType = Self.videoMimeType(for: item.supportedContentTypes)
            let fileExtension = Self.videoExtension(for: mimeType)
            withAnimation(.snappy(duration: 0.25)) {
                media = PickedMedia(data: data,
                                    mediaType: .video,
                                    mimeType: mimeType,
                                    filename: "story.\(fileExtension)",
                                    previewImage: nil)
            }
        } else {
            guard let image = UIImage(data: data),
                  let jpegData = image.studioResized(maxDimension: 2048)
                      .jpegData(compressionQuality: 0.85) else {
                errorMessage = String(localized: "Das Bild konnte nicht verarbeitet werden.")
                return
            }
            withAnimation(.snappy(duration: 0.25)) {
                media = PickedMedia(data: jpegData,
                                    mediaType: .image,
                                    mimeType: "image/jpeg",
                                    filename: "story.jpg",
                                    previewImage: image)
            }
        }
        errorMessage = nil
    }

    /// Server-seitig erlaubte Video-MIME-Typen (lib/storage: VIDEO_EXT).
    private static let allowedVideoMimeTypes: Set<String> = [
        "video/mp4", "video/webm", "video/ogg",
        "video/quicktime", "video/x-matroska", "video/x-m4v",
    ]

    private static func videoMimeType(for types: [UTType]) -> String {
        for type in types where type.conforms(to: .movie) {
            if let mime = type.preferredMIMEType, allowedVideoMimeTypes.contains(mime) {
                return mime
            }
        }
        return "video/mp4"
    }

    private static func videoExtension(for mimeType: String) -> String {
        switch mimeType {
        case "video/webm": "webm"
        case "video/ogg": "ogv"
        case "video/quicktime": "mov"
        case "video/x-matroska": "mkv"
        case "video/x-m4v": "m4v"
        default: "mp4"
        }
    }

    // MARK: - Absenden

    private var canSubmit: Bool {
        media != nil && trimmedCaption.count <= Self.captionLimit
    }

    private func submit() {
        guard canSubmit, !isSubmitting, let media else { return }
        isSubmitting = true
        errorMessage = nil
        let captionValue = trimmedCaption
        Task {
            do {
                let mediaUrl = try await appState.api.studioUpload(
                    slug: slug,
                    purpose: .story,
                    fileData: media.data,
                    filename: media.filename,
                    mimeType: media.mimeType
                )
                try await appState.api.createStudioStory(
                    slug: slug,
                    mediaUrl: mediaUrl,
                    mediaType: media.mediaType,
                    caption: captionValue.isEmpty ? nil : captionValue
                )
                onPublished()
                dismiss()
            } catch let error as APIError where error.code == .noStoriesSpace {
                errorMessage = String(localized: "Diese Community hat keinen Stories-Bereich. Lege ihn im Web-Dashboard an.")
                isSubmitting = false
            } catch {
                errorMessage = error.localizedDescription
                isSubmitting = false
            }
        }
    }
}
