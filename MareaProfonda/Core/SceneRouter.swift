import SpriteKit

/// Passaggio da una scena all'altra con la dissolvenza a bolle.
final class SceneRouter {
    static let shared: SceneRouter = SceneRouter()

    weak var view: SKView?
    private var transitioning: Bool = false

    private init() {}

    func showTitle(animated: Bool) {
        guard let view: SKView = view else { return }
        OverlayCenter.shared.show(nil)
        let scene: TitleScene = TitleScene(size: view.bounds.size)
        scene.onStart = {
            OverlayCenter.shared.show(OverlayScreen.slots)
        }
        present(scene, animated: animated)
    }

    /// Il porto: da qui si sceglie che cosa fare in questa fase della giornata.
    func showHub() {
        guard let view: SKView = view, let state: GameState = GameSession.shared.state else {
            showTitle(animated: true)
            return
        }
        OverlayCenter.shared.show(nil)
        let scene: HubScene = HubScene(size: view.bounds.size, phase: state.phase)
        present(scene, animated: true) {
            OverlayCenter.shared.show(OverlayScreen.hub)
        }
    }

    func startDive() {
        guard let view: SKView = view else { return }
        OverlayCenter.shared.show(nil)
        let scene: DiveScene = DiveScene(size: view.bounds.size, config: GameSession.shared.diveConfig())
        scene.onFinished = { (bag: DiveBag, deepest: Double) -> Void in
            GameSession.shared.finishDive(bag: bag, deepest: deepest)
            SceneRouter.shared.showHub()
        }
        present(scene, animated: true)
    }

    func startService() {
        guard let view: SKView = view, let setup: ServiceSetup = GameSession.shared.serviceSetup() else {
            showHub()
            return
        }
        OverlayCenter.shared.show(nil)
        let scene: RestaurantScene = RestaurantScene(size: view.bounds.size, config: RestaurantScene.Config(setup: setup))
        scene.onFinished = { (result: ServiceResult) -> Void in
            GameSession.shared.finishService(result)
            OverlayCenter.shared.show(OverlayScreen.summary)
        }
        present(scene, animated: true)
    }

    /// - Parameter then: chiamata quando la scena nuova è visibile (per mostrare un menu sopra).
    func present(_ scene: BaseScene, animated: Bool, then: (() -> Void)? = nil) {
        guard let view: SKView = view, !transitioning else { return }
        InputManager.shared.reset()
        if animated, let current: BaseScene = view.scene as? BaseScene {
            transitioning = true
            BubbleWipe.cover(current) { [weak self, weak view] in
                view?.presentScene(scene)
                self?.transitioning = false
                DispatchQueue.main.async {
                    BubbleWipe.reveal(scene)
                    then?()
                }
            }
        } else {
            view.presentScene(scene)
            then?()
        }
    }
}

/// Dissolvenza a bolle: uno sciame di bolle sale a coprire lo schermo, poi si dirada sulla scena nuova.
enum BubbleWipe {
    private static let veilColor: SKColor = SKColor(red: 0.04, green: 0.20, blue: 0.36, alpha: 1)

    private static let texture: SKTexture = {
        let size: Int = 40
        var image: PixelBuffer = PixelBuffer(width: size, height: size)
        let c: Double = Double(size) / 2 - 0.5
        var y: Int = 0
        while y < size {
            var x: Int = 0
            while x < size {
                let d: Double = ((Double(x) - c) * (Double(x) - c) + (Double(y) - c) * (Double(y) - c)).squareRoot()
                if d <= c - 2 {
                    image.set(x, y, RGBA(r: 96, g: 190, b: 214, a: 255))
                } else if d <= c {
                    image.set(x, y, RGBA(r: 214, g: 246, b: 252, a: 255))
                }
                x += 1
            }
            y += 1
        }
        // Riflesso in alto a sinistra.
        image.fillRect(x: 9, y: 8, width: 7, height: 3, RGBA(r: 240, g: 252, b: 255, a: 255))
        image.fillRect(x: 8, y: 11, width: 3, height: 5, RGBA(r: 240, g: 252, b: 255, a: 255))
        return TextureFactory.texture(from: image)
    }()

    private static func makeLayer(_ scene: BaseScene) -> SKNode {
        let layer: SKNode = SKNode()
        layer.zPosition = 5000
        scene.cam.addChild(layer)
        return layer
    }

    static func cover(_ scene: BaseScene, completion: @escaping () -> Void) {
        let layer: SKNode = makeLayer(scene)
        let w: CGFloat = scene.size.width
        let h: CGFloat = scene.size.height
        var rng: SeededRNG = SeededRNG(seed: UInt64(scene.frameCount) &+ 77)
        let veil: SKSpriteNode = SKSpriteNode(color: veilColor, size: CGSize(width: w + 4, height: h + 4))
        veil.alpha = 0
        veil.zPosition = -1
        layer.addChild(veil)
        veil.run(SKAction.sequence([SKAction.wait(forDuration: 0.16), SKAction.fadeIn(withDuration: 0.30)]))
        var i: Int = 0
        while i < 44 {
            let bubble: SKSpriteNode = SKSpriteNode(texture: texture)
            let scale: CGFloat = CGFloat(rng.range(1.6, 4.4))
            bubble.setScale(scale)
            bubble.position = CGPoint(x: CGFloat(rng.range(-0.55, 0.55)) * w, y: -h / 2 - 90 - CGFloat(rng.range(0, 0.55)) * h)
            layer.addChild(bubble)
            let rise: SKAction = SKAction.moveBy(x: CGFloat(rng.range(-30, 30)), y: h * 1.25 + 180, duration: rng.range(0.48, 0.66))
            rise.timingMode = SKActionTimingMode.easeIn
            bubble.run(rise)
            i += 1
        }
        layer.run(SKAction.sequence([SKAction.wait(forDuration: 0.56), SKAction.run(completion)]))
    }

    static func reveal(_ scene: BaseScene) {
        let layer: SKNode = makeLayer(scene)
        let w: CGFloat = scene.size.width
        let h: CGFloat = scene.size.height
        var rng: SeededRNG = SeededRNG(seed: 991)
        let veil: SKSpriteNode = SKSpriteNode(color: veilColor, size: CGSize(width: w + 4, height: h + 4))
        veil.zPosition = -1
        layer.addChild(veil)
        veil.run(SKAction.fadeOut(withDuration: 0.42))
        var i: Int = 0
        while i < 30 {
            let bubble: SKSpriteNode = SKSpriteNode(texture: texture)
            bubble.setScale(CGFloat(rng.range(1.2, 3.6)))
            bubble.position = CGPoint(x: CGFloat(rng.range(-0.55, 0.55)) * w, y: CGFloat(rng.range(-0.5, 0.4)) * h)
            layer.addChild(bubble)
            let rise: SKAction = SKAction.moveBy(x: CGFloat(rng.range(-24, 24)), y: h * 1.1 + 120, duration: rng.range(0.42, 0.70))
            rise.timingMode = SKActionTimingMode.easeIn
            bubble.run(rise)
            i += 1
        }
        layer.run(SKAction.sequence([SKAction.wait(forDuration: 0.8), SKAction.removeFromParent()]))
    }
}
