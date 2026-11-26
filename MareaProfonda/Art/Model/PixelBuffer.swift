import Foundation

/// Colore a 8 bit per canale, alfa non premoltiplicata.
struct RGBA: Equatable, Hashable {
    var r: UInt8
    var g: UInt8
    var b: UInt8
    var a: UInt8

    static let clear: RGBA = RGBA(r: 0, g: 0, b: 0, a: 0)
    static let white: RGBA = RGBA(r: 255, g: 255, b: 255, a: 255)
    static let black: RGBA = RGBA(r: 0, g: 0, b: 0, a: 255)

    init(r: UInt8, g: UInt8, b: UInt8, a: UInt8 = 255) {
        self.r = r
        self.g = g
        self.b = b
        self.a = a
    }

    /// Da esadecimale 0xRRGGBB.
    init(hex: UInt32, alpha: UInt8 = 255) {
        self.r = UInt8((hex >> 16) & 0xFF)
        self.g = UInt8((hex >> 8) & 0xFF)
        self.b = UInt8(hex & 0xFF)
        self.a = alpha
    }

    /// Da testo "rrggbb" o "rrggbbaa" (con o senza cancelletto).
    init?(hexString: String) {
        var text: Substring = Substring(hexString)
        if text.hasPrefix("#") { text = text.dropFirst() }
        guard text.count == 6 || text.count == 8, let value: UInt32 = UInt32(text, radix: 16) else { return nil }
        if text.count == 6 {
            self.init(hex: value)
        } else {
            self.init(r: UInt8((value >> 24) & 0xFF), g: UInt8((value >> 16) & 0xFF), b: UInt8((value >> 8) & 0xFF), a: UInt8(value & 0xFF))
        }
    }

    func mixed(with other: RGBA, _ t: Double) -> RGBA {
        let k: Double = t < 0 ? 0 : (t > 1 ? 1 : t)
        func ch(_ x: UInt8, _ y: UInt8) -> UInt8 {
            let v: Double = Double(x) + (Double(y) - Double(x)) * k
            return UInt8(max(0, min(255, v.rounded())))
        }
        return RGBA(r: ch(r, other.r), g: ch(g, other.g), b: ch(b, other.b), a: ch(a, other.a))
    }

    func withAlpha(_ alpha: UInt8) -> RGBA {
        return RGBA(r: r, g: g, b: b, a: alpha)
    }

    /// Schiarisce (k > 1) o scurisce (k < 1) mantenendo l'alfa.
    func scaled(_ k: Double) -> RGBA {
        func ch(_ x: UInt8) -> UInt8 {
            return UInt8(max(0, min(255, (Double(x) * k).rounded())))
        }
        return RGBA(r: ch(r), g: ch(g), b: ch(b), a: a)
    }
}

/// Immagine RGBA in memoria: riga 0 in alto, 4 byte per pixel, alfa non premoltiplicata.
/// È il formato comune tra i pittori (sprite, terreno, fondali) e le texture del gioco.
struct PixelBuffer {
    let width: Int
    let height: Int
    var data: [UInt8]

    init(width: Int, height: Int, fill: RGBA = RGBA.clear) {
        self.width = max(width, 0)
        self.height = max(height, 0)
        let count: Int = self.width * self.height
        if fill == RGBA.clear {
            data = [UInt8](repeating: 0, count: count * 4)
        } else {
            data = [UInt8](repeating: 0, count: count * 4)
            var i: Int = 0
            while i < count {
                data[i * 4] = fill.r
                data[i * 4 + 1] = fill.g
                data[i * 4 + 2] = fill.b
                data[i * 4 + 3] = fill.a
                i += 1
            }
        }
    }

    @inline(__always)
    func contains(_ x: Int, _ y: Int) -> Bool {
        return x >= 0 && y >= 0 && x < width && y < height
    }

    func get(_ x: Int, _ y: Int) -> RGBA {
        if !contains(x, y) { return RGBA.clear }
        let i: Int = (y * width + x) * 4
        return RGBA(r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3])
    }

    /// Scrive il pixel sostituendo quello presente. Fuori dai bordi non fa nulla.
    mutating func set(_ x: Int, _ y: Int, _ c: RGBA) {
        if !contains(x, y) { return }
        let i: Int = (y * width + x) * 4
        data[i] = c.r
        data[i + 1] = c.g
        data[i + 2] = c.b
        data[i + 3] = c.a
    }

    /// Sovrappone il colore tenendo conto dell'alfa ("source over").
    mutating func blend(_ x: Int, _ y: Int, _ c: RGBA) {
        if !contains(x, y) || c.a == 0 { return }
        if c.a == 255 {
            set(x, y, c)
            return
        }
        let i: Int = (y * width + x) * 4
        let sa: Double = Double(c.a) / 255.0
        let da: Double = Double(data[i + 3]) / 255.0
        let outA: Double = sa + da * (1 - sa)
        if outA <= 0 { return }
        func ch(_ s: UInt8, _ d: UInt8) -> UInt8 {
            let v: Double = (Double(s) * sa + Double(d) * da * (1 - sa)) / outA
            return UInt8(max(0, min(255, v.rounded())))
        }
        data[i] = ch(c.r, data[i])
        data[i + 1] = ch(c.g, data[i + 1])
        data[i + 2] = ch(c.b, data[i + 2])
        data[i + 3] = UInt8(max(0, min(255, (outA * 255).rounded())))
    }

    mutating func fillRect(x: Int, y: Int, width w: Int, height h: Int, _ c: RGBA) {
        let x0: Int = max(x, 0)
        let y0: Int = max(y, 0)
        let x1: Int = min(x + w, width)
        let y1: Int = min(y + h, height)
        if x1 <= x0 || y1 <= y0 { return }
        var yy: Int = y0
        while yy < y1 {
            var xx: Int = x0
            while xx < x1 {
                set(xx, yy, c)
                xx += 1
            }
            yy += 1
        }
    }

    /// Copia `source` in questa immagine (sostituzione, senza fusione).
    mutating func copy(_ source: PixelBuffer, toX dx: Int, y dy: Int) {
        var sy: Int = 0
        while sy < source.height {
            let ty: Int = dy + sy
            if ty >= 0 && ty < height {
                var sx: Int = 0
                while sx < source.width {
                    let tx: Int = dx + sx
                    if tx >= 0 && tx < width {
                        let si: Int = (sy * source.width + sx) * 4
                        let ti: Int = (ty * width + tx) * 4
                        data[ti] = source.data[si]
                        data[ti + 1] = source.data[si + 1]
                        data[ti + 2] = source.data[si + 2]
                        data[ti + 3] = source.data[si + 3]
                    }
                    sx += 1
                }
            }
            sy += 1
        }
    }

    /// Sovrappone `source` rispettando l'alfa.
    mutating func draw(_ source: PixelBuffer, atX dx: Int, y dy: Int) {
        var sy: Int = 0
        while sy < source.height {
            var sx: Int = 0
            while sx < source.width {
                let c: RGBA = source.get(sx, sy)
                if c.a != 0 { blend(dx + sx, dy + sy, c) }
                sx += 1
            }
            sy += 1
        }
    }

    /// Copia con i canali colore premoltiplicati per l'alfa (formato richiesto dalle texture).
    func premultipliedData() -> [UInt8] {
        var out: [UInt8] = data
        let count: Int = width * height
        var i: Int = 0
        while i < count {
            let a: UInt32 = UInt32(out[i * 4 + 3])
            if a != 255 {
                out[i * 4] = UInt8((UInt32(out[i * 4]) * a + 127) / 255)
                out[i * 4 + 1] = UInt8((UInt32(out[i * 4 + 1]) * a + 127) / 255)
                out[i * 4 + 2] = UInt8((UInt32(out[i * 4 + 2]) * a + 127) / 255)
            }
            i += 1
        }
        return out
    }

    /// Impronta FNV-1a del contenuto: serve a confrontare il rasterizzatore con le anteprime.
    func fingerprint() -> UInt64 {
        var h: UInt64 = 0xCBF2_9CE4_8422_2325
        for b in data {
            h ^= UInt64(b)
            h = h &* 0x1000_0000_01B3
        }
        return h
    }
}
