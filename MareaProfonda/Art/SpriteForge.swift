import SpriteKit

/// Converte le immagini in memoria in texture di SpriteKit.
enum TextureFactory {
    static func cgImage(width: Int, height: Int, premultiplied: [UInt8]) -> CGImage? {
        guard width > 0, height > 0, premultiplied.count == width * height * 4 else { return nil }
        let data: Data = Data(premultiplied)
        guard let provider: CGDataProvider = CGDataProvider(data: data as CFData) else { return nil }
        let info: CGBitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
        return CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                       space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: info, provider: provider,
                       decode: nil, shouldInterpolate: false, intent: CGColorRenderingIntent.defaultIntent)
    }

    static func texture(from buffer: PixelBuffer, filtering: SKTextureFilteringMode = SKTextureFilteringMode.nearest) -> SKTexture {
        return texture(width: buffer.width, height: buffer.height, premultiplied: buffer.premultipliedData(), filtering: filtering)
    }

    static func texture(width: Int, height: Int, premultiplied: [UInt8], filtering: SKTextureFilteringMode) -> SKTexture {
        guard let image: CGImage = cgImage(width: width, height: height, premultiplied: premultiplied) else {
            return SKTexture()
        }
        let texture: SKTexture = SKTexture(cgImage: image)
        texture.filteringMode = filtering
        return texture
    }

    /// Texture bianca piena: base per gli sprite disegnati interamente da uno shader.
    static let white: SKTexture = TextureFactory.texture(from: PixelBuffer(width: 4, height: 4, fill: RGBA.white))
}

/// Fucina degli sprite: legge i file `.spr` del bundle (matrici ASCII con palette indicizzata),
/// li rasterizza, li impacchetta in atlanti e fornisce le texture al gioco.
/// Il risultato è conservato su disco e riusato finché i file non cambiano.
final class SpriteForge {
    static let shared: SpriteForge = SpriteForge()
    private static let cacheVersion: String = "v1"

    private var textures: [String: SKTexture] = [:]
    private var placements: [String: AtlasPlacement] = [:]
    private var pages: [SKTexture] = []
    private var reportedMissing: Set<String> = []
    private(set) var isLoaded: Bool = false
    private(set) var loadedFromCache: Bool = false
    private(set) var problems: [String] = []

    private lazy var missingTexture: SKTexture = {
        var buffer: PixelBuffer = PixelBuffer(width: 8, height: 8, fill: RGBA(hex: 0xFF00FF))
        var y: Int = 0
        while y < 8 {
            var x: Int = 0
            while x < 8 {
                if (x / 4 + y / 4) % 2 == 0 { buffer.set(x, y, RGBA.black) }
                x += 1
            }
            y += 1
        }
        return TextureFactory.texture(from: buffer)
    }()

    private init() {}

    var spriteCount: Int { return placements.count }
    var pageCount: Int { return pages.count }

    // MARK: - Caricamento

    func loadIfNeeded() {
        if isLoaded { return }
        isLoaded = true

        let sources: [(name: String, data: Data)] = readSources()
        if sources.isEmpty {
            problems.append("nessun file .spr nel bundle")
            return
        }
        let key: String = SpriteForge.cacheKey(sources)
        if let cached: (pages: [(width: Int, height: Int, bytes: [UInt8])], placements: [String: AtlasPlacement]) = readCache(key: key) {
            install(pages: cached.pages, placements: cached.placements)
            loadedFromCache = true
            return
        }

        var library: SpriteLibrary = SpriteLibrary()
        for source in sources {
            guard let text: String = String(data: source.data, encoding: String.Encoding.utf8) else {
                problems.append("\(source.name): testo non leggibile")
                continue
            }
            do {
                try library.parse(text: text, fileName: source.name)
            } catch {
                problems.append("\(error)")
            }
        }
        problems.append(contentsOf: library.validate())

        var items: [AtlasPacker.Item] = []
        for sprite in library.expandedSprites() {
            items.append(AtlasPacker.Item(name: sprite.name, image: library.rasterize(sprite), anchorX: sprite.anchorX, anchorY: sprite.anchorY))
        }
        let result: AtlasResult = AtlasPacker.pack(items)
        var rawPages: [(width: Int, height: Int, bytes: [UInt8])] = []
        for page in result.pages {
            rawPages.append((width: page.width, height: page.height, bytes: page.premultipliedData()))
        }
        install(pages: rawPages, placements: result.placements)
        if problems.isEmpty {
            writeCache(key: key, pages: rawPages, placements: result.placements)
        }
    }

    private func install(pages rawPages: [(width: Int, height: Int, bytes: [UInt8])], placements newPlacements: [String: AtlasPlacement]) {
        pages = rawPages.map { (page: (width: Int, height: Int, bytes: [UInt8])) -> SKTexture in
            return TextureFactory.texture(width: page.width, height: page.height, premultiplied: page.bytes, filtering: SKTextureFilteringMode.nearest)
        }
        placements = newPlacements
        textures.removeAll(keepingCapacity: true)
        for (name, place) in newPlacements {
            guard place.page >= 0, place.page < pages.count else { continue }
            let pageWidth: CGFloat = CGFloat(rawPages[place.page].width)
            let pageHeight: CGFloat = CGFloat(rawPages[place.page].height)
            let rect: CGRect = CGRect(x: CGFloat(place.x) / pageWidth,
                                      y: 1.0 - CGFloat(place.y + place.height) / pageHeight,
                                      width: CGFloat(place.width) / pageWidth,
                                      height: CGFloat(place.height) / pageHeight)
            let texture: SKTexture = SKTexture(rect: rect, in: pages[place.page])
            texture.filteringMode = SKTextureFilteringMode.nearest
            textures[name] = texture
        }
    }

    private func readSources() -> [(name: String, data: Data)] {
        guard let directory: URL = Bundle.main.url(forResource: "Sprites", withExtension: nil) else { return [] }
        let files: [URL] = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        var out: [(name: String, data: Data)] = []
        for url in files.sorted(by: { (a: URL, b: URL) -> Bool in a.lastPathComponent < b.lastPathComponent }) where url.pathExtension == "spr" {
            if let data: Data = try? Data(contentsOf: url) {
                out.append((name: url.lastPathComponent, data: data))
            }
        }
        return out
    }

    // MARK: - Cache su disco

    private static func cacheKey(_ sources: [(name: String, data: Data)]) -> String {
        var h: UInt64 = 0xCBF2_9CE4_8422_2325
        for source in sources {
            for b in source.name.utf8 {
                h ^= UInt64(b)
                h = h &* 0x1000_0000_01B3
            }
            source.data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) -> Void in
                for b in raw {
                    h ^= UInt64(b)
                    h = h &* 0x1000_0000_01B3
                }
            }
        }
        return cacheVersion + "-" + String(h, radix: 16)
    }

    private struct CacheIndex: Codable {
        let pageWidths: [Int]
        let pageHeights: [Int]
        let placements: [String: AtlasPlacement]
    }

    private var cacheRoot: URL? {
        return FileManager.default.urls(for: FileManager.SearchPathDirectory.cachesDirectory, in: FileManager.SearchPathDomainMask.userDomainMask).first?
            .appendingPathComponent("SpriteForge", isDirectory: true)
    }

    private func readCache(key: String) -> (pages: [(width: Int, height: Int, bytes: [UInt8])], placements: [String: AtlasPlacement])? {
        guard let directory: URL = cacheRoot?.appendingPathComponent(key, isDirectory: true),
              let indexData: Data = try? Data(contentsOf: directory.appendingPathComponent("index.json")),
              let index: CacheIndex = try? JSONDecoder().decode(CacheIndex.self, from: indexData),
              index.pageWidths.count == index.pageHeights.count else { return nil }
        var pages: [(width: Int, height: Int, bytes: [UInt8])] = []
        for i in 0..<index.pageWidths.count {
            guard let data: Data = try? Data(contentsOf: directory.appendingPathComponent("page\(i).rgba")),
                  data.count == index.pageWidths[i] * index.pageHeights[i] * 4 else { return nil }
            pages.append((width: index.pageWidths[i], height: index.pageHeights[i], bytes: [UInt8](data)))
        }
        return (pages: pages, placements: index.placements)
    }

    private func writeCache(key: String, pages: [(width: Int, height: Int, bytes: [UInt8])], placements: [String: AtlasPlacement]) {
        guard let root: URL = cacheRoot else { return }
        let fm: FileManager = FileManager.default
        // Le versioni precedenti non servono più.
        try? fm.removeItem(at: root)
        let directory: URL = root.appendingPathComponent(key, isDirectory: true)
        do {
            try fm.createDirectory(at: directory, withIntermediateDirectories: true)
            for (i, page) in pages.enumerated() {
                try Data(page.bytes).write(to: directory.appendingPathComponent("page\(i).rgba"), options: Data.WritingOptions.atomic)
            }
            let index: CacheIndex = CacheIndex(pageWidths: pages.map { $0.width }, pageHeights: pages.map { $0.height }, placements: placements)
            try JSONEncoder().encode(index).write(to: directory.appendingPathComponent("index.json"), options: Data.WritingOptions.atomic)
        } catch {
            try? fm.removeItem(at: root)
        }
    }

    // MARK: - Accesso

    func has(_ name: String) -> Bool {
        loadIfNeeded()
        return textures[name] != nil
    }

    func texture(_ name: String) -> SKTexture {
        loadIfNeeded()
        if let texture: SKTexture = textures[name] { return texture }
        if !reportedMissing.contains(name) {
            reportedMissing.insert(name)
            problems.append("sprite mancante: \(name)")
            NSLog("SpriteForge: sprite mancante '%@'", name)
        }
        return missingTexture
    }

    /// Fotogrammi `prefix_0`, `prefix_1`, ... finché esistono.
    func frames(_ prefix: String) -> [SKTexture] {
        loadIfNeeded()
        var out: [SKTexture] = []
        var i: Int = 0
        while let texture: SKTexture = textures["\(prefix)_\(i)"] {
            out.append(texture)
            i += 1
        }
        if out.isEmpty { out.append(texture(prefix + "_0")) }
        return out
    }

    /// Punto di ancoraggio normalizzato dichiarato nel file `.spr`.
    func anchor(_ name: String) -> CGPoint {
        guard let place: AtlasPlacement = placements[name], place.width > 0, place.height > 0 else {
            return CGPoint(x: 0.5, y: 0.5)
        }
        return CGPoint(x: CGFloat(place.anchorX) / CGFloat(place.width), y: 1.0 - CGFloat(place.anchorY) / CGFloat(place.height))
    }

    func pixelSize(_ name: String) -> CGSize {
        guard let place: AtlasPlacement = placements[name] else { return CGSize(width: 8, height: 8) }
        return CGSize(width: place.width, height: place.height)
    }

    /// Nodo pronto all'uso con texture e ancoraggio.
    func node(_ name: String) -> SKSpriteNode {
        let node: SKSpriteNode = SKSpriteNode(texture: texture(name))
        node.anchorPoint = anchor(name)
        return node
    }
}
