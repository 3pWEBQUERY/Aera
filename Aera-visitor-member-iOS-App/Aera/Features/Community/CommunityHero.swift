import SwiftUI

/// Kopfbereich der Community — fünf Ausführungen, wie sie der Creator im
/// Layout-Editor wählt (`lib/layout.ts`, `components/community/community-hero.tsx`).
///
/// Die Zeile darunter stellt er selbst zusammen: aus Bereichen, eingebauten
/// Seiten, eigenen Adressen und den beiden Aktionen. Was nicht in die Zeile
/// passt, liegt hinter dem „…"-Knopf.
struct CommunityHeroView: View {
    let community: CommunityDetail
    let viewer: Viewer
    let header: CommunityHeader?
    let onMenu: (HeroMenuItem) -> Void

    @Environment(\.brand) private var brand

    private var variant: HeaderVariant { header?.variant ?? .editorial }
    private var mosaic: [String] { header?.mosaic ?? [] }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            switch variant {
            case .editorial:
                editorial
            case .mosaic:
                mosaicHeader
            case .spotlight:
                spotlight
            case .immersive:
                immersive
            case .compact:
                compact
            }

            if let menu = header?.menu, !menu.isEmpty {
                HeroMenuBar(menu: menu, onSelect: onMenu)
            }
        }
    }

    // MARK: - Ausführungen

    /// Der ruhige Standard: Titelbild, darunter Logo, Name und Kennzahlen.
    private var editorial: some View {
        VStack(alignment: .leading, spacing: 14) {
            cover
                .aspectRatio(16 / 9, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .strokeBorder(Theme.border, lineWidth: 1)
                )
            identity
            stats
        }
    }

    /// Mosaik: die Bilder, die der Creator dafür hochgeladen hat. Ohne Bilder
    /// bleibt es beim Titelbild — ein leeres Raster wäre schlechter als keins.
    @ViewBuilder
    private var mosaicHeader: some View {
        if mosaic.isEmpty {
            editorial
        } else {
            VStack(alignment: .leading, spacing: 14) {
                mosaicGrid
                    .frame(height: 230)
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                identity
                stats
            }
        }
    }

    private var mosaicGrid: some View {
        let columns = min(3, max(1, mosaic.count))
        let rows: [[String]] = stride(from: 0, to: mosaic.count, by: columns).map {
            Array(mosaic[$0..<min($0 + columns, mosaic.count)])
        }
        return VStack(spacing: 3) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 3) {
                    ForEach(row, id: \.self) { url in
                        Color.clear
                            .overlay { AsyncImageView(url: url) }
                            .clipped()
                    }
                }
            }
        }
    }

    /// Spotlight: Name und Logo liegen auf dem Bild.
    private var spotlight: some View {
        VStack(alignment: .leading, spacing: 14) {
            cover
                .aspectRatio(16 / 9, contentMode: .fit)
                .overlay {
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.7)],
                        startPoint: .center,
                        endPoint: .bottom
                    )
                }
                .overlay(alignment: .bottomLeading) {
                    HStack(alignment: .center, spacing: 12) {
                        logo
                        VStack(alignment: .leading, spacing: 3) {
                            Text(community.name)
                                .font(.displaySerif(26))
                                .kerning(-0.4)
                                .foregroundStyle(.white)
                                .lineLimit(2)
                            if let tagline = community.tagline, !tagline.isEmpty {
                                Text(tagline)
                                    .font(.system(size: 13))
                                    .foregroundStyle(.white.opacity(0.8))
                                    .lineLimit(2)
                            }
                        }
                    }
                    .padding(16)
                }
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            stats
        }
    }

    /// Immersiv: hohes Bild, das die Seite trägt.
    private var immersive: some View {
        VStack(alignment: .leading, spacing: 14) {
            cover
                .frame(height: 320)
                .overlay {
                    LinearGradient(
                        colors: [.black.opacity(0.15), .black.opacity(0.75)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
                .overlay(alignment: .bottomLeading) {
                    VStack(alignment: .leading, spacing: 8) {
                        logo
                        Text(community.name)
                            .font(.displaySerif(30))
                            .kerning(-0.5)
                            .foregroundStyle(.white)
                            .lineLimit(3)
                        if let tagline = community.tagline, !tagline.isEmpty {
                            Text(tagline)
                                .font(.system(size: 14))
                                .foregroundStyle(.white.opacity(0.85))
                                .lineLimit(3)
                        }
                    }
                    .padding(18)
                }
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            stats
        }
    }

    /// Kompakt: kein Bild, nur wer hier spricht.
    private var compact: some View {
        VStack(alignment: .leading, spacing: 12) {
            identity
            stats
        }
    }

    // MARK: - Bausteine

    @ViewBuilder
    private var cover: some View {
        if community.coverUrl != nil {
            Color.clear
                .overlay { AsyncImageView(url: community.coverUrl) }
                .clipped()
        } else {
            BrandCoverPlaceholder(name: community.name, brand: brand)
        }
    }

    private var identity: some View {
        HStack(alignment: .center, spacing: 12) {
            logo
            VStack(alignment: .leading, spacing: 3) {
                Text(community.name)
                    .font(.displaySerif(28))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2)
                if let tagline = community.tagline, !tagline.isEmpty {
                    Text(tagline)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.ink.opacity(0.6))
                        .lineLimit(2)
                }
            }
        }
    }

    private var logo: some View {
        let shape = RoundedRectangle(cornerRadius: 8, style: .continuous)
        return Group {
            if community.logoUrl != nil {
                AsyncImageView(url: community.logoUrl)
            } else {
                ZStack {
                    brand.soft
                    Text(String(community.name.prefix(1)).uppercased())
                        .font(.displaySerif(18))
                        .foregroundStyle(brand.color)
                }
            }
        }
        .frame(width: 44, height: 44)
        .clipShape(shape)
        .overlay(shape.strokeBorder(.black.opacity(0.05), lineWidth: 1))
    }

    private var stats: some View {
        HStack(spacing: 6) {
            PillLabel(String(localized: "\(community.memberCount) Mitglieder"),
                      systemImage: "person.2")
            if viewer.isMember, let levelName = viewer.levelName {
                LevelChip(levelName: levelName, points: viewer.points)
            }
            if let role = viewer.role {
                RoleBadge(role: role)
            }
        }
    }
}

// MARK: - Menüzeile

/// Die Zeile unter der Kopfzeile. Was der Creator in die Zeile gelegt hat,
/// steht in der Zeile; der Rest liegt hinter dem „…"-Knopf.
struct HeroMenuBar: View {
    let menu: HeroMenu
    let onSelect: (HeroMenuItem) -> Void

    @Environment(\.brand) private var brand
    @State private var showMore = false

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(menu.bar) { item in
                    Button {
                        onSelect(item)
                    } label: {
                        Label {
                            Text(item.title)
                        } icon: {
                            Image(systemName: item.type.symbolName)
                        }
                        .font(.system(size: 14, weight: .semibold))
                        .labelStyle(.titleAndIcon)
                    }
                    .buttonStyle(style(for: item.style))
                }

                if !menu.more.isEmpty {
                    Button {
                        showMore = true
                    } label: {
                        if let label = menu.moreLabel, !label.isEmpty {
                            Text(label)
                                .font(.system(size: 14, weight: .semibold))
                        } else {
                            Image(systemName: "ellipsis")
                                .font(.system(size: 15, weight: .semibold))
                        }
                    }
                    .buttonStyle(.secondary)
                    .accessibilityLabel(Text(menu.moreLabel ?? String(localized: "Mehr")))
                }
            }
            .padding(.vertical, 2)
        }
        .scrollIndicators(.hidden)
        .sheet(isPresented: $showMore) {
            moreSheet
        }
    }

    private func style(for style: HeroMenuStyle) -> AnyButtonStyle {
        switch style {
        case .solid: AnyButtonStyle(BrandButtonStyle())
        case .outline: AnyButtonStyle(SecondaryButtonStyle())
        case .plain: AnyButtonStyle(GhostButtonStyle())
        }
    }

    private var moreSheet: some View {
        NavigationStack {
            List {
                ForEach(menu.more) { item in
                    Button {
                        showMore = false
                        // Erst schließen, dann handeln — sonst kämpfen Blatt
                        // und Ziel um die Bühne.
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                            onSelect(item)
                        }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: item.type.symbolName)
                                .font(.system(size: 15))
                                .foregroundStyle(brand.color)
                                .frame(width: 24)
                            Text(item.title)
                                .font(.system(size: 15))
                                .foregroundStyle(Theme.ink)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Theme.ink.opacity(0.3))
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .listStyle(.plain)
            .navigationTitle(menu.moreLabel.map { Text($0) } ?? Text("Mehr"))
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Teilen

/// Ziel des Teilen-Blatts.
struct ShareTarget: Identifiable, Hashable {
    let url: URL

    var id: String { url.absoluteString }
}

/// Systemeigenes Teilen-Blatt.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// Typgelöschter Button-Stil — die Zeile mischt drei Stile in einer Schleife.
struct AnyButtonStyle: ButtonStyle {
    private let bodyBuilder: (Configuration) -> AnyView

    init<S: ButtonStyle>(_ style: S) {
        bodyBuilder = { configuration in
            AnyView(style.makeBody(configuration: configuration))
        }
    }

    func makeBody(configuration: Configuration) -> some View {
        bodyBuilder(configuration)
    }
}
