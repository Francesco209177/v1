/// Roccia e flora del Calderone, dipinte a blocchi attorno alla camera.
/// Ogni blocco è dipinto da `TerrainPainter` (lo stesso dell'app iOS) in secondo piano e tenuto
/// come immagine; i blocchi lontani vengono scartati, così la memoria resta costante a ogni profondità.
final class TerrainCache {
    static let chunkSize: Int = 256

    private let map: CaveMap
    private let worldData: WorldData
    private let styles: [TerrainStyle]
    private var chunks: [Int: Image] = [:]
    private var pending: Set<Int> = []
    private var propsByChunk: [Int: [MapProp]] = [:]
    private let lock: Lock = Lock()
    private var finished: [(key: Int, image: Image)] = []
    private let chunkCols: Int
    private let chunkRows: Int

    init(map: CaveMap, world: WorldData) {
        self.map = map
        worldData = world
        styles = TerrainPainter.styles(for: world)
        let size: Int = TerrainCache.chunkSize
        chunkCols = (map.cols * map.tileSize + size - 1) / size
        chunkRows = (map.rows * map.tileSize + size - 1) / size
        for prop in map.props {
            let cx: Int = max(0, min(chunkCols - 1, Int(prop.x) / size))
            let cy: Int = max(0, min(chunkRows - 1, Int(prop.y) / size))
            propsByChunk[key(cx, cy), default: []].append(prop)
        }
    }

    private func key(_ cx: Int, _ cy: Int) -> Int {
        return cy * 4096 + cx
    }

    var loadedChunkCount: Int { return chunks.count }

    private static func paint(map: CaveMap, world: WorldData, styles: [TerrainStyle], cx: Int, cy: Int) -> Image {
        let size: Int = TerrainCache.chunkSize
        let result: TerrainPainter.Result = TerrainPainter.paint(map: map, world: world, styles: styles,
                                                                originX: cx * size, originY: cy * size, width: size, height: size)
        return result.hasRock ? Image(result.image) : Image.empty
    }

    /// Carica i blocchi visibili (più un margine) e scarta quelli lontani.
    /// - Parameter synchronous: true per dipingere subito, senza attese (all'ingresso nella scena).
    func update(camX: Double, camY: Double, viewWidth: Double, viewHeight: Double, synchronous: Bool) {
        let ready: [(key: Int, image: Image)] = lock.with { () -> [(key: Int, image: Image)] in
            let out: [(key: Int, image: Image)] = finished
            finished.removeAll()
            return out
        }
        for item in ready {
            pending.remove(item.key)
            chunks[item.key] = item.image
        }
        let size: Double = Double(TerrainCache.chunkSize)
        let margin: Double = synchronous ? 32 : 150
        let x0: Int = max(0, Int(((camX - viewWidth / 2 - margin) / size).rounded(.down)))
        let x1: Int = min(chunkCols - 1, Int(((camX + viewWidth / 2 + margin) / size).rounded(.down)))
        let y0: Int = max(0, Int(((camY - viewHeight / 2 - margin) / size).rounded(.down)))
        let y1: Int = min(chunkRows - 1, Int(((camY + viewHeight / 2 + margin) / size).rounded(.down)))
        if x1 >= x0 && y1 >= y0 {
            var cy: Int = y0
            while cy <= y1 {
                var cx: Int = x0
                while cx <= x1 {
                    let k: Int = key(cx, cy)
                    if chunks[k] == nil && (synchronous || !pending.contains(k)) {
                        if synchronous {
                            chunks[k] = TerrainCache.paint(map: map, world: worldData, styles: styles, cx: cx, cy: cy)
                            pending.remove(k)
                        } else {
                            pending.insert(k)
                            let map: CaveMap = self.map
                            let world: WorldData = worldData
                            let styles: [TerrainStyle] = self.styles
                            let px: Int = cx
                            let py: Int = cy
                            Worker.run { [weak self] in
                                let image: Image = TerrainCache.paint(map: map, world: world, styles: styles, cx: px, cy: py)
                                guard let self: TerrainCache = self else { return }
                                self.lock.with { self.finished.append((key: k, image: image)) }
                            }
                        }
                    }
                    cx += 1
                }
                cy += 1
            }
        }
        for k in chunks.keys {
            let cx: Int = k % 4096
            let cy: Int = k / 4096
            if cx < x0 - 2 || cx > x1 + 2 || cy < y0 - 2 || cy > y1 + 2 { chunks[k] = nil }
        }
    }

    private func visibleRange(_ g: Canvas, camX: Double, camY: Double) -> (x0: Int, x1: Int, y0: Int, y1: Int) {
        let size: Double = Double(TerrainCache.chunkSize)
        let halfW: Double = Double(g.width) / 2
        let halfH: Double = Double(g.height) / 2
        return (x0: max(0, Int(((camX - halfW - 48) / size).rounded(.down))), x1: min(chunkCols - 1, Int(((camX + halfW + 48) / size).rounded(.down))),
                y0: max(0, Int(((camY - halfH - 64) / size).rounded(.down))), y1: min(chunkRows - 1, Int(((camY + halfH + 64) / size).rounded(.down))))
    }

    /// Colonne e rovine: stanno dietro la roccia.
    func drawBehind(_ g: Canvas, camX: Double, camY: Double) {
        drawProps(g, camX: camX, camY: camY, time: 0, layer: 0)
    }

    func drawRock(_ g: Canvas, camX: Double, camY: Double) {
        let range: (x0: Int, x1: Int, y0: Int, y1: Int) = visibleRange(g, camX: camX, camY: camY)
        if range.x1 < range.x0 || range.y1 < range.y0 { return }
        let ox: Int = g.width / 2 - Int(camX.rounded())
        let oy: Int = g.height / 2 - Int(camY.rounded())
        var cy: Int = range.y0
        while cy <= range.y1 {
            var cx: Int = range.x0
            while cx <= range.x1 {
                if let image: Image = chunks[key(cx, cy)], !image.isEmpty {
                    g.draw(image, x: cx * TerrainCache.chunkSize + ox, y: cy * TerrainCache.chunkSize + oy)
                }
                cx += 1
            }
            cy += 1
        }
    }

    /// Posidonia, gorgonie, spugne, anemoni, cristalli, bocche e corde: davanti alla roccia.
    func drawFlora(_ g: Canvas, camX: Double, camY: Double, time: Double) {
        drawProps(g, camX: camX, camY: camY, time: time, layer: 1)
        drawProps(g, camX: camX, camY: camY, time: time, layer: 2)
    }

    private func drawProps(_ g: Canvas, camX: Double, camY: Double, time: Double, layer: Int) {
        let range: (x0: Int, x1: Int, y0: Int, y1: Int) = visibleRange(g, camX: camX, camY: camY)
        if range.x1 < range.x0 || range.y1 < range.y0 { return }
        let ox: Int = g.width / 2 - Int(camX.rounded())
        let oy: Int = g.height / 2 - Int(camY.rounded())
        let sprites: Sprites = Sprites.shared
        var cy: Int = range.y0
        while cy <= range.y1 {
            var cx: Int = range.x0
            while cx <= range.x1 {
                for prop in propsByChunk[key(cx, cy)] ?? [] {
                    let px: Int = Int(prop.x.rounded()) + ox
                    let py: Int = Int(prop.y.rounded()) + oy
                    let v: Int = prop.variant
                    switch prop.kind {
                    case .column:
                        if layer == 0 { g.sprite(sprites.get("column\(v)_0"), x: px, y: py) }
                    case .posidonia:
                        if layer == 1 {
                            let frames: Int = max(1, sprites.frameCount("posidonia\(v)"))
                            let offset: Double = Double((Int(prop.x) * 7 + Int(prop.y) * 3) % 10) / 10.0
                            let frame: Int = Int(max(0, time - offset) / 0.24) % frames
                            g.sprite(sprites.get("posidonia\(v)_\(frame)"), x: px, y: py, flipX: Int(prop.x) % 2 == 0)
                        }
                    case .anemone:
                        if layer == 1 {
                            let frames: Int = max(1, sprites.frameCount("anemone\(v)"))
                            g.sprite(sprites.get("anemone\(v)_\(Int(time / 0.30) % frames)"), x: px, y: py)
                        }
                    case .gorgonia:
                        if layer == 1 {
                            let image: Image = sprites.get("gorgonia\(v)_0")
                            if prop.hanging {
                                g.sprite(image, x: Double(px), y: Double(py), rotation: 0, scaleX: 1, scaleY: -1)
                            } else {
                                g.sprite(image, x: px, y: py)
                            }
                        }
                    case .sponge:
                        if layer == 1 { g.sprite(sprites.get("sponge\(v)_0"), x: px, y: py) }
                    case .vent:
                        if layer == 1 { g.sprite(sprites.get("vent\(v)_0"), x: px, y: py) }
                    case .crystal:
                        if layer == 1 { g.sprite(sprites.get("crystal\(v)_0"), x: px, y: py) }
                    case .rope:
                        if layer == 2 {
                            // Corda di risalita: un galleggiante con la sua cima che scende.
                            let segment: Image = sprites.get("rope_segment")
                            let segments: Int = v == 0 ? 9 : 6
                            var i: Int = 0
                            while i < segments {
                                g.sprite(segment, x: px, y: py - (v == 0 ? 46 : -4) + i * 8)
                                i += 1
                            }
                            if v != 0 {
                                let bob: Int = Int((sin(time * Double.pi / 1.1) + 1).rounded())
                                g.sprite(sprites.get("rope_float"), x: px, y: py - bob)
                            }
                        }
                    }
                }
                cx += 1
            }
            cy += 1
        }
    }
}

/// Fondali in parallasse: pareti lontane del Calderone su tre piani, più un piano scuro in primissimo
/// piano. Ogni piano è un'immagine ripetibile che scorre a una frazione della velocità della camera;
/// il colore segue quello dell'acqua, così la lontananza "sbiadisce".
final class DiveBackdrop {
    private struct Layer {
        let image: Image
        let factor: Double
        let strength: Double
        let alpha: UInt8
    }

    private var far: [Layer] = []
    private var front: [Layer] = []
    private let dark: RGBA = RGBA(hex: 0x061633)

    init(seed: UInt64) {
        // Dal più lontano al più vicino: più sfocato e tenue quello lontano.
        far.append(Layer(image: DiveBackdrop.soft(BackdropPainter.rockLayer(size: 256, seed: seed &+ 11, cellsX: 5, cellsY: 2, coverage: 0.34, softEdge: 0.03), factor: 3),
                         factor: 0.12, strength: 0.13, alpha: 255))
        far.append(Layer(image: DiveBackdrop.soft(BackdropPainter.rockLayer(size: 256, seed: seed &+ 22, cellsX: 6, cellsY: 3, coverage: 0.28, softEdge: 0.015), factor: 2),
                         factor: 0.26, strength: 0.24, alpha: 255))
        far.append(Layer(image: Image(BackdropPainter.rockLayer(size: 512, seed: seed &+ 33, cellsX: 7, cellsY: 4, coverage: 0.20, softEdge: 0)),
                         factor: 0.48, strength: 0.38, alpha: 255))
        // Primo piano: poche sagome scure che passano davanti a tutto, appena accennate.
        front.append(Layer(image: Image(BackdropPainter.rockLayer(size: 512, seed: seed &+ 44, cellsX: 4, cellsY: 3, coverage: 0.035, softEdge: 0)),
                           factor: 1.28, strength: 0.86, alpha: 56))
    }

    /// Ingrandisce un'immagine di `factor` volte con interpolazione: i piani lontani restano morbidi.
    private static func soft(_ source: PixelBuffer, factor: Int) -> Image {
        let w: Int = source.width * factor
        let h: Int = source.height * factor
        var out: PixelBuffer = PixelBuffer(width: w, height: h)
        var y: Int = 0
        while y < h {
            let fy: Double = (Double(y) + 0.5) / Double(factor) - 0.5
            let y0: Int = Int(fy.rounded(.down))
            let ty: Double = fy - Double(y0)
            let ya: Int = ((y0 % source.height) + source.height) % source.height
            let yb: Int = (ya + 1) % source.height
            var x: Int = 0
            while x < w {
                let fx: Double = (Double(x) + 0.5) / Double(factor) - 0.5
                let x0: Int = Int(fx.rounded(.down))
                let tx: Double = fx - Double(x0)
                let xa: Int = ((x0 % source.width) + source.width) % source.width
                let xb: Int = (xa + 1) % source.width
                let top: RGBA = DiveBackdrop.mix(source.get(xa, ya), source.get(xb, ya), tx)
                let bottom: RGBA = DiveBackdrop.mix(source.get(xa, yb), source.get(xb, yb), tx)
                out.set(x, y, DiveBackdrop.mix(top, bottom, ty))
                x += 1
            }
            y += 1
        }
        return Image(out)
    }

    /// Media pesata che non sporca i bordi: i pixel trasparenti non portano colore.
    private static func mix(_ a: RGBA, _ b: RGBA, _ t: Double) -> RGBA {
        let wa: Double = Double(a.a) * (1 - t)
        let wb: Double = Double(b.a) * t
        let sum: Double = wa + wb
        if sum <= 0.5 { return RGBA.clear }
        func ch(_ x: UInt8, _ y: UInt8) -> UInt8 {
            return UInt8(max(0, min(255, ((Double(x) * wa + Double(y) * wb) / sum).rounded())))
        }
        return RGBA(r: ch(a.r, b.r), g: ch(a.g, b.g), b: ch(a.b, b.b), a: UInt8(max(0, min(255, sum.rounded()))))
    }

    private func draw(_ layers: [Layer], _ g: Canvas, camX: Double, camY: Double, water: RGBA, visibility: Double) {
        let area: Rect = Rect(0, 0, g.width, g.height)
        for layer in layers {
            let tint: RGBA = water.mixed(with: dark, layer.strength * (0.55 + 0.45 * visibility)).withAlpha(layer.alpha)
            let ox: Int = Int((camX * layer.factor).rounded()) - g.width / 2
            let oy: Int = Int((camY * layer.factor).rounded()) - g.height / 2
            g.tile(layer.image, in: area, offsetX: ox, offsetY: oy, ink: Ink.tint(tint))
        }
    }

    /// Piani lontani: subito dopo il colore dell'acqua.
    func drawFar(_ g: Canvas, camX: Double, camY: Double, water: RGBA, visibility: Double) {
        draw(far, g, camX: camX, camY: camY, water: water, visibility: visibility)
    }

    /// Primo piano: dopo creature ed effetti.
    func drawFront(_ g: Canvas, camX: Double, camY: Double, water: RGBA, visibility: Double) {
        draw(front, g, camX: camX, camY: camY, water: water, visibility: visibility)
    }
}

extension Canvas {
    /// Buio delle profondità con l'alone attorno a Tecla e, se c'è la torcia, il fascio nella direzione
    /// in cui guarda. Stessa forma dello shader dell'app iOS; a blocchi di 2×2, con sei gradini netti.
    /// - Parameters:
    ///   - centerX, centerY: posizione di Tecla sulla tela.
    ///   - dirX, dirY: direzione del fascio (y verso il basso).
    ///   - radius, beam: raggio dell'alone e lunghezza del fascio, in frazione dell'altezza della tela.
    ///   - extra: altre luci che bucano il buio (esche luminose, pesci abissali, fuoco).
    func darkenDive(level: Double, centerX: Double, centerY: Double, dirX: Double, dirY: Double, radius: Double, beam: Double,
                    torch: Bool, extra: [Light]) {
        if level <= 0.01 { return }
        let h: Double = Double(height)
        let bayer: [Double] = [-0.5, 0.0, 0.25, -0.25]
        let rIn: Double = radius * 0.30
        var by: Int = 0
        while by < height {
            let dy: Double = (Double(by) + 1 - centerY) / h
            var bx: Int = 0
            while bx < width {
                let dx: Double = (Double(bx) + 1 - centerX) / h
                let dist: Double = (dx * dx + dy * dy).squareRoot()
                var light: Double = 1 - MathUtil.smoothstep(rIn, radius, dist)
                if torch && light < 1 {
                    let along: Double = dx * dirX + dy * dirY
                    if along > 0 {
                        let side: Double = abs(dx * dirY - dy * dirX)
                        let reach: Double = 1 - MathUtil.smoothstep(beam * 0.45, beam, along)
                        let cone: Double = 1 - MathUtil.smoothstep(0.02 + along * 0.30, 0.05 + along * 0.44, side)
                        light = max(light, reach * cone)
                    }
                }
                if light < 1 {
                    for l in extra {
                        let ex: Double = Double(bx) + 1 - l.x
                        let ey: Double = Double(by) + 1 - l.y
                        let d2: Double = ex * ex + ey * ey
                        let r2: Double = l.radius * l.radius
                        if d2 < r2 {
                            let f: Double = 1 - d2 / r2
                            light = max(light, f * f * l.strength)
                        }
                    }
                }
                let jitter: Double = bayer[((bx >> 1) & 1) + ((by >> 1) & 1) * 2] * 0.5
                let stepped: Double = max(0, min(1, ((light * 6 + 0.5 + jitter).rounded(.down)) / 6))
                let a: Double = level * (1 - stepped)
                if a > 0.004 {
                    let k: UInt32 = UInt32((a * 255).rounded())
                    let inv: UInt32 = 255 - k
                    // Nero appena bluastro, come l'acqua di notte.
                    let add: Pixel = (Pack.mul(3, k) << 8) | (Pack.mul(11, k) << 16) | (k << 24)
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
                bx += 2
            }
            by += 2
        }
    }
}
