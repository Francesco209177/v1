import SpriteKit

/// Il porto di Pietrasale come fondale: cielo e isola, banchina, facciata dell'osteria, gozzo.
/// Lo usano il porto vero e proprio e le scene della storia; la luce dipende dall'ora.
final class PortBackdrop: SKNode {
    /// Quota a cui poggiano i piedi dei personaggi.
    static let groundY: Double = -52

    let phase: DayPhase
    private(set) var glows: [SKSpriteNode] = []

    init(phase: DayPhase) {
        self.phase = phase
        super.init()
        let forge: SpriteForge = SpriteForge.shared

        // Cielo con l'isola: occupa la parte alta, il mare comincia all'orizzonte (y = 0).
        let skyImage: PixelBuffer = BackdropPainter.sky(width: 640, height: 150, seed: 4, style: PortBackdrop.skyStyle(phase))
        let sky: SKSpriteNode = SKSpriteNode(texture: TextureFactory.texture(from: skyImage))
        sky.size = CGSize(width: 640, height: 150)
        sky.anchorPoint = CGPoint(x: 0.5, y: 0)
        sky.position = CGPoint(x: 40, y: 0)
        sky.zPosition = -50
        addChild(sky)

        // Banchina, su due file.
        var x: Double = -360
        while x < 360 {
            for y in [-44.0, -72.0, -100.0] {
                let tile: SKSpriteNode = forge.node("port_quay")
                tile.position = CGPoint(x: x, y: y)
                tile.zPosition = 2
                addChild(tile)
            }
            x += 32
        }

        let facade: SKSpriteNode = forge.node("port_facade")
        facade.position = CGPoint(x: 70, y: -46)
        facade.zPosition = 3
        addChild(facade)

        let boat: SKSpriteNode = forge.node("gozzo")
        boat.position = CGPoint(x: -150, y: -30)
        boat.zPosition = 1
        boat.run(SKAction.repeatForever(SKAction.sequence([
            SKAction.moveBy(x: 0, y: 1, duration: 1.0),
            SKAction.moveBy(x: 0, y: -1, duration: 1.0)
        ])))
        addChild(boat)

        for (name, px) in [("port_bollard", -92.0), ("port_crate", -40.0), ("port_bollard", 180.0), ("port_crate", 206.0)] {
            let prop: SKSpriteNode = forge.node(name)
            prop.position = CGPoint(x: px, y: -47)
            prop.zPosition = 4
            addChild(prop)
        }

        // La sera e la notte le finestre sono accese.
        if phase == DayPhase.evening || phase == DayPhase.night {
            for gx in [28.0, 114.0, 50.0, 100.0] {
                let glow: SKSpriteNode = SKSpriteNode(texture: PortBackdrop.glowTexture)
                glow.size = CGSize(width: 70, height: 70)
                glow.position = CGPoint(x: gx, y: -46 + 40)
                glow.zPosition = 30
                glow.blendMode = SKBlendMode.add
                glow.alpha = 0.45
                addChild(glow)
                glows.append(glow)
            }
        }
    }

    required init?(coder aDecoder: NSCoder) {
        return nil
    }

    static func skyStyle(_ phase: DayPhase) -> BackdropPainter.SkyStyle {
        switch phase {
        case .morning: return BackdropPainter.SkyStyle.morning
        case .afternoon: return BackdropPainter.SkyStyle.afternoon
        case .evening: return BackdropPainter.SkyStyle.evening
        case .night: return BackdropPainter.SkyStyle.night
        }
    }

    /// Colori del mare all'orizzonte e in primo piano, per lo shader dell'acqua.
    static func seaColors(_ phase: DayPhase) -> (top: RGBA, bottom: RGBA) {
        switch phase {
        case .morning: return (top: RGBA(hex: 0x58D6D0), bottom: RGBA(hex: 0x1F8FB0))
        case .afternoon: return (top: RGBA(hex: 0x4CC4D8), bottom: RGBA(hex: 0x1A78A8))
        case .evening: return (top: RGBA(hex: 0xF09A6A), bottom: RGBA(hex: 0x3A3A78))
        case .night: return (top: RGBA(hex: 0x1B2A55), bottom: RGBA(hex: 0x070B24))
        }
    }

    /// Velo colorato che dà la luce dell'ora: colore e opacità.
    static func tint(_ phase: DayPhase) -> (color: SKColor, alpha: CGFloat) {
        switch phase {
        case .night: return (color: SKColor(hex: 0x050A28), alpha: 0.42)
        case .evening: return (color: SKColor(hex: 0x3A1A50), alpha: 0.16)
        case .morning, .afternoon: return (color: SKColor.black, alpha: 0)
        }
    }

    static let glowTexture: SKTexture = {
        let size: Int = 48
        var image: PixelBuffer = PixelBuffer(width: size, height: size)
        let c: Double = Double(size) / 2
        var y: Int = 0
        while y < size {
            var x: Int = 0
            while x < size {
                let dx: Double = Double(x) + 0.5 - c
                let dy: Double = Double(y) + 0.5 - c
                let d: Double = (dx * dx + dy * dy).squareRoot() / c
                if d < 1 {
                    let a: Double = (1 - d) * (1 - d)
                    image.set(x, y, RGBA(r: 255, g: 200, b: 120, a: UInt8(max(0, min(255, a * 255)))))
                }
                x += 1
            }
            y += 1
        }
        return TextureFactory.texture(from: image, filtering: SKTextureFilteringMode.linear)
    }()
}
