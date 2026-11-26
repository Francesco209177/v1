import SpriteKit
import UIKit

/// Riproduttore delle scene della storia: un fondale, gli attori, il riquadro dei dialoghi
/// con il ritratto di chi parla. Un tocco completa la battuta, un altro passa alla successiva.
final class CutsceneScene: BaseScene {

    /// Un personaggio in scena.
    private final class Actor {
        let sprite: SKSpriteNode
        private var frames: [String: [SKTexture]] = [:]
        private(set) var pose: String = "stand"
        var x: Double
        var fromX: Double
        var toX: Double
        var moveTime: Double = 0
        var moveFor: Double = 0
        var baseY: Double
        let swims: Bool
        private var clock: Double = 0

        init(member: CastMember, x: Double, y: Double, swims: Bool) {
            let forge: SpriteForge = SpriteForge.shared
            var table: [String: [SKTexture]] = [:]
            for name in ["stand", "walk", "talk", "shock"] where forge.has("\(member.body)_\(name)_0") {
                table[name] = forge.frames("\(member.body)_\(name)")
            }
            sprite = forge.node("\(member.body)_stand_0")
            self.x = x
            fromX = x
            toX = x
            baseY = y
            self.swims = swims
            frames = table
        }

        func setPose(_ name: String) {
            pose = frames[name] != nil ? name : "stand"
            clock = 0
        }

        func walk(to target: Double, time: Double) {
            fromX = x
            toX = target
            moveTime = 0
            moveFor = max(time, 0.05)
            if abs(target - x) > 1 { sprite.xScale = target >= x ? 1 : -1 }
            setPose("walk")
        }

        var isMoving: Bool { return moveFor > 0 }

        func update(dt: Double, layout: PixelLayout) {
            clock += dt
            if moveFor > 0 {
                moveTime += dt
                let t: Double = MathUtil.clamp(moveTime / moveFor, 0, 1)
                x = fromX + (toX - fromX) * t
                if t >= 1 {
                    moveFor = 0
                    setPose("stand")
                }
            }
            let list: [SKTexture] = frames[pose] ?? frames["stand"] ?? []
            if !list.isEmpty {
                let rate: Double = pose == "walk" ? 9 : (pose == "talk" ? 5 : (pose == "shock" ? 7 : 2.4))
                let texture: SKTexture = list[Int(clock * rate) % list.count]
                if sprite.texture !== texture { sprite.texture = texture }
            }
            let bob: Double = swims ? sin(clock * 1.6) * 2.5 : 0
            sprite.position = CGPoint(x: layout.snap(x), y: layout.snap(baseY + bob))
        }
    }

    /// Chiamata alla fine della scena (o quando viene saltata).
    var onFinished: (() -> Void)?
    /// Avanzamento automatico, per la prova della CI: un tocco ogni tanti secondi.
    var autoAdvance: Double? = nil

    private let cutscene: Cutscene
    private var cursor: CutsceneCursor
    private var shownStep: Int = -1
    private var actors: [String: Actor] = [:]
    private var place: String
    private var finished: Bool = false
    private var autoClock: Double = 0

    // Fondale
    private let backdrop: SKNode = SKNode()
    private let water: SKSpriteNode = SKSpriteNode(texture: TextureFactory.white)
    private let rays: SKSpriteNode = SKSpriteNode(texture: TextureFactory.white)
    private let tint: SKSpriteNode = SKSpriteNode(color: SKColor.black, size: CGSize(width: 10, height: 10))
    private let fade: SKSpriteNode = SKSpriteNode(color: SKColor.black, size: CGSize(width: 10, height: 10))
    private let flash: SKSpriteNode = SKSpriteNode(color: SKColor.white, size: CGSize(width: 10, height: 10))
    private var groundY: Double = PortBackdrop.groundY
    private var shakeLeft: Double = 0
    private var fx: SeededRNG = SeededRNG(seed: 77)
    private var bubbleClock: Double = 0.6

    // Dialoghi
    private let box: SKShapeNode = SKShapeNode()
    private let nameTag: SKShapeNode = SKShapeNode()
    private let nameLabel: SKLabelNode = Theme.label("", size: 14, weight: UIFont.Weight.heavy, color: Theme.ink)
    private let textLabel: SKLabelNode = SKLabelNode()
    private let portrait: SKSpriteNode = SKSpriteNode()
    private let arrow: SKLabelNode = Theme.label("▼", size: 13, weight: UIFont.Weight.heavy, color: Theme.terracotta)
    private let skipButton: PillButton = PillButton(text: String(localized: "Salta"), size: CGSize(width: 86, height: 34),
                                                    fill: Theme.ink.withAlphaComponent(0.55), textColor: Theme.lime)
    private var skipPressed: Bool = false
    private var boxRect: CGRect = CGRect.zero
    private var textWidth: CGFloat = 300
    private var fullText: String = ""
    private var shownLetters: Int = -1
    private var narrating: Bool = false

    // Cartello a tutto schermo
    private let card: SKNode = SKNode()
    private let cardVeil: SKSpriteNode = SKSpriteNode(color: Theme.ink, size: CGSize(width: 10, height: 10))
    private let cardTitle: SKLabelNode = SKLabelNode()
    private let cardSub: SKLabelNode = SKLabelNode()
    private let cardHint: SKLabelNode = Theme.label(String(localized: "Tocca per continuare"), size: 12, weight: UIFont.Weight.semibold,
                                                    color: Theme.lime.withAlphaComponent(0.6))

    init(size: CGSize, cutscene: Cutscene) {
        self.cutscene = cutscene
        cursor = CutsceneCursor(scene: cutscene)
        place = cutscene.place
        super.init(size: size)
    }

    required init?(coder aDecoder: NSCoder) {
        return nil
    }

    /// Camera più vicina che al porto: i personaggi sono i protagonisti.
    override var targetArtHeight: Double { return 184 }

    // MARK: - Costruzione

    override func setup() {
        backgroundColor = SKColor(hex: 0x0E2238)
        ControllerSupport.shared.start()

        water.zPosition = -100
        water.shader = ShaderLibrary.water
        cam.addChild(water)
        rays.zPosition = -55
        rays.shader = ShaderLibrary.godRays
        rays.blendMode = SKBlendMode.add
        rays.isHidden = true
        cam.addChild(rays)
        tint.zPosition = 20
        tint.alpha = 0
        cam.addChild(tint)
        fade.zPosition = 300
        fade.alpha = 0
        cam.addChild(fade)
        flash.zPosition = 310
        flash.alpha = 0
        cam.addChild(flash)
        world.addChild(backdrop)
        buildPlace()

        for entry in cutscene.actors {
            guard let member: CastMember = GameData.shared.story.member(entry.who), !member.body.isEmpty else { continue }
            let swims: Bool = Cutscene.underwater.contains(place)
            let actor: Actor = Actor(member: member, x: entry.x, y: swims ? groundY + 44 : groundY, swims: swims)
            actor.sprite.zPosition = 6
            actor.sprite.xScale = (entry.left ?? false) ? -1 : 1
            actor.sprite.alpha = (entry.hidden ?? false) ? 0 : 1
            world.addChild(actor.sprite)
            actors[entry.who] = actor
        }

        // Riquadro dei dialoghi.
        box.fillColor = Theme.lime
        box.strokeColor = Theme.ink.withAlphaComponent(0.85)
        box.lineWidth = 2
        box.zPosition = 10
        hud.addChild(box)
        nameTag.strokeColor = SKColor.clear
        nameTag.zPosition = 11
        hud.addChild(nameTag)
        nameLabel.zPosition = 12
        nameLabel.horizontalAlignmentMode = SKLabelHorizontalAlignmentMode.left
        hud.addChild(nameLabel)
        textLabel.zPosition = 12
        textLabel.numberOfLines = 0
        textLabel.lineBreakMode = NSLineBreakMode.byWordWrapping
        textLabel.horizontalAlignmentMode = SKLabelHorizontalAlignmentMode.left
        textLabel.verticalAlignmentMode = SKLabelVerticalAlignmentMode.top
        hud.addChild(textLabel)
        portrait.zPosition = 13
        portrait.anchorPoint = CGPoint(x: 0.5, y: 0)
        hud.addChild(portrait)
        arrow.zPosition = 12
        arrow.run(SKAction.repeatForever(SKAction.sequence([
            SKAction.moveBy(x: 0, y: -3, duration: 0.35),
            SKAction.moveBy(x: 0, y: 3, duration: 0.35)
        ])))
        hud.addChild(arrow)
        skipButton.zPosition = 30
        hud.addChild(skipButton)

        card.zPosition = 40
        card.isHidden = true
        cardVeil.alpha = 0.94
        card.addChild(cardVeil)
        for label in [cardTitle, cardSub] {
            label.zPosition = 1
            label.numberOfLines = 0
            label.lineBreakMode = NSLineBreakMode.byWordWrapping
            label.horizontalAlignmentMode = SKLabelHorizontalAlignmentMode.center
            label.verticalAlignmentMode = SKLabelVerticalAlignmentMode.center
            card.addChild(label)
        }
        cardHint.zPosition = 1
        card.addChild(cardHint)
        hud.addChild(card)

        setDialogVisible(false)
        for (_, actor) in actors { actor.update(dt: 0, layout: layout) }
    }

    /// Costruisce il fondale del luogo corrente e sceglie la quota del suolo.
    private func buildPlace() {
        backdrop.removeAllChildren()
        rays.isHidden = true
        tint.alpha = 0
        water.isHidden = false
        let forge: SpriteForge = SpriteForge.shared
        let data: WorldData = GameData.shared.world

        switch place {
        case "porto_mattina", "porto_sera", "porto_notte", "mare":
            let phase: DayPhase = place == "porto_sera" ? DayPhase.evening : (place == "porto_notte" ? DayPhase.night : DayPhase.morning)
            backgroundColor = SKColor(PortBackdrop.skyStyle(phase).top)
            let sea: (top: RGBA, bottom: RGBA) = PortBackdrop.seaColors(phase)
            ShaderLibrary.setColor(ShaderLibrary.water, "u_top", sea.top)
            ShaderLibrary.setColor(ShaderLibrary.water, "u_bottom", sea.bottom)
            backdrop.addChild(PortBackdrop(phase: phase))
            let light: (color: SKColor, alpha: CGFloat) = PortBackdrop.tint(phase)
            tint.color = light.color
            tint.alpha = light.alpha
            groundY = PortBackdrop.groundY

        case "osteria":
            backgroundColor = SKColor(hex: 0x1A1216)
            water.isHidden = true
            let room: SKNode = SKNode()
            room.position = CGPoint(x: -214, y: 0)
            var x: Double = -64
            while x < 520 {
                let tile: SKSpriteNode = forge.node("room_floor")
                tile.position = CGPoint(x: x, y: 0)
                room.addChild(tile)
                let lower: SKSpriteNode = forge.node("room_floor")
                lower.position = CGPoint(x: x, y: -32)
                room.addChild(lower)
                x += 32
            }
            let kitchen: SKSpriteNode = forge.node("room_kitchen")
            kitchen.position = CGPoint(x: -16, y: 0)
            room.addChild(kitchen)
            let front: SKSpriteNode = forge.node("room_kitchen_front")
            front.position = CGPoint(x: -16, y: 0)
            front.zPosition = 3
            room.addChild(front)
            let leftWall: SKSpriteNode = forge.node("room_wall1")
            leftWall.position = CGPoint(x: -80, y: 0)
            room.addChild(leftWall)
            x = 104
            var variant: Int = 0
            while x < 360 {
                let wall: SKSpriteNode = forge.node("room_wall\(variant % 2)")
                wall.position = CGPoint(x: x, y: 0)
                room.addChild(wall)
                x += 64
                variant += 1
            }
            let door: SKSpriteNode = forge.node("room_door")
            door.position = CGPoint(x: x, y: 0)
            room.addChild(door)
            let decor: [(String, Double, Double)] = [("room_lantern", 136, 96), ("room_window", 196, 92), ("room_lantern", 262, 96),
                                                      ("room_shelf", 314, 84), ("room_garlic", 232, 96)]
            for (name, dx, top) in decor {
                let item: SKSpriteNode = forge.node(name)
                item.position = CGPoint(x: dx, y: top)
                item.zPosition = 1
                room.addChild(item)
                if name == "room_lantern" {
                    let glow: SKSpriteNode = SKSpriteNode(texture: PortBackdrop.glowTexture)
                    glow.size = CGSize(width: 96, height: 96)
                    glow.position = CGPoint(x: dx, y: 80)
                    glow.zPosition = 12
                    glow.blendMode = SKBlendMode.add
                    glow.alpha = 0.32
                    room.addChild(glow)
                }
            }
            let barrel: SKSpriteNode = forge.node("room_barrel")
            barrel.position = CGPoint(x: 120, y: -3)
            barrel.zPosition = 2
            room.addChild(barrel)
            for tx in [372.0] {
                let chair: SKSpriteNode = forge.node("room_chair")
                chair.position = CGPoint(x: tx + 22, y: -4)
                chair.zPosition = 2
                room.addChild(chair)
                let table: SKSpriteNode = forge.node("room_table")
                table.position = CGPoint(x: tx, y: -4)
                table.zPosition = 2
                room.addChild(table)
            }
            backdrop.addChild(room)
            groundY = -9

        default:
            // Sott'acqua: il colore dell'acqua della zona, un fondo di roccia dipinto come nelle immersioni.
            let depth: Double
            let props: [MapProp.Kind]
            var dark: CGFloat = 0
            switch place {
            case "relitto":
                depth = 28
                props = [MapProp.Kind.posidonia, MapProp.Kind.posidonia, MapProp.Kind.sponge]
            case "citta":
                depth = 290
                props = [MapProp.Kind.column, MapProp.Kind.column, MapProp.Kind.anemone]
                dark = 0.34
            case "fumarole":
                depth = 440
                props = [MapProp.Kind.vent, MapProp.Kind.crystal]
                dark = 0.46
            case "santuario":
                depth = 560
                props = [MapProp.Kind.crystal, MapProp.Kind.column, MapProp.Kind.crystal]
                dark = 0.30
            default:
                depth = 60
                props = [MapProp.Kind.gorgonia, MapProp.Kind.sponge, MapProp.Kind.posidonia]
            }
            backgroundColor = SKColor(data.waterColor(atDepth: depth))
            ShaderLibrary.setColor(ShaderLibrary.water, "u_top", data.waterColor(atDepth: max(depth - 8, 0)))
            ShaderLibrary.setColor(ShaderLibrary.water, "u_bottom", data.waterColor(atDepth: depth + 8))
            let light: Double = data.light(atDepth: depth)
            rays.isHidden = light < 0.25
            ShaderLibrary.setFloat(ShaderLibrary.godRays, "u_strength", 0.42 * pow(light, 1.7))
            ShaderLibrary.setFloat(ShaderLibrary.godRays, "u_offset", 0.1)
            tint.color = SKColor(hex: 0x020818)
            tint.alpha = dark
            groundY = -58
            buildSeabed(depthMeters: depth, props: props)
        }
        layoutCamera()
    }

    /// Un fondale di roccia lungo quanto la scena, dipinto con lo stile della zona a quella profondità.
    private func buildSeabed(depthMeters: Double, props: [MapProp.Kind]) {
        let data: WorldData = GameData.shared.world
        let ts: Int = data.pixelsPerMeter
        let cols: Int = 40
        let floorRow: Int = Int(depthMeters)
        var map: CaveMap = CaveMap(cols: cols, rows: data.maxDepthMeters, tileSize: ts, seed: UInt64(floorRow) &+ 17)
        var c: Int = 0
        while c < cols {
            // Fondo ondulato, con due rialzi ai lati.
            let wave: Double = Noise.fbm(Double(c) * 0.16, 2.7, seed: UInt64(floorRow) &+ 3, octaves: 3)
            let edge: Double = abs(Double(c) - Double(cols) / 2) / (Double(cols) / 2)
            let top: Int = floorRow - Int((wave * 2.4 + pow(edge, 3) * 5).rounded())
            var r: Int = max(top, 1)
            while r < min(floorRow + 12, map.rows) {
                map.setSolid(c, r, true)
                r += 1
            }
            c += 1
        }
        map.rebuildField()
        let width: Int = cols * ts
        let height: Int = 16 * ts
        let originY: Int = (floorRow - 8) * ts
        let painted: TerrainPainter.Result = TerrainPainter.paint(map: map, world: data, styles: TerrainPainter.styles(for: data),
                                                                 originX: 0, originY: originY, width: width, height: height)
        // La roccia della mappa comincia a `floorRow`: la porto alla quota del suolo della scena.
        let surfaceInImage: Double = Double(floorRow * ts - originY)
        let top: Double = groundY + surfaceInImage
        if painted.hasRock {
            let sprite: SKSpriteNode = SKSpriteNode(texture: TextureFactory.texture(from: painted.image), size: CGSize(width: width, height: height))
            sprite.anchorPoint = CGPoint(x: 0.5, y: 1)
            sprite.position = CGPoint(x: 0, y: top)
            sprite.zPosition = 1
            backdrop.addChild(sprite)
        }
        // Sagome lontane, come nei fondali delle immersioni.
        let far: PixelBuffer = BackdropPainter.rockLayer(size: 256, seed: UInt64(floorRow) &+ 9, cellsX: 5, cellsY: 2, coverage: 0.30, softEdge: 0.02)
        let farTexture: SKTexture = TextureFactory.texture(from: far, filtering: SKTextureFilteringMode.linear)
        var fx0: Double = -512
        while fx0 < 512 {
            let sprite: SKSpriteNode = SKSpriteNode(texture: farTexture, size: CGSize(width: 512, height: 512))
            sprite.anchorPoint = CGPoint(x: 0, y: 0.5)
            sprite.position = CGPoint(x: fx0, y: groundY + 60)
            sprite.zPosition = -80
            sprite.color = SKColor(data.waterColor(atDepth: depthMeters).scaled(0.55))
            sprite.colorBlendFactor = 1
            sprite.alpha = 0.5
            backdrop.addChild(sprite)
            fx0 += 512
        }
        // Flora e rovine posate sul fondo.
        var rng: SeededRNG = SeededRNG(seed: UInt64(floorRow) &+ 5)
        var x: Double = -Double(width) / 2 + 30
        while x < Double(width) / 2 - 30 {
            if let kind: MapProp.Kind = rng.pick(props), abs(x) > 26 {
                let mapX: Double = x + Double(width) / 2
                var y: Double = Double(floorRow * ts) - 60
                var steps: Int = 0
                while steps < 80 && map.density(x: mapX, y: y) < 0.5 {
                    y += 1
                    steps += 1
                }
                let variants: Int = (kind == MapProp.Kind.posidonia || kind == MapProp.Kind.gorgonia) ? 2 : 1
                let v: Int = rng.int(0, variants)
                let name: String = "\(kind.rawValue)\(v)_0"
                if SpriteForge.shared.has(name) {
                    let node: SKSpriteNode = SpriteForge.shared.node(name)
                    node.position = CGPoint(x: x, y: groundY - (y - Double(floorRow * ts)))
                    node.zPosition = 2
                    backdrop.addChild(node)
                }
            }
            x += rng.range(34, 70)
        }
    }

    private func layoutCamera() {
        // Il suolo sta poco sopra il riquadro dei dialoghi.
        let h: Double = Double(artSize.height)
        setCamera(x: 0, y: groundY + h / 2 - h * 0.37)
    }

    override func layoutHUD() {
        water.size = size
        rays.size = size
        for node in [tint, fade, flash, cardVeil] { node.size = CGSize(width: size.width + 4, height: size.height + 4) }
        let safe: CGRect = hudSafeRect
        let boxHeight: CGFloat = min(118, safe.height * 0.31)
        let boxWidth: CGFloat = min(safe.width - 16, 760)
        boxRect = CGRect(x: -boxWidth / 2, y: safe.minY + 6, width: boxWidth, height: boxHeight)
        box.path = CGPath(roundedRect: boxRect, cornerWidth: 18, cornerHeight: 18, transform: nil)
        skipButton.position = CGPoint(x: safe.maxX - 52, y: safe.maxY - 26)
        arrow.position = CGPoint(x: boxRect.maxX - 22, y: boxRect.minY + 16)
        cardTitle.preferredMaxLayoutWidth = safe.width * 0.8
        cardSub.preferredMaxLayoutWidth = safe.width * 0.7
        cardTitle.position = CGPoint(x: 0, y: 22)
        cardSub.position = CGPoint(x: 0, y: -26)
        cardHint.position = CGPoint(x: 0, y: safe.minY + 26)
        layoutDialog()
        layoutCamera()
    }

    /// Dispone ritratto, nome e testo dentro il riquadro, a seconda che parli un personaggio o il narratore.
    private func layoutDialog() {
        let scale: CGFloat = hudIconScale(2.6)
        portrait.setScale(scale)
        let portraitWidth: CGFloat = narrating ? 0 : 44 * scale
        portrait.position = CGPoint(x: boxRect.minX + 14 + portraitWidth / 2, y: boxRect.minY + 4)
        let left: CGFloat = boxRect.minX + (narrating ? 26 : portraitWidth + 28)
        textWidth = boxRect.maxX - 34 - left
        textLabel.preferredMaxLayoutWidth = textWidth
        textLabel.position = CGPoint(x: left, y: boxRect.maxY - (narrating ? 18 : 34))
        nameLabel.position = CGPoint(x: left + 2, y: boxRect.maxY - 17)
    }

    private func setDialogVisible(_ visible: Bool) {
        for node in [box, nameTag, nameLabel, textLabel, portrait, arrow] as [SKNode] { node.isHidden = !visible }
    }

    // MARK: - Ciclo

    override func tick(_ dt: Double) {
        let input: InputManager = InputManager.shared
        input.beginFrame()
        if finished { return }
        if input.pressed.contains(GameButtons.pause) {
            finish()
            return
        }
        if input.pressed.contains(GameButtons.interact) || input.pressed.contains(GameButtons.primary) { tap() }
        if let every: Double = autoAdvance {
            autoClock += dt
            if autoClock >= every {
                autoClock = 0
                tap()
            }
        }

        _ = cursor.advance(scene: cutscene, dt: dt)
        if cursor.isFinished {
            finish()
            return
        }
        if cursor.index != shownStep { begin(step: cursor.index) }
        updateTypewriter()

        for (_, actor) in actors { actor.update(dt: dt, layout: layout) }
        updateShake(dt)
        if Cutscene.underwater.contains(place) { updateBubbles(dt) }
    }

    private func tap() {
        if finished { return }
        if cursor.tap(scene: cutscene) { Feedback.tap() }
    }

    /// Avvia gli effetti del passo appena cominciato.
    private func begin(step index: Int) {
        shownStep = index
        let step: CutsceneStep = cutscene.steps[index]
        // Chi stava parlando torna in posa normale.
        for (_, actor) in actors where actor.pose == "talk" { actor.setPose("stand") }
        if step.action != "say" { setDialogVisible(false) }
        if step.action != "title" { card.isHidden = true }

        switch step.action {
        case "say":
            showLine(step)
        case "move":
            if let who: String = step.who, let actor: Actor = actors[who], let x: Double = step.x {
                actor.walk(to: x, time: step.duration)
            }
        case "show":
            if let who: String = step.who, let actor: Actor = actors[who] {
                if let x: Double = step.x {
                    actor.x = x
                    actor.toX = x
                }
                actor.sprite.run(SKAction.fadeIn(withDuration: 0.25))
            }
        case "hide":
            if let who: String = step.who, let actor: Actor = actors[who] { actor.sprite.run(SKAction.fadeOut(withDuration: 0.25)) }
        case "face":
            if let who: String = step.who, let actor: Actor = actors[who] { actor.sprite.xScale = (step.left ?? false) ? -1 : 1 }
        case "pose":
            if let who: String = step.who, let actor: Actor = actors[who] { actor.setPose(step.pose ?? "stand") }
        case "shake":
            shakeLeft = step.duration
            Feedback.thud()
        case "flash":
            flash.removeAllActions()
            flash.alpha = 0.9
            flash.run(SKAction.fadeOut(withDuration: 0.35))
        case "title":
            cardTitle.attributedText = Theme.attributed(step.text?.text() ?? "", size: 30, weight: UIFont.Weight.heavy, color: Theme.lime)
            cardSub.attributedText = Theme.attributed(step.sub?.text() ?? "", size: 15, weight: UIFont.Weight.semibold, color: Theme.ochre)
            card.isHidden = false
            card.alpha = 0
            card.run(SKAction.fadeIn(withDuration: 0.3))
        case "place":
            if let next: String = step.place {
                fade.removeAllActions()
                fade.run(SKAction.sequence([
                    SKAction.fadeIn(withDuration: 0.3),
                    SKAction.run { [weak self] in
                        self?.place = next
                        self?.buildPlace()
                    },
                    SKAction.fadeOut(withDuration: 0.3)
                ]))
            }
        default:
            break
        }
    }

    private func showLine(_ step: CutsceneStep) {
        let story: StoryBook = GameData.shared.story
        let member: CastMember? = story.member(step.who ?? "")
        let hasPortrait: Bool = member?.portrait != nil
        narrating = !hasPortrait
        setDialogVisible(true)
        portrait.isHidden = !hasPortrait
        nameTag.isHidden = !hasPortrait
        nameLabel.isHidden = !hasPortrait
        box.fillColor = narrating ? Theme.ink.withAlphaComponent(0.88) : Theme.lime
        box.strokeColor = narrating ? Theme.lime.withAlphaComponent(0.5) : Theme.ink.withAlphaComponent(0.85)

        if let member: CastMember = member, let prefix: String = member.portrait {
            let name: String = "\(prefix)_\(step.mood ?? "calm")"
            portrait.texture = SpriteForge.shared.texture(name)
            portrait.size = SpriteForge.shared.pixelSize(name)
            let tagColor: SKColor = SKColor(RGBA(hexString: member.color) ?? RGBA(hex: 0x2BB7B3))
            nameLabel.attributedText = Theme.attributed(member.name.text(), size: 14, weight: UIFont.Weight.heavy, color: Theme.ink)
            layoutDialog()
            let width: CGFloat = nameLabel.frame.width + 22
            nameTag.path = CGPath(roundedRect: CGRect(x: nameLabel.position.x - 11, y: nameLabel.position.y - 11, width: width, height: 22),
                                  cornerWidth: 11, cornerHeight: 11, transform: nil)
            nameTag.fillColor = tagColor
            // L'attore che parla si anima, a meno che non sia già in una posa forte.
            if let who: String = step.who, let actor: Actor = actors[who], actor.pose == "stand" { actor.setPose("talk") }
        } else {
            layoutDialog()
        }
        fullText = step.text?.text() ?? ""
        shownLetters = -1
        updateTypewriter()
    }

    private func updateTypewriter() {
        guard shownStep >= 0, shownStep < cutscene.steps.count, cutscene.steps[shownStep].action == "say" else { return }
        let count: Int = min(cursor.shown, fullText.count)
        if count != shownLetters {
            shownLetters = count
            let visible: String = String(fullText.prefix(count))
            textLabel.attributedText = Theme.attributed(visible, size: 17, weight: narrating ? UIFont.Weight.medium : UIFont.Weight.semibold,
                                                        color: narrating ? Theme.lime : Theme.ink)
        }
        arrow.isHidden = count < fullText.count
    }

    private func updateShake(_ dt: Double) {
        if shakeLeft <= 0 { return }
        shakeLeft -= dt
        let h: Double = Double(artSize.height)
        let amount: Double = min(shakeLeft * 6, 3)
        setCamera(x: fx.range(-amount, amount), y: groundY + h / 2 - h * 0.37 + fx.range(-amount, amount))
        if shakeLeft <= 0 { layoutCamera() }
    }

    private func updateBubbles(_ dt: Double) {
        bubbleClock -= dt
        if bubbleClock > 0 { return }
        bubbleClock = fx.range(0.5, 1.1)
        for (_, actor) in actors where actor.sprite.alpha > 0.5 {
            let bubble: SKSpriteNode = SpriteForge.shared.node("bubble_\(fx.int(0, 2))")
            bubble.position = CGPoint(x: actor.sprite.position.x + (actor.sprite.xScale > 0 ? 10 : -10), y: actor.sprite.position.y + 4)
            bubble.zPosition = 8
            world.addChild(bubble)
            let rise: SKAction = SKAction.moveBy(x: CGFloat(fx.range(-6, 6)), y: 60, duration: 1.6)
            bubble.run(SKAction.sequence([SKAction.group([rise, SKAction.fadeOut(withDuration: 1.6)]), SKAction.removeFromParent()]))
        }
    }

    private func finish() {
        if finished { return }
        finished = true
        setDialogVisible(false)
        if let done: (() -> Void) = onFinished {
            done()
        }
    }

    // MARK: - Tocchi

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch: UITouch = touches.first else { return }
        if skipButton.contains(point: touch.location(in: hud)) {
            skipPressed = true
            skipButton.setPressed(true)
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch: UITouch = touches.first else { return }
        let point: CGPoint = touch.location(in: hud)
        if skipPressed {
            skipPressed = false
            skipButton.setPressed(false)
            if skipButton.contains(point: point) {
                Feedback.tap()
                finish()
            }
            return
        }
        tap()
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        skipPressed = false
        skipButton.setPressed(false)
    }

    override var debugSummary: String {
        return "scena=\(cutscene.id) passo=\(cursor.index)/\(cutscene.steps.count) attori=\(actors.count)"
    }
}
