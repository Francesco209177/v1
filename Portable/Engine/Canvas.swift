/// Come un'immagine viene posata sulla tela.
enum Ink {
    /// Così com'è.
    case normal
    /// Con trasparenza complessiva (0...255).
    case alpha(Int)
    /// Colori moltiplicati per la tinta: serve ai glifi bianchi del font e alle sagome.
    case tint(RGBA)
    /// Sagoma piena di un solo colore (lampo bianco di un colpo, ombre).
    case solid(RGBA)
    /// Somma di luce (0...255 = intensità).
    case add(Int)
}

/// Tela in memoria su cui si disegna il gioco: riga 0 in alto, un `Pixel` per punto.
/// Tutte le operazioni rispettano il ritaglio (`clip`) e la traslazione (`ox`, `oy`).
final class Canvas {
    let width: Int
    let height: Int
    let buffer: UnsafeMutablePointer<Pixel>

    /// Traslazione sommata a ogni coordinata (camera, liste che scorrono).
    var ox: Int = 0
    var oy: Int = 0
    private(set) var clip: Rect

    init(width: Int, height: Int) {
        self.width = max(width, 1)
        self.height = max(height, 1)
        buffer = UnsafeMutablePointer<Pixel>.allocate(capacity: self.width * self.height)
        buffer.initialize(repeating: 0, count: self.width * self.height)
        clip = Rect(0, 0, self.width, self.height)
    }

    deinit {
        buffer.deallocate()
    }

    // MARK: Ritaglio

    /// Restringe il ritaglio (in coordinate già traslate) e restituisce quello precedente.
    @discardableResult
    func pushClip(_ r: Rect) -> Rect {
        let old: Rect = clip
        clip = old.intersection(Rect(r.x + ox, r.y + oy, r.w, r.h))
        return old
    }

    func restoreClip(_ old: Rect) {
        clip = old
    }

    func resetClip() {
        clip = Rect(0, 0, width, height)
    }

    // MARK: Riempimenti

    func clear(_ color: RGBA) {
        let p: Pixel = Pack.premultiplied(color)
        buffer.update(repeating: p, count: width * height)
    }

    func fill(_ r: Rect, _ color: RGBA) {
        fill(x: r.x, y: r.y, w: r.w, h: r.h, color)
    }

    func fill(x: Int, y: Int, w: Int, h: Int, _ color: RGBA) {
        if color.a == 0 { return }
        let x0: Int = max(x + ox, clip.x)
        let y0: Int = max(y + oy, clip.y)
        let x1: Int = min(x + ox + w, clip.maxX)
        let y1: Int = min(y + oy + h, clip.maxY)
        if x1 <= x0 || y1 <= y0 { return }
        let p: Pixel = Pack.premultiplied(color)
        let n: Int = x1 - x0
        var yy: Int = y0
        if color.a == 255 {
            while yy < y1 {
                (buffer + (yy * width + x0)).update(repeating: p, count: n)
                yy += 1
            }
        } else {
            let inv: UInt32 = 255 - UInt32(color.a)
            while yy < y1 {
                var row: UnsafeMutablePointer<Pixel> = buffer + (yy * width + x0)
                let end: UnsafeMutablePointer<Pixel> = row + n
                while row < end {
                    row.pointee = p &+ Pack.scaled(row.pointee, inv)
                    row += 1
                }
                yy += 1
            }
        }
    }

    /// Somma luce a un rettangolo.
    func addLight(x: Int, y: Int, w: Int, h: Int, _ color: RGBA) {
        let x0: Int = max(x + ox, clip.x)
        let y0: Int = max(y + oy, clip.y)
        let x1: Int = min(x + ox + w, clip.maxX)
        let y1: Int = min(y + oy + h, clip.maxY)
        if x1 <= x0 || y1 <= y0 { return }
        let p: Pixel = Pack.premultiplied(color)
        var yy: Int = y0
        while yy < y1 {
            var row: UnsafeMutablePointer<Pixel> = buffer + (yy * width + x0)
            let end: UnsafeMutablePointer<Pixel> = row + (x1 - x0)
            while row < end {
                row.pointee = Pack.add(p, row.pointee)
                row += 1
            }
            yy += 1
        }
    }

    /// Sfumatura verticale a fasce di `band` righe, da `top` a `bottom`.
    func gradient(_ r: Rect, top: RGBA, bottom: RGBA, band: Int = 4) {
        if r.h <= 0 { return }
        let step: Int = max(band, 1)
        var yy: Int = 0
        while yy < r.h {
            let t: Double = Double(yy) / Double(max(r.h - 1, 1))
            fill(x: r.x, y: r.y + yy, w: r.w, h: min(step, r.h - yy), top.mixed(with: bottom, t))
            yy += step
        }
    }

    @inline(__always)
    func plot(_ x: Int, _ y: Int, _ p: Pixel) {
        let px: Int = x + ox
        let py: Int = y + oy
        if px < clip.x || py < clip.y || px >= clip.maxX || py >= clip.maxY { return }
        let i: Int = py * width + px
        buffer[i] = Pack.over(p, buffer[i])
    }

    func point(_ x: Int, _ y: Int, _ color: RGBA) {
        plot(x, y, Pack.premultiplied(color))
    }

    // MARK: Forme

    func line(_ x0: Int, _ y0: Int, _ x1: Int, _ y1: Int, _ color: RGBA) {
        let p: Pixel = Pack.premultiplied(color)
        var x: Int = x0
        var y: Int = y0
        let dx: Int = abs(x1 - x0)
        let dy: Int = -abs(y1 - y0)
        let sx: Int = x0 < x1 ? 1 : -1
        let sy: Int = y0 < y1 ? 1 : -1
        var err: Int = dx + dy
        var guardCount: Int = 0
        while guardCount < 4096 {
            plot(x, y, p)
            if x == x1 && y == y1 { break }
            let e2: Int = 2 * err
            if e2 >= dy {
                err += dy
                x += sx
            }
            if e2 <= dx {
                err += dx
                y += sy
            }
            guardCount += 1
        }
    }

    /// Linea spessa `thickness` pixel.
    func line(_ x0: Double, _ y0: Double, _ x1: Double, _ y1: Double, thickness: Int, _ color: RGBA) {
        if thickness <= 1 {
            line(Int(x0.rounded()), Int(y0.rounded()), Int(x1.rounded()), Int(y1.rounded()), color)
            return
        }
        let dx: Double = x1 - x0
        let dy: Double = y1 - y0
        let steps: Int = max(1, Int(max(abs(dx), abs(dy)).rounded()))
        let half: Int = thickness / 2
        var i: Int = 0
        while i <= steps {
            let t: Double = Double(i) / Double(steps)
            fill(x: Int((x0 + dx * t).rounded()) - half, y: Int((y0 + dy * t).rounded()) - half, w: thickness, h: thickness, color)
            i += 1
        }
    }

    func outline(_ r: Rect, _ color: RGBA, thickness: Int = 1) {
        fill(x: r.x, y: r.y, w: r.w, h: thickness, color)
        fill(x: r.x, y: r.maxY - thickness, w: r.w, h: thickness, color)
        fill(x: r.x, y: r.y + thickness, w: thickness, h: r.h - thickness * 2, color)
        fill(x: r.maxX - thickness, y: r.y + thickness, w: thickness, h: r.h - thickness * 2, color)
    }

    /// Disco pieno, a scanline.
    func disc(_ cx: Int, _ cy: Int, radius: Int, _ color: RGBA) {
        if radius <= 0 {
            fill(x: cx, y: cy, w: 1, h: 1, color)
            return
        }
        let r2: Double = (Double(radius) + 0.35) * (Double(radius) + 0.35)
        var dy: Int = -radius
        while dy <= radius {
            let span: Int = Int((r2 - Double(dy * dy)).squareRoot())
            fill(x: cx - span, y: cy + dy, w: span * 2 + 1, h: 1, color)
            dy += 1
        }
    }

    /// Anello: disco esterno meno disco interno.
    func ring(_ cx: Int, _ cy: Int, radius: Int, thickness: Int, _ color: RGBA) {
        if radius <= 0 { return }
        let outer: Double = (Double(radius) + 0.35) * (Double(radius) + 0.35)
        let innerR: Double = Double(radius - thickness) + 0.35
        let inner: Double = innerR * innerR
        var dy: Int = -radius
        while dy <= radius {
            let d2: Double = Double(dy * dy)
            let span: Int = Int((outer - d2).squareRoot())
            if innerR <= 0 || d2 >= inner {
                fill(x: cx - span, y: cy + dy, w: span * 2 + 1, h: 1, color)
            } else {
                let hole: Int = Int((inner - d2).squareRoot())
                fill(x: cx - span, y: cy + dy, w: span - hole, h: 1, color)
                fill(x: cx + hole + 1, y: cy + dy, w: span - hole, h: 1, color)
            }
            dy += 1
        }
    }

    /// Arco di anello, dall'alto in senso orario: `fraction` da 0 a 1.
    func arc(_ cx: Int, _ cy: Int, radius: Int, thickness: Int, fraction: Double, _ color: RGBA) {
        if fraction <= 0 { return }
        if fraction >= 1 {
            ring(cx, cy, radius: radius, thickness: thickness, color)
            return
        }
        let p: Pixel = Pack.premultiplied(color)
        let outer: Double = Double(radius) + 0.35
        let inner: Double = Double(radius - thickness) + 0.35
        let limit: Double = fraction * 2 * Double.pi
        var dy: Int = -radius
        while dy <= radius {
            var dx: Int = -radius
            while dx <= radius {
                let d: Double = Double(dx * dx + dy * dy).squareRoot()
                if d <= outer && d > inner {
                    var angle: Double = atan2(Double(dx), Double(-dy))
                    if angle < 0 { angle += 2 * Double.pi }
                    if angle <= limit { plot(cx + dx, cy + dy, p) }
                }
                dx += 1
            }
            dy += 1
        }
    }

    /// Rettangolo con gli angoli smussati a gradini, come nella pixel art.
    func roundRect(_ r: Rect, radius: Int, _ color: RGBA) {
        let rad: Int = max(0, min(radius, min(r.w, r.h) / 2))
        if rad == 0 {
            fill(r, color)
            return
        }
        var i: Int = 0
        while i < rad {
            let cut: Int = Canvas.cornerCut(rad, i)
            fill(x: r.x + cut, y: r.y + i, w: r.w - cut * 2, h: 1, color)
            fill(x: r.x + cut, y: r.maxY - 1 - i, w: r.w - cut * 2, h: 1, color)
            i += 1
        }
        fill(x: r.x, y: r.y + rad, w: r.w, h: r.h - rad * 2, color)
    }

    func roundOutline(_ r: Rect, radius: Int, _ color: RGBA) {
        let rad: Int = max(0, min(radius, min(r.w, r.h) / 2))
        if rad == 0 {
            outline(r, color)
            return
        }
        var i: Int = 0
        while i < rad {
            let cut: Int = Canvas.cornerCut(rad, i)
            let next: Int = i + 1 < rad ? Canvas.cornerCut(rad, i + 1) : 0
            let span: Int = max(1, cut - next)
            if i == 0 {
                fill(x: r.x + cut, y: r.y, w: r.w - cut * 2, h: 1, color)
                fill(x: r.x + cut, y: r.maxY - 1, w: r.w - cut * 2, h: 1, color)
            }
            fill(x: r.x + next, y: r.y + i + (i == 0 ? 1 : 0), w: span, h: 1, color)
            fill(x: r.maxX - next - span, y: r.y + i + (i == 0 ? 1 : 0), w: span, h: 1, color)
            fill(x: r.x + next, y: r.maxY - 1 - i - (i == 0 ? 1 : 0), w: span, h: 1, color)
            fill(x: r.maxX - next - span, y: r.maxY - 1 - i - (i == 0 ? 1 : 0), w: span, h: 1, color)
            i += 1
        }
        fill(x: r.x, y: r.y + rad, w: 1, h: r.h - rad * 2, color)
        fill(x: r.maxX - 1, y: r.y + rad, w: 1, h: r.h - rad * 2, color)
    }

    /// Di quanti pixel rientra la riga `row` (0 = bordo) di un angolo di raggio `radius`.
    private static func cornerCut(_ radius: Int, _ row: Int) -> Int {
        let r: Double = Double(radius)
        let dy: Double = r - Double(row) - 0.5
        let dx: Double = (r * r - dy * dy).squareRoot()
        return max(0, Int((r - dx).rounded()))
    }

    // MARK: Immagini

    /// Posa l'immagine con l'angolo in alto a sinistra in (x, y).
    func draw(_ image: Image, x: Int, y: Int, flipX: Bool = false, ink: Ink = Ink.normal) {
        if image.isEmpty { return }
        let dx0: Int = x + ox
        let dy0: Int = y + oy
        let x0: Int = max(dx0, clip.x)
        let y0: Int = max(dy0, clip.y)
        let x1: Int = min(dx0 + image.width, clip.maxX)
        let y1: Int = min(dy0 + image.height, clip.maxY)
        if x1 <= x0 || y1 <= y0 { return }
        let w: Int = image.width
        let dest: UnsafeMutablePointer<Pixel> = buffer
        let stride: Int = width
        image.pixels.withUnsafeBufferPointer { (source: UnsafeBufferPointer<Pixel>) -> Void in
            guard let src: UnsafePointer<Pixel> = source.baseAddress else { return }
            var yy: Int = y0
            while yy < y1 {
                let srow: UnsafePointer<Pixel> = src + (yy - dy0) * w
                let drow: UnsafeMutablePointer<Pixel> = dest + yy * stride
                var xx: Int = x0
                switch ink {
                case .normal:
                    while xx < x1 {
                        let sxi: Int = flipX ? (w - 1 - (xx - dx0)) : (xx - dx0)
                        let s: Pixel = srow[sxi]
                        if s != 0 { drow[xx] = Pack.over(s, drow[xx]) }
                        xx += 1
                    }
                case .alpha(let amount):
                    let k: UInt32 = UInt32(max(0, min(255, amount)))
                    while xx < x1 {
                        let sxi: Int = flipX ? (w - 1 - (xx - dx0)) : (xx - dx0)
                        let s: Pixel = srow[sxi]
                        if s != 0 { drow[xx] = Pack.over(Pack.scaled(s, k), drow[xx]) }
                        xx += 1
                    }
                case .tint(let color):
                    let t: Pixel = Pack.premultiplied(color)
                    while xx < x1 {
                        let sxi: Int = flipX ? (w - 1 - (xx - dx0)) : (xx - dx0)
                        let s: Pixel = srow[sxi]
                        if s != 0 { drow[xx] = Pack.over(Pack.tinted(s, t), drow[xx]) }
                        xx += 1
                    }
                case .solid(let color):
                    let t: Pixel = Pack.premultiplied(color)
                    while xx < x1 {
                        let sxi: Int = flipX ? (w - 1 - (xx - dx0)) : (xx - dx0)
                        let s: Pixel = srow[sxi]
                        if s != 0 { drow[xx] = Pack.over(Pack.scaled(t, s >> 24), drow[xx]) }
                        xx += 1
                    }
                case .add(let amount):
                    let k: UInt32 = UInt32(max(0, min(255, amount)))
                    while xx < x1 {
                        let sxi: Int = flipX ? (w - 1 - (xx - dx0)) : (xx - dx0)
                        let s: Pixel = srow[sxi]
                        if s != 0 { drow[xx] = Pack.add(Pack.scaled(s, k), drow[xx]) }
                        xx += 1
                    }
                }
                yy += 1
            }
        }
    }

    /// Posa lo sprite con il suo punto d'appoggio in (x, y).
    func sprite(_ image: Image, x: Int, y: Int, flipX: Bool = false, ink: Ink = Ink.normal) {
        let left: Int = flipX ? x - (image.width - image.anchorX) : x - image.anchorX
        draw(image, x: left, y: y - image.anchorY, flipX: flipX, ink: ink)
    }

    /// Ingrandimento a multipli interi, angolo in alto a sinistra in (x, y).
    func draw(_ image: Image, x: Int, y: Int, scale: Int, flipX: Bool = false, ink: Ink = Ink.normal) {
        if scale <= 1 {
            draw(image, x: x, y: y, flipX: flipX, ink: ink)
            return
        }
        if image.isEmpty { return }
        let dx0: Int = x + ox
        let dy0: Int = y + oy
        let x0: Int = max(dx0, clip.x)
        let y0: Int = max(dy0, clip.y)
        let x1: Int = min(dx0 + image.width * scale, clip.maxX)
        let y1: Int = min(dy0 + image.height * scale, clip.maxY)
        if x1 <= x0 || y1 <= y0 { return }
        let w: Int = image.width
        var yy: Int = y0
        while yy < y1 {
            let sy: Int = (yy - dy0) / scale
            var xx: Int = x0
            while xx < x1 {
                var sx: Int = (xx - dx0) / scale
                if flipX { sx = w - 1 - sx }
                let s: Pixel = image.pixels[sy * w + sx]
                if s != 0 {
                    let i: Int = yy * width + xx
                    buffer[i] = Canvas.apply(ink, s, buffer[i])
                }
                xx += 1
            }
            yy += 1
        }
    }

    /// Sprite ruotato e scalato attorno al suo punto d'appoggio, campionato al pixel più vicino.
    /// `rotation` in radianti, senso orario sullo schermo (y verso il basso).
    func sprite(_ image: Image, x: Double, y: Double, rotation: Double, scaleX: Double = 1, scaleY: Double = 1, ink: Ink = Ink.normal) {
        if image.isEmpty || scaleX == 0 || scaleY == 0 { return }
        let c: Double = cos(rotation)
        let s: Double = sin(rotation)
        let ax: Double = Double(image.anchorX)
        let ay: Double = Double(image.anchorY)
        // Riquadro che contiene i quattro angoli trasformati.
        var minX: Double = Double.greatestFiniteMagnitude
        var minY: Double = Double.greatestFiniteMagnitude
        var maxX: Double = -Double.greatestFiniteMagnitude
        var maxY: Double = -Double.greatestFiniteMagnitude
        let corners: [(Double, Double)] = [(0, 0), (Double(image.width), 0), (0, Double(image.height)), (Double(image.width), Double(image.height))]
        for corner in corners {
            let lx: Double = (corner.0 - ax) * scaleX
            let ly: Double = (corner.1 - ay) * scaleY
            let wx: Double = x + lx * c - ly * s
            let wy: Double = y + lx * s + ly * c
            minX = min(minX, wx)
            maxX = max(maxX, wx)
            minY = min(minY, wy)
            maxY = max(maxY, wy)
        }
        let x0: Int = max(Int(minX.rounded(.down)) + ox, clip.x)
        let y0: Int = max(Int(minY.rounded(.down)) + oy, clip.y)
        let x1: Int = min(Int(maxX.rounded(.up)) + ox, clip.maxX)
        let y1: Int = min(Int(maxY.rounded(.up)) + oy, clip.maxY)
        if x1 <= x0 || y1 <= y0 { return }
        let w: Int = image.width
        let h: Int = image.height
        var yy: Int = y0
        while yy < y1 {
            let wy: Double = Double(yy - oy) + 0.5 - y
            var xx: Int = x0
            while xx < x1 {
                let wx: Double = Double(xx - ox) + 0.5 - x
                // Trasformazione inversa: dallo schermo allo sprite.
                let lx: Double = (wx * c + wy * s) / scaleX + ax
                let ly: Double = (-wx * s + wy * c) / scaleY + ay
                if lx >= 0 && ly >= 0 {
                    let sx: Int = Int(lx)
                    let sy: Int = Int(ly)
                    if sx < w && sy < h {
                        let p: Pixel = image.pixels[sy * w + sx]
                        if p != 0 {
                            let i: Int = yy * width + xx
                            buffer[i] = Canvas.apply(ink, p, buffer[i])
                        }
                    }
                }
                xx += 1
            }
            yy += 1
        }
    }

    @inline(__always)
    private static func apply(_ ink: Ink, _ s: Pixel, _ d: Pixel) -> Pixel {
        switch ink {
        case .normal: return Pack.over(s, d)
        case .alpha(let amount): return Pack.over(Pack.scaled(s, UInt32(max(0, min(255, amount)))), d)
        case .tint(let color): return Pack.over(Pack.tinted(s, Pack.premultiplied(color)), d)
        case .solid(let color): return Pack.over(Pack.scaled(Pack.premultiplied(color), s >> 24), d)
        case .add(let amount): return Pack.add(Pack.scaled(s, UInt32(max(0, min(255, amount)))), d)
        }
    }

    /// Ripete l'immagine su tutto il rettangolo, a partire dallo scostamento dato (fondali che scorrono).
    func tile(_ image: Image, in r: Rect, offsetX: Int, offsetY: Int, ink: Ink = Ink.normal) {
        if image.isEmpty || r.w <= 0 || r.h <= 0 { return }
        let old: Rect = pushClip(r)
        let startX: Int = r.x - (((offsetX % image.width) + image.width) % image.width)
        let startY: Int = r.y - (((offsetY % image.height) + image.height) % image.height)
        var yy: Int = startY
        while yy < r.maxY {
            var xx: Int = startX
            while xx < r.maxX {
                draw(image, x: xx, y: yy, ink: ink)
                xx += image.width
            }
            yy += image.height
        }
        restoreClip(old)
    }

    // MARK: Luce e buio

    /// Una sorgente di luce nel buio: centro e raggio in pixel della tela.
    struct Light {
        var x: Double
        var y: Double
        var radius: Double
        var strength: Double
    }

    /// Scurisce la tela lasciando chiaro attorno alle luci. `level` va da 0 (niente) a 1 (nero).
    /// Lavora a blocchi di 2×2 con un retino ordinato: poche sfumature nette, da pixel art.
    func darken(level: Double, tint: RGBA, lights: [Light]) {
        if level <= 0.01 { return }
        let tr: UInt32 = UInt32(tint.r)
        let tg: UInt32 = UInt32(tint.g)
        let tb: UInt32 = UInt32(tint.b)
        let bayer: [Double] = [0.0, 0.5, 0.75, 0.25]
        var by: Int = 0
        while by < height {
            var bx: Int = 0
            while bx < width {
                let px: Double = Double(bx) + 1
                let py: Double = Double(by) + 1
                var light: Double = 0
                for l in lights {
                    let dx: Double = px - l.x
                    let dy: Double = py - l.y
                    let d2: Double = dx * dx + dy * dy
                    let r2: Double = l.radius * l.radius
                    if d2 < r2 {
                        let f: Double = 1 - d2 / r2
                        light = max(light, f * f * l.strength)
                        if light >= 1 { break }
                    }
                }
                var dark: Double = level * (1 - min(light, 1))
                if dark > 0.004 {
                    // Sei gradini, con il retino a spezzare le bande.
                    let steps: Double = 6
                    let jitter: Double = bayer[((bx >> 1) & 1) + ((by >> 1) & 1) * 2] - 0.5
                    dark = min(1, max(0, ((dark * steps + jitter * 0.9).rounded()) / steps))
                    if dark > 0 {
                        let k: UInt32 = UInt32((dark * 255).rounded())
                        let inv: UInt32 = 255 - k
                        let add: Pixel = Pack.mul(tr, k) | (Pack.mul(tg, k) << 8) | (Pack.mul(tb, k) << 16) | (k << 24)
                        var yy: Int = by
                        while yy < min(by + 2, height) {
                            var xx: Int = bx
                            while xx < min(bx + 2, width) {
                                let i: Int = yy * width + xx
                                buffer[i] = add &+ Pack.scaled(buffer[i], inv)
                                xx += 1
                            }
                            yy += 1
                        }
                    }
                }
                bx += 2
            }
            by += 2
        }
    }

    /// Copia della tela come immagine (istantanee per le dissolvenze).
    func snapshot() -> Image {
        var out: [Pixel] = [Pixel](repeating: 0, count: width * height)
        var i: Int = 0
        while i < width * height {
            out[i] = buffer[i]
            i += 1
        }
        return Image(width: width, height: height, anchorX: 0, anchorY: 0, pixels: out)
    }
}
