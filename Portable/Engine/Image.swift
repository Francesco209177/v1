/// Colore impacchettato in 32 bit, già premoltiplicato per l'alfa.
/// In memoria i byte sono nell'ordine R, G, B, A: lo stesso che vuole lo schermo di Android.
typealias Pixel = UInt32

enum Pack {
    /// Prodotto di due valori a 8 bit, diviso per 255 e arrotondato.
    @inline(__always)
    static func mul(_ a: UInt32, _ b: UInt32) -> UInt32 {
        let t: UInt32 = a * b + 128
        return (t + (t >> 8)) >> 8
    }

    /// Da colore con alfa separata a pixel premoltiplicato.
    @inline(__always)
    static func premultiplied(_ c: RGBA) -> Pixel {
        let a: UInt32 = UInt32(c.a)
        if a == 255 {
            return UInt32(c.r) | (UInt32(c.g) << 8) | (UInt32(c.b) << 16) | 0xFF00_0000
        }
        return mul(UInt32(c.r), a) | (mul(UInt32(c.g), a) << 8) | (mul(UInt32(c.b), a) << 16) | (a << 24)
    }

    /// Moltiplica i quattro canali per `k` (0...255).
    @inline(__always)
    static func scaled(_ p: Pixel, _ k: UInt32) -> Pixel {
        var rb: UInt32 = (p & 0x00FF_00FF) * k + 0x0080_0080
        rb = ((rb + ((rb >> 8) & 0x00FF_00FF)) >> 8) & 0x00FF_00FF
        var ag: UInt32 = ((p >> 8) & 0x00FF_00FF) * k + 0x0080_0080
        ag = (ag + ((ag >> 8) & 0x00FF_00FF)) & 0xFF00_FF00
        return rb | ag
    }

    /// Sovrappone `s` (premoltiplicato) a `d`.
    @inline(__always)
    static func over(_ s: Pixel, _ d: Pixel) -> Pixel {
        let sa: UInt32 = s >> 24
        if sa == 255 { return s }
        if sa == 0 { return d }
        return s &+ scaled(d, 255 - sa)
    }

    /// Somma con saturazione, canale per canale: per aloni e raggi di luce.
    @inline(__always)
    static func add(_ s: Pixel, _ d: Pixel) -> Pixel {
        let r: UInt32 = min((s & 0xFF) + (d & 0xFF), 255)
        let g: UInt32 = min(((s >> 8) & 0xFF) + ((d >> 8) & 0xFF), 255)
        let b: UInt32 = min(((s >> 16) & 0xFF) + ((d >> 16) & 0xFF), 255)
        let a: UInt32 = min((s >> 24) + (d >> 24), 255)
        return r | (g << 8) | (b << 16) | (a << 24)
    }

    /// Colora un pixel: ogni canale è moltiplicato per quello della tinta (premoltiplicata).
    @inline(__always)
    static func tinted(_ s: Pixel, _ t: Pixel) -> Pixel {
        let r: UInt32 = mul(s & 0xFF, t & 0xFF)
        let g: UInt32 = mul((s >> 8) & 0xFF, (t >> 8) & 0xFF)
        let b: UInt32 = mul((s >> 16) & 0xFF, (t >> 16) & 0xFF)
        let a: UInt32 = mul(s >> 24, t >> 24)
        return r | (g << 8) | (b << 16) | (a << 24)
    }
}

/// Immagine pronta per il disegno. `anchorX`/`anchorY` sono il punto d'appoggio dello sprite,
/// in pixel dall'angolo in alto a sinistra.
struct Image {
    let width: Int
    let height: Int
    let anchorX: Int
    let anchorY: Int
    let pixels: [Pixel]

    static let empty: Image = Image(width: 0, height: 0, anchorX: 0, anchorY: 0, pixels: [])

    init(width: Int, height: Int, anchorX: Int, anchorY: Int, pixels: [Pixel]) {
        self.width = width
        self.height = height
        self.anchorX = anchorX
        self.anchorY = anchorY
        self.pixels = pixels
    }

    init(_ buffer: PixelBuffer, anchorX: Int = 0, anchorY: Int = 0) {
        width = buffer.width
        height = buffer.height
        self.anchorX = anchorX
        self.anchorY = anchorY
        let count: Int = buffer.width * buffer.height
        var out: [Pixel] = [Pixel](repeating: 0, count: count)
        var i: Int = 0
        while i < count {
            let a: UInt8 = buffer.data[i * 4 + 3]
            if a != 0 {
                out[i] = Pack.premultiplied(RGBA(r: buffer.data[i * 4], g: buffer.data[i * 4 + 1], b: buffer.data[i * 4 + 2], a: a))
            }
            i += 1
        }
        pixels = out
    }

    var isEmpty: Bool { return width == 0 || height == 0 }
}

/// Rettangolo a coordinate intere, in pixel.
struct Rect: Equatable {
    var x: Int
    var y: Int
    var w: Int
    var h: Int

    init(_ x: Int, _ y: Int, _ w: Int, _ h: Int) {
        self.x = x
        self.y = y
        self.w = w
        self.h = h
    }

    var maxX: Int { return x + w }
    var maxY: Int { return y + h }
    var midX: Int { return x + w / 2 }
    var midY: Int { return y + h / 2 }

    func contains(_ px: Double, _ py: Double) -> Bool {
        return px >= Double(x) && py >= Double(y) && px < Double(x + w) && py < Double(y + h)
    }

    func inset(_ d: Int) -> Rect {
        return Rect(x + d, y + d, max(0, w - d * 2), max(0, h - d * 2))
    }

    func inset(dx: Int, dy: Int) -> Rect {
        return Rect(x + dx, y + dy, max(0, w - dx * 2), max(0, h - dy * 2))
    }

    func intersection(_ o: Rect) -> Rect {
        let x0: Int = max(x, o.x)
        let y0: Int = max(y, o.y)
        let x1: Int = min(maxX, o.maxX)
        let y1: Int = min(maxY, o.maxY)
        return Rect(x0, y0, max(0, x1 - x0), max(0, y1 - y0))
    }

    /// Toglie una fascia in alto e la restituisce.
    mutating func cutTop(_ amount: Int) -> Rect {
        let a: Int = min(amount, h)
        let out: Rect = Rect(x, y, w, a)
        y += a
        h -= a
        return out
    }

    mutating func cutBottom(_ amount: Int) -> Rect {
        let a: Int = min(amount, h)
        h -= a
        return Rect(x, y + h, w, a)
    }

    mutating func cutLeft(_ amount: Int) -> Rect {
        let a: Int = min(amount, w)
        let out: Rect = Rect(x, y, a, h)
        x += a
        w -= a
        return out
    }

    mutating func cutRight(_ amount: Int) -> Rect {
        let a: Int = min(amount, w)
        w -= a
        return Rect(x + w, y, a, h)
    }
}
