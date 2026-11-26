import SpriteKit

/// Schermata del titolo: mare aperto, raggi di luce, Tecla che nuota sotto il nome del gioco.
final class TitleScene: BaseScene {
    var onStart: (() -> Void)?

    private let water: SKSpriteNode = SKSpriteNode(texture: TextureFactory.white)
    private let rays: SKSpriteNode = SKSpriteNode(texture: TextureFactory.white)
    private let title: PixelLabel = PixelLabel(text: "MAREA PROFONDA", color: SKColor.white, alignment: PixelLabel.Alignment.center)
    private let prompt: PixelLabel = PixelLabel(text: "TOCCA PER IMMERGERTI", color: SKColor(red: 1.0, green: 0.92, blue: 0.62, alpha: 1), alignment: PixelLabel.Alignment.center)
    private var swimmer: SKSpriteNode = SKSpriteNode()
    private var swimmerX: Double = -200
    private var bubbleTimer: Double = 0
    private var started: Bool = false

    override func setup() {
        backgroundColor = SKColor(red: 0.05, green: 0.22, blue: 0.36, alpha: 1)
        AudioDirector.shared.music("porto")

        water.zPosition = -100
        water.shader = ShaderLibrary.water
        cam.addChild(water)
        ShaderLibrary.setColor(ShaderLibrary.water, "u_top", RGBA(hex: 0x3CC4C8))
        ShaderLibrary.setColor(ShaderLibrary.water, "u_bottom", RGBA(hex: 0x0B2E57))

        rays.zPosition = -90
        rays.shader = ShaderLibrary.godRays
        rays.blendMode = SKBlendMode.add
        cam.addChild(rays)
        ShaderLibrary.setFloat(ShaderLibrary.godRays, "u_strength", 0.38)

        title.shadowColor = SKColor(red: 0.03, green: 0.10, blue: 0.22, alpha: 1)
        prompt.shadowColor = SKColor(red: 0.03, green: 0.10, blue: 0.22, alpha: 1)
        hud.addChild(title)
        hud.addChild(prompt)
        prompt.run(SKAction.repeatForever(SKAction.sequence([
            SKAction.fadeAlpha(to: 0.25, duration: 0.8),
            SKAction.fadeAlpha(to: 1.0, duration: 0.8)
        ])))

        let forge: SpriteForge = SpriteForge.shared
        swimmer = forge.node("tecla_swim_0")
        swimmer.zPosition = 10
        swimmer.run(SKAction.repeatForever(SKAction.animate(with: forge.frames("tecla_swim"), timePerFrame: 0.11)))
        world.addChild(swimmer)
        setCamera(x: 0, y: 0)
    }

    override func layoutHUD() {
        water.size = size
        rays.size = size
        let unit: CGFloat = hudPixelScale(1)
        let titleScale: Int = size.width > 760 ? 4 : 3
        title.setScale(unit * CGFloat(titleScale))
        title.position = CGPoint(x: 0, y: size.height * 0.20)
        prompt.setScale(unit * 2)
        prompt.position = CGPoint(x: 0, y: hudSafeRect.minY + 18)
    }

    override func tick(_ dt: Double) {
        let input: InputManager = InputManager.shared
        input.beginFrame()
        if !input.pressed.isEmpty { begin() }
        let halfWidth: Double = Double(artSize.width) / 2 + 40
        swimmerX += dt * 46
        if swimmerX > halfWidth { swimmerX = -halfWidth }
        let y: Double = -18 + sin(elapsed * 1.3) * 5
        swimmer.position = CGPoint(x: layout.snap(swimmerX), y: layout.snap(y))

        bubbleTimer -= dt
        if bubbleTimer <= 0 {
            bubbleTimer = 0.35 + Double(frameCount % 5) * 0.07
            spawnBubble(x: swimmerX + 16, y: y + 3)
        }
    }

    private func spawnBubble(x: Double, y: Double) {
        let names: [String] = ["bubble_0", "bubble_1", "bubble_2"]
        let bubble: SKSpriteNode = SpriteForge.shared.node(names[frameCount % names.count])
        bubble.position = CGPoint(x: x, y: y)
        bubble.zPosition = 9
        bubble.alpha = 0.9
        world.addChild(bubble)
        let rise: SKAction = SKAction.moveBy(x: CGFloat(-6 + frameCount % 13), y: 70, duration: 2.2)
        rise.timingMode = SKActionTimingMode.easeOut
        bubble.run(SKAction.sequence([
            SKAction.group([rise, SKAction.sequence([SKAction.wait(forDuration: 1.5), SKAction.fadeOut(withDuration: 0.7)])]),
            SKAction.removeFromParent()
        ]))
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        begin()
    }

    private func begin() {
        if started { return }
        started = true
        Feedback.tap()
        // Il titolo lascia spazio alla scelta della partita.
        title.run(SKAction.fadeAlpha(to: 0.0, duration: 0.25))
        prompt.removeAllActions()
        prompt.run(SKAction.fadeOut(withDuration: 0.2))
        onStart?()
    }
}

/// Scena usata solo dalla prova automatica per controllare che un errore di shader lasci traccia nei log.
final class ShaderCanaryScene: BaseScene {
    override func setup() {
        let node: SKSpriteNode = SKSpriteNode(texture: TextureFactory.white)
        node.size = CGSize(width: 64, height: 64)
        node.shader = ShaderLibrary.makeBrokenCanary()
        world.addChild(node)
    }
}
