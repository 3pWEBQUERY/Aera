import SwiftUI

/// Horizontale Space-Chip-Bar (DESIGN.md §3/4): Chips in einem
/// `GlassEffectContainer`; aktiver Chip mit Brand-Tint und weißem Text,
/// gesperrte Spaces mit Lock-Badge. Auswahl per Binding (Space-Slug).
struct GlassChipBar: View {
    let spaces: [SpaceSummary]
    @Binding var selection: String?

    @Environment(\.brand) private var brand

    init(spaces: [SpaceSummary], selection: Binding<String?>) {
        self.spaces = spaces
        self._selection = selection
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal) {
                GlassEffectContainer(spacing: 10) {
                    HStack(spacing: 10) {
                        ForEach(spaces) { space in
                            chip(for: space)
                                .id(space.slug)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
            }
            .scrollIndicators(.hidden)
            .onAppear {
                if let selection {
                    proxy.scrollTo(selection, anchor: .center)
                }
            }
            .onChange(of: selection) { _, newValue in
                guard let newValue else { return }
                withAnimation(.snappy(duration: 0.25)) {
                    proxy.scrollTo(newValue, anchor: .center)
                }
            }
        }
    }

    private func chip(for space: SpaceSummary) -> some View {
        let isActive = selection == space.slug
        return Button {
            withAnimation(.snappy(duration: 0.25)) {
                selection = space.slug
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: space.type.symbolName)
                    .font(.system(size: 12, weight: .semibold))
                Text(space.name)
                    .font(.system(size: 14, weight: isActive ? .semibold : .medium))
                    .lineLimit(1)
                if !space.accessible {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 9, weight: .semibold))
                        .opacity(0.7)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .foregroundStyle(isActive ? .white : Theme.ink)
        }
        .buttonStyle(.plain)
        .glassEffect(isActive ? .regular.tint(brand.color).interactive() : .regular.interactive())
    }
}
