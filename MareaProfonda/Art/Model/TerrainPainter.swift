/// Colori della roccia di una zona, già convertiti.
struct TerrainStyle {
    let outline: RGBA
    let rock: [RGBA]
    let cap: [RGBA]

    init(zone: ZoneInfo) {
        outline = RGBA(hexString: zone.outline) ?? RGBA.black
        var rockColors: [RGBA] = zone.rock.map { RGBA(hexString: $0) ?? RGBA(hex: 0x808080) }
        while rockColors.count < 5 { rockColors.append(rockColors.last ?? RGBA(hex: 0x808080)) }
        rock = rockColors
        var capColors: [RGBA] = zone.cap.map { RGBA(hexString: $0) ?? RGBA(hex: 0xC0C0C0) }
        while capColors.count < 2 { capColors.append(capColors.last ?? RGBA(hex: 0xC0C0C0)) }
        cap = capColors
    }
}

/// Dipinge la roccia del Calderone pixel per pixel a partire dal campo di densità della mappa:
/// contorno scuro, bordo illuminato dall'alto, crosta sulle superfici rivolte in su,
/// interno a strati con qualche granello. Pochi toni netti, come nella pixel art disegnata a mano.
enum TerrainPainter {

    struct Result {
        let image: PixelBuffer
        /// false se il riquadro è tutta acqua: non serve creare una texture.
        let hasRock: Bool
    }

    static func styles(for world: WorldData) -> [TerrainStyle] {
        return world.zones.map { TerrainStyle(zone: $0) }
    }

    /// Dipinge il rettangolo di mappa che parte da (`originX`, `originY`), in pixel di mappa.
    static func paint(map: CaveMap, world: WorldData, styles: [TerrainStyle], originX: Int, originY: Int, width: Int, height: Int) -> Result {
        var image: PixelBuffer = PixelBuffer(width: width, height: height)
        if styles.isEmpty { return Result(image: image, hasRock: false) }
        let sw: Int = width + 2
        let sh: Int = height + 2
        var dens: [Float] = [Float](repeating: 0, count: sw * sh)
        var any: Bool = false
        var j: Int = 0
        while j < sh {
            let y: Double = Double(originY + j - 1) + 0.5
            var i: Int = 0
            while i < sw {
                let d: Float = Float(map.density(x: Double(originX + i - 1) + 0.5, y: y))
                dens[j * sw + i] = d
                if d > 0.5 { any = true }
                i += 1
            }
            j += 1
        }
        if !any { return Result(image: image, hasRock: false) }

        let seed: UInt64 = map.seed
        let tile: Double = Double(map.tileSize)
        j = 0
        while j < height {
            let py: Int = originY + j
            var i: Int = 0
            while i < width {
                let center: Int = (j + 1) * sw + (i + 1)
                let d: Float = dens[center]
                if d <= 0.5 {
                    i += 1
                    continue
                }
                let px: Int = originX + i
                let left: Float = dens[center - 1]
                let right: Float = dens[center + 1]
                let above: Float = dens[center - sw]
                let below: Float = dens[center + sw]

                // Zona con una fascia sfumata a retino al confine, così il cambio di roccia non è un taglio netto.
                let grain: Double = Noise.cell(px, py, seed &+ 7)
                let depthMeters: Double = Double(py) / tile + (grain - 0.5) * 3.0
                let style: TerrainStyle = styles[min(world.zoneIndex(atDepth: depthMeters), styles.count - 1)]

                var color: RGBA
                if left <= 0.5 || right <= 0.5 || above <= 0.5 || below <= 0.5 {
                    color = style.outline
                } else {
                    let gx: Double = Double(right - left)
                    let gy: Double = Double(below - above)
                    let glen: Double = (gx * gx + gy * gy).squareRoot()
                    let nx: Double = glen > 1e-5 ? -gx / glen : 0
                    let ny: Double = glen > 1e-5 ? -gy / glen : 0
                    let up: Double = -ny
                    let lit: Double = nx * -0.45 + ny * -0.89
                    let inside: Double = Double(d - 0.5) * 2
                    let strata: Double = Noise.fbm(Double(px) * 0.035, Double(py) * 0.11, seed: seed &+ 9, octaves: 3)

                    if up > 0.5 && inside < 0.085 {
                        color = style.cap[1]
                    } else if up > 0.5 && inside < 0.20 + (grain - 0.5) * 0.06 {
                        color = grain > 0.86 ? style.cap[1] : style.cap[0]
                    } else if inside < 0.15 {
                        if lit > 0.25 {
                            color = style.rock[4]
                        } else if lit > -0.25 {
                            color = style.rock[3]
                        } else {
                            color = style.rock[1]
                        }
                    } else if inside < 0.46 {
                        var tone: Int = 2
                        if strata > 0.56 { tone += 1 }
                        if lit < -0.35 { tone -= 1 }
                        color = style.rock[max(1, min(3, tone))]
                    } else {
                        var tone: Int = strata > 0.60 ? 2 : (strata > 0.43 ? 1 : 0)
                        if inside > 0.92 && tone > 0 { tone -= 1 }
                        color = style.rock[tone]
                        if grain > 0.972 {
                            color = style.rock[min(tone + 1, 4)]
                        } else if grain < 0.022 {
                            color = style.outline
                        }
                    }
                }
                image.set(i, j, color)
                i += 1
            }
            j += 1
        }
        return Result(image: image, hasRock: true)
    }
}
