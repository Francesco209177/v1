/// L'immersione nel Calderone. Tutta la logica sta in `DiveSim` (la stessa dell'app iOS):
/// qui si leggono i comandi, si fa avanzare la simulazione e si disegna ciò che contiene.
final class DiveScreen: Screen {
    private struct FishLook {
        var clock: Double = 0
        var hurt: Double = 0
        var punch: Double = 0
    }

    private struct Mote {
        var x: Double
        var y: Double
        let vx: Double
        let vy: Double
        let sprite: String
        let alpha: Int
    }

    // Dati
    private let config: DiveConfig
    private let worldData: WorldData
    private var sim: DiveSim
    private var fx: SeededRNG
    private let terrain: TerrainCache
    private let backdrop: DiveBackdrop
    private var effects: Effects
    private var bossPaint: BossPaint?

    // Aspetto
    private var looks: [Int: FishLook] = [:]
    private var motes: [Mote] = []
    private var sky: Image = Image.empty
    private var surfaceStrips: [Image] = []
    private var glowCache: [Int: Image] = [:]
    private var diverClock: Double = 0
    private var diverPose: Int = 0
    private var minimap: Image = Image.empty
    private var minimapClock: Double = 0
    private var flash: Double = 0
    private var flashLength: Double = 0.35
    private var inkAlpha: Double = 0
    private var water: RGBA = RGBA(hex: 0x1F8FB0)
    private var visibility: Double = 1
    private var dark: Double = 0

    // Interfaccia
    private let pad: TouchPad = TouchPad()
    private var toast: Toast = Toast()
    private var hint: HintBox = HintBox()
    private var bannerTitle: String = ""
    private var bannerRange: String = ""
    private var bannerClock: Double = 99
    private var zoneName: String = ""
    private var blink: Double = 0
    private var paused: Bool = false
    private var pauseLines: [String] = []
    private var results: DiveResults?
    /// Chiamata alla fine dell'immersione con ciò che Tecla porta a casa e com'è andata.
    var onFinished: ((DiveOutcome) -> Void)?

    // Stato
    private var camX: Double = 0
    private var camY: Double = 0
    private var shakeX: Double = 0
    private var shakeY: Double = 0
    private var viewW: Double = 427
    private var viewH: Double = 240
    private var elapsed: Double = 0
    private var bubbleTimer: Double = 0.4
    private var zoneIndex: Int = -1
    private var leaving: Bool = false
    private var ended: Bool = false
    private var aiming: Bool = false
    private var aimDirection: Vec2 = Vec2(1, 0)
    private var manualAim: Vec2? = nil
    private var hitStop: Double = 0
    private var shake: Double = 0
    private var autoFireClock: Double = 1.0
    private var alarmClock: Double = 0
    private var victoryClock: Double = -1
    private var dyingClock: Double = 0

    init(config: DiveConfig) {
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
        // Su iPhone i pesci "pensano" con GameplayKit; qui decide direttamente la simulazione, con le stesse regole.
        simulation.usesExternalBrains = false
        simulation.harpoonTuning.damage = config.harpoonDamage
        simulation.harpoonTuning.range = config.harpoonRange
        simulation.tuning.maxSpeed = config.swimSpeed
        simulation.equip(config.weapon)
        sim = simulation
        fx = SeededRNG(seed: config.seed &+ 404)
        effects = Effects(seed: config.seed &+ 405)
        terrain = TerrainCache(map: generated, world: data)
        backdrop = DiveBackdrop(seed: config.seed)
    }

    // MARK: - Ingresso

    override func enter(_ app: App) {
        viewW = Double(app.worldCanvas.width)
        viewH = Double(app.worldCanvas.height)
        for phase in [0.0, 2.1, 4.2] {
            surfaceStrips.append(Image(BackdropPainter.surfaceStrip(width: 256, height: 10, phase: phase)))
        }
        let skyWidth: Int = max(640, app.worldCanvas.width + 96)
        sky = Image(BackdropPainter.sky(width: skyWidth, height: 150, seed: config.seed, style: config.sky), anchorX: skyWidth / 2, anchorY: 150)

        // Plancton sospeso che deriva piano.
        let moteNames: [String] = ["plankton_0", "plankton_1", "plankton_0", "plankton_2", "plankton_1"]
        var m: Int = 0
        while m < 42 {
            motes.append(Mote(x: fx.range(-340, 340), y: fx.range(-170, 170), vx: fx.range(-3.5, 3.5), vy: fx.range(-2.5, 1.5),
                              sprite: moteNames[m % moteNames.count], alpha: Int(fx.range(0.35, 0.85) * 255)))
            m += 1
        }

        var actions: [GameButtons] = [GameButtons.primary, GameButtons.interact, GameButtons.dash, GameButtons.pause]
        if config.weapon != nil { actions.append(GameButtons.secondary) }
        pad.configure(actions: actions)
        pad.layout(safe: app.safe)

        if let boss: BossBody = sim.boss, let arena: Arena = sim.arena {
            bossPaint = BossPaint(boss: boss, arena: arena)
        }

        // Primo fotogramma già completo: camera su Tecla e terreno dipinto subito.
        let start: Vec2 = clampCamera(sim.diver.position)
        camX = start.x
        camY = start.y
        terrain.update(camX: camX, camY: camY, viewWidth: viewW, viewHeight: viewH, synchronous: true)
        updateAtmosphere()
        updateZone(force: true)
        if let boss: BossInfo = config.boss {
            announce(zone: boss.name.text(), range: boss.epithet.text())
        }
        // Le istruzioni della prima immersione.
        if config.autopilot == nil && config.boss == nil && GameSession.shared.firstTime("immersione") {
            hint.show("Pollice sinistro per nuotare. Tieni premuto l'arpione per mirare, rilascia per tirare; con un pesce agganciato tieni premuto per recuperare e molla durante gli strattoni. Il Fiato cala: risali o cerca una campana d'aria. Per finire torna alla barca e premi la mano.",
                      width: min(Int(Double(app.uiWidth) * 0.62), 330), seconds: 14)
        }
    }

    override func leave(_ app: App) {
        pad.releaseAll(app.input)
        Mixer.shared.setUnderwater(0)
    }

    // MARK: - Comandi

    override func controls(_ app: App) {
        pad.layout(safe: app.safe)
        pad.hidden = paused || ended
        pad.read(app.input)
    }

    override func back(_ app: App) -> Bool {
        if ended { return true }
        setPaused(!paused, app)
        return true
    }

    // MARK: - Ciclo di gioco

    override func update(_ app: App, _ dt: Double) {
        let input: Input = app.input
        viewW = Double(app.worldCanvas.width)
        viewH = Double(app.worldCanvas.height)
        blink += dt
        toast.update(dt)
        hint.update(dt)
        bannerClock += dt
        if flash > 0 { flash = max(0, flash - dt) }

        if ended { return }
        if input.pressed.contains(GameButtons.pause) { setPaused(!paused, app) }
        if paused { return }
        elapsed += dt

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
            endDive(fainted: false, app)
            return
        }

        let events: [DiveEvent] = simDt > 0 ? sim.step(input: command, dt: simDt) : []
        handle(events)
        updateLooks(simDt)
        updateDiver(simDt)
        updateBoss(dt)

        // Camera: segue con un po' di anticipo nella direzione di nuoto, più eventuale scossa.
        let diver: Vec2 = sim.diver.position
        let lead: Vec2 = Vec2(sim.diver.velocity.x * 0.32, sim.diver.velocity.y * 0.26)
        var focus: Vec2 = diver + lead
        if let boss: BossBody = sim.boss, boss.isAlive {
            // Negli scontri l'inquadratura tiene insieme Tecla e il boss.
            focus = diver * 0.62 + boss.position * 0.38 + lead * 0.4
        }
        let target: Vec2 = clampCamera(focus)
        camX = MathUtil.damp(camX, target.x, rate: 5.5, dt: dt)
        camY = MathUtil.damp(camY, target.y, rate: 5.5, dt: dt)
        shakeX = 0
        shakeY = 0
        if shake > 0.05 {
            shakeX = fx.range(-shake, shake).rounded()
            shakeY = fx.range(-shake, shake).rounded()
            shake *= exp(-dt * 12)
        }

        terrain.update(camX: camX, camY: camY, viewWidth: viewW, viewHeight: viewH, synchronous: false)
        updateAtmosphere()
        updateMotes(dt)
        updateBubbles(dt)
        effects.update(dt)
        updateZone(force: false)
        updateHUD(dt)
        GameSession.shared.addPlayTime(dt)

        if sim.fainted && !ended {
            endDive(fainted: true, app)
        }
        // Vittoria: un attimo per godersela, poi il riepilogo.
        if victoryClock >= 0 && !ended {
            victoryClock -= dt
            if victoryClock <= 0 { endDive(fainted: false, app) }
        }
    }

    /// Tenere premuto il tasto dell'arpione mostra la mira; al rilascio parte il colpo.
    /// Con la lenza agganciata lo stesso tasto serve a recuperare.
    private func updateAiming(input: Input, command: inout DiveInput, dt: Double) {
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

    private func updateLooks(_ dt: Double) {
        var alive: Set<Int> = []
        var i: Int = 0
        while i < sim.fish.count {
            let id: Int = sim.fishId(at: i)
            alive.insert(id)
            var look: FishLook = looks[id] ?? FishLook()
            look.clock += dt * (4.0 + sim.fish[i].velocity.length * 0.09)
            if look.hurt > 0 { look.hurt -= dt }
            if look.punch > 0 { look.punch = max(0, look.punch - dt * 7) }
            looks[id] = look
            i += 1
        }
        for id in looks.keys where !alive.contains(id) { looks[id] = nil }
    }

    private func updateDiver(_ dt: Double) {
        let state: DiverState = sim.diver
        let speed: Double = state.velocity.length
        let pose: Int = state.isDashing ? 2 : (speed > 9 ? 1 : 0)
        if pose != diverPose {
            diverPose = pose
            diverClock = 0
        }
        // L'animazione va al ritmo del nuoto: più veloce, più pinneggiate.
        let rate: Double
        switch pose {
        case 0: rate = 3.2
        case 1: rate = 5.5 + 6.0 * min(speed / max(sim.tuning.maxSpeed, 1), 1.2)
        default: rate = 16
        }
        diverClock += dt * rate
    }

    private func updateBoss(_ dt: Double) {
        guard let boss: BossBody = sim.boss, let paint: BossPaint = bossPaint else { return }
        paint.update(boss: boss, hazards: sim.hazards, dt: dt)
        // Dentro l'inchiostro lo schermo si scurisce.
        let target: Double = sim.inked ? 0.62 : 0
        inkAlpha += (target - inkAlpha) * min(1, dt * 6)
        if boss.move == BossMove.dying {
            // Si spegne tra scintille e bolle.
            dyingClock -= dt
            if dyingClock <= 0 {
                dyingClock = 0.16
                let at: Vec2 = boss.position + Vec2(fx.range(-boss.info.radius, boss.info.radius), fx.range(-boss.info.radius, boss.info.radius))
                effects.sparks(at: at, color: RGBA(hex: 0xFFE27A), count: 6)
                shake = max(shake, 2.0)
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
                effects.sparks(at: at, color: RGBA(hex: 0xE8E0C8), count: 5)
            case .fishHit(let at, let damage, let killed):
                hitStop = killed ? 0.07 : 0.045
                shake = max(shake, killed ? 2.4 : 1.4)
                Feedback.hit()
                effects.sparks(at: at, color: Theme.white, count: 7)
                effects.number(Int(damage.rounded()), at: at, color: RGBA(hex: 0xFFE27A))
                var i: Int = 0
                while i < sim.fish.count {
                    let p: Vec2 = sim.fish[i].position
                    if abs(p.x - at.x) < 3 && abs(p.y - at.y) < 3 {
                        let id: Int = sim.fishId(at: i)
                        var look: FishLook = looks[id] ?? FishLook()
                        look.hurt = 0.12
                        look.punch = 1
                        looks[id] = look
                    }
                    i += 1
                }
            case .hookStarted:
                toast.show("Agganciato! Recupera la lenza", color: Theme.ochre)
            case .surge:
                Feedback.warning()
                shake = max(shake, 1.2)
            case .lineBroke:
                toast.show("La lenza si è spezzata!", color: Theme.danger)
                Feedback.thud()
            case .caught(let item, let at):
                Feedback.success(sound: SFXKind.catchFish)
                let name: String = GameData.shared.fish.find(item.speciesId)?.name.text() ?? item.speciesId
                toast.show("\(name)  " + String(repeating: "★", count: item.stars), color: Theme.lime)
                effects.sparks(at: at, color: RGBA(hex: 0xFFE27A), count: 10)
            case .diverHurt(let damage, let at):
                shake = max(shake, 4.5)
                Feedback.thud(sound: SFXKind.hurt)
                effects.number(Int(damage.rounded()), at: at, color: RGBA(hex: 0xFF6B60))
                effects.sparks(at: at, color: RGBA(hex: 0xFF8A80), count: 8)
            case .telegraph(let at):
                effects.sparks(at: at, color: RGBA(hex: 0xFF6B60), count: 3)
            case .pickedUp(let kind, let at):
                Feedback.tap(sound: kind == PickupPoint.Kind.maiolica ? SFXKind.coin : SFXKind.pickup)
                toast.show(pickupName(kind), color: Theme.lime)
                effects.sparks(at: at, color: RGBA(hex: 0xA8EC9A), count: 5)
            case .breathRefilled:
                Feedback.success(sound: SFXKind.bell)
                toast.show("Fiato al massimo", color: Theme.turquoise)
                var b: Int = 0
                while b < 10 {
                    spawnBubble(spread: 10)
                    b += 1
                }
            case .breathLow:
                Feedback.warning()
                toast.show("Fiato agli sgoccioli: risali!", color: Theme.danger)
            case .pressure:
                Feedback.warning()
                shake = max(shake, 1.5)
                toast.show("Troppa pressione per questa muta", color: Theme.danger)
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
                    effects.ring(at: at, radius: radius, color: RGBA(hex: 0xF4EFE2))
                case .stun:
                    if radius > 0 {
                        effects.ring(at: at, radius: radius, color: RGBA(hex: 0xBFE9F7))
                        shake = max(shake, 3)
                        effects.sparks(at: at, color: RGBA(hex: 0xD6F3FB), count: 16)
                    }
                case .melee:
                    effects.sparks(at: at, color: Theme.white, count: 6)
                case .sleep, .bolt:
                    break
                }
            case .outOfAmmo:
                Feedback.warning()
                toast.show("Colpi finiti", color: Theme.ochre)
            case .asleep(let at):
                effects.sparks(at: at, color: RGBA(hex: 0xBFE9F7), count: 6)
            case .photographed(let species):
                Feedback.success()
                flash = 0.35
                flashLength = 0.35
                let name: String = GameData.shared.fish.find(species)?.name.text() ?? species
                toast.show("Fotografia: \(name)", color: Theme.lime)
            case .bossTelegraph(let at, _):
                Feedback.warning()
                effects.sparks(at: at, color: RGBA(hex: 0xFF6B60), count: 5)
            case .bossAttack:
                Feedback.tap()
            case .bossHit(let at, let damage):
                hitStop = 0.05
                shake = max(shake, 2.2)
                Feedback.hit()
                bossPaint?.flashHit()
                effects.sparks(at: at, color: Theme.white, count: 9)
                effects.number(Int(damage.rounded()), at: at, color: RGBA(hex: 0xFFE27A))
            case .bossBlocked(let at):
                Feedback.tap(sound: SFXKind.clang)
                effects.sparks(at: at, color: RGBA(hex: 0x9AA8B8), count: 4)
                toast.show("Parato!", color: RGBA(hex: 0xBFC8D4))
            case .bossPhase(let phase):
                Feedback.thud(sound: SFXKind.roar)
                shake = max(shake, 5)
                toast.show(phase == 2 ? "Si infuria!" : "È allo stremo: attenta!", color: Theme.danger)
            case .bossStunned(let at):
                Feedback.success()
                effects.sparks(at: at, color: RGBA(hex: 0xFFE27A), count: 12)
                toast.show("Scoperto: colpisci adesso!", color: Theme.ochre)
            case .quake:
                Feedback.thud()
                shake = max(shake, 5.5)
            case .blast(let at, let radius):
                Feedback.thud(sound: SFXKind.blast)
                shake = max(shake, 4)
                effects.ring(at: at, radius: max(radius, 10), color: RGBA(hex: 0xFFB060))
                effects.sparks(at: at, color: RGBA(hex: 0xFFD6A0), count: 14)
            case .bossDying:
                Feedback.success()
                hitStop = 0.25
                shake = max(shake, 6)
            case .bossDefeated:
                Feedback.success()
                flash = 0.6
                flashLength = 0.6
                toast.show("Vittoria!", color: Theme.lime)
                victoryClock = 1.6
            case .bellReady:
                Feedback.tap()
            }
        }
    }

    // MARK: - Camera e atmosfera

    private func clampCamera(_ p: Vec2) -> Vec2 {
        let halfW: Double = viewW / 2
        let halfH: Double = viewH / 2
        let skyRoom: Double = 84
        if let arena: Arena = sim.arena {
            // Nella sala di un boss la camera non esce dalle pareti.
            let margin: Double = 28
            let ax0: Double = min(arena.minX - margin + halfW, arena.center.x)
            let ax1: Double = max(arena.maxX + margin - halfW, arena.center.x)
            let ay0: Double = min(arena.minY - margin + halfH, arena.center.y)
            let ay1: Double = max(arena.maxY + margin - halfH, arena.center.y)
            return Vec2(MathUtil.clamp(p.x, ax0, ax1), MathUtil.clamp(p.y, ay0, ay1))
        }
        let minX: Double = min(halfW, sim.map.widthPixels / 2)
        let maxX: Double = max(sim.map.widthPixels - halfW, sim.map.widthPixels / 2)
        let minY: Double = halfH - skyRoom
        let maxY: Double = max(sim.map.heightPixels - halfH, minY)
        return Vec2(MathUtil.clamp(p.x, minX, maxX), MathUtil.clamp(p.y, minY, maxY))
    }

    /// Colore dell'acqua, visibilità e buio in base alla profondità.
    private func updateAtmosphere() {
        let ppm: Double = Double(worldData.pixelsPerMeter)
        water = worldData.waterColor(atDepth: max(0, camY) / ppm)
        visibility = worldData.light(atDepth: sim.diver.depthMeters)
        // Buio: comincia sotto i 150 metri circa e si fa quasi totale negli abissi; di notte è buio ovunque.
        var level: Double = MathUtil.clamp((0.60 - visibility) / 0.60, 0, 1) * 0.94
        if config.night { level = max(level, sim.diver.atSurface ? 0.35 : 0.66) }
        if let boss: BossInfo = config.boss {
            // Negli scontri si deve vedere che cosa succede; solo la Lanterna combatte al buio.
            level = boss.kind == BossKind.lanterna ? max(level, 0.88) : min(level, 0.28)
        }
        dark = level
        // Sott'acqua i suoni si ovattano; con la testa fuori tornano limpidi.
        Mixer.shared.setUnderwater(sim.diver.atSurface && sim.arena == nil ? 0 : 1)
    }

    private func updateMotes(_ dt: Double) {
        let halfW: Double = viewW / 2 + 12
        let halfH: Double = viewH / 2 + 12
        var i: Int = 0
        while i < motes.count {
            motes[i].x += motes[i].vx * dt
            motes[i].y += motes[i].vy * dt
            // Riciclo ai bordi dello schermo: il plancton sembra infinito.
            if motes[i].x < camX - halfW { motes[i].x += halfW * 2 }
            if motes[i].x > camX + halfW { motes[i].x -= halfW * 2 }
            if motes[i].y < camY - halfH { motes[i].y += halfH * 2 }
            if motes[i].y > camY + halfH { motes[i].y -= halfH * 2 }
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

    /// Punto del mondo da cui escono le bolle: la bocca di Tecla, tenuto conto di come è girata.
    private var mouth: Vec2 {
        let state: DiverState = sim.diver
        let side: Double = state.facingRight ? 1 : -1
        let local: Vec2 = Vec2(15 * side, 2)
        let angle: Double = state.facingRight ? -state.tilt : state.tilt
        return state.position + local.rotated(by: angle)
    }

    private func spawnBubble(spread: Double) {
        if sim.diver.position.y < 10 { return }
        effects.bubble(at: mouth, spread: spread, ceiling: 0)
    }

    private func announce(zone name: String, range: String) {
        bannerTitle = name
        bannerRange = range
        bannerClock = 0
    }

    private func updateZone(force: Bool) {
        let index: Int = worldData.zoneIndex(atDepth: sim.diver.depthMeters)
        if index == zoneIndex && !force { return }
        zoneIndex = index
        // La musica segue il luogo: scontro, notte, abissi o acque chiare.
        if config.boss != nil {
            Mixer.shared.music("boss")
        } else if config.night {
            Mixer.shared.music("notte")
        } else {
            Mixer.shared.music(index >= 3 ? "abisso" : "immersione")
        }
        if index >= 0 && index < worldData.zones.count {
            let zone: ZoneInfo = worldData.zones[index]
            let name: String = zone.name.text()
            zoneName = config.phaseLabel.isEmpty ? name : "\(name) · \(config.phaseLabel)"
            if config.boss == nil { announce(zone: name, range: "\(zone.depthFrom)–\(zone.depthTo) m") }
        }
    }

    private func updateHUD(_ dt: Double) {
        minimapClock -= dt
        if minimapClock <= 0 && config.boss == nil {
            minimapClock = 0.33
            minimap = Image(sim.minimap(cols: 56, rows: 38, blink: Int(elapsed * 3) % 2 == 0))
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

    // MARK: - Fine dell'immersione e pausa

    private func outcome(bag: DiveBag, fainted: Bool) -> DiveOutcome {
        return DiveOutcome(bag: bag, deepest: sim.deepest, fainted: fainted, boss: config.boss?.id, bossDefeated: sim.bossDefeated)
    }

    private func endDive(fainted: Bool, _ app: App) {
        if ended { return }
        ended = true
        pad.releaseAll(app.input)
        aiming = false
        var headline: String? = nil
        var detail: String? = nil
        if let boss: BossInfo = config.boss {
            if sim.bossDefeated {
                headline = "Vittoria!"
                detail = "\(boss.name.text()) non farà più paura a nessuno."
            } else {
                headline = "Sei svenuta!"
                detail = "\(boss.name.text()) ha vinto questa volta. Potenzia l'attrezzatura e riprova."
            }
        }
        results = DiveResults(bag: sim.bag, fainted: fainted, deepest: sim.deepest, catalog: GameData.shared.fish, headline: headline, detail: detail)
    }

    private func finish(_ app: App, bag: DiveBag, fainted: Bool) {
        if leaving { return }
        leaving = true
        if let finished: (DiveOutcome) -> Void = onFinished {
            finished(outcome(bag: bag, fainted: fainted))
        } else {
            Flow.showTitle(app)
        }
    }

    /// Riassunto della sacca: specie per specie, con stelle e peso.
    private func bagSummary() -> [String] {
        let bag: DiveBag = sim.bag
        var groups: [String: (count: Int, weight: Double)] = [:]
        for item in bag.fish {
            let name: String = GameData.shared.fish.find(item.speciesId)?.name.text() ?? item.speciesId
            let key: String = "\(name) " + String(repeating: "★", count: item.stars)
            let old: (count: Int, weight: Double) = groups[key] ?? (count: 0, weight: 0)
            groups[key] = (count: old.count + 1, weight: old.weight + item.weight)
        }
        var lines: [String] = ["Sacca: \(Fmt.one(bag.totalWeight)) / \(Int(bag.maxWeight)) kg"]
        for key in groups.keys.sorted().prefix(8) {
            let entry: (count: Int, weight: Double) = groups[key] ?? (count: 0, weight: 0)
            lines.append("\(key) ×\(entry.count) · \(Fmt.one(entry.weight)) kg")
        }
        for kind in bag.materials.keys.sorted() {
            if let pickup: PickupPoint.Kind = PickupPoint.Kind(rawValue: kind) { lines.append("\(pickupName(pickup)) ×\(bag.materials[kind] ?? 0)") }
        }
        if !bag.relics.isEmpty { lines.append("Maioliche dei Nerei ×\(bag.relics.count)") }
        if lines.count == 1 { lines.append("Ancora vuota.") }
        return lines
    }

    private func setPaused(_ value: Bool, _ app: App) {
        if ended { return }
        paused = value
        if value { pauseLines = bagSummary() }
        pad.releaseAll(app.input)
        aiming = false
    }

    /// L'app perde il primo piano: l'immersione si mette in pausa da sola.
    override func suspend(_ app: App) {
        if !paused && !leaving && !ended { setPaused(true, app) }
    }

    // MARK: - Disegno del mondo

    private func glowImage(side: Int) -> Image {
        if let cached: Image = glowCache[side] { return cached }
        var image: PixelBuffer = PixelBuffer(width: side, height: side)
        let c: Double = Double(side) / 2
        var y: Int = 0
        while y < side {
            var x: Int = 0
            while x < side {
                let dx: Double = Double(x) + 0.5 - c
                let dy: Double = Double(y) + 0.5 - c
                let d: Double = (dx * dx + dy * dy).squareRoot() / c
                if d < 1 {
                    let a: Double = ((1 - d) * (1 - d) * 5).rounded() / 5
                    image.set(x, y, RGBA(r: 130, g: 240, b: 225, a: UInt8(max(0, min(255, a * 255)))))
                }
                x += 1
            }
            y += 1
        }
        let made: Image = Image(image, anchorX: side / 2, anchorY: side / 2)
        glowCache[side] = made
        return made
    }

    override func drawWorld(_ app: App, _ g: Canvas) {
        let sprites: Sprites = Sprites.shared
        let cx: Double = camX + shakeX
        let cy: Double = camY + shakeY
        let halfW: Double = Double(g.width) / 2
        let halfH: Double = Double(g.height) / 2
        let ox: Double = halfW - cx.rounded()
        let oy: Double = halfH - cy.rounded()
        let ppm: Double = Double(worldData.pixelsPerMeter)
        @inline(__always) func sx(_ x: Double) -> Int { return Int((x + ox).rounded()) }
        @inline(__always) func sy(_ y: Double) -> Int { return Int((y + oy).rounded()) }

        // Acqua: sfuma dal colore in cima allo schermo a quello in fondo.
        let top: RGBA = worldData.waterColor(atDepth: max(0, cy - halfH) / ppm)
        let bottom: RGBA = worldData.waterColor(atDepth: max(0, cy + halfH) / ppm)
        g.gradient(Rect(0, 0, g.width, g.height), top: top, bottom: bottom, band: 3)
        backdrop.drawFar(g, camX: cx, camY: cy, water: water, visibility: visibility)
        let surfaceY: Int = sy(0)
        if visibility >= 0.2 && !config.night {
            WaterPaint.rays(g, time: elapsed, strength: 0.9 * pow(visibility, 1.7), surfaceY: surfaceY, offsetX: cx * 0.35)
        }

        // Cielo, isola e pelo dell'acqua, quando la camera arriva in superficie.
        if surfaceY > -6 {
            g.fill(x: 0, y: 0, w: g.width, h: max(0, surfaceY - 150), config.sky.top)
            g.sprite(sky, x: sx(cx * 0.94 + sim.map.widthPixels * 0.03), y: surfaceY)
            let frame: Int = Int(elapsed / 0.28) % max(surfaceStrips.count, 1)
            let first: Double = ((cx - halfW) / 256).rounded(.down) * 256
            var i: Int = 0
            while Double(i) * 256 + first < cx + halfW {
                g.draw(surfaceStrips[(frame + i) % surfaceStrips.count], x: sx(first + Double(i) * 256), y: surfaceY - 4)
                i += 1
            }
        }
        if config.boss == nil {
            // Il gozzo ancorato sopra il canale principale.
            let bob: Double = sin(elapsed * Double.pi / 0.9) > 0 ? 1 : 0
            g.sprite(sprites.get("gozzo"), x: sx(sim.boat.x), y: sy(-1 - bob))
        }

        terrain.drawBehind(g, camX: cx, camY: cy)
        terrain.drawRock(g, camX: cx, camY: cy)
        terrain.drawFlora(g, camX: cx, camY: cy, time: elapsed)

        // Oggetti da raccogliere e campane d'aria.
        for pickup in sim.pickups {
            let px: Int = sx(pickup.position.x)
            var py: Int = sy(pickup.position.y)
            if px < -24 || px > g.width + 24 || py < -24 || py > g.height + 24 { continue }
            if pickup.kind == PickupPoint.Kind.campana {
                py -= Int((sin(elapsed * Double.pi / 1.2) + 1).rounded())
                g.sprite(sprites.get(pickup.taken ? "pickup_campana_vuota" : "pickup_campana"), x: px, y: py)
            } else if !pickup.taken {
                g.sprite(sprites.get("pickup_\(pickup.kind.rawValue)"), x: px, y: py)
            }
        }

        bossPaint?.draw(g, boss: sim.boss, hazards: sim.hazards, arena: sim.arena, camX: cx, camY: cy, time: elapsed)
        drawCreatures(g, ox: ox, oy: oy)

        // Arpione: linea di mira, lenza, punta, pesce trasportato.
        let diver: DiverState = sim.diver
        let dx: Int = sx(diver.position.x)
        let dy: Int = sy(diver.position.y)
        if aiming {
            let range: Double = sim.harpoonTuning.range
            g.line(dx, dy, dx + Int((aimDirection.x * range).rounded()), dy + Int((aimDirection.y * range).rounded()), RGBA(r: 255, g: 255, b: 255, a: 128))
        }
        let harpoon: HarpoonState = sim.harpoon
        if harpoon.isOut {
            let tx: Int = sx(harpoon.tip.x)
            let ty: Int = sy(harpoon.tip.y)
            g.line(dx, dy, tx, ty, RGBA(hex: 0xE8E0C8))
            let rope: Double = atan2(Double(ty - dy), Double(tx - dx))
            if harpoon.phase != HarpoonPhase.reeling {
                // In volo la punta guarda avanti; al ritorno resta girata verso l'esterno.
                let angle: Double = harpoon.phase == HarpoonPhase.flying ? atan2(harpoon.direction.y, harpoon.direction.x) : rope
                g.sprite(sprites.get("harpoon_tip"), x: Double(tx), y: Double(ty), rotation: angle)
            }
            if let item: CatchItem = harpoon.carried {
                g.sprite(sprites.get("\(item.speciesId)_dead_0"), x: Double(tx), y: Double(ty), rotation: rope + Double.pi)
            }
        }
        for shot in sim.shots {
            let px: Int = sx(shot.position.x)
            let py: Int = sy(shot.position.y)
            if shot.kind == WeaponKind.stun {
                g.fill(x: px - 1, y: py - 1, w: 3, h: 3, RGBA(hex: 0xF4EFE2))
            } else {
                g.line(px - Int((shot.direction.x * 3).rounded()), py - Int((shot.direction.y * 3).rounded()),
                       px + Int((shot.direction.x * 3).rounded()), py + Int((shot.direction.y * 3).rounded()), RGBA(hex: 0xF4EFE2))
            }
        }

        // Tecla: lampeggia finché dura l'invulnerabilità dopo un colpo.
        let names: [String] = ["tecla_idle", "tecla_swim", "tecla_dash"]
        let frames: Int = max(1, sprites.frameCount(names[diverPose]))
        let image: Image = sprites.get("\(names[diverPose])_\(Int(diverClock) % frames)")
        let ghost: Bool = sim.invulnerable > 0 && Int(elapsed * 14) % 2 == 0
        let stretch: Double = diver.isDashing ? 1.12 : 1.0
        let squash: Double = diver.isDashing ? 0.92 : 1.0
        let side: Double = diver.facingRight ? 1 : -1
        g.sprite(image, x: Double(dx), y: Double(dy), rotation: diver.facingRight ? -diver.tilt : diver.tilt,
                 scaleX: side * stretch, scaleY: squash, ink: ghost ? Ink.alpha(115) : Ink.normal)

        if aiming, let target: (ref: TargetRef, position: Vec2) = sim.bestTarget(direction: aimDirection, cone: 0.97) {
            g.sprite(sprites.get("alert"), x: sx(target.position.x), y: sy(target.position.y) - 12)
        }

        effects.drawBubbles(g, camX: cx.rounded(), camY: cy.rounded())
        effects.draw(g, camX: cx.rounded(), camY: cy.rounded())
        for mote in motes where mote.y > 2 {
            g.sprite(sprites.get(mote.sprite), x: sx(mote.x), y: sy(mote.y), ink: Ink.alpha(mote.alpha))
        }
        backdrop.drawFront(g, camX: cx, camY: cy, water: water, visibility: visibility)

        if inkAlpha > 0.01 { g.fill(x: 0, y: 0, w: g.width, h: g.height, RGBA(hex: 0x0A0614).withAlpha(UInt8(inkAlpha * 255))) }

        // Buio, con l'alone e il fascio della torcia; poi ciò che brilla di luce propria.
        if dark >= 0.02 {
            var lights: [Canvas.Light] = bossPaint?.lights(boss: sim.boss, hazards: sim.hazards, camX: cx, camY: cy, width: g.width, height: g.height) ?? []
            var i: Int = 0
            while i < sim.fish.count {
                let body: FishBody = sim.fish[i]
                if body.species.isGlowing {
                    lights.append(Canvas.Light(x: body.position.x + ox, y: body.position.y + oy, radius: body.species.radius * 2.2 + 8, strength: 0.75))
                }
                i += 1
            }
            let hasTorch: Bool = config.torchRadius >= 0.18 || config.autopilot != nil || config.boss != nil
            g.darkenDive(level: dark, centerX: Double(dx), centerY: Double(dy), dirX: cos(diver.tilt) * side, dirY: -sin(diver.tilt),
                         radius: config.autopilot != nil ? 0.26 : config.torchRadius + 0.03, beam: 0.50 + config.torchRadius * 1.4,
                         torch: hasTorch, extra: lights)
            i = 0
            while i < sim.fish.count {
                let body: FishBody = sim.fish[i]
                if body.species.isGlowing {
                    let look: FishLook = looks[sim.fishId(at: i)] ?? FishLook()
                    let amount: Double = MathUtil.clamp(dark, 0, 1) * (0.55 + 0.2 * sin(look.clock * 0.8))
                    g.sprite(glowImage(side: Int(body.species.radius * 5) + 14), x: sx(body.position.x), y: sy(body.position.y), ink: Ink.add(Int(amount * 255)))
                }
                i += 1
            }
        }
        bossPaint?.drawGlow(g, boss: sim.boss, hazards: sim.hazards, arena: sim.arena, camX: cx, camY: cy, time: elapsed)

        if flash > 0 {
            let peak: Double = flashLength > 0.5 ? 0.7 : 0.85
            g.fill(x: 0, y: 0, w: g.width, h: g.height, Theme.white.withAlpha(UInt8(peak * flash / flashLength * 255)))
        }
    }

    private func drawCreatures(_ g: Canvas, ox: Double, oy: Double) {
        let sprites: Sprites = Sprites.shared
        // Banchi: uno sprite per membro.
        for school in sim.schools {
            let prefix: String = "\(school.species.spriteId)_swim"
            let frames: Int = max(1, sprites.frameCount(prefix))
            let rate: Double = school.mode == School.Mode.scatter ? 14 : 6
            for member in school.members where member.alive {
                let px: Int = Int((member.position.x + ox).rounded())
                let py: Int = Int((member.position.y + oy).rounded())
                if px < -30 || px > g.width + 30 || py < -30 || py > g.height + 30 { continue }
                g.sprite(sprites.get("\(prefix)_\(Int(elapsed * rate + member.phase) % frames)"), x: px, y: py, flipX: !member.facingRight)
            }
        }
        // Pesci singoli.
        var i: Int = 0
        while i < sim.fish.count {
            let body: FishBody = sim.fish[i]
            let px: Double = (body.position.x + ox).rounded()
            let py: Double = (body.position.y + oy).rounded()
            if px < -80 || px > Double(g.width) + 80 || py < -80 || py > Double(g.height) + 80 {
                i += 1
                continue
            }
            let look: FishLook = looks[sim.fishId(at: i)] ?? FishLook()
            let art: String = body.species.spriteId
            let name: String
            if body.state == FishState.dead {
                name = "\(art)_dead_0"
            } else if look.hurt > 0 || body.state == FishState.stunned {
                name = "\(art)_hurt_0"
            } else {
                let frames: Int = sprites.frameCount("\(art)_swim")
                name = frames > 0 ? "\(art)_swim_\(Int(look.clock) % frames)" : "\(art)_hurt_0"
            }
            let speed: Double = body.velocity.length
            var rotation: Double = 0
            var offsetX: Double = 0
            switch body.state {
            case .windup:
                // Trema prima di caricare.
                offsetX = sin(look.clock * 9) * 1.2
            case .hooked:
                rotation = sin(look.clock * 2.2) * 0.35
            case .charge, .flee, .chase:
                if speed > 8 {
                    rotation = MathUtil.clamp(atan2(-body.velocity.y, abs(body.velocity.x)), -0.6, 0.6) * (body.facingRight ? 1 : -1)
                }
            case .dead:
                rotation = Double.pi
            case .asleep:
                rotation = 0.5
            default:
                break
            }
            let image: Image = sprites.get(name)
            if rotation == 0 && look.punch <= 0 {
                g.sprite(image, x: Int((px + offsetX).rounded()), y: Int(py), flipX: !body.facingRight)
            } else {
                let facing: Double = body.facingRight ? 1 : -1
                g.sprite(image, x: px + offsetX, y: py, rotation: -rotation, scaleX: facing * (1 + look.punch * 0.22), scaleY: 1 - look.punch * 0.18)
            }
            if body.state == FishState.windup {
                g.sprite(sprites.get("alert"), x: Int(px), y: Int(py) - Int(body.species.radius) - 8)
            } else if body.state == FishState.asleep {
                g.text("ZZ", x: Int(px) + 2, y: Int(py) - Int(body.species.radius) - 11, RGBA(hex: 0xBFE9F7), align: TextAlign.center, shadow: RGBA(hex: 0x06142A))
            }
            i += 1
        }
    }

    // MARK: - Disegno dell'interfaccia

    override func drawUI(_ app: App, _ ui: UI) {
        let g: Canvas = ui.g
        let safe: Rect = app.safe
        if let panel: DiveResults = results {
            g.fill(x: 0, y: 0, w: g.width, h: g.height, Theme.ink.withAlpha(199))
            if let kept: DiveBag = panel.draw(app, ui) { finish(app, bag: kept, fainted: panel.fainted) }
            return
        }
        drawStatus(g, safe: safe)
        if let boss: BossBody = sim.boss {
            // Tra il riquadro dello stato (a sinistra) e la pausa (a destra): centrata se c'è posto.
            let freeLeft: Int = safe.x + 158
            let freeRight: Int = safe.maxX - 36
            var barWidth: Int = Int(Double(safe.w) * 0.42)
            var barCenter: Int = safe.midX
            if barCenter - barWidth / 2 < freeLeft {
                barWidth = min(barWidth, freeRight - freeLeft)
                barCenter = max(barCenter, freeLeft + barWidth / 2)
            }
            drawBossBar(g, info: boss.info, ratio: boss.hpRatio, vulnerable: boss.isVulnerable, top: safe.y + 4, centerX: barCenter,
                        maxWidth: barWidth)
        } else if !minimap.isEmpty {
            let mx: Int = safe.maxX - 56 - 34
            g.roundRect(Rect(mx - 2, safe.y + 3, 60, 42), radius: 3, Theme.lime.withAlpha(140))
            g.draw(minimap, x: mx, y: safe.y + 5, ink: Ink.alpha(235))
        }

        // Annuncio della zona.
        if bannerClock < 2.95 {
            var alpha: Double = 1
            if bannerClock < 0.35 {
                alpha = bannerClock / 0.35
            } else if bannerClock > 2.35 {
                alpha = max(0, 1 - (bannerClock - 2.35) / 0.6)
            }
            let y: Int = safe.y + Int(Double(safe.h) * 0.24)
            g.text(bannerTitle, x: safe.midX, y: y, Theme.lime.withAlpha(UInt8(alpha * 255)), align: TextAlign.center, scale: 2,
                   shadow: Theme.ink.withAlpha(UInt8(alpha * 200)))
            g.text(bannerRange, x: safe.midX, y: y + 20, Theme.ochre.withAlpha(UInt8(alpha * 255)), align: TextAlign.center,
                   shadow: Theme.ink.withAlpha(UInt8(alpha * 200)))
        }
        toast.draw(g, centerX: safe.midX, y: safe.y + Int(Double(safe.h) * 0.42))
        hint.draw(g, centerX: safe.midX, top: safe.y + Int(Double(safe.h) * 0.12))

        if !paused && !ended {
            drawPrompt(app, g)
            drawReel(g, safe: safe)
        }
        pad.draw(g, usingController: app.input.usingController)
        if let weapon: WeaponInfo = sim.secondary, weapon.ammo > 0, !paused, let at: (x: Int, y: Int) = pad.center(of: GameButtons.secondary) {
            g.text("×\(sim.ammo)", x: at.x, y: at.y - 26, sim.ammo == 0 ? RGBA(hex: 0xFF8A80) : Theme.white, align: TextAlign.center, shadow: RGBA(hex: 0x06142A))
        }
        if paused { drawPause(app, ui) }
    }

    /// Riquadro in alto a sinistra: Fiato, profondità, carico della sacca, zona.
    private func drawStatus(_ g: Canvas, safe: Rect) {
        let box: Rect = Rect(safe.x + 4, safe.y + 4, 148, 47)
        g.roundRect(box, radius: 5, Theme.ink.withAlpha(107))
        let ratio: Double = sim.breathRatio
        // Fiato: turchese, poi ocra, poi rosso lampeggiante sotto il 25%.
        var color: RGBA = Theme.turquoise
        if ratio < 0.25 {
            color = Int(blink * 5) % 2 == 0 ? Theme.danger : Theme.lime
        } else if ratio < 0.5 {
            color = Theme.ochre
        }
        let sprites: Sprites = Sprites.shared
        let breathIcon: Image = sprites.get("icon_breath")
        g.draw(breathIcon, x: box.x + 11 - breathIcon.width / 2, y: box.y + 11 - breathIcon.height / 2, ink: Ink.tint(ratio < 0.25 ? Theme.danger : Theme.turquoise))
        let bar: Rect = Rect(box.x + 22, box.y + 6, box.w - 30, 10)
        g.roundRect(bar, radius: 5, Theme.ink.withAlpha(140))
        g.roundOutline(bar, radius: 5, Theme.lime.withAlpha(90))
        let fill: Int = Int((Double(bar.w - 4) * MathUtil.clamp(ratio, 0, 1)).rounded())
        if fill > 0 { g.roundRect(Rect(bar.x + 2, bar.y + 2, max(fill, 4), bar.h - 4), radius: 3, color) }

        let depthIcon: Image = sprites.get("icon_depth")
        g.draw(depthIcon, x: box.x + 10 - depthIcon.width / 2, y: box.y + 25 - depthIcon.height / 2, ink: Ink.tint(Theme.ochre))
        g.text("\(Int(max(sim.diver.depthMeters, 0).rounded())) m", x: box.x + 19, y: box.y + 22, Theme.white)
        let over: Bool = sim.bag.totalWeight > sim.bag.maxWeight
        let weightIcon: Image = sprites.get("icon_weight")
        g.draw(weightIcon, x: box.x + 68 - weightIcon.width / 2, y: box.y + 25 - weightIcon.height / 2, ink: Ink.tint(over ? Theme.danger : Theme.lime))
        g.text("\(Fmt.one(sim.bag.totalWeight))/\(Int(sim.bag.maxWeight)) kg", x: box.x + 77, y: box.y + 22, over ? RGBA(hex: 0xFF8A80) : Theme.white)
        g.text(zoneName, x: box.x + 7, y: box.y + 35, Theme.lime.withAlpha(230))
    }

    /// Suggerimento dell'azione disponibile, sopra la testa di Tecla.
    private func drawPrompt(_ app: App, _ g: Canvas) {
        guard let what: DiveInteraction = sim.interaction() else { return }
        let text: String
        switch what {
        case .pickup: text = "Raccogli"
        case .bell: text = "Respira"
        case .boat: text = "Sali a bordo"
        case .photo: text = "Fotografa"
        }
        let wx: Double = sim.diver.position.x - camX + viewW / 2
        let wy: Double = sim.diver.position.y - camY + viewH / 2
        let x: Int = Int(app.uiFromWorld(wx).rounded())
        let y: Int = Int(app.uiFromWorld(wy).rounded()) - 30
        let icon: Image = Sprites.shared.get("icon_hand")
        let w: Int = PixelFont.shared.width(text) + icon.width + 13
        let box: Rect = Rect(max(app.safe.x + 2, min(app.safe.maxX - w - 2, x - w / 2)), max(app.safe.y + 2, y - 7), w, 15)
        g.roundRect(box, radius: 7, Theme.lime.withAlpha(240))
        g.draw(icon, x: box.x + 5, y: box.midY - icon.height / 2, ink: Ink.tint(Theme.ink))
        g.text(text, x: box.x + icon.width + 8, y: box.y + 4, Theme.ink)
    }

    /// Tiro alla lenza: in basso al centro, fuori dalla zona dei pollici.
    private func drawReel(_ g: Canvas, safe: Rect) {
        let harpoon: HarpoonState = sim.harpoon
        if harpoon.phase != HarpoonPhase.reeling { return }
        let width: Int = min(170, Int(Double(safe.w) * 0.36))
        let box: Rect = Rect(safe.midX - width / 2 - 50, safe.maxY - 52, width + 58, 48)
        g.roundRect(box, radius: 6, Theme.ink.withAlpha(153))
        let left: Int = safe.midX - width / 2
        if harpoon.isSurging {
            g.text("MOLLA!", x: safe.midX, y: box.y + 5, Int(blink * 8) % 2 == 0 ? RGBA(hex: 0xFF6B60) : Theme.white, align: TextAlign.center, shadow: RGBA(hex: 0x06142A))
        } else {
            g.text("TIENI PREMUTO", x: safe.midX, y: box.y + 5, Theme.white, align: TextAlign.center, shadow: RGBA(hex: 0x06142A))
        }
        let tension: RGBA = harpoon.tension > 0.75 ? Theme.danger : (harpoon.tension > 0.45 ? Theme.ochre : Theme.lime)
        let rows: [(String, Double, RGBA, Int)] = [("Recupero", harpoon.progress, Theme.turquoise, box.y + 18), ("Tensione", harpoon.tension, tension, box.y + 32)]
        for row in rows {
            g.text(row.0, x: left - 5, y: row.3 + 1, Theme.lime, align: TextAlign.right)
            let bar: Rect = Rect(left, row.3, width, 9)
            g.roundRect(bar, radius: 4, Theme.ink.withAlpha(140))
            g.roundOutline(bar, radius: 4, Theme.lime.withAlpha(90))
            let fill: Int = Int((Double(bar.w - 4) * MathUtil.clamp(row.1, 0, 1)).rounded())
            if fill > 0 { g.roundRect(Rect(bar.x + 2, bar.y + 2, max(fill, 3), bar.h - 4), radius: 2, row.2) }
        }
    }

    private func drawPause(_ app: App, _ ui: UI) {
        let g: Canvas = ui.g
        let safe: Rect = app.safe
        g.fill(x: 0, y: 0, w: g.width, h: g.height, Theme.ink.withAlpha(184))
        g.text("PAUSA", x: safe.midX, y: safe.y + 18, Theme.white, align: TextAlign.center, scale: 3)
        var y: Int = safe.y + 52
        for line in pauseLines {
            g.text(line, x: safe.midX, y: y, Theme.lime, align: TextAlign.center)
            y += PixelFont.lineHeight
        }
        let by: Int = safe.maxY - 40
        if ui.button("pausa.riprendi", Rect(safe.midX - 134, by, 128, 26), "Riprendi") { setPaused(false, app) }
        if ui.button("pausa.abbandona", Rect(safe.midX + 6, by, 128, 26), "Abbandona l'immersione", fill: Theme.lime) {
            // Abbandono dalla pausa: l'immersione finisce senza bottino.
            finish(app, bag: DiveBag(), fainted: false)
        }
    }

    // MARK: - Diagnostica per la prova automatica

    var debugSummary: String {
        var members: Int = 0
        for school in sim.schools { members += school.aliveCount }
        var text: String = "depth=\(Int(sim.diver.depthMeters)) chunks=\(terrain.loadedChunkCount) fish=\(sim.fish.count) school=\(members) caught=\(sim.bag.fish.count) breath=\(Int(sim.breathRatio * 100))"
        if let boss: BossBody = sim.boss {
            text += " boss=\(boss.info.id) vita=\(Int(boss.hpRatio * 100)) mossa=\(boss.move.rawValue) pericoli=\(sim.hazards.count)"
        }
        return text
    }
}

/// Riepilogo di fine immersione: che cosa si è portato a casa. Se Tecla è svenuta
/// si può tenere un solo oggetto: lo si sceglie qui.
final class DiveResults {
    private struct Entry {
        let title: String
        let detail: String
        let icon: String
        /// Che cosa resta nella sacca se si sceglie questa voce dopo uno svenimento.
        let keepFish: CatchItem?
        let keepMaterial: String?
    }

    let fainted: Bool
    private let bag: DiveBag
    private var entries: [Entry] = []
    private var selected: Int = 0
    private let title: String
    private let subtitle: String

    init(bag: DiveBag, fainted: Bool, deepest: Double, catalog: FishCatalog, headline: String?, detail: String?) {
        self.bag = bag
        self.fainted = fainted
        title = headline ?? (fainted ? "Sei svenuta!" : "Bottino dell'immersione")
        subtitle = detail ?? "Profondità massima \(Int(deepest.rounded())) m · Carico \(Fmt.one(bag.totalWeight)) kg"
        // Pesci raggruppati per specie e stelle, i più pregiati per primi.
        var groups: [String: (item: CatchItem, count: Int, weight: Double)] = [:]
        for item in bag.fish {
            let key: String = "\(item.speciesId)#\(item.stars)"
            if let existing: (item: CatchItem, count: Int, weight: Double) = groups[key] {
                groups[key] = (item: existing.item, count: existing.count + 1, weight: existing.weight + item.weight)
            } else {
                groups[key] = (item: item, count: 1, weight: item.weight)
            }
        }
        let ordered: [(item: CatchItem, count: Int, weight: Double)] = groups.values.sorted { (a, b) -> Bool in
            let pa: Int = (catalog.find(a.item.speciesId)?.price ?? 0) * a.item.stars
            let pb: Int = (catalog.find(b.item.speciesId)?.price ?? 0) * b.item.stars
            if pa != pb { return pa > pb }
            return a.item.speciesId < b.item.speciesId
        }
        for group in ordered {
            let name: String = catalog.find(group.item.speciesId)?.name.text() ?? group.item.speciesId
            let stars: String = String(repeating: "★", count: group.item.stars)
            let count: String = group.count > 1 ? "  ×\(group.count)" : ""
            entries.append(Entry(title: "\(name)  \(stars)\(count)", detail: "\(Fmt.one(group.weight)) kg",
                                 icon: "\(group.item.speciesId)_swim_0", keepFish: group.item, keepMaterial: nil))
        }
        for kind in bag.materials.keys.sorted() {
            let count: Int = bag.materials[kind] ?? 0
            if count <= 0 { continue }
            let pickup: PickupPoint.Kind = PickupPoint.Kind(rawValue: kind) ?? PickupPoint.Kind.conchiglia
            let weight: Double = (DiveBag.materialWeights[kind] ?? 0.2) * Double(count)
            entries.append(Entry(title: "\(pickupName(pickup))  ×\(count)", detail: "\(Fmt.one(weight)) kg",
                                 icon: "pickup_\(kind)", keepFish: nil, keepMaterial: kind))
        }
        if entries.count > 12 { entries = Array(entries.prefix(12)) }
    }

    /// Disegna il riepilogo. Ritorna la sacca che Tecla porta a casa quando il giocatore conferma.
    func draw(_ app: App, _ ui: UI) -> DiveBag? {
        let g: Canvas = ui.g
        let safe: Rect = app.safe
        let cardW: Int = min(350, safe.w - 16)
        let cardH: Int = min(208, safe.h - 8)
        let card: Rect = Rect(safe.midX - cardW / 2, safe.midY - cardH / 2, cardW, cardH)
        ui.card(card)
        g.text(title, x: card.midX, y: card.y + 9, Theme.ink, align: TextAlign.center, scale: 2)
        g.paragraph(subtitle, x: card.x + 10, y: card.y + 30, width: card.w - 20, Theme.muted, align: TextAlign.center, maxLines: 2)
        var hint: String = ""
        if entries.isEmpty {
            hint = "Nessun bottino stavolta."
        } else if fainted {
            hint = "Puoi tenere un solo oggetto: scegli quale. Il resto va perso."
        }
        if !hint.isEmpty { g.text(hint, x: card.midX, y: card.y + 53, entries.isEmpty ? Theme.muted : Theme.terracotta, align: TextAlign.center) }

        // Al massimo dodici voci, su due colonne.
        let columns: Int = entries.count > 6 ? 2 : 1
        let perColumn: Int = columns == 2 ? (entries.count + 1) / 2 : max(entries.count, 1)
        let gap: Int = 5
        let rowW: Int = (card.w - 20 - gap * (columns - 1)) / columns
        let listTop: Int = card.y + 66
        let available: Int = card.h - 66 - 36
        let rowH: Int = min(19, max(13, available / max(perColumn, 1) - 2))
        var index: Int = 0
        while index < entries.count {
            let entry: Entry = entries[index]
            let column: Int = index / perColumn
            let row: Rect = Rect(card.x + 10 + column * (rowW + gap), listTop + (index % perColumn) * (rowH + 2), rowW, rowH)
            let chosen: Bool = fainted && index == selected
            if fainted {
                let press: UI.Press = ui.press("bottino.\(index)", row)
                if press.clicked { selected = index }
                if press.focused { ui.focusRing(row) }
            }
            g.roundRect(row, radius: 3, chosen ? Theme.ochre : Theme.shade.withAlpha(150))
            let icon: Image = Sprites.shared.get(entry.icon)
            let old: Rect = g.pushClip(Rect(row.x + 2, row.y, 26, row.h))
            g.draw(icon, x: row.x + 15 - icon.width / 2, y: row.midY - icon.height / 2)
            g.restoreClip(old)
            g.text(entry.title, x: row.x + 32, y: row.midY - 3, Theme.ink)
            g.text(entry.detail, x: row.maxX - 5, y: row.midY - 3, Theme.muted, align: TextAlign.right)
            index += 1
        }
        if ui.button("bottino.ok", Rect(card.midX - 60, card.maxY - 31, 120, 24), fainted && !entries.isEmpty ? "Tieni questo" : "Continua") {
            var kept: DiveBag = bag
            if fainted {
                kept.fish = []
                kept.materials = [:]
                if selected < entries.count {
                    if let item: CatchItem = entries[selected].keepFish {
                        kept.fish = [item]
                    } else if let kind: String = entries[selected].keepMaterial {
                        kept.materials[kind] = 1
                    }
                }
            }
            return kept
        }
        return nil
    }
}
