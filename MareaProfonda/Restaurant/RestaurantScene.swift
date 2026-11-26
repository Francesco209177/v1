import SpriteKit
import UIKit

/// Il servizio della sera all'osteria. La logica è in `ServiceSim`; qui la sala, i personaggi,
/// i fumetti dei clienti, il gioco del vino e l'HUD.
final class RestaurantScene: BaseScene {

    struct Config {
        var setup: ServiceSetup
        /// Sprite dell'ospite speciale (pinuccio, critico).
        var vipSprite: String = "pinuccio"
        /// true nella prova automatica: serve un cameriere automatico.
        var autopilot: Bool = false
    }

    private final class CustomerView {
        let node: SKNode = SKNode()
        let sprite: SKSpriteNode
        let bubble: SKSpriteNode = SpriteForge.shared.node("bubble")
        let bubbleIcon: SKSpriteNode = SKSpriteNode()
        let wineIcon: SKSpriteNode = SpriteForge.shared.node("icon_wine")
        let patienceBack: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0x2A1A1E), size: CGSize(width: 18, height: 3))
        let patienceFill: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0x58C070), size: CGSize(width: 16, height: 1))
        let prefix: String
        var clock: Double = 0
        var lastPhase: CustomerPhase = CustomerPhase.arriving

        init(prefix: String) {
            self.prefix = prefix
            sprite = SpriteForge.shared.node("\(prefix)_walk_0")
            node.addChild(sprite)
            bubble.position = CGPoint(x: 2, y: 34)
            bubble.zPosition = 20
            bubble.isHidden = true
            node.addChild(bubble)
            bubbleIcon.zPosition = 21
            bubbleIcon.position = CGPoint(x: 6, y: 44)
            bubbleIcon.isHidden = true
            node.addChild(bubbleIcon)
            wineIcon.zPosition = 21
            wineIcon.position = CGPoint(x: -10, y: 40)
            wineIcon.isHidden = true
            node.addChild(wineIcon)
            patienceBack.anchorPoint = CGPoint(x: 0, y: 0.5)
            patienceBack.position = CGPoint(x: -5, y: 31)
            patienceBack.zPosition = 21
            patienceBack.isHidden = true
            node.addChild(patienceBack)
            patienceFill.anchorPoint = CGPoint(x: 0, y: 0.5)
            patienceFill.position = CGPoint(x: -4, y: 31)
            patienceFill.zPosition = 22
            patienceFill.isHidden = true
            node.addChild(patienceFill)
        }
    }

    private let config: Config
    private var sim: ServiceSim
    private var bot: ServiceBot = ServiceBot(pourSkill: 0.95)
    private var fx: SeededRNG = SeededRNG(seed: 4242)

    // Sala
    private let room: SKNode = SKNode()
    private let ines: SKSpriteNode = SpriteForge.shared.node("ines_cook_0")
    private let tecla: SKSpriteNode = SpriteForge.shared.node("tecla_stand_0")
    private var tableSprites: [SKSpriteNode] = []
    private var tablePlates: [SKSpriteNode] = []
    private var passPlates: [SKSpriteNode] = []
    private var customerViews: [Int: CustomerView] = [:]
    private var frames: [String: [SKTexture]] = [:]
    private var teclaClock: Double = 0
    private var inesClock: Double = 0
    private var inesShout: Double = 0

    // HUD
    private let controls: TouchControls = TouchControls()
    private let topPanel: SKShapeNode = SKShapeNode()
    private let timerLabel: PixelLabel = PixelLabel(text: "0:00", color: SKColor.white, alignment: PixelLabel.Alignment.left)
    private let coinIcon: SKSpriteNode = SpriteForge.shared.node("icon_coin")
    private let goldLabel: PixelLabel = PixelLabel(text: "0", color: SKColor(hex: 0xFFE27A), alignment: PixelLabel.Alignment.left)
    private let comboLabel: PixelLabel = PixelLabel(text: "", color: SKColor(hex: 0xFF8A60), alignment: PixelLabel.Alignment.left)
    private var dishIcons: [SKSpriteNode] = []
    private var dishCounts: [PixelLabel] = []
    private var dishIds: [String] = []
    private let prompt: SKNode = SKNode()
    private let promptBody: SKShapeNode = SKShapeNode()
    private let promptLabel: SKLabelNode = Theme.label("", size: 13, weight: UIFont.Weight.bold, color: Theme.ink)
    private var promptText: String = ""
    private let toast: SKLabelNode = Theme.label("", size: 16, weight: UIFont.Weight.bold, color: Theme.lime)

    // Gioco del vino
    private let pourPanel: SKNode = SKNode()
    private let pourGlass: SKShapeNode = SKShapeNode()
    private let pourFill: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0x9A2848), size: CGSize(width: 10, height: 10))
    private let pourZone: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0x58C070, alpha: 0.55), size: CGSize(width: 10, height: 10))
    private let pourHint: SKLabelNode = Theme.label(String(localized: "Tieni premuto e molla nella fascia verde"), size: 12, weight: UIFont.Weight.bold, color: Theme.lime)
    private let pourGlassSize: CGSize = CGSize(width: 46, height: 92)

    private let pause: PauseOverlay = PauseOverlay(secondaryTitle: String(localized: "Chiudi l'osteria"))
    private var userPaused: Bool = false
    private var closing: Bool = false
    private var cameraX: Double = 0
    private var shownGold: Int = -1
    private var shownTime: Int = -1
    private var shownCombo: Int = -1

    /// Chiamata a servizio concluso.
    var onFinished: ((ServiceResult) -> Void)?

    init(size: CGSize, config: Config) {
        self.config = config
        sim = ServiceSim(setup: config.setup)
        super.init(size: size)
    }

    required init?(coder aDecoder: NSCoder) {
        return nil
    }

    /// Negli interni la camera è più vicina: personaggi più grandi ed espressivi.
    override var targetArtHeight: Double { return 156 }

    private func textures(_ prefix: String) -> [SKTexture] {
        if let cached: [SKTexture] = frames[prefix] { return cached }
        let loaded: [SKTexture] = SpriteForge.shared.frames(prefix)
        frames[prefix] = loaded
        return loaded
    }

    // MARK: - Costruzione

    override func setup() {
        backgroundColor = SKColor(hex: 0x1A1216)
        ControllerSupport.shared.start()
        let forge: SpriteForge = SpriteForge.shared
        world.addChild(room)

        let roomWidth: Double = sim.doorX + 64
        // Pavimento e pareti.
        var x: Double = -32
        while x < roomWidth + 32 {
            let tile: SKSpriteNode = forge.node("room_floor")
            tile.position = CGPoint(x: x, y: 0)
            tile.zPosition = 0
            room.addChild(tile)
            x += 32
        }
        let kitchen: SKSpriteNode = forge.node("room_kitchen")
        kitchen.position = CGPoint(x: -16, y: 0)
        kitchen.zPosition = 0
        room.addChild(kitchen)
        let front: SKSpriteNode = forge.node("room_kitchen_front")
        front.position = CGPoint(x: -16, y: 0)
        front.zPosition = 3
        room.addChild(front)
        x = 104
        var variant: Int = 0
        while x < sim.doorX - 4 {
            let wall: SKSpriteNode = forge.node("room_wall\(variant % 2)")
            wall.position = CGPoint(x: x, y: 0)
            wall.zPosition = 0
            room.addChild(wall)
            x += 64
            variant += 1
        }
        let door: SKSpriteNode = forge.node("room_door")
        door.position = CGPoint(x: x, y: 0)
        door.zPosition = 0
        room.addChild(door)
        let leftWall: SKSpriteNode = forge.node("room_wall1")
        leftWall.position = CGPoint(x: -80, y: 0)
        room.addChild(leftWall)

        // Arredi alle pareti, a ritmo regolare.
        let decor: [String] = ["room_lantern", "room_window", "room_lantern", "room_shelf", "room_garlic", "room_picture"]
        var d: Int = 0
        var dx: Double = 132
        while dx < sim.doorX - 30 {
            let name: String = decor[d % decor.count]
            let item: SKSpriteNode = forge.node(name)
            let top: CGFloat = name == "room_lantern" || name == "room_garlic" ? 96 : (name == "room_window" ? 92 : 84)
            item.position = CGPoint(x: dx, y: Double(top))
            item.zPosition = 1
            room.addChild(item)
            if name == "room_lantern" {
                let glow: SKSpriteNode = SKSpriteNode(texture: RestaurantScene.glowTexture)
                glow.size = CGSize(width: 96, height: 96)
                glow.position = CGPoint(x: dx, y: 80)
                glow.zPosition = 12
                glow.blendMode = SKBlendMode.add
                glow.alpha = 0.34
                room.addChild(glow)
                glow.run(SKAction.repeatForever(SKAction.sequence([
                    SKAction.fadeAlpha(to: 0.26, duration: 0.9 + Double(d) * 0.13),
                    SKAction.fadeAlpha(to: 0.36, duration: 0.7 + Double(d) * 0.11)
                ])))
            }
            dx += name == "room_window" ? 66 : 52
            d += 1
        }

        // Nonna Ines dietro il passavivande, la botte del vino.
        ines.position = CGPoint(x: 62, y: 30)
        ines.zPosition = 2
        room.addChild(ines)
        let barrel: SKSpriteNode = forge.node("room_barrel")
        barrel.position = CGPoint(x: ServiceSim.barrelX, y: -3)
        barrel.zPosition = 4
        room.addChild(barrel)

        // Piatti pronti sulla mensola.
        var p: Int = 0
        while p < 4 {
            let plate: SKSpriteNode = SKSpriteNode()
            plate.anchorPoint = CGPoint(x: 0.5, y: 0)
            plate.position = CGPoint(x: 18 + Double(p) * 18, y: 38)
            plate.zPosition = 5
            plate.isHidden = true
            room.addChild(plate)
            passPlates.append(plate)
            p += 1
        }

        // Il personale assunto sta in sala, vicino alla botte: lavora da sé, ma si vede che c'è.
        var staffIndex: Int = 0
        for name in config.setup.staffSprites.prefix(4) where forge.has("\(name)_walk_0") {
            let helper: SKSpriteNode = forge.node("\(name)_walk_0")
            helper.position = CGPoint(x: 128 + Double(staffIndex) * 20, y: 8)
            helper.zPosition = 2
            helper.run(SKAction.repeatForever(SKAction.sequence([
                SKAction.moveBy(x: 0, y: 1, duration: 0.5 + Double(staffIndex) * 0.07),
                SKAction.moveBy(x: 0, y: -1, duration: 0.5 + Double(staffIndex) * 0.07)
            ])))
            room.addChild(helper)
            staffIndex += 1
        }

        // Tavoli con la loro sedia.
        for table in sim.tables {
            let chair: SKSpriteNode = forge.node("room_chair")
            chair.position = CGPoint(x: table.x + 22, y: -4)
            chair.zPosition = 4
            room.addChild(chair)
            let sprite: SKSpriteNode = forge.node("room_table")
            sprite.position = CGPoint(x: table.x, y: -4)
            sprite.zPosition = 6
            room.addChild(sprite)
            tableSprites.append(sprite)
            let plate: SKSpriteNode = SKSpriteNode()
            plate.anchorPoint = CGPoint(x: 0.5, y: 0)
            plate.position = CGPoint(x: table.x + 4, y: 21)
            plate.zPosition = 7
            plate.isHidden = true
            room.addChild(plate)
            tablePlates.append(plate)
        }

        tecla.zPosition = 9
        room.addChild(tecla)

        // HUD
        topPanel.fillColor = Theme.ink.withAlphaComponent(0.55)
        topPanel.strokeColor = SKColor.clear
        hud.addChild(topPanel)
        for label in [timerLabel, goldLabel, comboLabel] {
            label.zPosition = 1
            label.shadowColor = SKColor(hex: 0x120C10)
            hud.addChild(label)
        }
        coinIcon.zPosition = 1
        hud.addChild(coinIcon)
        for dish in config.setup.dishes {
            let kind: String = GameData.shared.recipes.find(dish.recipeId)?.plate ?? "fried"
            let icon: SKSpriteNode = forge.node("plate_\(kind)")
            icon.anchorPoint = CGPoint(x: 0.5, y: 0.5)
            icon.zPosition = 1
            hud.addChild(icon)
            dishIcons.append(icon)
            let count: PixelLabel = PixelLabel(text: "0", color: SKColor.white, alignment: PixelLabel.Alignment.left)
            count.zPosition = 1
            count.shadowColor = SKColor(hex: 0x120C10)
            hud.addChild(count)
            dishCounts.append(count)
            dishIds.append(dish.recipeId)
        }
        prompt.isHidden = true
        prompt.zPosition = 4
        promptBody.fillColor = Theme.lime.withAlphaComponent(0.95)
        promptBody.strokeColor = SKColor.clear
        prompt.addChild(promptBody)
        promptLabel.zPosition = 1
        prompt.addChild(promptLabel)
        hud.addChild(prompt)
        toast.alpha = 0
        toast.zPosition = 6
        hud.addChild(toast)

        // Gioco del vino: un bicchiere grande al centro.
        pourPanel.isHidden = true
        pourPanel.zPosition = 8
        pourGlass.path = CGPath(roundedRect: CGRect(x: -pourGlassSize.width / 2 - 4, y: -pourGlassSize.height / 2 - 4,
                                                    width: pourGlassSize.width + 8, height: pourGlassSize.height + 8),
                                cornerWidth: 10, cornerHeight: 10, transform: nil)
        pourGlass.fillColor = Theme.ink.withAlphaComponent(0.7)
        pourGlass.strokeColor = Theme.lime
        pourGlass.lineWidth = 3
        pourPanel.addChild(pourGlass)
        pourZone.anchorPoint = CGPoint(x: 0.5, y: 0)
        pourZone.zPosition = 1
        pourPanel.addChild(pourZone)
        pourFill.anchorPoint = CGPoint(x: 0.5, y: 0)
        pourFill.zPosition = 2
        pourPanel.addChild(pourFill)
        pourHint.zPosition = 2
        pourHint.position = CGPoint(x: 0, y: -pourGlassSize.height / 2 - 24)
        pourPanel.addChild(pourHint)
        hud.addChild(pourPanel)

        controls.zPosition = 10
        controls.configure(actions: [GameButtons.interact, GameButtons.pause])
        hud.addChild(controls)

        pause.zPosition = 600
        pause.onResume = { [weak self] in self?.setPaused(false) }
        pause.onSecondary = { [weak self] in self?.finish() }
        hud.addChild(pause)

        cameraX = clampCamera(sim.teclaX)
        setCamera(x: cameraX, y: 36)
        refresh(dt: 0)
    }

    /// Alone caldo delle lanterne: un cerchio sfumato dipinto una volta sola.
    private static let glowTexture: SKTexture = {
        let size: Int = 64
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
                    image.set(x, y, RGBA(r: 255, g: 196, b: 110, a: UInt8(max(0, min(255, a * 255)))))
                }
                x += 1
            }
            y += 1
        }
        return TextureFactory.texture(from: image, filtering: SKTextureFilteringMode.linear)
    }()

    override func layoutHUD() {
        let safe: CGRect = hudSafeRect
        let unit: CGFloat = hudIconScale(1.0)
        controls.layout(safe: safe, iconScale: hudIconScale(2.0))
        pause.layout(sceneSize: size, pixelScale: unit)

        let panelWidth: CGFloat = min(safe.width - 70, 150 + CGFloat(dishIcons.count) * 58)
        let panelHeight: CGFloat = 34
        let origin: CGPoint = CGPoint(x: safe.minX, y: safe.maxY - panelHeight)
        topPanel.path = CGPath(roundedRect: CGRect(x: origin.x, y: origin.y, width: panelWidth, height: panelHeight),
                               cornerWidth: 12, cornerHeight: 12, transform: nil)
        let midY: CGFloat = origin.y + panelHeight / 2
        let textScale: CGFloat = hudIconScale(2.0)
        timerLabel.setScale(textScale)
        timerLabel.position = CGPoint(x: origin.x + 12, y: midY - 3.5 * textScale)
        coinIcon.setScale(textScale)
        coinIcon.position = CGPoint(x: origin.x + 66, y: midY)
        goldLabel.setScale(textScale)
        goldLabel.position = CGPoint(x: origin.x + 78, y: midY - 3.5 * textScale)
        var i: Int = 0
        while i < dishIcons.count {
            let x: CGFloat = origin.x + 142 + CGFloat(i) * 58
            dishIcons[i].setScale(textScale)
            dishIcons[i].position = CGPoint(x: x, y: midY)
            dishCounts[i].setScale(textScale)
            dishCounts[i].position = CGPoint(x: x + 18, y: midY - 3.5 * textScale)
            i += 1
        }
        comboLabel.alignment = PixelLabel.Alignment.center
        comboLabel.setScale(hudIconScale(3.0))
        comboLabel.position = CGPoint(x: 0, y: origin.y - 30)
        toast.position = CGPoint(x: 0, y: safe.maxY - safe.height * 0.30)
        pourPanel.position = CGPoint(x: 0, y: 6)
        let zoneHeight: CGFloat = pourGlassSize.height * CGFloat(ServiceSim.pourLimit - (ServiceSim.pourTarget - 0.06))
        pourZone.size = CGSize(width: pourGlassSize.width, height: zoneHeight)
        pourZone.position = CGPoint(x: 0, y: -pourGlassSize.height / 2 + pourGlassSize.height * CGFloat(ServiceSim.pourTarget - 0.06))
    }

    // MARK: - Ciclo

    override func tick(_ dt: Double) {
        let input: InputManager = InputManager.shared
        input.beginFrame()
        if closing { return }
        if input.pressed.contains(GameButtons.pause) { setPaused(!userPaused) }
        if userPaused {
            if input.pressed.contains(GameButtons.interact) { setPaused(false) }
            return
        }
        GameSession.shared.addPlayTime(dt)

        var command: ServiceInput = ServiceInput()
        command.moveX = input.move.x
        command.interact = input.pressed.contains(GameButtons.interact) || input.pressed.contains(GameButtons.primary)
        command.pourHeld = input.held.contains(GameButtons.interact) || input.held.contains(GameButtons.primary)
        if config.autopilot { command = bot.decide(sim, dt: dt) }

        let events: [ServiceEvent] = sim.step(input: command, dt: dt)
        handle(events)
        refresh(dt: dt)

        if sim.finished { finish() }
    }

    private func clampCamera(_ x: Double) -> Double {
        let half: Double = Double(artSize.width) / 2
        let minX: Double = -16 + half
        let maxX: Double = sim.doorX + 64 - half
        if maxX < minX { return (minX + maxX) / 2 }
        return MathUtil.clamp(x, minX, maxX)
    }

    private func refresh(dt: Double) {
        // Tecla
        let teclaFrames: [SKTexture]
        var rate: Double = 6
        if sim.cleaning > 0 {
            teclaFrames = textures("tecla_clean")
            rate = 10
        } else if sim.pouring {
            teclaFrames = textures("tecla_pour")
        } else {
            var hasDish: Bool = false
            var hasWine: Bool = false
            for item in sim.carrying {
                if case Carried.dish = item { hasDish = true }
                if case Carried.wine = item { hasWine = true }
            }
            if sim.isWalking {
                teclaFrames = textures(hasDish ? "tecla_carry" : (hasWine ? "tecla_carrywine" : "tecla_walk"))
                rate = 11
            } else {
                teclaFrames = textures(hasDish ? "tecla_hold" : (hasWine ? "tecla_pour" : "tecla_stand"))
                rate = 3
            }
        }
        teclaClock += dt * rate
        if !teclaFrames.isEmpty {
            let texture: SKTexture = teclaFrames[Int(teclaClock) % teclaFrames.count]
            if tecla.texture !== texture { tecla.texture = texture }
        }
        tecla.xScale = sim.facingRight ? 1 : -1
        tecla.position = CGPoint(x: layout.snap(sim.teclaX), y: -18)

        // Nonna Ines: mescola, e strilla quando un piatto è pronto.
        inesClock += dt * 5
        if inesShout > 0 { inesShout -= dt }
        let inesFrames: [SKTexture] = textures(inesShout > 0 ? "ines_shout" : "ines_cook")
        if !inesFrames.isEmpty {
            let texture: SKTexture = inesFrames[Int(inesClock) % inesFrames.count]
            if ines.texture !== texture { ines.texture = texture }
        }

        // Passavivande
        var p: Int = 0
        while p < passPlates.count {
            if p < sim.pass.count {
                let kind: String = GameData.shared.recipes.find(sim.pass[p].dishId)?.plate ?? "fried"
                let name: String = "plate_\(kind)"
                passPlates[p].texture = SpriteForge.shared.texture(name)
                passPlates[p].size = SpriteForge.shared.pixelSize(name)
                passPlates[p].isHidden = false
            } else {
                passPlates[p].isHidden = true
            }
            p += 1
        }

        // Tavoli
        var t: Int = 0
        while t < sim.tables.count && t < tableSprites.count {
            let name: String = sim.tables[t].dirty ? "room_table_dirty" : "room_table"
            let texture: SKTexture = SpriteForge.shared.texture(name)
            if tableSprites[t].texture !== texture { tableSprites[t].texture = texture }
            tablePlates[t].isHidden = true
            t += 1
        }

        // Clienti
        var present: Set<Int> = []
        for customer in sim.customers {
            present.insert(customer.id)
            let view: CustomerView
            if let existing: CustomerView = customerViews[customer.id] {
                view = existing
            } else {
                let prefix: String = customer.look >= 100 ? config.vipSprite : "cust\(customer.look % 8)"
                view = CustomerView(prefix: prefix)
                room.addChild(view.node)
                customerViews[customer.id] = view
            }
            update(view: view, customer: customer, dt: dt)
        }
        for (id, view) in customerViews where !present.contains(id) {
            view.node.removeFromParent()
            customerViews[id] = nil
        }

        // Camera
        cameraX = MathUtil.damp(cameraX, clampCamera(sim.teclaX + (sim.facingRight ? 26 : -26)), rate: 4, dt: max(dt, 0.001))
        setCamera(x: cameraX, y: 36)

        refreshHUD()
    }

    private func update(view: CustomerView, customer: Customer, dt: Double) {
        if customer.phase != view.lastPhase {
            view.lastPhase = customer.phase
            view.clock = 0
        }
        var prefix: String
        var rate: Double = 3
        var seated: Bool = true
        switch customer.phase {
        case .arriving:
            prefix = "\(view.prefix)_walk"
            rate = 8
            seated = false
        case .waitingToOrder, .waitingFood:
            prefix = customer.patience < 0.3 ? "\(view.prefix)_angry" : "\(view.prefix)_sit"
        case .eating:
            prefix = "\(view.prefix)_eat"
            rate = 5
        case .leavingHappy:
            prefix = "\(view.prefix)_walk"
            rate = 8
            seated = false
        case .leavingAngry:
            prefix = "\(view.prefix)_walk"
            rate = 10
            seated = false
        }
        view.clock += dt * rate
        let frames: [SKTexture] = textures(prefix)
        if !frames.isEmpty {
            let texture: SKTexture = frames[Int(view.clock) % frames.count]
            if view.sprite.texture !== texture { view.sprite.texture = texture }
        }
        // Seduti guardano il tavolo (a sinistra); in piedi camminano nella loro direzione.
        let goingOut: Bool = customer.phase == CustomerPhase.leavingHappy || customer.phase == CustomerPhase.leavingAngry
        view.sprite.xScale = goingOut ? 1 : -1
        view.node.position = CGPoint(x: layout.snap(customer.x), y: seated ? -2 : -10)
        view.node.zPosition = seated ? 5 : 8

        // Fumetto: vuole ordinare, oppure aspetta un piatto.
        var showBubble: Bool = false
        if customer.phase == CustomerPhase.waitingToOrder {
            showBubble = true
            setIcon(view.bubbleIcon, "icon_order")
        } else if customer.phase == CustomerPhase.waitingFood, let dish: String = customer.dishId {
            showBubble = true
            let kind: String = GameData.shared.recipes.find(dish)?.plate ?? "fried"
            setIcon(view.bubbleIcon, "plate_\(kind)")
        }
        view.bubble.isHidden = !showBubble
        view.bubbleIcon.isHidden = !showBubble
        view.patienceBack.isHidden = !showBubble
        view.patienceFill.isHidden = !showBubble
        if showBubble {
            let ratio: CGFloat = CGFloat(MathUtil.clamp(customer.patience, 0, 1))
            view.patienceFill.size = CGSize(width: 16 * ratio, height: 1)
            view.patienceFill.color = ratio > 0.5 ? SKColor(hex: 0x58C070) : (ratio > 0.25 ? SKColor(hex: 0xF2B830) : SKColor(hex: 0xE5484D))
        }
        let wantsWine: Bool = customer.wantsWine && !customer.wineServed
            && (customer.phase == CustomerPhase.waitingFood || customer.phase == CustomerPhase.eating)
        view.wineIcon.isHidden = !wantsWine

        if customer.phase == CustomerPhase.eating, customer.table < tablePlates.count, let dish: String = customer.dishId {
            let kind: String = GameData.shared.recipes.find(dish)?.plate ?? "fried"
            let name: String = "plate_\(kind)"
            tablePlates[customer.table].texture = SpriteForge.shared.texture(name)
            tablePlates[customer.table].size = SpriteForge.shared.pixelSize(name)
            tablePlates[customer.table].isHidden = false
        }
    }

    private func setIcon(_ node: SKSpriteNode, _ name: String) {
        let texture: SKTexture = SpriteForge.shared.texture(name)
        if node.texture !== texture {
            node.texture = texture
            node.size = SpriteForge.shared.pixelSize(name)
        }
    }

    private func refreshHUD() {
        let seconds: Int = Int(sim.timeLeft.rounded(.up))
        if seconds != shownTime {
            shownTime = seconds
            timerLabel.text = String(format: "%d:%02d", seconds / 60, seconds % 60)
            timerLabel.color = seconds <= 15 ? SKColor(hex: 0xFF8A80) : SKColor.white
        }
        let gold: Int = sim.result.total
        if gold != shownGold {
            shownGold = gold
            goldLabel.text = "\(gold)"
        }
        if sim.combo != shownCombo {
            shownCombo = sim.combo
            comboLabel.text = sim.combo >= 2 ? "COMBO ×\(sim.combo)" : ""
        }
        var i: Int = 0
        while i < dishIds.count {
            let left: Int = sim.portions[dishIds[i]] ?? 0
            dishCounts[i].text = "\(left)"
            dishCounts[i].color = left == 0 ? SKColor(hex: 0x9A8A80) : SKColor.white
            dishIcons[i].alpha = left == 0 ? 0.4 : 1
            i += 1
        }

        // Suggerimento dell'azione sopra la testa di Tecla.
        var text: String? = nil
        if let action: ServiceAction = sim.availableAction() {
            switch action {
            case .takeOrder: text = String(localized: "Prendi l'ordine")
            case .serveDish: text = String(localized: "Servi")
            case .serveWine: text = String(localized: "Servi il vino")
            case .clean: text = String(localized: "Pulisci")
            case .pickUp: text = String(localized: "Prendi il piatto")
            case .pour: text = String(localized: "Spilla il vino")
            }
        }
        if let text: String = text {
            prompt.isHidden = false
            if text != promptText {
                promptText = text
                promptLabel.attributedText = Theme.attributed(text, size: 13, weight: UIFont.Weight.bold, color: Theme.ink)
                let width: CGFloat = promptLabel.frame.width + 26
                promptBody.path = CGPath(roundedRect: CGRect(x: -width / 2, y: -13, width: width, height: 26), cornerWidth: 13, cornerHeight: 13, transform: nil)
            }
            let k: CGFloat = CGFloat(layout.pointsPerArtPixel)
            prompt.position = CGPoint(x: (tecla.position.x - cam.position.x) * k, y: (tecla.position.y - cam.position.y) * k + 40 * k)
        } else {
            prompt.isHidden = true
        }

        pourPanel.isHidden = !sim.pouring
        if sim.pouring {
            let level: CGFloat = CGFloat(MathUtil.clamp(sim.pourLevel, 0, 1))
            pourFill.size = CGSize(width: pourGlassSize.width, height: max(1, pourGlassSize.height * level))
            pourFill.position = CGPoint(x: 0, y: -pourGlassSize.height / 2)
        }
    }

    // MARK: - Eventi

    private func showToast(_ text: String, color: SKColor) {
        toast.attributedText = Theme.attributed(text, size: 16, weight: UIFont.Weight.bold, color: color)
        toast.removeAllActions()
        toast.alpha = 0
        toast.run(SKAction.sequence([SKAction.fadeIn(withDuration: 0.12), SKAction.wait(forDuration: 1.2), SKAction.fadeOut(withDuration: 0.4)]))
    }

    private func pop(_ icon: String, text: String?, at x: Double, color: SKColor) {
        let holder: SKNode = SKNode()
        holder.position = CGPoint(x: x, y: 40)
        holder.zPosition = 30
        let sprite: SKSpriteNode = SpriteForge.shared.node(icon)
        holder.addChild(sprite)
        if let text: String = text {
            let label: PixelLabel = PixelLabel(text: text, color: color, alignment: PixelLabel.Alignment.left)
            label.shadowColor = SKColor(hex: 0x120C10)
            label.position = CGPoint(x: 7, y: -3)
            holder.addChild(label)
        }
        room.addChild(holder)
        let rise: SKAction = SKAction.moveBy(x: 0, y: 18, duration: 0.8)
        rise.timingMode = SKActionTimingMode.easeOut
        holder.run(SKAction.sequence([
            SKAction.group([rise, SKAction.sequence([SKAction.wait(forDuration: 0.5), SKAction.fadeOut(withDuration: 0.3)])]),
            SKAction.removeFromParent()
        ]))
    }

    private func handle(_ events: [ServiceEvent]) {
        for event in events {
            switch event {
            case .customerArrived:
                Feedback.tap()
            case .orderTaken:
                Feedback.tap()
            case .dishReady:
                inesShout = 0.9
                Feedback.tap()
            case .pickedUp:
                Feedback.tap()
            case .served(let table, let gold, let tip):
                Feedback.success()
                pop("icon_coin", text: "+\(gold + tip)", at: sim.tables[table].x, color: SKColor(hex: 0xFFE27A))
            case .wineServed(let table, let perfect, let gold):
                Feedback.hit()
                pop(perfect ? "icon_heart" : "icon_coin", text: "+\(gold)", at: sim.tables[table].x, color: SKColor(hex: 0xFFE27A))
            case .tableCleaned:
                Feedback.tap()
            case .leftAngry(let table):
                Feedback.thud()
                pop("icon_anger", text: nil, at: sim.tables[table].x + 14, color: SKColor.white)
                showToast(String(localized: "Un cliente se n'è andato arrabbiato"), color: Theme.danger)
            case .leftEmptyHanded:
                showToast(String(localized: "Finito tutto: il cliente torna un'altra sera"), color: Theme.ochre)
            case .pourStarted:
                Feedback.tap()
            case .pourSpilled:
                Feedback.thud()
                showToast(String(localized: "Traboccato! Riprova"), color: Theme.danger)
            case .pourTooLittle:
                showToast(String(localized: "Troppo poco: riempi fino alla fascia verde"), color: Theme.ochre)
            case .pourDone(let perfect):
                Feedback.success()
                if perfect { showToast(String(localized: "Versata perfetta!"), color: Theme.turquoise) }
            case .comboLost:
                break
            case .vipDelighted:
                Feedback.success()
                showToast(String(localized: "L'ospite speciale è entusiasta!"), color: Theme.ochre)
            case .closed:
                break
            case .staffHelped:
                Feedback.tap()
            }
        }
    }

    // MARK: - Pausa e chiusura

    private func setPaused(_ value: Bool) {
        userPaused = value
        room.isPaused = value
        pause.isHidden = !value
        controls.releaseAll()
        controls.isHidden = value
    }

    func pauseForBackground() {
        if !userPaused && !closing { setPaused(true) }
    }

    private func finish() {
        if closing { return }
        closing = true
        controls.releaseAll()
        controls.isHidden = true
        pause.isHidden = true
        prompt.isHidden = true
        pourPanel.isHidden = true
        onFinished?(sim.result)
    }

    // MARK: - Tocchi

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            let point: CGPoint = touch.location(in: hud)
            if userPaused {
                pause.touchBegan(at: point)
            } else if !closing {
                _ = controls.touchBegan(touch, at: point)
            }
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        if userPaused || closing { return }
        for touch in touches { controls.touchMoved(touch, at: touch.location(in: hud)) }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            if userPaused {
                pause.touchEnded(at: touch.location(in: hud))
            } else {
                controls.touchEnded(touch)
            }
        }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        pause.cancelTouch()
        for touch in touches { controls.touchEnded(touch) }
    }

    override var debugSummary: String {
        let r: ServiceResult = sim.result
        return "time=\(Int(sim.time)) clienti=\(sim.customers.count) serviti=\(r.served) persi=\(r.lost) oro=\(r.total) combo=\(r.bestCombo)"
    }
}
