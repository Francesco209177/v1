import SpriteKit
import UIKit

/// Immersione nel Calderone. La logica (Tecla, pesci, arpione, Fiato, sacca) vive in `DiveSim`;
/// qui c'è tutto ciò che si vede e si tocca: fondali, luce, sprite, HUD, comandi, effetti.
final class DiveScene: BaseScene {

    struct Config {
        /// Seme della mappa: slot, giorno e fascia oraria combinati.
        var seed: UInt64 = 1
        /// Profondità di partenza in metri (0 = dalla barca).
        var startDepthMeters: Double = 0
        var sky: BackdropPainter.SkyStyle = BackdropPainter.SkyStyle.morning
        var night: Bool = false
        /// Comandi imposti dalla prova automatica: direzione di nuoto e tiro continuo.
        var autopilot: Vec2? = nil
        var autoFire: Bool = false
        // Attrezzatura (valori di partenza; la partita li sostituisce con i potenziamenti).
        var breathMax: Double = 120
        var maxSafeDepth: Double = 110
        var bagWeight: Double = 10
        var harpoonDamage: Double = 10
        var harpoonRange: Double = 150
        var swimSpeed: Double = 66
        /// Raggio della luce attorno a Tecla nel buio, in frazione dell'altezza dello schermo.
        var torchRadius: Double = 0.10
        var weapon: WeaponInfo? = nil
        /// Nome della fase del giorno, mostrato accanto alla zona.
        var phaseLabel: String = ""
        /// Se valorizzato l'immersione è uno scontro: si comincia nella sala di questo boss.
        var boss: BossInfo? = nil
        /// Zone in cui può esserci una maiolica da collezione.
        var relicZones: [(index: Int, from: Double, to: Double)] = []
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
    private var sim: DiveSim
    private var fx: SeededRNG

    // Fondali e ambiente
    private let water: SKSpriteNode = SKSpriteNode(texture: TextureFactory.white)
    private let rays: SKSpriteNode = SKSpriteNode(texture: TextureFactory.white)
    private let darkness: SKSpriteNode = SKSpriteNode(texture: TextureFactory.white)
    private let terrain: TerrainLayer
    private let sky: SKSpriteNode = SKSpriteNode()
    private let surface: SKNode = SKNode()
    private var surfaceSprites: [SKSpriteNode] = []
    private var surfaceTextures: [SKTexture] = []
    private let boat: SKSpriteNode = SpriteForge.shared.node("gozzo")
    private var backdrop: ParallaxBackdrop?
    private var motes: [Mote] = []

    // Creature e attrezzi
    private let diverNode: DiverNode = DiverNode()
    private let creatures: SKNode = SKNode()
    private var agents: [Int: FishAgent] = [:]
    private var schoolNodes: [Int: [SKSpriteNode]] = [:]
    private var schoolFrames: [String: [SKTexture]] = [:]
    private var pickupNodes: [Int: SKSpriteNode] = [:]
    private let harpoonTip: SKSpriteNode = SpriteForge.shared.node("harpoon_tip")
    private let harpoonRope: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0xE8E0C8), size: CGSize(width: 1, height: 1))
    private let carried: SKSpriteNode = SKSpriteNode()
    private let aimLine: SKSpriteNode = SKSpriteNode(color: SKColor(white: 1, alpha: 0.5), size: CGSize(width: 1, height: 1))
    private let reticle: SKSpriteNode = SpriteForge.shared.node("alert")
    private var shotNodes: [SKSpriteNode] = []
    private let flash: SKSpriteNode = SKSpriteNode(color: SKColor.white, size: CGSize(width: 10, height: 10))
    private let minimap: SKSpriteNode = SKSpriteNode()
    private let minimapFrame: SKShapeNode = SKShapeNode()
    private var minimapClock: Double = 0
    private let ammoLabel: PixelLabel = PixelLabel(text: "", color: SKColor.white, alignment: PixelLabel.Alignment.center)

    // Interfaccia
    private let diveHUD: DiveHUD = DiveHUD()
    private let controls: TouchControls = TouchControls()
    private let pauseLayer: SKNode = SKNode()
    private let pauseVeil: SKSpriteNode = SKSpriteNode(color: Theme.ink, size: CGSize(width: 10, height: 10))
    private let pauseTitle: PixelLabel = PixelLabel(text: "PAUSA", color: SKColor.white, alignment: PixelLabel.Alignment.center)
    /// Il contenuto della sacca, da consultare in pausa.
    private let pauseBag: SKLabelNode = SKLabelNode()
    private let resumeButton: PillButton = PillButton(text: String(localized: "Riprendi"), size: CGSize(width: 200, height: 48), fill: Theme.turquoise)
    private let quitButton: PillButton = PillButton(text: String(localized: "Abbandona l'immersione"), size: CGSize(width: 200, height: 48), fill: Theme.lime)
    /// Pausa chiesta dal giocatore (diversa da `isPaused` di SpriteKit, che ferma anche l'HUD).
    private var userPaused: Bool = false
    private var pressedPill: PillButton?
    private var results: DiveResultsPanel?
    /// Chiamata alla fine dell'immersione con ciò che Tecla porta a casa e com'è andata.
    var onFinished: ((DiveOutcome) -> Void)?

    // Scontro con un boss
    private var bossView: BossView?
    private var bossBar: BossBar?
    private var victoryClock: Double = -1
    private var dyingClock: Double = 0
    private let inkVeil: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0x0A0614), size: CGSize(width: 10, height: 10))
    private let hint: HintPanel = HintPanel()

    // Stato
    private var cameraPos: Vec2 = Vec2.zero
    private var bubbleTimer: Double = 0.4
    private var surfaceClock: Double = 0
    private var zoneIndex: Int = -1
    private var leaving: Bool = false
    private var ended: Bool = false
    private var aiming: Bool = false
    private var aimDirection: Vec2 = Vec2(1, 0)
    /// Ultima direzione scelta a mano durante la mira: resta valida nel fotogramma del rilascio.
    private var manualAim: Vec2? = nil
    private var hitStop: Double = 0
    private var shake: Double = 0
    private var autoFireClock: Double = 1.0
    private var alarmClock: Double = 0

    init(size: CGSize, config: Config) {
        self.config = config
        let data: WorldData = GameData.shared.world
        worldData = data
        // La prova automatica visita anche le zone profonde: niente limiti di pressione né di fiato.
        let testing: Bool = config.autopilot != nil
        let generated: CaveMap
        var simulation: DiveSim
        if let boss: BossInfo = config.boss {
            let built: (map: CaveMap, arena: Arena) = CaveGenerator.arena(seed: config.seed, world: data, boss: boss)
            generated = built.map
            simulation = DiveSim(map: built.map, arena: built.arena, boss: boss, catalog: GameData.shared.fish, seed: config.seed,
                                 breathMax: testing ? 100_000 : config.breathMax, bagWeight: config.bagWeight)
        } else {
            generated = CaveGenerator.generate(seed: config.seed, world: data)
            simulation = DiveSim(map: generated, catalog: GameData.shared.fish, seed: config.seed, night: config.night,
                                 startDepthMeters: config.startDepthMeters, breathMax: testing ? 100_000 : config.breathMax,
                                 maxSafeDepth: testing ? 640 : config.maxSafeDepth, bagWeight: config.bagWeight, relicZones: config.relicZones)
        }
        simulation.usesExternalBrains = true
        simulation.harpoonTuning.damage = config.harpoonDamage
        simulation.harpoonTuning.range = config.harpoonRange
        simulation.tuning.maxSpeed = config.swimSpeed
        simulation.equip(config.weapon)
        sim = simulation
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
        boat.position = CGPoint(x: sim.boat.x, y: 1)
        boat.zPosition = -20
        boat.run(SKAction.repeatForever(SKAction.sequence([
            SKAction.moveBy(x: 0, y: 1, duration: 0.9),
            SKAction.moveBy(x: 0, y: -1, duration: 0.9)
        ])))
        world.addChild(boat)

        terrain.zPosition = 0
        world.addChild(terrain)

        creatures.zPosition = 12
        world.addChild(creatures)

        // Oggetti da raccogliere e campane d'aria.
        var p: Int = 0
        while p < sim.pickups.count {
            let pickup: PickupPoint = sim.pickups[p]
            let node: SKSpriteNode = SpriteForge.shared.node("pickup_\(pickup.kind.rawValue)")
            node.position = CGPoint(x: pickup.position.x, y: -pickup.position.y)
            node.zPosition = 6
            if pickup.kind == PickupPoint.Kind.campana {
                node.run(SKAction.repeatForever(SKAction.sequence([
                    SKAction.moveBy(x: 0, y: 2, duration: 1.2),
                    SKAction.moveBy(x: 0, y: -2, duration: 1.2)
                ])))
            }
            world.addChild(node)
            pickupNodes[p] = node
            p += 1
        }

        diverNode.zPosition = 20
        world.addChild(diverNode)

        // Arpione: lenza, punta, pesce trasportato, linea di mira.
        harpoonRope.anchorPoint = CGPoint(x: 0, y: 0.5)
        harpoonRope.zPosition = 18
        harpoonRope.isHidden = true
        world.addChild(harpoonRope)
        harpoonTip.zPosition = 19
        harpoonTip.isHidden = true
        world.addChild(harpoonTip)
        carried.zPosition = 19
        carried.isHidden = true
        world.addChild(carried)
        aimLine.anchorPoint = CGPoint(x: 0, y: 0.5)
        aimLine.zPosition = 17
        aimLine.isHidden = true
        world.addChild(aimLine)
        reticle.zPosition = 22
        reticle.isHidden = true
        world.addChild(reticle)

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
        var actions: [GameButtons] = [GameButtons.primary, GameButtons.interact, GameButtons.dash, GameButtons.pause]
        if config.weapon != nil { actions.append(GameButtons.secondary) }
        controls.configure(actions: actions)
        hud.addChild(controls)

        // Lampo della macchina fotografica, minimappa, colpi dell'arma secondaria.
        flash.zPosition = 450
        flash.alpha = 0
        cam.addChild(flash)
        minimap.zPosition = 6
        minimap.alpha = 0.92
        hud.addChild(minimap)
        minimapFrame.zPosition = 7
        minimapFrame.strokeColor = Theme.lime.withAlphaComponent(0.55)
        minimapFrame.lineWidth = 1.5
        minimapFrame.fillColor = SKColor.clear
        hud.addChild(minimapFrame)
        ammoLabel.zPosition = 11
        ammoLabel.shadowColor = SKColor(hex: 0x06142A)
        ammoLabel.isHidden = config.weapon == nil
        hud.addChild(ammoLabel)

        // Scontro: il boss, i suoi pericoli, la barra della vita.
        if let boss: BossBody = sim.boss, let arena: Arena = sim.arena {
            let view: BossView = BossView(boss: boss, arena: arena)
            world.addChild(view.node)
            world.addChild(view.glowLayer)
            bossView = view
            let bar: BossBar = BossBar(info: boss.info)
            bar.zPosition = 8
            hud.addChild(bar)
            bossBar = bar
            minimap.isHidden = true
            minimapFrame.isHidden = true
            boat.isHidden = true
            inkVeil.zPosition = 390
            inkVeil.alpha = 0
            cam.addChild(inkVeil)
        }

        // Finestra di pausa.
        pauseLayer.zPosition = 600
        pauseLayer.isHidden = true
        pauseVeil.alpha = 0.72
        pauseLayer.addChild(pauseVeil)
        pauseTitle.zPosition = 1
        pauseLayer.addChild(pauseTitle)
        pauseBag.zPosition = 1
        pauseBag.numberOfLines = 0
        pauseBag.horizontalAlignmentMode = SKLabelHorizontalAlignmentMode.center
        pauseBag.verticalAlignmentMode = SKLabelVerticalAlignmentMode.top
        pauseLayer.addChild(pauseBag)
        resumeButton.zPosition = 1
        quitButton.zPosition = 1
        pauseLayer.addChild(resumeButton)
        pauseLayer.addChild(quitButton)
        hud.addChild(pauseLayer)

        // Primo fotogramma già completo: camera sul sub e terreno dipinto subito.
        cameraPos = clampCamera(Vec2(sim.diver.position.x, -sim.diver.position.y))
        setCamera(x: cameraPos.x, y: cameraPos.y)
        terrain.update(mapX: cameraPos.x, mapY: -cameraPos.y, viewWidth: Double(artSize.width), viewHeight: Double(artSize.height), synchronous: true)
        diverNode.position = CGPoint(x: sim.diver.position.x, y: -sim.diver.position.y)
        updateAtmosphere()
        updateZone(force: true)
        if let boss: BossInfo = config.boss {
            diveHUD.announce(zone: boss.name.text(), range: boss.epithet.text())
        }
        // Le istruzioni della prima immersione.
        hint.zPosition = 9
        hud.addChild(hint)
        if config.autopilot == nil && config.boss == nil && GameSession.shared.firstTime("immersione") {
            hint.position = CGPoint(x: 0, y: size.height * 0.22)
            hint.show(String(localized: "Pollice sinistro per nuotare. Tieni premuto l'arpione per mirare, rilascia per tirare; con un pesce agganciato tieni premuto per recuperare e molla durante gli strattoni. Il Fiato cala: risali o cerca una campana d'aria. Per finire torna alla barca e premi la mano."),
                      width: min(size.width * 0.62, 520), seconds: 14)
        }
    }

    override func layoutHUD() {
        water.size = size
        rays.size = size
        darkness.size = size
        let safe: CGRect = hudSafeRect
        let unit: CGFloat = hudPixelScale(1)
        diveHUD.layout(safe: safe, pixelScale: hudIconScale(1.0))
        controls.layout(safe: safe, iconScale: hudIconScale(2.0))
        pauseVeil.size = CGSize(width: size.width + 4, height: size.height + 4)
        pauseTitle.setScale(unit * 4)
        pauseTitle.position = CGPoint(x: 0, y: size.height * 0.34)
        pauseBag.preferredMaxLayoutWidth = min(size.width * 0.7, 520)
        pauseBag.position = CGPoint(x: 0, y: size.height * 0.24)
        resumeButton.position = CGPoint(x: -110, y: -size.height * 0.30)
        quitButton.position = CGPoint(x: 110, y: -size.height * 0.30)
        results?.layout(sceneSize: size, safe: safe, pixelScale: unit)
        flash.size = CGSize(width: size.width + 4, height: size.height + 4)
        // Minimappa in alto a destra, sotto il tasto di pausa.
        let mapSize: CGSize = CGSize(width: 112, height: 76)
        minimap.size = mapSize
        minimap.position = CGPoint(x: safe.maxX - mapSize.width / 2 - 52, y: safe.maxY - mapSize.height / 2 - 4)
        minimapFrame.path = CGPath(roundedRect: CGRect(x: minimap.position.x - mapSize.width / 2 - 1, y: minimap.position.y - mapSize.height / 2 - 1,
                                                       width: mapSize.width + 2, height: mapSize.height + 2), cornerWidth: 6, cornerHeight: 6, transform: nil)
        ammoLabel.setScale(hudIconScale(2.0))
        ammoLabel.position = CGPoint(x: safe.maxX - 44, y: safe.minY + 166)
        bossBar?.layout(top: safe.maxY, maxWidth: safe.width * 0.42)
        inkVeil.size = CGSize(width: size.width + 4, height: size.height + 4)
    }

    // MARK: - Ciclo di gioco

    override func tick(_ dt: Double) {
        let input: InputManager = InputManager.shared
        input.beginFrame()

        if ended {
            results?.handle(input: input)
            return
        }
        if input.pressed.contains(GameButtons.pause) {
            setPaused(!userPaused)
        }
        if userPaused {
            if input.pressed.contains(GameButtons.interact) || input.pressed.contains(GameButtons.primary) { setPaused(false) }
            return
        }

        // Fermo-immagine di pochi fotogrammi sui colpi andati a segno.
        var simDt: Double = dt
        if hitStop > 0 {
            hitStop -= dt
            simDt = 0
        }

        var command: DiveInput = DiveInput()
        command.move = Vec2(input.move.x, -input.move.y)
        command.dash = input.pressed.contains(GameButtons.dash)
        command.interact = input.pressed.contains(GameButtons.interact)
        command.reelHeld = input.held.contains(GameButtons.primary)
        if let auto: Vec2 = config.autopilot {
            // Negli scontri la prova automatica nuota in tondo, per restare nella sala.
            command.move = config.boss != nil ? Vec2(cos(elapsed * 0.9) * 0.8, sin(elapsed * 1.3) * 0.7) : Vec2(auto.x, -auto.y)
        }
        updateAiming(input: input, command: &command, dt: dt)
        if input.pressed.contains(GameButtons.secondary) && config.weapon != nil {
            var manual: Vec2? = nil
            if let a: Vec2 = input.aim { manual = Vec2(a.x, -a.y) }
            command.secondary = sim.aimDirection(manual: manual, autoAim: SettingsStore.shared.settings.autoAim)
        }

        // A bordo: in superficie, accanto al gozzo, il tasto azione chiude l'immersione.
        if command.interact && sim.interaction() == DiveInteraction.boat && sim.harpoon.phase == HarpoonPhase.ready {
            endDive(fainted: false)
            return
        }

        syncBrains()
        let events: [DiveEvent] = simDt > 0 ? sim.step(input: command, dt: simDt) : []
        handle(events)

        let diverWorld: Vec2 = Vec2(sim.diver.position.x, -sim.diver.position.y)
        diverNode.position = CGPoint(x: layout.snap(diverWorld.x), y: layout.snap(diverWorld.y))
        diverNode.apply(state: sim.diver, tuning: sim.tuning, dt: simDt)
        // Lampeggia finché dura l'invulnerabilità dopo un colpo.
        diverNode.alpha = sim.invulnerable > 0 && Int(elapsed * 14) % 2 == 0 ? 0.45 : 1.0

        updateCreatures(dt: simDt)
        updateHarpoonNodes()
        updateShots()
        updateBoss(dt)

        // Camera: segue con un po' di anticipo nella direzione di nuoto, più eventuale scossa.
        let lead: Vec2 = Vec2(sim.diver.velocity.x * 0.32, -sim.diver.velocity.y * 0.26)
        var focus: Vec2 = diverWorld + lead
        if let boss: BossBody = sim.boss, boss.isAlive {
            // Negli scontri l'inquadratura tiene insieme Tecla e il boss.
            focus = diverWorld * 0.62 + Vec2(boss.position.x, -boss.position.y) * 0.38 + lead * 0.4
        }
        let target: Vec2 = clampCamera(focus)
        cameraPos = Vec2(MathUtil.damp(cameraPos.x, target.x, rate: 5.5, dt: dt), MathUtil.damp(cameraPos.y, target.y, rate: 5.5, dt: dt))
        var shakeX: Double = 0
        var shakeY: Double = 0
        if shake > 0.05 {
            shakeX = fx.range(-shake, shake)
            shakeY = fx.range(-shake, shake)
            shake *= exp(-dt * 12)
        }
        setCamera(x: cameraPos.x + shakeX, y: cameraPos.y + shakeY)

        terrain.update(mapX: cameraPos.x, mapY: -cameraPos.y, viewWidth: Double(artSize.width), viewHeight: Double(artSize.height), synchronous: false)
        updateAtmosphere()
        updateSurface(dt)
        updateMotes(dt)
        updateBubbles(dt)
        updateZone(force: false)
        updateHUD(dt)
        GameSession.shared.addPlayTime(dt)

        if sim.fainted && !ended {
            endDive(fainted: true)
        }
        // Vittoria: un attimo per godersela, poi il riepilogo.
        if victoryClock >= 0 && !ended {
            victoryClock -= dt
            if victoryClock <= 0 { endDive(fainted: false) }
        }
    }

    // MARK: - Boss

    private func updateBoss(_ dt: Double) {
        guard let boss: BossBody = sim.boss, let arena: Arena = sim.arena, let view: BossView = bossView else { return }
        view.update(boss: boss, hazards: sim.hazards, arena: arena, layout: layout, elapsed: elapsed, dt: dt)
        bossBar?.update(ratio: boss.hpRatio, vulnerable: boss.isVulnerable)
        // Dentro l'inchiostro lo schermo si scurisce.
        let target: CGFloat = sim.inked ? 0.62 : 0
        inkVeil.alpha += (target - inkVeil.alpha) * CGFloat(min(1, dt * 6))
        // Le campane d'aria dell'arena tornano piene: lo sprite segue lo stato.
        for (index, node) in pickupNodes where index < sim.pickups.count {
            let wanted: SKTexture = SpriteForge.shared.texture(sim.pickups[index].taken ? "pickup_campana_vuota" : "pickup_campana")
            if node.texture !== wanted { node.texture = wanted }
        }
        if boss.move == BossMove.dying {
            // Si spegne tra scintille e bolle.
            dyingClock -= dt
            if dyingClock <= 0 {
                dyingClock = 0.16
                let at: Vec2 = boss.position + Vec2(fx.range(-boss.info.radius, boss.info.radius), fx.range(-boss.info.radius, boss.info.radius))
                spawnSparks(at: at, color: SKColor(hex: 0xFFE27A), count: 6)
                shake = max(shake, 2.0)
            }
        }
    }

    // MARK: - Arpione: mira e tiro

    /// Tenere premuto il tasto dell'arpione mostra la mira; al rilascio parte il colpo.
    /// Con la lenza agganciata lo stesso tasto serve a recuperare.
    private func updateAiming(input: InputManager, command: inout DiveInput, dt: Double) {
        let ready: Bool = sim.harpoon.phase == HarpoonPhase.ready
        let settings: GameSettings = SettingsStore.shared.settings
        if ready && input.pressed.contains(GameButtons.primary) {
            aiming = true
            manualAim = nil
        }
        if aiming {
            if let a: Vec2 = input.aim { manualAim = Vec2(a.x, -a.y) }
            aimDirection = sim.aimDirection(manual: manualAim, autoAim: settings.autoAim)
            if !input.held.contains(GameButtons.primary) {
                aiming = false
                if ready { command.fire = aimDirection }
            }
        }
        if !ready { aiming = false }

        if config.autoFire && ready {
            autoFireClock -= dt
            if autoFireClock <= 0 {
                autoFireClock = 1.1
                command.fire = sim.aimDirection(manual: nil, autoAim: true)
            }
        }
        if config.autoFire && sim.harpoon.phase == HarpoonPhase.reeling {
            command.reelHeld = !sim.harpoon.isSurging && sim.harpoon.tension < 0.7
        }
    }

    // MARK: - Pesci

    /// Fa decidere a ogni pesce il prossimo stato e lo passa alla sua macchina a stati di GameplayKit.
    private func syncBrains() {
        let diver: Vec2 = sim.diver.position
        let diverSpeed: Double = sim.diver.velocity.length
        var i: Int = 0
        while i < sim.fish.count {
            let id: Int = sim.fishId(at: i)
            let body: FishBody = sim.fish[i]
            let agent: FishAgent
            if let existing: FishAgent = agents[id] {
                agent = existing
            } else {
                agent = FishAgent(id: id, species: body.species)
                agent.onEnter = { [weak self] (fishId: Int, state: FishState) -> Void in
                    self?.sim.enter(fishId: fishId, state: state)
                }
                creatures.addChild(agent.node)
                agents[id] = agent
            }
            // La simulazione può aver imposto uno stato (colpo, aggancio): la macchina si allinea.
            agent.sync(to: body.state)
            if let next: FishState = FishAI.think(body, diver: diver, diverSpeed: diverSpeed) {
                agent.request(next)
            }
            i += 1
        }
    }

    private func updateCreatures(dt: Double) {
        // Pesci singoli.
        var alive: Set<Int> = []
        var i: Int = 0
        while i < sim.fish.count {
            let id: Int = sim.fishId(at: i)
            alive.insert(id)
            agents[id]?.update(body: sim.fish[i], layout: layout, dt: dt)
            i += 1
        }
        for (id, agent) in agents where !alive.contains(id) {
            agent.node.removeFromParent()
            agents[id] = nil
        }

        // Banchi: uno sprite per membro, senza macchina a stati.
        var presentSchools: Set<Int> = []
        var s: Int = 0
        while s < sim.schools.count {
            let schoolId: Int = sim.schoolIds[s]
            let school: School = sim.schools[s]
            presentSchools.insert(schoolId)
            let frames: [SKTexture]
            if let cached: [SKTexture] = schoolFrames[school.species.id] {
                frames = cached
            } else {
                frames = SpriteForge.shared.frames("\(school.species.spriteId)_swim")
                schoolFrames[school.species.id] = frames
            }
            var nodes: [SKSpriteNode] = schoolNodes[schoolId] ?? []
            if nodes.isEmpty {
                var created: Int = 0
                while created < school.members.count {
                    let node: SKSpriteNode = SpriteForge.shared.node("\(school.species.spriteId)_swim_0")
                    creatures.addChild(node)
                    nodes.append(node)
                    created += 1
                }
                schoolNodes[schoolId] = nodes
            }
            var m: Int = 0
            while m < school.members.count && m < nodes.count {
                let member: SchoolMember = school.members[m]
                let node: SKSpriteNode = nodes[m]
                node.isHidden = !member.alive
                if member.alive {
                    node.position = CGPoint(x: layout.snap(member.position.x), y: layout.snap(-member.position.y))
                    node.xScale = member.facingRight ? 1 : -1
                    if !frames.isEmpty {
                        let rate: Double = school.mode == School.Mode.scatter ? 14 : 6
                        let texture: SKTexture = frames[Int(elapsed * rate + member.phase) % frames.count]
                        if node.texture !== texture { node.texture = texture }
                    }
                }
                m += 1
            }
            s += 1
        }
        for (schoolId, nodes) in schoolNodes where !presentSchools.contains(schoolId) {
            for node in nodes { node.removeFromParent() }
            schoolNodes[schoolId] = nil
        }
    }

    private func updateHarpoonNodes() {
        let harpoon: HarpoonState = sim.harpoon
        let origin: CGPoint = diverNode.position
        let out: Bool = harpoon.isOut
        harpoonTip.isHidden = !out
        harpoonRope.isHidden = !out
        carried.isHidden = true
        if out {
            let tip: CGPoint = CGPoint(x: layout.snap(harpoon.tip.x), y: layout.snap(-harpoon.tip.y))
            let dx: CGFloat = tip.x - origin.x
            let dy: CGFloat = tip.y - origin.y
            let length: CGFloat = (dx * dx + dy * dy).squareRoot()
            let angle: CGFloat = atan2(dy, dx)
            harpoonRope.position = origin
            harpoonRope.size = CGSize(width: max(length, 1), height: 1)
            harpoonRope.zRotation = angle
            harpoonTip.position = tip
            // In volo la punta guarda avanti; al ritorno resta girata verso l'esterno.
            let flightAngle: CGFloat = CGFloat(atan2(-harpoon.direction.y, harpoon.direction.x))
            harpoonTip.zRotation = harpoon.phase == HarpoonPhase.flying ? flightAngle : angle
            harpoonTip.isHidden = harpoon.phase == HarpoonPhase.reeling
            if let item: CatchItem = harpoon.carried {
                carried.isHidden = false
                let name: String = "\(item.speciesId)_dead_0"
                carried.texture = SpriteForge.shared.texture(name)
                carried.size = SpriteForge.shared.pixelSize(name)
                carried.position = tip
                carried.zRotation = angle + CGFloat.pi
            }
        }

        // Linea di mira e bersaglio agganciato dalla mira automatica.
        aimLine.isHidden = !aiming
        reticle.isHidden = true
        if aiming {
            aimLine.position = origin
            aimLine.size = CGSize(width: CGFloat(sim.harpoonTuning.range), height: 1)
            aimLine.zRotation = CGFloat(atan2(-aimDirection.y, aimDirection.x))
            if let target: (ref: TargetRef, position: Vec2) = sim.bestTarget(direction: aimDirection, cone: 0.97) {
                reticle.isHidden = false
                reticle.position = CGPoint(x: target.position.x, y: -target.position.y + 12)
            }
        }
    }

    // MARK: - Eventi della simulazione

    private func handle(_ events: [DiveEvent]) {
        for event in events {
            switch event {
            case .harpoonFired:
                Feedback.tap(sound: SFXKind.harpoon)
            case .harpoonHitRock(let at):
                spawnSparks(at: at, color: SKColor(hex: 0xE8E0C8), count: 5)
            case .fishHit(let at, let damage, let killed):
                hitStop = killed ? 0.07 : 0.045
                shake = max(shake, killed ? 2.4 : 1.4)
                Feedback.hit()
                spawnSparks(at: at, color: SKColor.white, count: 7)
                spawnNumber(Int(damage.rounded()), at: at, color: SKColor(hex: 0xFFE27A))
                for (_, agent) in agents {
                    let p: CGPoint = agent.node.position
                    if abs(Double(p.x) - at.x) < 3 && abs(Double(-p.y) - at.y) < 3 { agent.flashHurt() }
                }
            case .hookStarted:
                diveHUD.showToast(String(localized: "Agganciato! Recupera la lenza"), color: Theme.ochre)
            case .surge:
                Feedback.warning()
                shake = max(shake, 1.2)
            case .lineBroke:
                diveHUD.showToast(String(localized: "La lenza si è spezzata!"), color: Theme.danger)
                Feedback.thud()
            case .caught(let item, let at):
                Feedback.success(sound: SFXKind.catchFish)
                let name: String = GameData.shared.fish.find(item.speciesId)?.name.text() ?? item.speciesId
                diveHUD.showToast("\(name)  " + String(repeating: "★", count: item.stars), color: Theme.lime)
                spawnSparks(at: at, color: SKColor(hex: 0xFFE27A), count: 10)
            case .diverHurt(let damage, let at):
                shake = max(shake, 4.5)
                Feedback.thud(sound: SFXKind.hurt)
                spawnNumber(Int(damage.rounded()), at: at, color: SKColor(hex: 0xFF6B60))
                spawnSparks(at: at, color: SKColor(hex: 0xFF8A80), count: 8)
            case .telegraph(let at):
                spawnSparks(at: at, color: SKColor(hex: 0xFF6B60), count: 3)
            case .pickedUp(let kind, let at):
                Feedback.tap(sound: kind == PickupPoint.Kind.maiolica ? SFXKind.coin : SFXKind.pickup)
                for (index, node) in pickupNodes where sim.pickups[index].taken && !node.isHidden && sim.pickups[index].kind != PickupPoint.Kind.campana {
                    node.run(SKAction.sequence([
                        SKAction.group([SKAction.moveBy(x: 0, y: 14, duration: 0.22), SKAction.fadeOut(withDuration: 0.22)]),
                        SKAction.hide()
                    ]))
                }
                diveHUD.showToast(DiveScene.pickupName(kind), color: Theme.lime)
                spawnSparks(at: at, color: SKColor(hex: 0xA8EC9A), count: 5)
            case .breathRefilled:
                Feedback.success(sound: SFXKind.bell)
                diveHUD.showToast(String(localized: "Fiato al massimo"), color: Theme.turquoise)
                for (index, node) in pickupNodes where sim.pickups[index].taken && sim.pickups[index].kind == PickupPoint.Kind.campana {
                    node.texture = SpriteForge.shared.texture("pickup_campana_vuota")
                }
                var b: Int = 0
                while b < 10 {
                    spawnBubble(spread: 10)
                    b += 1
                }
            case .breathLow:
                Feedback.warning()
                diveHUD.showToast(String(localized: "Fiato agli sgoccioli: risali!"), color: Theme.danger)
            case .pressure:
                Feedback.warning()
                shake = max(shake, 1.5)
                diveHUD.showToast(String(localized: "Troppa pressione per questa muta"), color: Theme.danger)
            case .dashed:
                Feedback.hit(sound: SFXKind.bubble)
                var b: Int = 0
                while b < 6 {
                    spawnBubble(spread: 7)
                    b += 1
                }
            case .hitWall:
                Feedback.tap()
            case .fainted:
                Feedback.thud()
            case .secondaryUsed(let kind, let at, let radius):
                Feedback.hit()
                switch kind {
                case .net:
                    spawnRing(at: at, radius: radius, color: SKColor(hex: 0xF4EFE2))
                case .stun:
                    if radius > 0 {
                        spawnRing(at: at, radius: radius, color: SKColor(hex: 0xBFE9F7))
                        shake = max(shake, 3)
                        spawnSparks(at: at, color: SKColor(hex: 0xD6F3FB), count: 16)
                    }
                case .melee:
                    spawnSparks(at: at, color: SKColor.white, count: 6)
                case .sleep, .bolt:
                    break
                }
            case .outOfAmmo:
                Feedback.warning()
                diveHUD.showToast(String(localized: "Colpi finiti"), color: Theme.ochre)
            case .asleep(let at):
                spawnSparks(at: at, color: SKColor(hex: 0xBFE9F7), count: 6)
            case .photographed(let species):
                Feedback.success()
                flash.removeAllActions()
                flash.alpha = 0.85
                flash.run(SKAction.fadeOut(withDuration: 0.35))
                let name: String = GameData.shared.fish.find(species)?.name.text() ?? species
                diveHUD.showToast(String(localized: "Fotografia: \(name)"), color: Theme.lime)
            case .bossTelegraph(let at, _):
                Feedback.warning()
                spawnSparks(at: at, color: SKColor(hex: 0xFF6B60), count: 5)
            case .bossAttack:
                Feedback.tap()
            case .bossHit(let at, let damage):
                hitStop = 0.05
                shake = max(shake, 2.2)
                Feedback.hit()
                bossView?.flashHit()
                spawnSparks(at: at, color: SKColor.white, count: 9)
                spawnNumber(Int(damage.rounded()), at: at, color: SKColor(hex: 0xFFE27A))
            case .bossBlocked(let at):
                Feedback.tap(sound: SFXKind.clang)
                spawnSparks(at: at, color: SKColor(hex: 0x9AA8B8), count: 4)
                diveHUD.showToast(String(localized: "Parato!"), color: SKColor(hex: 0xBFC8D4))
            case .bossPhase(let phase):
                Feedback.thud(sound: SFXKind.roar)
                shake = max(shake, 5)
                diveHUD.showToast(phase == 2 ? String(localized: "Si infuria!") : String(localized: "È allo stremo: attenta!"), color: Theme.danger)
            case .bossStunned(let at):
                Feedback.success()
                spawnSparks(at: at, color: SKColor(hex: 0xFFE27A), count: 12)
                diveHUD.showToast(String(localized: "Scoperto: colpisci adesso!"), color: Theme.ochre)
            case .quake:
                Feedback.thud()
                shake = max(shake, 5.5)
            case .blast(let at, let radius):
                Feedback.thud(sound: SFXKind.blast)
                shake = max(shake, 4)
                spawnRing(at: at, radius: max(radius, 10), color: SKColor(hex: 0xFFB060))
                spawnSparks(at: at, color: SKColor(hex: 0xFFD6A0), count: 14)
            case .bossDying:
                Feedback.success()
                hitStop = 0.25
                shake = max(shake, 6)
            case .bossDefeated:
                Feedback.success()
                flash.removeAllActions()
                flash.alpha = 0.7
                flash.run(SKAction.fadeOut(withDuration: 0.6))
                diveHUD.showToast(String(localized: "Vittoria!"), color: Theme.lime)
                victoryClock = 1.6
            case .bellReady:
                Feedback.tap()
            }
        }
    }

    /// Cerchio che si allarga e svanisce: rete lanciata, scoppio di bolle.
    private func spawnRing(at point: Vec2, radius: Double, color: SKColor) {
        let ring: SKShapeNode = SKShapeNode(circleOfRadius: CGFloat(max(radius, 4)))
        ring.position = CGPoint(x: point.x, y: -point.y)
        ring.strokeColor = color
        ring.lineWidth = 1.5
        ring.fillColor = color.withAlphaComponent(0.12)
        ring.isAntialiased = false
        ring.zPosition = 27
        ring.setScale(0.3)
        world.addChild(ring)
        let grow: SKAction = SKAction.scale(to: 1.0, duration: 0.18)
        grow.timingMode = SKActionTimingMode.easeOut
        ring.run(SKAction.sequence([grow, SKAction.fadeOut(withDuration: 0.25), SKAction.removeFromParent()]))
    }

    /// Dardi, aste e bombe in volo.
    private func updateShots() {
        while shotNodes.count < sim.shots.count {
            let node: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0xF4EFE2), size: CGSize(width: 5, height: 1))
            node.zPosition = 19
            world.addChild(node)
            shotNodes.append(node)
        }
        var i: Int = 0
        while i < shotNodes.count {
            if i < sim.shots.count {
                let shot: SecondaryShot = sim.shots[i]
                shotNodes[i].isHidden = false
                shotNodes[i].position = CGPoint(x: shot.position.x, y: -shot.position.y)
                shotNodes[i].zRotation = CGFloat(atan2(-shot.direction.y, shot.direction.x))
                shotNodes[i].size = shot.kind == WeaponKind.stun ? CGSize(width: 3, height: 3) : CGSize(width: 6, height: 1)
            } else {
                shotNodes[i].isHidden = true
            }
            i += 1
        }
    }

    private func updateMinimap(_ dt: Double) {
        minimapClock -= dt
        if minimapClock > 0 { return }
        minimapClock = 0.33
        let image: PixelBuffer = sim.minimap(cols: 56, rows: 38, blink: Int(elapsed * 3) % 2 == 0)
        minimap.texture = TextureFactory.texture(from: image)
    }

    static func pickupName(_ kind: PickupPoint.Kind) -> String {
        switch kind {
        case .riccio: return String(localized: "Riccio di mare")
        case .conchiglia: return String(localized: "Conchiglia")
        case .alga: return String(localized: "Lattuga di mare")
        case .campana: return String(localized: "Campana d'aria")
        case .maiolica: return String(localized: "Maiolica dei Nerei")
        }
    }

    // MARK: - Effetti

    private func spawnSparks(at point: Vec2, color: SKColor, count: Int) {
        var i: Int = 0
        while i < count {
            let spark: SKSpriteNode = SKSpriteNode(color: color, size: CGSize(width: 1, height: 1))
            spark.position = CGPoint(x: point.x, y: -point.y)
            spark.zPosition = 26
            world.addChild(spark)
            let angle: Double = fx.range(0, 2 * Double.pi)
            let reach: Double = fx.range(6, 16)
            let fly: SKAction = SKAction.moveBy(x: CGFloat(cos(angle) * reach), y: CGFloat(sin(angle) * reach), duration: 0.28)
            fly.timingMode = SKActionTimingMode.easeOut
            spark.run(SKAction.sequence([SKAction.group([fly, SKAction.fadeOut(withDuration: 0.28)]), SKAction.removeFromParent()]))
            i += 1
        }
    }

    /// Numero di danno che sale e svanisce.
    private func spawnNumber(_ value: Int, at point: Vec2, color: SKColor) {
        let label: PixelLabel = PixelLabel(text: "\(value)", color: color, alignment: PixelLabel.Alignment.center)
        label.shadowColor = SKColor(hex: 0x06142A)
        label.position = CGPoint(x: point.x, y: -point.y + 8)
        label.zPosition = 40
        world.addChild(label)
        let rise: SKAction = SKAction.moveBy(x: 0, y: 16, duration: 0.6)
        rise.timingMode = SKActionTimingMode.easeOut
        label.run(SKAction.sequence([
            SKAction.group([rise, SKAction.sequence([SKAction.wait(forDuration: 0.35), SKAction.fadeOut(withDuration: 0.25)])]),
            SKAction.removeFromParent()
        ]))
    }

    private func clampCamera(_ p: Vec2) -> Vec2 {
        let halfW: Double = Double(artSize.width) / 2
        let halfH: Double = Double(artSize.height) / 2
        let skyRoom: Double = 84
        let maxY: Double = skyRoom - halfH
        let minY: Double = -(sim.map.heightPixels - halfH)
        let minX: Double = min(halfW, sim.map.widthPixels / 2)
        let maxX: Double = max(sim.map.widthPixels - halfW, sim.map.widthPixels / 2)
        if let arena: Arena = sim.arena {
            // Nella sala di un boss la camera non esce dalle pareti.
            let margin: Double = 28
            let ax0: Double = min(arena.minX - margin + halfW, arena.center.x)
            let ax1: Double = max(arena.maxX + margin - halfW, arena.center.x)
            let ay0: Double = min(-(arena.maxY + margin) + halfH, -arena.center.y)
            let ay1: Double = max(-(arena.minY - margin) - halfH, -arena.center.y)
            return Vec2(MathUtil.clamp(p.x, ax0, ax1), MathUtil.clamp(p.y, ay0, ay1))
        }
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

        let light: Double = worldData.light(atDepth: sim.diver.depthMeters)
        ShaderLibrary.setFloat(ShaderLibrary.godRays, "u_strength", 0.42 * pow(light, 1.7))
        ShaderLibrary.setFloat(ShaderLibrary.godRays, "u_offset", cameraPos.x * 0.0016)
        rays.isHidden = light < 0.2 || config.night

        backdrop?.update(cameraX: cameraPos.x, cameraY: cameraPos.y, viewWidth: Double(artSize.width), viewHeight: Double(artSize.height),
                         water: worldData.waterColor(atDepth: centerDepth), visibility: light, layout: layout)

        // Buio: comincia sotto i 150 metri circa e si fa quasi totale negli abissi; di notte è buio ovunque.
        var dark: Double = MathUtil.clamp((0.60 - light) / 0.60, 0, 1) * 0.94
        if config.night { dark = max(dark, sim.diver.atSurface ? 0.35 : 0.66) }
        if let boss: BossInfo = config.boss {
            // Negli scontri si deve vedere che cosa succede; solo la Lanterna combatte al buio.
            dark = boss.kind == BossKind.lanterna ? max(dark, 0.88) : min(dark, 0.28)
        }
        ShaderLibrary.setFloat(ShaderLibrary.terrainCaustics, "u_strength", config.night ? 0 : 1)
        // Sott'acqua i suoni si ovattano; con la testa fuori tornano limpidi.
        AudioDirector.shared.setUnderwater(sim.diver.atSurface && sim.arena == nil ? 0 : 1)
        FishAgent.darkness = dark
        darkness.isHidden = dark < 0.02
        if !darkness.isHidden {
            let w: Double = Double(artSize.width)
            let h: Double = Double(artSize.height)
            let u: Double = (sim.diver.position.x - cameraPos.x) / w + 0.5
            let v: Double = (-sim.diver.position.y - cameraPos.y) / h + 0.5
            let sign: Double = sim.diver.facingRight ? 1 : -1
            ShaderLibrary.setFloat(ShaderLibrary.darkness, "u_dark", dark)
            ShaderLibrary.setVector(ShaderLibrary.darkness, "u_center", u, v)
            ShaderLibrary.setVector(ShaderLibrary.darkness, "u_dir", cos(sim.diver.tilt) * sign, sin(sim.diver.tilt))
            ShaderLibrary.setFloat(ShaderLibrary.darkness, "u_aspect", w / max(h, 1))
            // Senza torcia resta solo un piccolo alone; con la torcia il raggio cresce e compare il fascio.
            let hasTorch: Bool = config.torchRadius >= 0.18 || config.autopilot != nil || config.boss != nil
            ShaderLibrary.setFloat(ShaderLibrary.darkness, "u_radius", config.autopilot != nil ? 0.26 : config.torchRadius + 0.03)
            ShaderLibrary.setFloat(ShaderLibrary.darkness, "u_beam", 0.50 + config.torchRadius * 1.4)
            ShaderLibrary.setFloat(ShaderLibrary.darkness, "u_torch", hasTorch ? 1.0 : 0.0)
        }
        diverNode.torch.isEnabled = dark > 0.05 && SettingsStore.shared.settings.dynamicLights
    }

    private func updateSurface(_ dt: Double) {
        // Il cielo segue la camera quasi del tutto: è lontanissimo.
        sky.position = CGPoint(x: layout.snap(cameraPos.x * 0.94 + sim.map.widthPixels * 0.03), y: 0)
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
        let speed: Double = sim.diver.velocity.length
        bubbleTimer = speed > 20 ? fx.range(0.35, 0.6) : fx.range(0.9, 1.5)
        spawnBubble(spread: 2)
    }

    private func spawnBubble(spread: Double) {
        if sim.diver.position.y < 10 { return }
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
        let time: Double = Double(climb) / 38.0
        let rise: SKAction = SKAction.moveBy(x: CGFloat(fx.range(-9, 9)), y: climb, duration: time)
        rise.timingMode = SKActionTimingMode.easeOut
        bubble.run(SKAction.sequence([
            SKAction.group([rise, SKAction.sequence([SKAction.wait(forDuration: time * 0.65), SKAction.fadeOut(withDuration: time * 0.35)])]),
            SKAction.removeFromParent()
        ]))
    }

    private func updateZone(force: Bool) {
        let index: Int = worldData.zoneIndex(atDepth: sim.diver.depthMeters)
        if index == zoneIndex && !force { return }
        zoneIndex = index
        // La musica segue il luogo: scontro, notte, abissi o acque chiare.
        if config.boss != nil {
            AudioDirector.shared.music("boss")
        } else if config.night {
            AudioDirector.shared.music("notte")
        } else {
            AudioDirector.shared.music(index >= 3 ? "abisso" : "immersione")
        }
        if index >= 0 && index < worldData.zones.count {
            let zone: ZoneInfo = worldData.zones[index]
            let name: String = zone.name.text()
            diveHUD.setZone(name: config.phaseLabel.isEmpty ? name : "\(name) · \(config.phaseLabel)")
            if config.boss == nil { diveHUD.announce(zone: name, range: "\(zone.depthFrom)–\(zone.depthTo) m") }
        }
    }

    private func updateHUD(_ dt: Double) {
        diveHUD.update(breath: sim.breathRatio, depthMeters: sim.diver.depthMeters, weight: sim.bag.totalWeight, maxWeight: sim.bag.maxWeight, dt: dt)
        let harpoon: HarpoonState = sim.harpoon
        diveHUD.setReel(visible: harpoon.phase == HarpoonPhase.reeling, progress: harpoon.progress, tension: harpoon.tension, surging: harpoon.isSurging)

        // Suggerimento dell'azione, sopra la testa di Tecla.
        var text: String? = nil
        if let what: DiveInteraction = sim.interaction() {
            switch what {
            case .pickup: text = String(localized: "Raccogli")
            case .bell: text = String(localized: "Respira")
            case .boat: text = String(localized: "Sali a bordo")
            case .photo: text = String(localized: "Fotografa")
            }
        }
        let k: CGFloat = CGFloat(layout.pointsPerArtPixel)
        let screen: CGPoint = CGPoint(x: (diverNode.position.x - cam.position.x) * k, y: (diverNode.position.y - cam.position.y) * k + 34)
        diveHUD.setPrompt(text, at: screen)
        updateMinimap(dt)
        if let weapon: WeaponInfo = sim.secondary {
            ammoLabel.text = weapon.ammo > 0 ? "×\(sim.ammo)" : ""
            ammoLabel.color = sim.ammo == 0 && weapon.ammo > 0 ? SKColor(hex: 0xFF8A80) : SKColor.white
        }

        // Allarme tattile ripetuto quando il Fiato è agli sgoccioli.
        if sim.breathRatio < 0.25 && !sim.diver.atSurface {
            alarmClock -= dt
            if alarmClock <= 0 {
                alarmClock = 1.4
                Feedback.tap()
            }
        }
    }

    // MARK: - Fine dell'immersione

    private func endDive(fainted: Bool) {
        if ended { return }
        ended = true
        controls.releaseAll()
        controls.isHidden = true
        diveHUD.setPrompt(nil, at: CGPoint.zero)
        diveHUD.setReel(visible: false, progress: 0, tension: 0, surging: false)
        world.isPaused = true
        var headline: String? = nil
        var detail: String? = nil
        if let boss: BossInfo = config.boss {
            if sim.bossDefeated {
                headline = String(localized: "Vittoria!")
                detail = String(localized: "\(boss.name.text()) non farà più paura a nessuno.")
            } else {
                headline = String(localized: "Sei svenuta!")
                detail = String(localized: "\(boss.name.text()) ha vinto questa volta. Potenzia l'attrezzatura e riprova.")
            }
        }
        let panel: DiveResultsPanel = DiveResultsPanel(bag: sim.bag, fainted: fainted, deepest: sim.deepest, catalog: GameData.shared.fish,
                                                       headline: headline, detail: detail)
        panel.zPosition = 700
        panel.onDone = { [weak self] (kept: DiveBag) -> Void in
            guard let self = self, !self.leaving else { return }
            self.leaving = true
            if let finished: ((DiveOutcome) -> Void) = self.onFinished {
                finished(self.outcome(bag: kept, fainted: fainted))
            } else {
                SceneRouter.shared.showTitle(animated: true)
            }
        }
        hud.addChild(panel)
        results = panel
        panel.layout(sceneSize: size, safe: hudSafeRect, pixelScale: hudPixelScale(1))
    }

    // MARK: - Pausa

    /// Riassunto della sacca: specie per specie, con stelle e peso.
    private func bagSummary() -> String {
        let bag: DiveBag = sim.bag
        var groups: [String: (count: Int, weight: Double)] = [:]
        for item in bag.fish {
            let name: String = GameData.shared.fish.find(item.speciesId)?.name.text() ?? item.speciesId
            let key: String = "\(name) " + String(repeating: "★", count: item.stars)
            let old: (count: Int, weight: Double) = groups[key] ?? (count: 0, weight: 0)
            groups[key] = (count: old.count + 1, weight: old.weight + item.weight)
        }
        var lines: [String] = []
        for key in groups.keys.sorted().prefix(8) {
            let entry: (count: Int, weight: Double) = groups[key] ?? (count: 0, weight: 0)
            lines.append("\(key) ×\(entry.count) · " + String(format: "%.1f kg", entry.weight))
        }
        for kind in bag.materials.keys.sorted() {
            if let pickup: PickupPoint.Kind = PickupPoint.Kind(rawValue: kind) { lines.append("\(DiveScene.pickupName(pickup)) ×\(bag.materials[kind] ?? 0)") }
        }
        if !bag.relics.isEmpty { lines.append(String(localized: "Maioliche dei Nerei ×\(bag.relics.count)")) }
        let total: String = String(format: "%.1f / %.0f kg", bag.totalWeight, bag.maxWeight)
        let head: String = String(localized: "Sacca: \(total)")
        return lines.isEmpty ? head + "\n" + String(localized: "Ancora vuota.") : head + "\n" + lines.joined(separator: "\n")
    }

    private func setPaused(_ value: Bool) {
        userPaused = value
        if value {
            pauseBag.attributedText = Theme.attributed(bagSummary(), size: 14, weight: UIFont.Weight.semibold, color: Theme.lime)
        }
        world.isPaused = value
        pauseLayer.isHidden = !value
        controls.releaseAll()
        controls.isHidden = value
        pressedPill = nil
        aiming = false
        resumeButton.setPressed(false)
        quitButton.setPressed(false)
    }

    /// Chiamata quando l'app perde il primo piano.
    func pauseForBackground() {
        if !userPaused && !leaving && !ended { setPaused(true) }
    }

    private func outcome(bag: DiveBag, fainted: Bool) -> DiveOutcome {
        return DiveOutcome(bag: bag, deepest: sim.deepest, fainted: fainted, boss: config.boss?.id, bossDefeated: sim.bossDefeated)
    }

    /// Abbandono dalla pausa: l'immersione finisce senza bottino.
    private func leaveToTitle() {
        if leaving { return }
        leaving = true
        if let finished: ((DiveOutcome) -> Void) = onFinished {
            finished(outcome(bag: DiveBag(), fainted: false))
        } else {
            SceneRouter.shared.showTitle(animated: true)
        }
    }

    // MARK: - Tocchi

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            let point: CGPoint = touch.location(in: hud)
            if ended {
                results?.touchBegan(at: point)
            } else if userPaused {
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
        if userPaused || ended { return }
        for touch in touches {
            controls.touchMoved(touch, at: touch.location(in: hud))
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            let point: CGPoint = touch.location(in: hud)
            if ended {
                results?.touchEnded(at: point)
            } else if userPaused {
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
        var members: Int = 0
        for school in sim.schools { members += school.aliveCount }
        var text: String = "depth=\(Int(sim.diver.depthMeters)) chunks=\(terrain.loadedChunkCount) fish=\(sim.fish.count) school=\(members) caught=\(sim.bag.fish.count) breath=\(Int(sim.breathRatio * 100))"
        if let boss: BossBody = sim.boss {
            text += " boss=\(boss.info.id) vita=\(Int(boss.hpRatio * 100)) mossa=\(boss.move.rawValue) pericoli=\(sim.hazards.count)"
        }
        return text
    }
}
