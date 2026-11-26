import SpriteKit

/// Fondali in parallasse: pareti lontane del Calderone su tre piani, più un piano scuro
/// in primissimo piano. Ogni piano è una texture ripetibile che scorre a una frazione della
/// velocità della camera; il colore segue quello dell'acqua, così la lontananza "sbiadisce".
final class ParallaxBackdrop {
    private struct Layer {
        let node: SKNode
        let sprites: [SKSpriteNode]
        let tile: Double
        let factor: Double
        let cols: Int
        let rows: Int
        /// Quanto il piano si stacca dal colore dell'acqua (0 = invisibile).
        let strength: Double
        let snapToPixels: Bool
    }

    private var layers: [Layer] = []
    private let dark: RGBA = RGBA(hex: 0x061633)

    init(parent: SKNode, seed: UInt64) {
        // Dal più lontano al più vicino: più sfocato e tenue quello lontano.
        addLayer(parent: parent, image: BackdropPainter.rockLayer(size: 256, seed: seed &+ 11, cellsX: 5, cellsY: 2, coverage: 0.34, softEdge: 0.03),
                 scale: 3, factor: 0.12, strength: 0.13, z: -90, linear: true)
        addLayer(parent: parent, image: BackdropPainter.rockLayer(size: 256, seed: seed &+ 22, cellsX: 6, cellsY: 3, coverage: 0.28, softEdge: 0.015),
                 scale: 2, factor: 0.26, strength: 0.24, z: -80, linear: true)
        addLayer(parent: parent, image: BackdropPainter.rockLayer(size: 512, seed: seed &+ 33, cellsX: 7, cellsY: 4, coverage: 0.20, softEdge: 0),
                 scale: 1, factor: 0.48, strength: 0.38, z: -70, linear: false)
        // Primo piano: poche sagome scure che passano davanti a tutto.
        addLayer(parent: parent, image: BackdropPainter.rockLayer(size: 512, seed: seed &+ 44, cellsX: 4, cellsY: 3, coverage: 0.05, softEdge: 0),
                 scale: 1, factor: 1.28, strength: 0.86, z: 60, linear: false)
    }

    private func addLayer(parent: SKNode, image: PixelBuffer, scale: Int, factor: Double, strength: Double, z: CGFloat, linear: Bool) {
        let texture: SKTexture = TextureFactory.texture(from: image, filtering: linear ? SKTextureFilteringMode.linear : SKTextureFilteringMode.nearest)
        let tile: Double = Double(image.width * scale)
        // Abbastanza copie da coprire lo schermo più largo previsto (circa 620 x 290 pixel d'arte).
        let cols: Int = Int((640.0 / tile).rounded(.up)) + 1
        let rows: Int = Int((300.0 / tile).rounded(.up)) + 1
        let node: SKNode = SKNode()
        node.zPosition = z
        var sprites: [SKSpriteNode] = []
        var i: Int = 0
        while i < cols * rows {
            let sprite: SKSpriteNode = SKSpriteNode(texture: texture, size: CGSize(width: tile, height: tile))
            sprite.anchorPoint = CGPoint(x: 0, y: 0)
            sprite.colorBlendFactor = 1
            if z > 0 { sprite.alpha = 0.72 }
            node.addChild(sprite)
            sprites.append(sprite)
            i += 1
        }
        parent.addChild(node)
        layers.append(Layer(node: node, sprites: sprites, tile: tile, factor: factor, cols: cols, rows: rows, strength: strength, snapToPixels: !linear))
    }

    /// - Parameters:
    ///   - cameraX, cameraY: posizione della camera nel mondo (y verso l'alto).
    ///   - water: colore dell'acqua al centro dello schermo.
    ///   - visibility: 1 in acque limpide, verso 0 al buio (i piani lontani spariscono per primi).
    func update(cameraX: Double, cameraY: Double, viewWidth: Double, viewHeight: Double, water: RGBA, visibility: Double, layout: PixelLayout) {
        for layer in layers {
            let scrollX: Double = cameraX * layer.factor
            let scrollY: Double = cameraY * layer.factor
            let i0: Double = ((scrollX - viewWidth / 2) / layer.tile).rounded(.down)
            let j0: Double = ((scrollY - viewHeight / 2) / layer.tile).rounded(.down)
            let baseX: Double = cameraX * (1 - layer.factor)
            let baseY: Double = cameraY * (1 - layer.factor)
            let tint: RGBA = water.mixed(with: dark, layer.strength * (0.55 + 0.45 * visibility))
            let color: SKColor = SKColor(tint)
            var index: Int = 0
            var j: Int = 0
            while j < layer.rows {
                var i: Int = 0
                while i < layer.cols {
                    var x: Double = (i0 + Double(i)) * layer.tile + baseX
                    var y: Double = (j0 + Double(j)) * layer.tile + baseY
                    if layer.snapToPixels {
                        x = layout.snap(x)
                        y = layout.snap(y)
                    }
                    let sprite: SKSpriteNode = layer.sprites[index]
                    sprite.position = CGPoint(x: x, y: y)
                    sprite.color = color
                    index += 1
                    i += 1
                }
                j += 1
            }
        }
    }
}
