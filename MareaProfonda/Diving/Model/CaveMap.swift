/// Oggetto decorativo o punto d'interesse posato dal generatore (flora, appigli, corde di risalita...).
struct MapProp: Equatable {
    enum Kind: String {
        case posidonia
        case gorgonia
        case sponge
        case anemone
        case column
        case vent
        case crystal
        case rope
    }

    let kind: Kind
    /// Posizione in pixel della mappa (y verso il basso, 0 = superficie).
    let x: Double
    let y: Double
    /// Variante grafica scelta dal generatore.
    let variant: Int
    /// true se l'oggetto pende da un soffitto.
    let hanging: Bool
}

/// Mappa di un'immersione: una griglia di celle di un metro, roccia o acqua, più un campo
/// di densità ammorbidito da cui derivano sia il disegno sia le collisioni. In questo modo
/// le pareti hanno contorni morbidi e ciò che si vede coincide con ciò contro cui si urta.
///
/// Coordinate "di mappa": x verso destra, y verso il basso, in pixel d'arte; y = 0 è la superficie.
struct CaveMap {
    let cols: Int
    let rows: Int
    /// Pixel d'arte per cella.
    let tileSize: Int
    let seed: UInt64
    private(set) var solid: [UInt8]
    /// Solidità media nell'intorno 3x3 di ogni cella, in [0, 1].
    private(set) var field: [Float]
    var props: [MapProp] = []
    /// Centro del canale principale per ogni riga, in celle: una via sempre libera verso il basso.
    var channel: [Double] = []

    var widthPixels: Double { return Double(cols * tileSize) }
    var heightPixels: Double { return Double(rows * tileSize) }

    init(cols: Int, rows: Int, tileSize: Int, seed: UInt64) {
        self.cols = cols
        self.rows = rows
        self.tileSize = tileSize
        self.seed = seed
        solid = [UInt8](repeating: 0, count: cols * rows)
        field = [Float](repeating: 0, count: cols * rows)
    }

    /// Fuori dai bordi laterali e sotto il fondo è roccia; sopra la superficie è vuoto.
    @inline(__always)
    func isSolidCell(_ c: Int, _ r: Int) -> Bool {
        if r < 0 { return false }
        if c < 0 || c >= cols || r >= rows { return true }
        return solid[r * cols + c] != 0
    }

    mutating func setSolid(_ c: Int, _ r: Int, _ value: Bool) {
        if c < 0 || c >= cols || r < 0 || r >= rows { return }
        solid[r * cols + c] = value ? 1 : 0
    }

    /// Ricalcola il campo ammorbidito: va chiamata dopo ogni modifica alle celle.
    mutating func rebuildField() {
        var r: Int = 0
        while r < rows {
            var c: Int = 0
            while c < cols {
                var sum: Int = 0
                var dr: Int = -1
                while dr <= 1 {
                    var dc: Int = -1
                    while dc <= 1 {
                        if isSolidCell(c + dc, r + dr) { sum += 1 }
                        dc += 1
                    }
                    dr += 1
                }
                field[r * cols + c] = Float(sum) / 9.0
                c += 1
            }
            r += 1
        }
    }

    @inline(__always)
    private func fieldAt(_ c: Int, _ r: Int) -> Double {
        if r < 0 { return 0 }
        if c < 0 || c >= cols || r >= rows { return 1 }
        return Double(field[r * cols + c])
    }

    /// Densità della roccia in un punto: > 0.5 è roccia.
    func density(x: Double, y: Double) -> Double {
        let ts: Double = Double(tileSize)
        let fx: Double = x / ts - 0.5
        let fy: Double = y / ts - 0.5
        let c0: Double = fx.rounded(.down)
        let r0: Double = fy.rounded(.down)
        let tx: Double = fx - c0
        let ty: Double = fy - r0
        let c: Int = Int(c0)
        let r: Int = Int(r0)
        let a: Double = fieldAt(c, r)
        let b: Double = fieldAt(c + 1, r)
        let d: Double = fieldAt(c, r + 1)
        let e: Double = fieldAt(c + 1, r + 1)
        let top: Double = a + (b - a) * tx
        let bottom: Double = d + (e - d) * tx
        let smooth: Double = top + (bottom - top) * ty
        // Lontano dai bordi il rumore non serve: si risparmia tempo.
        if smooth < 0.2 || smooth > 0.8 { return smooth }
        // Piccole irregolarità: la roccia non ha mai un profilo liscio.
        let rough: Double = (Noise.value(x * 0.085, y * 0.085, seed: seed &+ 31) - 0.5) * 0.16
            + (Noise.value(x * 0.26, y * 0.26, seed: seed &+ 37) - 0.5) * 0.07
        return smooth + rough
    }

    func isSolid(x: Double, y: Double) -> Bool {
        return density(x: x, y: y) > 0.5
    }

    /// Direzione in cui la roccia aumenta (non normalizzata).
    func gradient(x: Double, y: Double) -> Vec2 {
        let h: Double = 2.0
        let gx: Double = density(x: x + h, y: y) - density(x: x - h, y: y)
        let gy: Double = density(x: x, y: y + h) - density(x: x, y: y - h)
        return Vec2(gx, gy)
    }

    /// Sposta un cerchio fuori dalla roccia. Ritorna la nuova posizione e la normale d'urto, se c'è stato contatto.
    func resolve(center: Vec2, radius: Double) -> (position: Vec2, normal: Vec2?) {
        var p: Vec2 = center
        var hit: Vec2? = nil
        let samples: Int = 8
        var iteration: Int = 0
        while iteration < 3 {
            var push: Vec2 = Vec2.zero
            var contacts: Int = 0
            var i: Int = 0
            while i < samples {
                let angle: Double = Double(i) * (2 * Double.pi / Double(samples))
                let sx: Double = p.x + cos(angle) * radius
                let sy: Double = p.y + sin(angle) * radius
                let d: Double = density(x: sx, y: sy)
                if d > 0.5 {
                    let g: Vec2 = gradient(x: sx, y: sy)
                    let n: Vec2 = g.lengthSquared > 1e-10 ? (-g).normalized() : Vec2(-cos(angle), -sin(angle))
                    let depth: Double = min((d - 0.5) * Double(tileSize) * 1.6, radius)
                    push += n * depth
                    contacts += 1
                }
                i += 1
            }
            if contacts == 0 { break }
            let correction: Vec2 = push / Double(contacts)
            p += correction
            if correction.lengthSquared > 1e-10 { hit = correction.normalized() }
            iteration += 1
        }
        // Limiti della mappa: non si esce di lato, sopra la superficie o sotto il fondo.
        p.x = MathUtil.clamp(p.x, radius, widthPixels - radius)
        p.y = MathUtil.clamp(p.y, -radius * 0.25, heightPixels - radius)
        return (position: p, normal: hit)
    }

    /// Primo punto d'acqua libera attorno a una posizione (per collocare creature e oggetti).
    func nearestOpenPoint(to point: Vec2, clearance: Double) -> Vec2 {
        if isOpen(point, clearance: clearance) { return point }
        var ring: Double = Double(tileSize)
        while ring < Double(tileSize) * 24 {
            var i: Int = 0
            while i < 16 {
                let a: Double = Double(i) * Double.pi / 8
                let candidate: Vec2 = Vec2(point.x + cos(a) * ring, point.y + sin(a) * ring)
                if candidate.y > clearance && isOpen(candidate, clearance: clearance) { return candidate }
                i += 1
            }
            ring += Double(tileSize)
        }
        return point
    }

    func isOpen(_ p: Vec2, clearance: Double) -> Bool {
        if p.x < clearance || p.x > widthPixels - clearance || p.y > heightPixels - clearance { return false }
        if density(x: p.x, y: p.y) > 0.35 { return false }
        var i: Int = 0
        while i < 8 {
            let a: Double = Double(i) * Double.pi / 4
            if density(x: p.x + cos(a) * clearance, y: p.y + sin(a) * clearance) > 0.45 { return false }
            i += 1
        }
        return true
    }

    /// Posizione in pixel del centro del canale principale a una certa profondità in metri.
    func channelPoint(depthMeters: Double) -> Vec2 {
        let r: Int = MathUtil.clampInt(Int(depthMeters), 0, max(channel.count - 1, 0))
        let cx: Double = channel.isEmpty ? Double(cols) / 2 : channel[r]
        return Vec2((cx + 0.5) * Double(tileSize), depthMeters * Double(tileSize))
    }
}
