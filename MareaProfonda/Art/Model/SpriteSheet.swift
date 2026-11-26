/// Sprite come matrice di caratteri ASCII: ogni carattere è una voce della palette.
struct IndexedSprite {
    let name: String
    let width: Int
    let height: Int
    let palette: String
    /// Punto di ancoraggio in pixel, dall'angolo in alto a sinistra.
    let anchorX: Int
    let anchorY: Int
    /// `width * height` codici ASCII, riga per riga dall'alto.
    let pixels: [UInt8]
}

struct SpritePalette {
    let name: String
    /// Tabella di 128 colori indicizzata dal codice ASCII.
    var table: [RGBA]
    var defined: [Bool]

    init(name: String) {
        self.name = name
        table = [RGBA](repeating: RGBA.clear, count: 128)
        defined = [Bool](repeating: false, count: 128)
        defined[Int(SpriteLibrary.transparentKey)] = true
    }
}

/// Regola "variante": per ogni sprite il cui nome comincia con `sourcePrefix`
/// ne crea una copia con prefisso `newPrefix` e palette diversa (rarità, notte...).
struct SpriteVariant {
    let newPrefix: String
    let sourcePrefix: String
    let palette: String
}

struct SpriteParseError: Error, CustomStringConvertible {
    let file: String
    let line: Int
    let message: String
    var description: String { return "\(file):\(line): \(message)" }
}

/// Insieme di palette e sprite letti dai file `.spr`.
///
/// Formato (testo ASCII):
/// ```
/// palette nome
/// a 1d8a8eff        <- carattere, colore rrggbbaa
/// end
/// sprite nome larghezza altezza palette ax=13 ay=7
/// ..aa..            <- una riga di testo per riga di pixel, '.' = trasparente
/// end
/// variant nuovo_prefisso prefisso_sorgente palette
/// ```
struct SpriteLibrary {
    static let transparentKey: UInt8 = 46 // "."

    private(set) var palettes: [String: SpritePalette] = [:]
    private(set) var sprites: [IndexedSprite] = []
    private(set) var variants: [SpriteVariant] = []

    init() {}

    mutating func parse(text: String, fileName: String) throws {
        let lines: [Substring] = text.split(omittingEmptySubsequences: false, whereSeparator: { $0 == "\n" })
        var index: Int = 0

        func fail(_ message: String) -> SpriteParseError {
            return SpriteParseError(file: fileName, line: index, message: message)
        }

        func clean(_ raw: Substring) -> Substring {
            if raw.hasSuffix("\r") { return raw.dropLast() }
            return raw
        }

        while index < lines.count {
            let line: Substring = clean(lines[index])
            index += 1
            if line.isEmpty || line.hasPrefix("#") { continue }
            let parts: [Substring] = line.split(separator: " ", omittingEmptySubsequences: true)
            guard let keyword: Substring = parts.first else { continue }

            if keyword == "palette" {
                guard parts.count == 2 else { throw fail("intestazione di palette non valida") }
                var palette: SpritePalette = SpritePalette(name: String(parts[1]))
                var closed: Bool = false
                while index < lines.count {
                    let entry: Substring = clean(lines[index])
                    index += 1
                    if entry == "end" {
                        closed = true
                        break
                    }
                    let fields: [Substring] = entry.split(separator: " ", omittingEmptySubsequences: true)
                    guard fields.count == 2, fields[0].utf8.count == 1, let code: UInt8 = fields[0].utf8.first, code < 128,
                          let color: RGBA = RGBA(hexString: String(fields[1])) else {
                        throw fail("voce di palette non valida: \(entry)")
                    }
                    palette.table[Int(code)] = color
                    palette.defined[Int(code)] = true
                }
                if !closed { throw fail("palette \(palette.name) senza 'end'") }
                palettes[palette.name] = palette
            } else if keyword == "sprite" {
                guard parts.count >= 5, let w: Int = Int(parts[2]), let h: Int = Int(parts[3]), w > 0, h > 0, w <= 1024, h <= 1024 else {
                    throw fail("intestazione di sprite non valida: \(line)")
                }
                let name: String = String(parts[1])
                var ax: Int = w / 2
                var ay: Int = h / 2
                for option in parts.dropFirst(5) {
                    let pair: [Substring] = option.split(separator: "=")
                    guard pair.count == 2, let value: Int = Int(pair[1]) else { throw fail("opzione non valida: \(option)") }
                    if pair[0] == "ax" {
                        ax = value
                    } else if pair[0] == "ay" {
                        ay = value
                    } else {
                        throw fail("opzione sconosciuta: \(option)")
                    }
                }
                var pixels: [UInt8] = []
                pixels.reserveCapacity(w * h)
                var row: Int = 0
                while row < h {
                    guard index < lines.count else { throw fail("sprite \(name) troncato") }
                    let text: Substring = clean(lines[index])
                    index += 1
                    let bytes: Substring.UTF8View = text.utf8
                    guard bytes.count == w else { throw fail("sprite \(name): riga \(row) larga \(bytes.count), attesa \(w)") }
                    for b in bytes {
                        guard b < 128 else { throw fail("sprite \(name): carattere non ASCII") }
                        pixels.append(b)
                    }
                    row += 1
                }
                guard index < lines.count, clean(lines[index]) == "end" else { throw fail("sprite \(name) senza 'end'") }
                index += 1
                sprites.append(IndexedSprite(name: name, width: w, height: h, palette: String(parts[4]), anchorX: ax, anchorY: ay, pixels: pixels))
            } else if keyword == "variant" {
                guard parts.count == 4 else { throw fail("variante non valida: \(line)") }
                variants.append(SpriteVariant(newPrefix: String(parts[1]), sourcePrefix: String(parts[2]), palette: String(parts[3])))
            } else {
                throw fail("riga non riconosciuta: \(line)")
            }
        }
    }

    /// Sprite dichiarati più quelli prodotti dalle regole di variante.
    func expandedSprites() -> [IndexedSprite] {
        var out: [IndexedSprite] = sprites
        for rule in variants {
            for sprite in sprites where sprite.name.hasPrefix(rule.sourcePrefix) {
                let suffix: Substring = sprite.name.dropFirst(rule.sourcePrefix.count)
                out.append(IndexedSprite(name: rule.newPrefix + suffix, width: sprite.width, height: sprite.height,
                                         palette: rule.palette, anchorX: sprite.anchorX, anchorY: sprite.anchorY, pixels: sprite.pixels))
            }
        }
        return out
    }

    /// Controlla palette mancanti, caratteri non definiti e nomi duplicati.
    func validate() -> [String] {
        var problems: [String] = []
        var seen: Set<String> = []
        for sprite in expandedSprites() {
            if seen.contains(sprite.name) { problems.append("sprite duplicato: \(sprite.name)") }
            seen.insert(sprite.name)
            guard let palette: SpritePalette = palettes[sprite.palette] else {
                problems.append("\(sprite.name): palette mancante '\(sprite.palette)'")
                continue
            }
            var missing: Set<UInt8> = []
            for code in sprite.pixels where !palette.defined[Int(code)] { missing.insert(code) }
            for code in missing.sorted() {
                problems.append("\(sprite.name): carattere '\(Character(UnicodeScalar(code)))' assente dalla palette \(palette.name)")
            }
        }
        return problems
    }

    /// Rasterizza: carattere → colore di palette. Nient'altro, così anteprime e gioco coincidono.
    func rasterize(_ sprite: IndexedSprite) -> PixelBuffer {
        var image: PixelBuffer = PixelBuffer(width: sprite.width, height: sprite.height)
        guard let palette: SpritePalette = palettes[sprite.palette] else { return image }
        let count: Int = sprite.width * sprite.height
        var i: Int = 0
        while i < count {
            let code: Int = Int(sprite.pixels[i])
            if code != Int(SpriteLibrary.transparentKey) {
                let c: RGBA = palette.table[code]
                image.data[i * 4] = c.r
                image.data[i * 4 + 1] = c.g
                image.data[i * 4 + 2] = c.b
                image.data[i * 4 + 3] = c.a
            }
            i += 1
        }
        return image
    }
}
