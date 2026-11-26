/// Dipinge in memoria i fondali: pareti lontane del Calderone e cielo sopra la superficie.
/// Le pareti sono in toni di grigio, ripetibili in ogni direzione: il gioco le colora in base
/// alla profondità, così la stessa texture serve dalla prateria fino agli abissi.
enum BackdropPainter {

    /// Colonne e speroni di roccia visti in lontananza.
    /// - Parameters:
    ///   - size: lato della texture in pixel.
    ///   - cellsX, cellsY: quante "celle" di rumore per lato; più celle in orizzontale = colonne strette.
    ///   - coverage: frazione approssimativa di roccia, da 0 a 1.
    ///   - softEdge: larghezza del bordo sfumato (0 = netto).
    static func rockLayer(size: Int, seed: UInt64, cellsX: Int, cellsY: Int, coverage: Double, softEdge: Double) -> PixelBuffer {
        var image: PixelBuffer = PixelBuffer(width: size, height: size)
        if size <= 0 { return image }
        let threshold: Double = 0.5 + (0.5 - MathUtil.clamp(coverage, 0.02, 0.98)) * 0.42
        let sx: Double = Double(cellsX) / Double(size)
        let sy: Double = Double(cellsY) / Double(size)
        var y: Int = 0
        while y < size {
            var x: Int = 0
            while x < size {
                let u: Double = (Double(x) + 0.5) * sx
                let v: Double = (Double(y) + 0.5) * sy
                let n: Double = Noise.tileFbm(u, v, periodX: cellsX, periodY: cellsY, seed: seed, octaves: 4)
                if n > threshold - softEdge {
                    // Luce dall'alto: confronto con il rumore un po' più su.
                    let nUp: Double = Noise.tileFbm(u - 0.6 * sx, v - 2.4 * sy, periodX: cellsX, periodY: cellsY, seed: seed, octaves: 4)
                    var lum: Double = 0.74
                    if nUp < threshold { lum = 1.0 }
                    else if n > threshold + 0.09 { lum = 0.60 }
                    let strata: Double = Noise.tileValue(u * 3, v * 9, periodX: cellsX * 3, periodY: cellsY * 9, seed: seed &+ 77)
                    if lum < 0.9 && strata > 0.62 { lum += 0.08 }
                    var alpha: Double = 1
                    if softEdge > 0 && n < threshold {
                        alpha = (n - (threshold - softEdge)) / softEdge
                    }
                    let level: UInt8 = UInt8(max(0, min(255, (lum * 255).rounded())))
                    image.set(x, y, RGBA(r: level, g: level, b: level, a: UInt8(max(0, min(255, (alpha * 255).rounded())))))
                }
                x += 1
            }
            y += 1
        }
        return image
    }

    struct SkyStyle {
        var top: RGBA
        var horizon: RGBA
        var sun: RGBA
        var cloud: RGBA
        var island: RGBA
        var islandLight: RGBA
        var sunHeight: Double
        var windows: Bool

        static let morning: SkyStyle = SkyStyle(top: RGBA(hex: 0x4FA8E8), horizon: RGBA(hex: 0xBFE9F5), sun: RGBA(hex: 0xFFF3B0),
                                                cloud: RGBA(hex: 0xFFFFFF), island: RGBA(hex: 0x5E86A8), islandLight: RGBA(hex: 0x86AEC6),
                                                sunHeight: 0.42, windows: false)
        static let afternoon: SkyStyle = SkyStyle(top: RGBA(hex: 0x3C8FE0), horizon: RGBA(hex: 0xD9EEF0), sun: RGBA(hex: 0xFFE98A),
                                                  cloud: RGBA(hex: 0xFFF8E8), island: RGBA(hex: 0x4F7F9C), islandLight: RGBA(hex: 0x7FB0B8),
                                                  sunHeight: 0.22, windows: false)
        static let evening: SkyStyle = SkyStyle(top: RGBA(hex: 0x3B3A78), horizon: RGBA(hex: 0xF7A65E), sun: RGBA(hex: 0xFFD27A),
                                                cloud: RGBA(hex: 0xF4B48E), island: RGBA(hex: 0x3A2F5E), islandLight: RGBA(hex: 0x6A4A72),
                                                sunHeight: 0.80, windows: true)
        static let night: SkyStyle = SkyStyle(top: RGBA(hex: 0x070B24), horizon: RGBA(hex: 0x1B2A55), sun: RGBA(hex: 0xE8F0FF),
                                              cloud: RGBA(hex: 0x2A3A6A), island: RGBA(hex: 0x0A1230), islandLight: RGBA(hex: 0x16224A),
                                              sunHeight: 0.30, windows: true)
    }

    /// Cielo con sole (o luna), nuvole a pixel e il profilo dell'isola di Pietrasale col suo vulcano.
    static func sky(width: Int, height: Int, seed: UInt64, style: SkyStyle) -> PixelBuffer {
        var image: PixelBuffer = PixelBuffer(width: width, height: height)
        if width <= 0 || height <= 0 { return image }
        // Sfumatura a fasce di 4 righe.
        var y: Int = 0
        while y < height {
            let band: Double = Double((y / 4) * 4) / Double(max(height - 1, 1))
            let color: RGBA = style.top.mixed(with: style.horizon, band * band)
            image.fillRect(x: 0, y: y, width: width, height: 1, color)
            y += 1
        }
        // Sole o luna con alone.
        let sunX: Int = Int(Double(width) * 0.72)
        let sunY: Int = Int(Double(height) * style.sunHeight)
        let radius: Int = 9
        var dy: Int = -radius * 3
        while dy <= radius * 3 {
            var dx: Int = -radius * 3
            while dx <= radius * 3 {
                let dist: Double = Double(dx * dx + dy * dy).squareRoot()
                if dist <= Double(radius) {
                    image.set(sunX + dx, sunY + dy, style.sun)
                } else if dist <= Double(radius) * 3 {
                    let ring: Int = Int((dist - Double(radius)) / (Double(radius) * 2 / 3))
                    let alpha: UInt8 = ring == 0 ? 70 : (ring == 1 ? 38 : 16)
                    image.blend(sunX + dx, sunY + dy, style.sun.withAlpha(alpha))
                }
                dx += 1
            }
            dy += 1
        }
        // Nuvole: file di rettangoli arrotondati.
        var rng: SeededRNG = SeededRNG(seed: seed &+ 5)
        var cloud: Int = 0
        while cloud < 6 {
            let cx: Int = rng.int(0, width - 1)
            let cy: Int = rng.int(Int(Double(height) * 0.12), Int(Double(height) * 0.55))
            let puffs: Int = rng.int(3, 5)
            var p: Int = 0
            while p < puffs {
                let w: Int = rng.int(10, 22)
                let h: Int = rng.int(3, 6)
                let ox: Int = cx + p * 8 + rng.int(-3, 3)
                let oy: Int = cy - h + rng.int(-1, 1)
                var xx: Int = 0
                while xx < w {
                    var yy: Int = 0
                    while yy < h {
                        let corner: Bool = (xx == 0 || xx == w - 1) && (yy == 0 || yy == h - 1)
                        if !corner {
                            let px: Int = ((ox + xx) % width + width) % width
                            image.blend(px, oy + yy, style.cloud.withAlpha(yy == h - 1 ? 150 : 215))
                        }
                        yy += 1
                    }
                    xx += 1
                }
                p += 1
            }
            cloud += 1
        }
        // Isola: un vulcano dal profilo morbido e una costa bassa col paese.
        let base: Int = height
        var x: Int = 0
        while x < width {
            let t: Double = Double(x) / Double(width)
            let cone: Double = exp(-pow((t - 0.30) / 0.11, 2)) * Double(height) * 0.46
            let crater: Double = exp(-pow((t - 0.30) / 0.018, 2)) * Double(height) * 0.05
            let hills: Double = (Noise.tileValue(t * 9, 0.5, periodX: 9, periodY: 4, seed: seed &+ 21) * 0.10 + 0.06) * Double(height)
            let coast: Double = MathUtil.smoothstep(0.02, 0.16, t) * (1 - MathUtil.smoothstep(0.52, 0.70, t))
            let h: Int = Int(((cone - crater) + hills) * coast)
            var yy: Int = 0
            while yy < h {
                let py: Int = base - 1 - yy
                let lit: Bool = yy > h - 3 || (t < 0.30 && yy > h - 7)
                image.set(x, py, lit ? style.islandLight : style.island)
                yy += 1
            }
            // Casette del paese sulla costa.
            if t > 0.40 && t < 0.60 && x % 5 == 0 {
                let houseH: Int = 3 + Int(Noise.cell(x, 3, seed) * 4)
                var hy: Int = 0
                while hy < houseH {
                    image.set(x, base - 1 - h - hy, style.islandLight)
                    image.set(x + 1, base - 1 - h - hy, style.islandLight)
                    image.set(x + 2, base - 1 - h - hy, style.island)
                    hy += 1
                }
                if style.windows {
                    image.set(x + 1, base - h - houseH + 1, RGBA(hex: 0xFFD98A))
                }
            }
            x += 1
        }
        return image
    }

    /// Striscia della superficie vista da sotto: una linea chiara mossa dalle onde, ripetibile.
    static func surfaceStrip(width: Int, height: Int, phase: Double) -> PixelBuffer {
        var image: PixelBuffer = PixelBuffer(width: width, height: height)
        var x: Int = 0
        while x < width {
            let t: Double = Double(x) / Double(width) * 2 * Double.pi
            let wave: Double = sin(t * 3 + phase) * 1.4 + sin(t * 7 - phase * 1.3) * 0.8
            let top: Int = Int((Double(height) * 0.35 + wave).rounded())
            var y: Int = max(top, 0)
            while y < height {
                let d: Int = y - top
                let color: RGBA
                if d == 0 {
                    color = RGBA(r: 255, g: 255, b: 255, a: 235)
                } else if d == 1 {
                    color = RGBA(r: 214, g: 246, b: 250, a: 190)
                } else {
                    let fade: Double = 1 - Double(d) / Double(max(height - top, 1))
                    color = RGBA(r: 170, g: 232, b: 240, a: UInt8(max(0, min(255, fade * 90))))
                }
                image.set(x, y, color)
                y += 1
            }
            x += 1
        }
        return image
    }
}
