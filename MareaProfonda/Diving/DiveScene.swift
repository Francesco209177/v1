import SpriteKit
import UIKit

/// Immersione nel Calderone: Tecla nuota in una mappa generata dal seme, tra fondali in
/// parallasse, raggi di luce, caustiche e, più giù, il buio rischiarato dalla torcia.
final class DiveScene: BaseScene {

    struct Config {
        /// Seme della mappa: slot, giorno e fascia oraria combinati.
        var seed: UInt64 = 1
        /// Profondità di partenza in metri (0 = dalla barca).
        var startDepthMeters: Double = 0
        var sky: BackdropPainter.SkyStyle = BackdropPainter.SkyStyle.morning
        /// Direzione imposta dalla prova automatica, al posto dei comandi.
        var autopilot: Vec2? = nil
    }

    private struct Mote {
        let node: SKSpriteNode
        var x: Double
        var y: Double
        var vx: Double
        var vy: Double
    }

    // Dati
    private let config: Config
    private let worldData: WorldData
    private let map: CaveMap
    private let tuning: DiverTuning = DiverTuning()
    private var diver: DiverState
    private var fx: SeededRNG

    // Nodi
    private let water: SKSpriteNode = SKSpriteNode(texture: TextureFactory.white)
    private let rays: SKSpriteNode = SKSpriteNode(texture: TextureFactory.white)
    private let darkness: SKSpriteNode = SKSpriteNode(texture: TextureFactory.white)
    private let terrain: TerrainLayer
    private let diverNode: DiverNode = DiverNode()
    private let sky: SKSpriteNode = SKSpriteNode()
    private let surface: SKNode = SKNode()
    private var surfaceSprites: [SKSpriteNode] = []
    private var surfaceTextures: [SKTexture] = []
    private let boat: SKSpriteNode = SpriteForge.shared.node("gozzo")
    private var backdrop: ParallaxBackdrop?
    private var motes: [Mote] = []
    private let diveHUD: DiveHUD = DiveHUD()
    private let controls: TouchControls = TouchControls()

    // Pausa
    private let pauseLayer: SKNode = SKNode()
    private let pauseVeil: SKSpriteNode = SKSpriteNode(color: Theme.ink, size: CGSize(width: 10, height: 10))
    private let pauseTitle: PixelLabel = PixelLabel(text: "PAUSA", color: SKColor.white, alignment: PixelLabel.Alignment.center)
    private let resumeButton: PillButton = PillButton(text: String(localized: "Riprendi"), size: CGSize(width: 200, height: 48), fill: Theme.turquoise)
    private let quitButton: PillButton = PillButton(text: String(localized: "Torna al titolo"), size: CGSize(width: 200, height: 48), fill: Theme.lime)
    /// Pausa chiesta dal giocatore (diversa da `isPaused` di SpriteKit, che ferma anche l'HUD).
    private var userPaused: Bool = false
    private var pressedPill: PillButton?

    // Stato
    private var cameraPos: Vec2 = Vec2.zero
    private var bubbleTimer: Double = 0.4
    private var surfaceClock: Double = 0
    private var zoneIndex: Int = -1
    private var leaving: Bool = false

    init(size: CGSize, config: Config) {
        self.config = config
        let data: WorldData = GameData.shared.world
        worldData = data
        let generated: CaveMap = CaveGenerator.generate(seed: config.seed, world: data)
        map = generated
        let start: Vec2 = generated.channelPoint(depthMeters: max(config.startDepthMeters, 0.6))
        diver = DiverState(position: generated.nearestOpenPoint(to: start, clearance: 10))
        fx = SeededRNG(seed: config.seed &+ 404)
        terrain = TerrainLayer(map: generated, world: data, dynamicLights: SettingsStore.shared.settings.dynamicLights)
        super.init(size: size)
    }

    required init?(coder aDecoder: NSCoder) {
        return nil
    }

    // MARK: - Costruzione

    override func setup() {
        backgroundColor = SKColor(red: 0.03, green: 0.14, blue: 0.26, alpha: 1)
        ControllerSupport.shared.start()

        water.zPosition = -100
        water.shader = ShaderLibrary.water
        cam.addChild(water)

        rays.zPosition = -55
        rays.shader = ShaderLibrary.godRays
        rays.blendMode = SKBlendMode.add
        cam.addChild(rays)

        darkness.zPosition = 400
        darkness.shader = ShaderLibrary.darkness
        darkness.isHidden = true
        cam.addChild(darkness)

        backdrop = ParallaxBackdrop(parent: world, seed: config.seed)

        // Cielo e isola sopra la superficie.
        let skyImage: PixelBuffer = BackdropPainter.sky(width: 640, height: 150, seed: config.seed, style: config.sky)
        sky.texture = TextureFactory.texture(from: skyImage)
        sky.size = CGSize(width: 640, height: 150)
        sky.anchorPoint = CGPoint(x: 0.5, y: 0)
        sky.zPosition = -50
        world.addChild(sky)

        // Pelo dell'acqua visto da sotto: tre fasi dell'onda alternate.
        for phase in [0.0, 2.1, 4.2] {
            surfaceTextures.append(TextureFactory.texture(from: BackdropPainter.surfaceStrip(width: 256, height: 10, phase: phase)))
        }
        surface.zPosition = -45
        var i: Int = 0
        while i < 5 {
            let strip: SKSpriteNode = SKSpriteNode(texture: surfaceTextures[0], size: CGSize(width: 256, height: 10))
            strip.anchorPoint = CGPoint(x: 0, y: 1)
            surface.addChild(strip)
            surfaceSprites.append(strip)
            i += 1
        }
        world.addChild(surface)

        // Il gozzo ancorato sopra il canale principale.
        let anchorPoint: Vec2 = map.channelPoint(depthMeters: 0)
        boat.position = CGPoint(x: anchorPoint.x, y: 1)
        boat.zPosition = -20
        boat.run(SKAction.repeatForever(SKAction.sequence([
            SKAction.moveBy(x: 0, y: 1, duration: 0.9),
            SKAction.moveBy(x: 0, y: -1, duration: 0.9)
        ])))
        world.addChild(boat)

        terrain.zPosition = 0
        world.addChild(terrain)

        diverNode.zPosition = 20
        world.addChild(diverNode)

        // Plancton sospeso che deriva piano.
        let moteNames: [String] = ["plankton_0", "plankton_1", "plankton_0", "plankton_2", "plankton_1"]
        var m: Int = 0
        while m < 42 {
            let node: SKSpriteNode = SpriteForge.shared.node(moteNames[m % moteNames.count])
            node.zPosition = 30
            node.alpha = CGFloat(fx.range(0.35, 0.85))
            world.addChild(node)
            motes.append(Mote(node: node, x: fx.range(-340, 340), y: fx.range(-170, 170), vx: fx.range(-3.5, 3.5), vy: fx.range(-1.5, 2.5)))
            m += 1
        }

        diveHUD.zPosition = 5
        hud.addChild(diveHUD)
        controls.zPosition = 10
        controls.configure(actions: [GameButtons.dash, GameButtons.pause])
        hud.addChild(controls)

        // Finestra di pausa.
        pauseLayer.zPosition = 600
        pauseLayer.isHidden = true
        pauseVeil.alpha = 0.72
        pauseLayer.addChild(pauseVeil)
        pauseTitle.zPosition = 1
        pauseLayer.addChild(pauseTitle)
        resumeButton.zPosition = 1
        quitButton.zPosition = 1
        pauseLayer.addChild(resumeButton)
        pauseLayer.addChild(quitButton)
        hud.addChild(pauseLayer)

        // Primo fotogramma già completo: camera sul sub e terreno dipinto subito.
        cameraPos = clampCamera(Vec2(diver.position.x, -diver.position.y))
        setCamera(x: cameraPos.x, y: cameraPos.y)
        terrain.update(mapX: cameraPos.x, mapY: -cameraPos.y, viewWidth: Double(artSize.width), viewHeight: Double(artSize.height), synchronous: true)
        diverNode.position = CGPoint(x: diver.position.x, y: -diver.position.y)
        updateAtmosphere()
        updateHUD(force: true)
    }

    override func layoutHUD() {
        water.size = size
        rays.size = size
        darkness.size = size
        let safe: CGRect = hudSafeRect
        let unit: CGFloat = hudPixelScale(1)
        diveHUD.layout(safe: safe, pixelScale: unit)
        controls.layout(safe: safe, pixelScale: unit)
        pauseVeil.size = CGSize(width: size.width + 4, height: size.height + 4)
        pauseTitle.setScale(unit * 4)
        pauseTitle.position = CGPoint(x: 0, y: size.height * 0.22)
        resumeButton.position = CGPoint(x: 0, y: 4)
        quitButton.position = CGPoint(x: 0, y: -58)
    }

    // MARK: - Ciclo di gioco

    override func tick(_ dt: Double) {
        let input: InputManager = InputManager.shared
        input.beginFrame()

        if input.pressed.contains(GameButtons.pause) {
            setPaused(!userPaused)
        }
        if userPaused {
            if input.pressed.contains(GameButtons.interact) || input.pressed.contains(GameButtons.primary) { setPaused(false) }
            return
        }

        var move: Vec2 = Vec2(input.move.x, -input.move.y)
        if let auto: Vec2 = config.autopilot { move = Vec2(auto.x, -auto.y) }
        let wantsDash: Bool = input.pressed.contains(GameButtons.dash)
        let result: DiverStepResult = DiverMotion.step(&diver, input: move, wantsDash: wantsDash, speedFactor: 1.0,
                                                      map: map, tuning: tuning, dt: dt)
        if result.startedDash {
            Feedback.hit()
            var b: Int = 0
            while b < 6 {
                spawnBubble(spread: 7)
                b += 1
            }
        }
        if result.hitWall && result.impactSpeed > 70 {
            Feedback.tap()
        }

        let diverWorld: Vec2 = Vec2(diver.position.x, -diver.position.y)
        diverNode.position = CGPoint(x: layout.snap(diverWorld.x), y: layout.snap(diverWorld.y))
        diverNode.apply(state: diver, tuning: tuning, dt: dt)

        // Camera: segue con un po' di anticipo nella direzione di nuoto.
        let lead: Vec2 = Vec2(diver.velocity.x * 0.32, -diver.velocity.y * 0.26)
        let target: Vec2 = clampCamera(diverWorld + lead)
        cameraPos = Vec2(MathUtil.damp(cameraPos.x, target.x, rate: 5.5, dt: dt), MathUtil.damp(cameraPos.y, target.y, rate: 5.5, dt: dt))
        setCamera(x: cameraPos.x, y: cameraPos.y)

        terrain.update(mapX: cameraPos.x, mapY: -cameraPos.y, viewWidth: Double(artSize.width), viewHeight: Double(artSize.height), synchronous: false)
        updateAtmosphere()
        updateSurface(dt)
        updateMotes(dt)
        updateBubbles(dt)
        updateHUD(force: false)
    }

    private func clampCamera(_ p: Vec2) -> Vec2 {
        let halfW: Double = Double(artSize.width) / 2
        let halfH: Double = Double(artSize.height) / 2
        let skyRoom: Double = 84
        let maxY: Double = skyRoom - halfH
        let minY: Double = -(map.heightPixels - halfH)
        let minX: Double = min(halfW, map.widthPixels / 2)
        let maxX: Double = max(map.widthPixels - halfW, map.widthPixels / 2)
        return Vec2(MathUtil.clamp(p.x, minX, maxX), MathUtil.clamp(p.y, minY, maxY))
    }

    /// Colore dell'acqua, raggi, fondali e buio in base alla profondità.
    private func updateAtmosphere() {
        let ppm: Double = Double(worldData.pixelsPerMeter)
        let halfH: Double = Double(artSize.height) / 2
        let topDepth: Double = max(0, -(cameraPos.y + halfH)) / ppm
        let bottomDepth: Double = max(0, -(cameraPos.y - halfH)) / ppm
        let centerDepth: Double = max(0, -cameraPos.y) / ppm
        ShaderLibrary.setColor(ShaderLibrary.water, "u_top", worldData.waterColor(atDepth: topDepth))
        ShaderLibrary.setColor(ShaderLibrary.water, "u_bottom", worldData.waterColor(atDepth: bottomDepth))

        let light: Double = worldData.light(atDepth: diver.depthMeters)
        ShaderLibrary.setFloat(ShaderLibrary.godRays, "u_strength", 0.42 * pow(light, 1.7))
        ShaderLibrary.setFloat(ShaderLibrary.godRays, "u_offset", cameraPos.x * 0.0016)
        rays.isHidden = light < 0.2

        backdrop?.update(cameraX: cameraPos.x, cameraY: cameraPos.y, viewWidth: Double(artSize.width), viewHeight: Double(artSize.height),
                         water: worldData.waterColor(atDepth: centerDepth), visibility: light, layout: layout)

        // Buio: comincia sotto i 150 metri circa e si fa quasi totale negli abissi.
        let dark: Double = MathUtil.clamp((0.60 - light) / 0.60, 0, 1) * 0.94
        darkness.isHidden = dark < 0.02
        if !darkness.isHidden {
            let w: Double = Double(artSize.width)
            let h: Double = Double(artSize.height)
            let u: Double = (diver.position.x - cameraPos.x) / w + 0.5
            let v: Double = (-diver.position.y - cameraPos.y) / h + 0.5
            let sign: Double = diver.facingRight ? 1 : -1
            ShaderLibrary.setFloat(ShaderLibrary.darkness, "u_dark", dark)
            ShaderLibrary.setVector(ShaderLibrary.darkness, "u_center", u, v)
            ShaderLibrary.setVector(ShaderLibrary.darkness, "u_dir", cos(diver.tilt) * sign, sin(diver.tilt))
            ShaderLibrary.setFloat(ShaderLibrary.darkness, "u_aspect", w / max(h, 1))
            ShaderLibrary.setFloat(ShaderLibrary.darkness, "u_radius", 0.24)
            ShaderLibrary.setFloat(ShaderLibrary.darkness, "u_beam", 0.78)
            ShaderLibrary.setFloat(ShaderLibrary.darkness, "u_torch", 1.0)
        }
        diverNode.torch.isEnabled = dark > 0.05 && SettingsStore.shared.settings.dynamicLights
    }

    private func updateSurface(_ dt: Double) {
        // Il cielo segue la camera quasi del tutto: è lontanissimo.
        sky.position = CGPoint(x: layout.snap(cameraPos.x * 0.94 + map.widthPixels * 0.03), y: 0)
        sky.isHidden = cameraPos.y + Double(artSize.height) / 2 < -4
        surface.isHidden = sky.isHidden
        if surface.isHidden { return }
        surfaceClock += dt
        let frame: Int = Int(surfaceClock / 0.28) % max(surfaceTextures.count, 1)
        let first: Double = ((cameraPos.x - Double(artSize.width) / 2) / 256).rounded(.down) * 256
        var i: Int = 0
        while i < surfaceSprites.count {
            let sprite: SKSpriteNode = surfaceSprites[i]
            sprite.position = CGPoint(x: first + Double(i) * 256, y: 4)
            let texture: SKTexture = surfaceTextures[(frame + i) % surfaceTextures.count]
            if sprite.texture !== texture { sprite.texture = texture }
            i += 1
        }
    }

    private func updateMotes(_ dt: Double) {
        let halfW: Double = Double(artSize.width) / 2 + 12
        let halfH: Double = Double(artSize.height) / 2 + 12
        var i: Int = 0
        while i < motes.count {
            var mote: Mote = motes[i]
            mote.x += mote.vx * dt
            mote.y += mote.vy * dt
            // Riciclo ai bordi dello schermo: il plancton sembra infinito.
            if mote.x < cameraPos.x - halfW { mote.x += halfW * 2 }
            if mote.x > cameraPos.x + halfW { mote.x -= halfW * 2 }
            if mote.y < cameraPos.y - halfH { mote.y += halfH * 2 }
            if mote.y > cameraPos.y + halfH { mote.y -= halfH * 2 }
            mote.node.position = CGPoint(x: mote.x, y: min(mote.y, -2))
            mote.node.isHidden = mote.y > -2
            motes[i] = mote
            i += 1
        }
    }

    private func updateBubbles(_ dt: Double) {
        bubbleTimer -= dt
        if bubbleTimer > 0 { return }
        let speed: Double = diver.velocity.length
        bubbleTimer = speed > 20 ? fx.range(0.35, 0.6) : fx.range(0.9, 1.5)
        spawnBubble(spread: 2)
    }

    private func spawnBubble(spread: Double) {
        if diver.position.y < 10 { return }
        let names: [String] = ["bubble_0", "bubble_0", "bubble_1", "bubble_1", "bubble_2"]
        let bubble: SKSpriteNode = SpriteForge.shared.node(names[fx.int(0, names.count - 1)])
        let mouth: CGPoint = diverNode.mouthOffset
        bubble.position = CGPoint(x: diverNode.position.x + mouth.x + CGFloat(fx.range(-spread, spread)),
                                  y: diverNode.position.y + mouth.y + CGFloat(fx.range(-spread, spread)))
        bubble.zPosition = 25
        world.addChild(bubble)
        // Non oltre il pelo dell'acqua.
        let room: CGFloat = max(8, -bubble.position.y - 2)
        let climb: CGFloat = min(CGFloat(fx.range(55, 95)), room)
        let rise: SKAction = SKAction.moveBy(x: CGFloat(fx.range(-9, 9)), y: climb, duration: Double(climb) / 38.0)
        rise.timingMode = SKActionTimingMode.easeOut
        bubble.run(SKAction.sequence([
            SKAction.group([rise, SKAction.sequence([SKAction.wait(forDuration: Double(climb) / 38.0 * 0.65), SKAction.fadeOut(withDuration: Double(climb) / 38.0 * 0.35)])]),
            SKAction.removeFromParent()
        ]))
    }

    private func updateHUD(force: Bool) {
        let depth: Double = diver.depthMeters
        diveHUD.setDepth(meters: depth)
        let index: Int = worldData.zoneIndex(atDepth: depth)
        if index != zoneIndex || force {
            zoneIndex = index
            if index >= 0 && index < worldData.zones.count {
                let zone: ZoneInfo = worldData.zones[index]
                let name: String = zone.name.text()
                diveHUD.setZone(name: name)
                diveHUD.announce(zone: name, range: "\(zone.depthFrom)–\(zone.depthTo) m")
            }
        }
    }

    // MARK: - Pausa

    private func setPaused(_ value: Bool) {
        userPaused = value
        world.isPaused = value
        pauseLayer.isHidden = !value
        controls.releaseAll()
        controls.isHidden = value
        pressedPill = nil
        resumeButton.setPressed(false)
        quitButton.setPressed(false)
    }

    /// Chiamata quando l'app perde il primo piano.
    func pauseForBackground() {
        if !userPaused && !leaving { setPaused(true) }
    }

    private func leaveToTitle() {
        if leaving { return }
        leaving = true
        SceneRouter.shared.showTitle(animated: true)
    }

    // MARK: - Tocchi

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            let point: CGPoint = touch.location(in: hud)
            if userPaused {
                if resumeButton.contains(point: point) {
                    pressedPill = resumeButton
                } else if quitButton.contains(point: point) {
                    pressedPill = quitButton
                }
                pressedPill?.setPressed(true)
            } else {
                _ = controls.touchBegan(touch, at: point)
            }
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        if userPaused { return }
        for touch in touches {
            controls.touchMoved(touch, at: touch.location(in: hud))
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            if userPaused {
                let point: CGPoint = touch.location(in: hud)
                let pill: PillButton? = pressedPill
                pressedPill = nil
                pill?.setPressed(false)
                if let pill: PillButton = pill, pill.contains(point: point) {
                    Feedback.tap()
                    if pill === resumeButton {
                        setPaused(false)
                    } else {
                        leaveToTitle()
                    }
                }
            } else {
                controls.touchEnded(touch)
            }
        }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        pressedPill?.setPressed(false)
        pressedPill = nil
        for touch in touches {
            controls.touchEnded(touch)
        }
    }

    // MARK: - Diagnostica per la prova automatica

    override var debugSummary: String {
        return "depth=\(Int(diver.depthMeters)) chunks=\(terrain.loadedChunkCount) x=\(Int(diver.position.x)) y=\(Int(diver.position.y))"
    }
}
