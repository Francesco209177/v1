import SpriteKit

/// Il porto di Pietrasale: cielo e isola, mare, banchina, l'osteria e il gozzo ormeggiato.
/// È lo sfondo delle scelte della giornata; la luce cambia con mattina, pomeriggio, sera e notte.
final class HubScene: BaseScene {
    private let phase: DayPhase
    private let water: SKSpriteNode = SKSpriteNode(texture: TextureFactory.white)
    private let sky: SKSpriteNode = SKSpriteNode()
    private let facade: SKSpriteNode = SpriteForge.shared.node("port_facade")
    private let boat: SKSpriteNode = SpriteForge.shared.node("gozzo")
    private let tecla: SKSpriteNode = SpriteForge.shared.node("tecla_stand_0")
    private let ines: SKSpriteNode = SpriteForge.shared.node("ines_stand_0")
    private let tint: SKSpriteNode = SKSpriteNode(color: SKColor.black, size: CGSize(width: 10, height: 10))
    private var quay: [SKSpriteNode] = []
    private var glows: [SKSpriteNode] = []

    init(size: CGSize, phase: DayPhase) {
        self.phase = phase
        super.init(size: size)
    }

    required init?(coder aDecoder: NSCoder) {
        return nil
    }

    private var skyStyle: BackdropPainter.SkyStyle {
        switch phase {
        case .morning: return BackdropPainter.SkyStyle.morning
        case .afternoon: return BackdropPainter.SkyStyle.afternoon
        case .evening: return BackdropPainter.SkyStyle.evening
        case .night: return BackdropPainter.SkyStyle.night
        }
    }

    override func setup() {
        backgroundColor = SKColor(skyStyle.top)
        let forge: SpriteForge = SpriteForge.shared

        // Mare: lo stesso shader dell'immersione, con i colori dell'ora.
        water.zPosition = -100
        water.shader = ShaderLibrary.water
        cam.addChild(water)
        let seaTop: RGBA
        let seaBottom: RGBA
        switch phase {
        case .morning:
            seaTop = RGBA(hex: 0x58D6D0)
            seaBottom = RGBA(hex: 0x1F8FB0)
        case .afternoon:
            seaTop = RGBA(hex: 0x4CC4D8)
            seaBottom = RGBA(hex: 0x1A78A8)
        case .evening:
            seaTop = RGBA(hex: 0xF09A6A)
            seaBottom = RGBA(hex: 0x3A3A78)
        case .night:
            seaTop = RGBA(hex: 0x1B2A55)
            seaBottom = RGBA(hex: 0x070B24)
        }
        ShaderLibrary.setColor(ShaderLibrary.water, "u_top", seaTop)
        ShaderLibrary.setColor(ShaderLibrary.water, "u_bottom", seaBottom)

        // Cielo con l'isola: occupa la parte alta, il mare comincia all'orizzonte (y = 0).
        let skyImage: PixelBuffer = BackdropPainter.sky(width: 640, height: 150, seed: 4, style: skyStyle)
        sky.texture = TextureFactory.texture(from: skyImage)
        sky.size = CGSize(width: 640, height: 150)
        sky.anchorPoint = CGPoint(x: 0.5, y: 0)
        sky.position = CGPoint(x: 40, y: 0)
        sky.zPosition = -50
        world.addChild(sky)

        // Banchina.
        var x: Double = -360
        while x < 360 {
            let tile: SKSpriteNode = forge.node("port_quay")
            tile.position = CGPoint(x: x, y: -44)
            tile.zPosition = 2
            world.addChild(tile)
            quay.append(tile)
            let below: SKSpriteNode = forge.node("port_quay")
            below.position = CGPoint(x: x, y: -72)
            below.zPosition = 2
            world.addChild(below)
            x += 32
        }

        facade.position = CGPoint(x: 70, y: -46)
        facade.zPosition = 3
        world.addChild(facade)

        boat.position = CGPoint(x: -150, y: -30)
        boat.zPosition = 1
        boat.run(SKAction.repeatForever(SKAction.sequence([
            SKAction.moveBy(x: 0, y: 1, duration: 1.0),
            SKAction.moveBy(x: 0, y: -1, duration: 1.0)
        ])))
        world.addChild(boat)

        for (name, px) in [("port_bollard", -92.0), ("port_crate", -40.0), ("port_bollard", 180.0), ("port_crate", 206.0)] {
            let prop: SKSpriteNode = forge.node(name)
            prop.position = CGPoint(x: px, y: -47)
            prop.zPosition = 4
            world.addChild(prop)
        }

        tecla.position = CGPoint(x: -64, y: -52)
        tecla.zPosition = 5
        tecla.run(SKAction.repeatForever(SKAction.animate(with: forge.frames("tecla_stand"), timePerFrame: 0.45)))
        world.addChild(tecla)

        // La sera e la notte Nonna Ines aspetta sulla porta, e le finestre sono accese.
        let dark: Bool = phase == DayPhase.evening || phase == DayPhase.night
        ines.position = CGPoint(x: 96, y: -50)
        ines.zPosition = 5
        ines.xScale = -1
        ines.isHidden = phase != DayPhase.evening
        ines.run(SKAction.repeatForever(SKAction.animate(with: forge.frames("ines_stand"), timePerFrame: 0.5)))
        world.addChild(ines)

        tint.zPosition = 20
        tint.alpha = phase == DayPhase.night ? 0.42 : (phase == DayPhase.evening ? 0.16 : 0)
        tint.color = phase == DayPhase.night ? SKColor(hex: 0x050A28) : SKColor(hex: 0x3A1A50)
        cam.addChild(tint)
        if dark {
            for gx in [28.0, 114.0, 50.0, 100.0] {
                let glow: SKSpriteNode = SKSpriteNode(texture: HubScene.glowTexture)
                glow.size = CGSize(width: 70, height: 70)
                glow.position = CGPoint(x: gx, y: -46 + 40)
                glow.zPosition = 30
                glow.blendMode = SKBlendMode.add
                glow.alpha = 0.45
                world.addChild(glow)
                glows.append(glow)
            }
        }
        setCamera(x: 0, y: 14)
    }

    private static let glowTexture: SKTexture = {
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

    override func layoutHUD() {
        water.size = size
        tint.size = CGSize(width: size.width + 4, height: size.height + 4)
    }

    override func tick(_ dt: Double) {
        InputManager.shared.beginFrame()
        GameSession.shared.addPlayTime(dt)
    }

    override var debugSummary: String {
        return "fase=\(phase.rawValue)"
    }
}
