import SpriteKit

/// Il porto di Pietrasale: cielo e isola, mare, banchina, l'osteria e il gozzo ormeggiato.
/// È lo sfondo delle scelte della giornata; la luce cambia con mattina, pomeriggio, sera e notte.
final class HubScene: BaseScene {
    private let phase: DayPhase
    private let water: SKSpriteNode = SKSpriteNode(texture: TextureFactory.white)
    private let tecla: SKSpriteNode = SpriteForge.shared.node("tecla_stand_0")
    private let ines: SKSpriteNode = SpriteForge.shared.node("ines_stand_0")
    private let tint: SKSpriteNode = SKSpriteNode(color: SKColor.black, size: CGSize(width: 10, height: 10))

    init(size: CGSize, phase: DayPhase) {
        self.phase = phase
        super.init(size: size)
    }

    required init?(coder aDecoder: NSCoder) {
        return nil
    }

    override func setup() {
        backgroundColor = SKColor(PortBackdrop.skyStyle(phase).top)
        AudioDirector.shared.music(phase == DayPhase.night ? "notte" : "porto")
        let forge: SpriteForge = SpriteForge.shared

        // Mare: lo stesso shader dell'immersione, con i colori dell'ora.
        water.zPosition = -100
        water.shader = ShaderLibrary.water
        cam.addChild(water)
        let sea: (top: RGBA, bottom: RGBA) = PortBackdrop.seaColors(phase)
        ShaderLibrary.setColor(ShaderLibrary.water, "u_top", sea.top)
        ShaderLibrary.setColor(ShaderLibrary.water, "u_bottom", sea.bottom)

        world.addChild(PortBackdrop(phase: phase))

        tecla.position = CGPoint(x: -64, y: PortBackdrop.groundY)
        tecla.zPosition = 5
        tecla.run(SKAction.repeatForever(SKAction.animate(with: forge.frames("tecla_stand"), timePerFrame: 0.45)))
        world.addChild(tecla)

        // La sera Nonna Ines aspetta sulla porta.
        ines.position = CGPoint(x: 96, y: PortBackdrop.groundY + 2)
        ines.zPosition = 5
        ines.xScale = -1
        ines.isHidden = phase != DayPhase.evening
        ines.run(SKAction.repeatForever(SKAction.animate(with: forge.frames("ines_stand"), timePerFrame: 0.5)))
        world.addChild(ines)

        let light: (color: SKColor, alpha: CGFloat) = PortBackdrop.tint(phase)
        tint.zPosition = 20
        tint.alpha = light.alpha
        tint.color = light.color
        cam.addChild(tint)
        setCamera(x: 0, y: 14)
    }

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
