import SpriteKit
import simd

/// Roccia e flora del Calderone, caricate a blocchi attorno alla camera.
/// Ogni blocco è dipinto in un thread secondario da `TerrainPainter` e diventa uno sprite;
/// i blocchi lontani vengono rimossi, così la memoria resta costante a ogni profondità.
final class TerrainLayer: SKNode {
    static let chunkSize: Int = 256

    private let map: CaveMap
    private let worldData: WorldData
    private let styles: [TerrainStyle]
    private var chunks: [Int: SKNode] = [:]
    private var pending: Set<Int> = []
    private var propsByChunk: [Int: [MapProp]] = [:]
    private let queue: DispatchQueue = DispatchQueue(label: "it.mareaprofonda.terrain", qos: DispatchQoS.userInitiated)
    private let chunkCols: Int
    private let chunkRows: Int
    /// Oltre questa profondità i blocchi ricevono la luce dinamica della torcia invece delle caustiche.
    private let causticsLimitMeters: Double = 115
    private let dynamicLights: Bool

    init(map: CaveMap, world: WorldData, dynamicLights: Bool) {
        self.map = map
        self.worldData = world
        self.styles = TerrainPainter.styles(for: world)
        self.dynamicLights = dynamicLights
        let size: Int = TerrainLayer.chunkSize
        chunkCols = (map.cols * map.tileSize + size - 1) / size
        chunkRows = (map.rows * map.tileSize + size - 1) / size
        super.init()
        for prop in map.props {
            let cx: Int = max(0, min(chunkCols - 1, Int(prop.x) / size))
            let cy: Int = max(0, min(chunkRows - 1, Int(prop.y) / size))
            propsByChunk[key(cx, cy), default: []].append(prop)
        }
    }

    required init?(coder aDecoder: NSCoder) {
        return nil
    }

    private func key(_ cx: Int, _ cy: Int) -> Int {
        return cy * 4096 + cx
    }

    var loadedChunkCount: Int { return chunks.count }

    /// Carica i blocchi visibili (più un margine) e scarica quelli lontani.
    /// - Parameters:
    ///   - mapX, mapY: centro della vista in pixel di mappa (y verso il basso).
    ///   - synchronous: true per dipingere subito, senza attese (all'ingresso nella scena).
    func update(mapX: Double, mapY: Double, viewWidth: Double, viewHeight: Double, synchronous: Bool) {
        let size: Double = Double(TerrainLayer.chunkSize)
        let margin: Double = synchronous ? 64 : 150
        let x0: Int = max(0, Int(((mapX - viewWidth / 2 - margin) / size).rounded(.down)))
        let x1: Int = min(chunkCols - 1, Int(((mapX + viewWidth / 2 + margin) / size).rounded(.down)))
        let y0: Int = max(0, Int(((mapY - viewHeight / 2 - margin) / size).rounded(.down)))
        let y1: Int = min(chunkRows - 1, Int(((mapY + viewHeight / 2 + margin) / size).rounded(.down)))
        if x1 >= x0 && y1 >= y0 {
            for cy in y0...y1 {
                for cx in x0...x1 {
                    let k: Int = key(cx, cy)
                    if chunks[k] != nil || pending.contains(k) { continue }
                    if synchronous {
                        let painted: Painted = paint(cx, cy)
                        install(painted)
                    } else {
                        pending.insert(k)
                        queue.async { [weak self] in
                            guard let self = self else { return }
                            let painted: Painted = self.paint(cx, cy)
                            DispatchQueue.main.async { [weak self] in
                                guard let self = self else { return }
                                self.pending.remove(k)
                                self.install(painted)
                            }
                        }
                    }
                }
            }
        }
        // Scarica ciò che è lontano più di due blocchi dalla zona caricata.
        for (k, node) in chunks {
            let cx: Int = k % 4096
            let cy: Int = k / 4096
            if cx < x0 - 2 || cx > x1 + 2 || cy < y0 - 2 || cy > y1 + 2 {
                node.removeFromParent()
                chunks[k] = nil
            }
        }
    }

    private struct Painted {
        let cx: Int
        let cy: Int
        let image: CGImage?
    }

    /// Può girare fuori dal thread principale: usa solo dati immutabili.
    private func paint(_ cx: Int, _ cy: Int) -> Painted {
        let size: Int = TerrainLayer.chunkSize
        let result: TerrainPainter.Result = TerrainPainter.paint(map: map, world: worldData, styles: styles,
                                                                originX: cx * size, originY: cy * size, width: size, height: size)
        if !result.hasRock { return Painted(cx: cx, cy: cy, image: nil) }
        let image: CGImage? = TextureFactory.cgImage(width: size, height: size, premultiplied: result.image.premultipliedData())
        return Painted(cx: cx, cy: cy, image: image)
    }

    private func install(_ painted: Painted) {
        let k: Int = key(painted.cx, painted.cy)
        if chunks[k] != nil { return }
        let size: CGFloat = CGFloat(TerrainLayer.chunkSize)
        let container: SKNode = SKNode()
        container.position = CGPoint(x: CGFloat(painted.cx) * size, y: -CGFloat(painted.cy) * size)
        if let image: CGImage = painted.image {
            let texture: SKTexture = SKTexture(cgImage: image)
            texture.filteringMode = SKTextureFilteringMode.nearest
            let sprite: SKSpriteNode = SKSpriteNode(texture: texture, size: CGSize(width: size, height: size))
            sprite.anchorPoint = CGPoint(x: 0, y: 1)
            sprite.zPosition = 0
            let topMeters: Double = Double(painted.cy * TerrainLayer.chunkSize) / Double(map.tileSize)
            if topMeters < causticsLimitMeters {
                sprite.shader = ShaderLibrary.terrainCaustics
                let origin: vector_float2 = vector_float2(Float(painted.cx * TerrainLayer.chunkSize), Float(painted.cy * TerrainLayer.chunkSize))
                sprite.setValue(SKAttributeValue(vectorFloat2: origin), forAttribute: "a_origin")
                let fade: Double = MathUtil.clamp(1.0 - topMeters / causticsLimitMeters, 0, 1)
                sprite.setValue(SKAttributeValue(float: Float(fade)), forAttribute: "a_fade")
            } else if dynamicLights {
                sprite.lightingBitMask = 1
            }
            container.addChild(sprite)
        }
        for prop in propsByChunk[k] ?? [] {
            if let node: SKNode = makeProp(prop) {
                node.position = CGPoint(x: CGFloat(prop.x) - container.position.x, y: -CGFloat(prop.y) - container.position.y)
                container.addChild(node)
            }
        }
        addChild(container)
        chunks[k] = container
    }

    private func makeProp(_ prop: MapProp) -> SKNode? {
        let forge: SpriteForge = SpriteForge.shared
        let v: Int = prop.variant
        switch prop.kind {
        case .posidonia:
            let frames: [SKTexture] = forge.frames("posidonia\(v)")
            let node: SKSpriteNode = forge.node("posidonia\(v)_0")
            node.zPosition = 2
            let offset: Double = Double((Int(prop.x) * 7 + Int(prop.y) * 3) % 10) / 10.0
            node.run(SKAction.sequence([
                SKAction.wait(forDuration: offset),
                SKAction.repeatForever(SKAction.animate(with: frames, timePerFrame: 0.24))
            ]))
            if Int(prop.x) % 2 == 0 { node.xScale = -1 }
            return node
        case .anemone:
            let frames: [SKTexture] = forge.frames("anemone\(v)")
            let node: SKSpriteNode = forge.node("anemone\(v)_0")
            node.zPosition = 2
            node.run(SKAction.repeatForever(SKAction.animate(with: frames, timePerFrame: 0.30)))
            return node
        case .gorgonia:
            let node: SKSpriteNode = forge.node("gorgonia\(v)_0")
            node.zPosition = 2
            if prop.hanging { node.yScale = -1 }
            return node
        case .sponge:
            let node: SKSpriteNode = forge.node("sponge\(v)_0")
            node.zPosition = 2
            return node
        case .column:
            let node: SKSpriteNode = forge.node("column\(v)_0")
            node.zPosition = 1
            return node
        case .vent:
            let node: SKSpriteNode = forge.node("vent\(v)_0")
            node.zPosition = 2
            return node
        case .crystal:
            let node: SKSpriteNode = forge.node("crystal\(v)_0")
            node.zPosition = 2
            return node
        case .rope:
            // Corda di risalita: un galleggiante con la sua cima che scende.
            let holder: SKNode = SKNode()
            holder.zPosition = 3
            let float: SKSpriteNode = forge.node("rope_float")
            if v == 0 {
                // La cima dell'ancora del gozzo: parte dalla superficie.
                float.isHidden = true
            }
            holder.addChild(float)
            let segments: Int = v == 0 ? 9 : 6
            var i: Int = 0
            while i < segments {
                let piece: SKSpriteNode = forge.node("rope_segment")
                piece.position = CGPoint(x: 0, y: (v == 0 ? 46 : -4) - CGFloat(i) * 8)
                piece.zPosition = -1
                holder.addChild(piece)
                i += 1
            }
            float.run(SKAction.repeatForever(SKAction.sequence([
                SKAction.moveBy(x: 0, y: 2, duration: 1.1),
                SKAction.moveBy(x: 0, y: -2, duration: 1.1)
            ])))
            return holder
        }
    }
}
