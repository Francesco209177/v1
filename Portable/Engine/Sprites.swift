/// Magazzino degli sprite della versione portabile: legge i file `.spr` (gli stessi dell'app iOS),
/// li rasterizza una volta sola e li tiene pronti per la tela.
final class Sprites {
    static let shared: Sprites = Sprites()

    private var images: [String: Image] = [:]
    private var reported: Set<String> = []
    private(set) var problems: [String] = []
    private let missing: Image

    private init() {
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
        missing = Image(buffer, anchorX: 4, anchorY: 4)
    }

    var count: Int { return images.count }

    /// Carica tutti i file `.spr` di una cartella.
    func load(directory: String) {
        let names: [String] = ((try? FileManager.default.contentsOfDirectory(atPath: directory)) ?? []).filter { $0.hasSuffix(".spr") }.sorted()
        if names.isEmpty {
            problems.append("nessun file .spr in \(directory)")
            return
        }
        var library: SpriteLibrary = SpriteLibrary()
        for name in names {
            guard let data: Data = FileManager.default.contents(atPath: directory + "/" + name) else {
                problems.append("\(name): non leggibile")
                continue
            }
            let text: String = String(decoding: data, as: UTF8.self)
            do {
                try library.parse(text: text, fileName: name)
            } catch {
                problems.append("\(error)")
            }
        }
        problems.append(contentsOf: library.validate())
        for sprite in library.expandedSprites() {
            images[sprite.name] = Image(library.rasterize(sprite), anchorX: sprite.anchorX, anchorY: sprite.anchorY)
        }
    }

    func has(_ name: String) -> Bool {
        return images[name] != nil
    }

    /// Lo sprite con questo nome; se manca, un riquadro a scacchi ben visibile (e una nota, una volta sola).
    func get(_ name: String) -> Image {
        if let image: Image = images[name] { return image }
        if !reported.contains(name) {
            reported.insert(name)
            problems.append("sprite mancante: \(name)")
            Log.note("sprite mancante: \(name)")
        }
        return missing
    }

    /// Lo sprite, oppure nil se non esiste: per le alternative ("se c'è la versione di notte usa quella").
    func find(_ name: String) -> Image? {
        return images[name]
    }

    /// Quanti fotogrammi consecutivi esistono con nome `prefisso_0`, `prefisso_1`...
    func frameCount(_ prefix: String) -> Int {
        var n: Int = 0
        while images["\(prefix)_\(n)"] != nil { n += 1 }
        return n
    }

    /// Aggiunge un'immagine costruita in memoria (fondali dipinti, aloni).
    func register(_ name: String, _ image: Image) {
        images[name] = image
    }
}

/// Note di servizio: finiscono nel log di Android (o sul terminale) e nel registro della prova automatica.
enum Log {
    static var sink: ((String) -> Void)?
    private(set) static var lines: [String] = []

    static func note(_ text: String) {
        if lines.count < 400 { lines.append(text) }
        if let sink: (String) -> Void = sink {
            sink(text)
        } else {
            print(text)
        }
    }
}
