/// Allineamento orizzontale di un testo rispetto alla coordinata data.
enum TextAlign {
    case left
    case center
    case right
}

/// Il font a pixel della fucina (`font.spr`): larghezza proporzionale, maiuscole alte 7 pixel,
/// minuscole con occhio di 5 e gambe che scendono di 2. Ogni glifo è una sagoma bianca da colorare.
final class PixelFont {
    static let shared: PixelFont = PixelFont()

    /// Altezza delle maiuscole.
    static let capHeight: Int = 7
    /// Distanza consigliata tra due righe di testo.
    static let lineHeight: Int = 11
    static let spaceWidth: Int = 3

    private var glyphs: [UInt32: Image] = [:]
    private var fallback: Image = Image.empty

    private init() {}

    /// Da chiamare dopo aver caricato gli sprite.
    func load() {
        glyphs.removeAll()
        var code: UInt32 = 32
        while code < 0x2700 {
            if let image: Image = Sprites.shared.find("font_\(code)") { glyphs[code] = image }
            code += 1
        }
        fallback = glyphs[63] ?? Image.empty
    }

    /// Simboli tipografici ricondotti a quelli che il font possiede.
    @inline(__always)
    private func normalize(_ code: UInt32) -> UInt32 {
        switch code {
        case 0x2018, 0x2019, 0x60, 0xB4: return 39   // apostrofi curvi
        case 0x201C, 0x201D: return 34               // virgolette curve
        case 0xA0: return 32                         // spazio non divisibile
        case 0xC1: return 0xC0
        case 0xCC, 0xCD: return 0xCC
        case 0xD3: return 0xD2
        case 0xDA: return 0xD9
        case 0xE1: return 0xE0
        case 0xED: return 0xEC
        case 0xF3: return 0xF2
        case 0xFA: return 0xF9
        default: return code
        }
    }

    @inline(__always)
    private func glyph(_ scalar: UInt32) -> Image? {
        let code: UInt32 = normalize(scalar)
        if code == 32 { return nil }
        if let image: Image = glyphs[code] { return image }
        return fallback
    }

    /// Larghezza in pixel di una riga di testo.
    func width(_ text: String, scale: Int = 1) -> Int {
        var w: Int = 0
        var any: Bool = false
        for scalar in text.unicodeScalars {
            if let image: Image = glyph(scalar.value) {
                w += image.width + 1
            } else {
                w += PixelFont.spaceWidth + 1
            }
            any = true
        }
        return any ? (w - 1) * scale : 0
    }

    /// Spezza il testo in righe che stanno in `maxWidth` pixel; "\n" va sempre a capo.
    func wrap(_ text: String, maxWidth: Int, scale: Int = 1) -> [String] {
        var lines: [String] = []
        for paragraph in text.split(separator: "\n", omittingEmptySubsequences: false) {
            var current: String = ""
            for word in paragraph.split(separator: " ", omittingEmptySubsequences: true) {
                let candidate: String = current.isEmpty ? String(word) : current + " " + word
                if width(candidate, scale: scale) <= maxWidth || current.isEmpty {
                    current = candidate
                } else {
                    lines.append(current)
                    current = String(word)
                }
            }
            lines.append(current)
        }
        return lines
    }

    /// Disegna una riga: `y` è il bordo superiore delle maiuscole.
    /// - Returns: la larghezza disegnata.
    @discardableResult
    func draw(_ text: String, on canvas: Canvas, x: Int, y: Int, color: RGBA, align: TextAlign = TextAlign.left,
              scale: Int = 1, shadow: RGBA? = nil) -> Int {
        let total: Int = width(text, scale: scale)
        var cx: Int
        switch align {
        case .left: cx = x
        case .center: cx = x - total / 2
        case .right: cx = x - total
        }
        let k: Int = max(scale, 1)
        for scalar in text.unicodeScalars {
            guard let image: Image = glyph(scalar.value) else {
                cx += (PixelFont.spaceWidth + 1) * k
                continue
            }
            if let shadow: RGBA = shadow {
                canvas.draw(image, x: cx + k, y: y + k, scale: k, ink: Ink.tint(shadow))
            }
            canvas.draw(image, x: cx, y: y, scale: k, ink: Ink.tint(color))
            cx += (image.width + 1) * k
        }
        return total
    }
}

extension Canvas {
    /// Una riga di testo; `y` è il bordo superiore delle maiuscole.
    @discardableResult
    func text(_ text: String, x: Int, y: Int, _ color: RGBA, align: TextAlign = TextAlign.left, scale: Int = 1, shadow: RGBA? = nil) -> Int {
        return PixelFont.shared.draw(text, on: self, x: x, y: y, color: color, align: align, scale: scale, shadow: shadow)
    }

    /// Testo su più righe dentro una larghezza. Ritorna l'altezza occupata.
    @discardableResult
    func paragraph(_ text: String, x: Int, y: Int, width: Int, _ color: RGBA, align: TextAlign = TextAlign.left,
                   lineHeight: Int = PixelFont.lineHeight, maxLines: Int = 99, scale: Int = 1, shadow: RGBA? = nil) -> Int {
        let lines: [String] = PixelFont.shared.wrap(text, maxWidth: width, scale: scale)
        var row: Int = 0
        for line in lines {
            if row >= maxLines { break }
            let lx: Int
            switch align {
            case .left: lx = x
            case .center: lx = x + width / 2
            case .right: lx = x + width
            }
            self.text(line, x: lx, y: y + row * lineHeight * scale, color, align: align, scale: scale, shadow: shadow)
            row += 1
        }
        return row * lineHeight * scale
    }
}

/// Numeri e testi brevi formattati senza Foundation completo.
enum Fmt {
    /// Numero con una cifra decimale ("3,5").
    static func one(_ value: Double) -> String {
        let scaled: Int = Int((abs(value) * 10).rounded())
        return (value < 0 ? "-" : "") + "\(scaled / 10),\(scaled % 10)"
    }

    /// Minuti e secondi ("2:05").
    static func clock(_ seconds: Double) -> String {
        let total: Int = max(0, Int(seconds.rounded(.up)))
        let s: Int = total % 60
        return "\(total / 60):" + (s < 10 ? "0\(s)" : "\(s)")
    }

    /// Ore e minuti di gioco ("3 h 07 min").
    static func playTime(_ seconds: Double) -> String {
        let minutes: Int = Int(seconds / 60)
        let m: Int = minutes % 60
        if minutes < 60 { return "\(m) min" }
        return "\(minutes / 60) h " + (m < 10 ? "0\(m)" : "\(m)") + " min"
    }
}
