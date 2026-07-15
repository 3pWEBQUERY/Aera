import SwiftUI
import UIKit

/// Rendert HTML (Blog, Newsletter, Knowledge) als `AttributedString`
/// mit Serif-Body (17 pt, Zeilenhöhe ~1.7). Die Konvertierung über
/// `NSAttributedString(data:options:)` muss auf dem MainActor laufen —
/// sie wird deshalb als async Factory im `.task` ausgeführt; bis dahin
/// (und bei Fehlern) wird der Plain-Text-Fallback gezeigt.
struct HTMLTextView: View {
    let html: String
    var fontSize: CGFloat = 17

    @State private var attributed: AttributedString?

    init(html: String, fontSize: CGFloat = 17) {
        self.html = html
        self.fontSize = fontSize
    }

    var body: some View {
        Group {
            if let attributed {
                Text(attributed)
            } else {
                Text(HTMLRenderer.plainText(from: html))
                    .font(.displaySerif(fontSize, weight: .regular))
                    .foregroundStyle(Theme.ink)
            }
        }
        .lineSpacing(fontSize * 0.4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: html) {
            attributed = await HTMLRenderer.render(html: html, fontSize: fontSize)
        }
    }
}

enum HTMLRenderer {
    /// Konvertiert HTML in einen AttributedString mit Serif-Fonts.
    /// Muss auf dem MainActor laufen (WebKit-basierter HTML-Import).
    @MainActor
    static func render(html: String, fontSize: CGFloat = 17) async -> AttributedString? {
        // Erst rendern lassen, damit der erste Frame nicht blockiert.
        await Task.yield()

        guard let data = html.data(using: .utf8) else { return nil }
        let options: [NSAttributedString.DocumentReadingOptionKey: Any] = [
            .documentType: NSAttributedString.DocumentType.html,
            .characterEncoding: String.Encoding.utf8.rawValue
        ]
        guard let source = try? NSMutableAttributedString(
            data: data,
            options: options,
            documentAttributes: nil
        ) else {
            return nil
        }

        let fullRange = NSRange(location: 0, length: source.length)

        // Fonts auf System-Serif (New York) umstellen; relative Größen
        // (Überschriften) und Bold/Italic-Traits bleiben erhalten.
        source.enumerateAttribute(.font, in: fullRange) { value, range, _ in
            let existing = value as? UIFont
            let baseSize = existing?.pointSize ?? 12
            let targetSize = fontSize * (baseSize / 12)
            let traits = existing?.fontDescriptor.symbolicTraits ?? []
            let weight: UIFont.Weight = traits.contains(.traitBold) ? .semibold : .regular

            var descriptor = UIFont.systemFont(ofSize: targetSize, weight: weight).fontDescriptor
            if let serif = descriptor.withDesign(.serif) {
                descriptor = serif
            }
            if traits.contains(.traitItalic),
               let italic = descriptor.withSymbolicTraits(descriptor.symbolicTraits.union(.traitItalic)) {
                descriptor = italic
            }
            source.addAttribute(.font, value: UIFont(descriptor: descriptor, size: targetSize), range: range)
        }

        // Textfarbe auf Ink setzen — Links behalten ihre Tint-Färbung.
        source.enumerateAttribute(.link, in: fullRange) { value, range, _ in
            if value == nil {
                source.addAttribute(.foregroundColor, value: UIColor(Theme.ink), range: range)
            }
        }

        // Abschließende Leerzeilen des HTML-Imports entfernen.
        while source.string.hasSuffix("\n") {
            source.deleteCharacters(in: NSRange(location: source.length - 1, length: 1))
        }

        return AttributedString(source)
    }

    /// Grober Plain-Text-Fallback (Tags entfernt, Basis-Entities dekodiert).
    static func plainText(from html: String) -> String {
        var text = html.replacingOccurrences(
            of: "<[^>]+>",
            with: " ",
            options: .regularExpression
        )
        text = text
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
        return text
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
