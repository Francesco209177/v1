/// Riproduttore delle scene della storia: un fondale, gli attori, il riquadro dei dialoghi
/// con il ritratto di chi parla. Un tocco completa la battuta, un altro passa alla successiva.
final class CutsceneScreen: Screen {

    /// Un personaggio in scena (coordinate del mondo con la y verso l'alto, come su iOS).
    private final class Actor {
        let body: String
        private var frames: [String: Int] = [:]
        private(set) var pose: String = "stand"
        var x: Double
        var fromX: Double
        var toX: Double
        var moveTime: Double = 0
        var moveFor: Double = 0
        let baseY: Double
        let swims: Bool
        /// true se guarda a sinistra.
        var flip: Bool
        var alpha: Double
        var targetAlpha: Double
        private var clock: Double = 0

        init(member: CastMember, x: Double, y: Double, swims: Bool, left: Bool, hidden: Bool) {
            body = member.body
            let sprites: Sprites = Sprites.shared
            var table: [String: Int] = [:]
            for name in ["stand", "walk", "talk", "shock"] where sprites.has("\(member.body)_\(name)_0") {
                table[name] = sprites.frameCount("\(member.body)_\(name)")
            }
            frames = table
            self.x = x
            fromX = x
            toX = x
            baseY = y
            self.swims = swims
            flip = left
            alpha = hidden ? 0 : 1
            targetAlpha = alpha
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
            if abs(target - x) > 1 { flip = target < x }
            setPose("walk")
        }

        func update(dt: Double) {
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
            // Entrate e uscite in dissolvenza (0,25 s).
            if alpha < targetAlpha {
                alpha = min(targetAlpha, alpha + dt / 0.25)
            } else if alpha > targetAlpha {
                alpha = max(targetAlpha, alpha - dt / 0.25)
            }
        }

        /// Quota attuale, con l'ondeggiare di chi nuota.
        var y: Double {
            return baseY + (swims ? sin(clock * 1.6) * 2.5 : 0)
        }

        var image: Image {
            let count: Int = frames[pose] ?? frames["stand"] ?? 0
            let name: String = frames[pose] != nil ? pose : "stand"
            if count <= 0 { return Sprites.shared.get("\(body)_stand_0") }
            let rate: Double = pose == "walk" ? 9 : (pose == "talk" ? 5 : (pose == "shock" ? 7 : 2.4))
            return Sprites.shared.get("\(body)_\(name)_\(Int(clock * rate) % count)")
        }
    }

    /// Un fondale sott'acqua: colore dell'acqua della zona, roccia dipinta come nelle immersioni, flora e rovine.
    private final class Seabed {
        let top: RGBA
        let bottom: RGBA
        let rays: Double
        let dark: Double
        let rock: Image
        let rockTop: Double
        let far: Image
        let farColor: RGBA
        private(set) var props: [(image: Image, x: Double, y: Double)] = []

        init(place: String, groundY: Double) {
            let data: WorldData = GameData.shared.world
            let depth: Double
            let kinds: [MapProp.Kind]
            var darkness: Double = 0
            switch place {
            case "relitto":
                depth = 28
                kinds = [MapProp.Kind.posidonia, MapProp.Kind.posidonia, MapProp.Kind.sponge]
            case "citta":
                depth = 290
                kinds = [MapProp.Kind.column, MapProp.Kind.column, MapProp.Kind.anemone]
                darkness = 0.34
            case "fumarole":
                depth = 440
                kinds = [MapProp.Kind.vent, MapProp.Kind.crystal]
                darkness = 0.46
            case "santuario":
                depth = 560
                kinds = [MapProp.Kind.crystal, MapProp.Kind.column, MapProp.Kind.crystal]
                darkness = 0.30
            default:
                depth = 60
                kinds = [MapProp.Kind.gorgonia, MapProp.Kind.sponge, MapProp.Kind.posidonia]
            }
            top = data.waterColor(atDepth: max(depth - 8, 0))
            bottom = data.waterColor(atDepth: depth + 8)
            let light: Double = data.light(atDepth: depth)
            rays = light < 0.25 ? 0 : 0.9 * pow(light, 1.7)
            dark = darkness

            // Fondo ondulato lungo quanto la scena, con due rialzi ai lati.
            let ts: Int = data.pixelsPerMeter
            let cols: Int = 40
            let floorRow: Int = Int(depth)
            var map: CaveMap = CaveMap(cols: cols, rows: data.maxDepthMeters, tileSize: ts, seed: UInt64(floorRow) &+ 17)
            var c: Int = 0
            while c < cols {
                let wave: Double = Noise.fbm(Double(c) * 0.16, 2.7, seed: UInt64(floorRow) &+ 3, octaves: 3)
                let edge: Double = abs(Double(c) - Double(cols) / 2) / (Double(cols) / 2)
                let surface: Int = floorRow - Int((wave * 2.4 + pow(edge, 3) * 5).rounded())
                var r: Int = max(surface, 1)
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
            rockTop = groundY + Double(floorRow * ts - originY)
            rock = painted.hasRock ? Image(painted.image, anchorX: width / 2, anchorY: 0) : Image.empty
            far = Image(BackdropPainter.rockLayer(size: 256, seed: UInt64(floorRow) &+ 9, cellsX: 5, cellsY: 2, coverage: 0.30, softEdge: 0.02))
            farColor = data.waterColor(atDepth: depth).scaled(0.55).withAlpha(128)

            // Flora e rovine posate sul fondo.
            var rng: SeededRNG = SeededRNG(seed: UInt64(floorRow) &+ 5)
            var x: Double = -Double(width) / 2 + 30
            while x < Double(width) / 2 - 30 {
                if let kind: MapProp.Kind = rng.pick(kinds), abs(x) > 26 {
                    let mapX: Double = x + Double(width) / 2
                    var y: Double = Double(floorRow * ts) - 60
                    var steps: Int = 0
                    while steps < 80 && map.density(x: mapX, y: y) < 0.5 {
                        y += 1
                        steps += 1
                    }
                    let variants: Int = (kind == MapProp.Kind.posidonia || kind == MapProp.Kind.gorgonia) ? 2 : 1
                    let v: Int = rng.int(0, variants)
                    if let image: Image = Sprites.shared.find("\(kind.rawValue)\(v)_0") {
                        props.append((image: image, x: x, y: groundY - (y - Double(floorRow * ts))))
                    }
                }
                x += rng.range(34, 70)
            }
        }

        func draw(_ g: Canvas, view: View2D, time: Double, groundY: Double) {
            WaterPaint.fill(g, top: top, bottom: bottom)
            // Sagome lontane, come nei fondali delle immersioni.
            var fx: Double = -512
            while fx < 512 {
                g.draw(far, x: view.sx(fx), y: view.sy(groundY + 60) - 256, scale: 2, ink: Ink.solid(farColor))
                fx += 512
            }
            WaterPaint.rays(g, time: time, strength: rays)
            if !rock.isEmpty { g.sprite(rock, x: view.sx(0), y: view.sy(rockTop)) }
            for prop in props {
                g.sprite(prop.image, x: view.sx(prop.x), y: view.sy(prop.y))
            }
        }
    }

    /// Chiamata alla fine della scena (o quando viene saltata).
    var onFinished: (() -> Void)?
    /// Prova automatica: avanza da sola dopo tot secondi per battuta.
    var autoAdvance: Double? = nil

    private let cutscene: Cutscene
    private var cursor: CutsceneCursor
    private var shownStep: Int = -1
    private var actors: [String: Actor] = [:]
    /// Gli attori nell'ordine della scena: si disegnano sempre allo stesso modo.
    private var cast: [Actor] = []
    private var place: String
    private var finished: Bool = false
    private var autoClock: Double = 0
    private var clock: Double = 0

    // Fondale
    private var port: PortPaint? = nil
    private var seabed: Seabed? = nil
    private var groundY: Double = PortPaint.groundY
    private var shakeLeft: Double = 0
    private var shakeX: Double = 0
    private var shakeY: Double = 0
    private var fx: SeededRNG = SeededRNG(seed: 77)
    private var bubbleClock: Double = 0.6
    private var bubbles: [RisingBubble] = []
    private var flash: Double = 0
    private var nextPlace: String? = nil
    private var placeFade: Double = 0

    // Dialoghi
    private var dialogVisible: Bool = false
    private var speaker: CastMember? = nil
    private var mood: String = "calm"
    private var fullText: String = ""
    private var shownLetters: Int = -1
    private var wrapped: [String] = []
    private var wrappedWidth: Int = -1

    // Cartello a tutto schermo
    private var cardVisible: Bool = false
    private var cardAlpha: Double = 0
    private var cardTitle: String = ""
    private var cardSub: String = ""

    init(cutscene: Cutscene) {
        self.cutscene = cutscene
        cursor = CutsceneCursor(scene: cutscene)
        place = cutscene.place
        super.init()
        buildPlace()
        let swims: Bool = Cutscene.underwater.contains(place)
        for entry in cutscene.actors {
            guard let member: CastMember = GameData.shared.story.member(entry.who), !member.body.isEmpty else { continue }
            let actor: Actor = Actor(member: member, x: entry.x, y: swims ? groundY + 44 : groundY, swims: swims,
                                     left: entry.left ?? false, hidden: entry.hidden ?? false)
            actors[entry.who] = actor
            cast.append(actor)
        }
    }

    /// Camera più vicina che al porto: i personaggi sono i protagonisti.
    override var worldHeight: Double { return 184 }

    override func enter(_ app: App) {
        Mixer.shared.music("scena")
        Mixer.shared.setUnderwater(0, immediately: true)
    }

    // MARK: Luoghi

    /// Prepara il fondale del luogo corrente e sceglie la quota del suolo.
    private func buildPlace() {
        port = nil
        seabed = nil
        switch place {
        case "porto_mattina", "porto_sera", "porto_notte", "mare":
            let phase: DayPhase = place == "porto_sera" ? DayPhase.evening : (place == "porto_notte" ? DayPhase.night : DayPhase.morning)
            port = PortPaint(phase: phase)
            groundY = PortPaint.groundY
        case "osteria":
            groundY = -9
        default:
            groundY = -58
            seabed = Seabed(place: place, groundY: groundY)
        }
    }

    /// La sala dell'osteria, costruita con gli sprite di `osteria.spr` come su iOS.
    private func drawRoom(_ g: Canvas, view: View2D) {
        g.fill(x: 0, y: 0, w: g.width, h: g.height, RGBA(hex: 0x1A1216))
        let sprites: Sprites = Sprites.shared
        let ox: Double = -214
        let floor: Image = sprites.get("room_floor")
        var x: Double = -128
        while x < 584 {
            for y in [0.0, -32.0, -64.0, -96.0] {
                g.sprite(floor, x: view.sx(ox + x), y: view.sy(y))
            }
            x += 32
        }
        g.sprite(sprites.get("room_kitchen"), x: view.sx(ox - 16), y: view.sy(0))
        g.sprite(sprites.get("room_wall1"), x: view.sx(ox - 80), y: view.sy(0))
        x = 104
        var variant: Int = 0
        while x < 360 {
            g.sprite(sprites.get("room_wall\(variant % 2)"), x: view.sx(ox + x), y: view.sy(0))
            x += 64
            variant += 1
        }
        g.sprite(sprites.get("room_door"), x: view.sx(ox + x), y: view.sy(0))
        let decor: [(String, Double, Double)] = [("room_lantern", 136, 96), ("room_window", 196, 92), ("room_lantern", 262, 96),
                                                  ("room_shelf", 314, 84), ("room_garlic", 232, 96)]
        for item in decor {
            g.sprite(sprites.get(item.0), x: view.sx(ox + item.1), y: view.sy(item.2))
        }
        g.sprite(sprites.get("room_barrel"), x: view.sx(ox + 120), y: view.sy(-3))
        g.sprite(sprites.get("room_table"), x: view.sx(ox + 372), y: view.sy(-4))
        g.sprite(sprites.get("room_chair"), x: view.sx(ox + 394), y: view.sy(-4))
        g.sprite(sprites.get("room_kitchen_front"), x: view.sx(ox - 16), y: view.sy(0))
    }

    /// Aloni delle lanterne: sopra i personaggi.
    private func drawRoomFront(_ g: Canvas, view: View2D) {
        let glow: Image = PortPaint.glowImage()
        for gx in [136.0, 262.0] {
            g.sprite(glow, x: view.sx(-214 + gx), y: view.sy(80), ink: Ink.add(82))
        }
    }

    // MARK: Ciclo

    override func update(_ app: App, _ dt: Double) {
        clock += dt
        updateEffects(dt)
        if finished { return }
        let input: Input = app.input
        if input.pressed.contains(GameButtons.pause) {
            finish()
            return
        }
        // Tocchi: "Salta" in alto a destra, altrove si avanza.
        let skip: Rect = skipRect(app)
        var tapped: Bool = false
        for touch in input.touches where touch.ended && touch.owner == nil && touch.travel < 20 {
            if skip.contains(touch.startX, touch.startY) {
                if skip.contains(touch.x, touch.y) {
                    Feedback.tap()
                    finish()
                    return
                }
            } else {
                tapped = true
            }
        }
        if input.confirm || input.pressed.contains(GameButtons.interact) || input.pressed.contains(GameButtons.primary) { tapped = true }
        if tapped { tap() }
        if let every: Double = autoAdvance {
            autoClock += dt
            if autoClock >= every {
                autoClock = 0
                tap()
            }
        }

        // Ogni passo va avviato, anche quelli istantanei (entrate, pose): in un fotogramma se ne possono chiudere diversi.
        if !cursor.isFinished && cursor.index != shownStep { begin(step: cursor.index) }
        var elapsedNow: Double = dt
        var chained: Int = 0
        while cursor.advance(scene: cutscene, dt: elapsedNow) && !cursor.isFinished && chained < 24 {
            begin(step: cursor.index)
            elapsedNow = 0
            chained += 1
        }
        if cursor.isFinished {
            finish()
            return
        }
        updateTypewriter()
        if cardVisible { cardAlpha = min(1, cardAlpha + dt / 0.3) }
    }

    /// Attori, scossa, lampo, dissolvenza del cambio di luogo e bollicine.
    private func updateEffects(_ dt: Double) {
        var i: Int = 0
        while i < cast.count {
            cast[i].update(dt: dt)
            i += 1
        }
        if shakeLeft > 0 {
            shakeLeft -= dt
            let amount: Double = min(max(shakeLeft, 0) * 6, 3)
            shakeX = fx.range(-amount, amount)
            shakeY = fx.range(-amount, amount)
            if shakeLeft <= 0 {
                shakeX = 0
                shakeY = 0
            }
        }
        flash = max(0, flash - dt / 0.35 * 0.9)
        if let next: String = nextPlace {
            let before: Double = placeFade
            placeFade += dt
            if before < 0.3 && placeFade >= 0.3 {
                place = next
                buildPlace()
            }
            if placeFade >= 0.6 { nextPlace = nil }
        }
        if Cutscene.underwater.contains(place) && !finished {
            bubbleClock -= dt
            if bubbleClock <= 0 {
                bubbleClock = fx.range(0.5, 1.1)
                for actor in cast where actor.alpha > 0.5 {
                    bubbles.append(RisingBubble(x: actor.x + (actor.flip ? -10 : 10), y: actor.y + 4, vx: fx.range(-6, 6) / 1.6,
                                                age: 0, life: 1.6, sprite: "bubble_\(fx.int(0, 2))"))
                }
            }
        }
        i = 0
        while i < bubbles.count {
            bubbles[i].age += dt
            bubbles[i].y += 60 / bubbles[i].life * dt
            bubbles[i].x += bubbles[i].vx * dt
            i += 1
        }
        bubbles.removeAll(where: { (bubble: RisingBubble) -> Bool in bubble.age >= bubble.life })
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
        for actor in cast where actor.pose == "talk" { actor.setPose("stand") }
        if step.action != "say" { dialogVisible = false }
        if step.action != "title" { cardVisible = false }

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
                actor.targetAlpha = 1
            }
        case "hide":
            if let who: String = step.who, let actor: Actor = actors[who] { actor.targetAlpha = 0 }
        case "face":
            if let who: String = step.who, let actor: Actor = actors[who] { actor.flip = step.left ?? false }
        case "pose":
            if let who: String = step.who, let actor: Actor = actors[who] { actor.setPose(step.pose ?? "stand") }
        case "shake":
            shakeLeft = step.duration
            Feedback.thud()
        case "flash":
            flash = 0.9
        case "title":
            cardTitle = step.text?.text() ?? ""
            cardSub = step.sub?.text() ?? ""
            cardVisible = true
            cardAlpha = 0
        case "place":
            if let next: String = step.place {
                nextPlace = next
                placeFade = 0
            }
        default:
            break
        }
    }

    private func showLine(_ step: CutsceneStep) {
        let member: CastMember? = GameData.shared.story.member(step.who ?? "")
        speaker = member?.portrait != nil ? member : nil
        mood = step.mood ?? "calm"
        dialogVisible = true
        // L'attore che parla si anima, a meno che non sia già in una posa forte.
        if speaker != nil, let who: String = step.who, let actor: Actor = actors[who], actor.pose == "stand" { actor.setPose("talk") }
        fullText = step.text?.text() ?? ""
        wrappedWidth = -1
        shownLetters = -1
        updateTypewriter()
    }

    private func updateTypewriter() {
        guard shownStep >= 0, shownStep < cutscene.steps.count, cutscene.steps[shownStep].action == "say" else { return }
        let count: Int = min(cursor.shown, fullText.count)
        if count != shownLetters {
            // Il ticchettio della macchina da scrivere, una lettera sì e una no.
            if count > shownLetters && count % 2 == 0 { Mixer.shared.play(SFXKind.letter, volume: 0.5) }
            shownLetters = count
        }
    }

    private func finish() {
        if finished { return }
        finished = true
        dialogVisible = false
        cardVisible = false
        if let done: (() -> Void) = onFinished {
            done()
        }
    }

    override func back(_ app: App) -> Bool {
        if !finished {
            Feedback.tap()
            finish()
        }
        return true
    }

    // MARK: Mondo

    override func drawWorld(_ app: App, _ g: Canvas) {
        let h: Double = Double(g.height)
        // Il suolo sta poco sopra il riquadro dei dialoghi.
        let view: View2D = View2D(centerX: shakeX, centerY: groundY + h * 0.13 + shakeY, width: g.width, height: g.height)
        if let port: PortPaint = port {
            port.drawBack(g, view: view, time: app.time)
        } else if let seabed: Seabed = seabed {
            seabed.draw(g, view: view, time: app.time, groundY: groundY)
        } else {
            drawRoom(g, view: view)
        }
        for actor in cast where actor.alpha > 0.01 {
            let ink: Ink = actor.alpha >= 0.99 ? Ink.normal : Ink.alpha(Int(actor.alpha * 255))
            g.sprite(actor.image, x: view.sx(actor.x), y: view.sy(actor.y), flipX: actor.flip, ink: ink)
        }
        for bubble in bubbles {
            let alpha: Double = max(0, 1 - bubble.age / bubble.life)
            g.sprite(Sprites.shared.get(bubble.sprite), x: view.sx(bubble.x), y: view.sy(bubble.y), ink: Ink.alpha(Int(alpha * 230)))
        }
        if let port: PortPaint = port {
            port.drawFront(g, view: view)
        } else if let seabed: Seabed = seabed {
            if seabed.dark > 0 { g.fill(x: 0, y: 0, w: g.width, h: g.height, RGBA(hex: 0x020818, alpha: UInt8(seabed.dark * 255))) }
        } else {
            drawRoomFront(g, view: view)
        }
        if flash > 0.01 { g.fill(x: 0, y: 0, w: g.width, h: g.height, Theme.white.withAlpha(UInt8(min(1, flash) * 255))) }
        if nextPlace != nil {
            let veil: Double = placeFade < 0.3 ? placeFade / 0.3 : max(0, 1 - (placeFade - 0.3) / 0.3)
            g.fill(x: 0, y: 0, w: g.width, h: g.height, RGBA(r: 0, g: 0, b: 0, a: UInt8(MathUtil.clamp(veil, 0, 1) * 255)))
        }
    }

    // MARK: Interfaccia

    private func skipRect(_ app: App) -> Rect {
        let safe: Rect = app.safe
        return Rect(safe.maxX - 6 - 54, safe.y + 6, 54, 21)
    }

    override func drawUI(_ app: App, _ ui: UI) {
        if finished { return }
        let g: Canvas = ui.g
        if dialogVisible { drawDialog(app, g, time: ui.time) }

        // "Salta": un tocco chiude la scena.
        let skip: Rect = skipRect(app)
        let down: Bool = app.input.touches.contains(where: { (touch: TouchPoint) -> Bool in
            !touch.ended && skip.contains(touch.startX, touch.startY) && skip.contains(touch.x, touch.y)
        })
        g.roundRect(skip, radius: 10, Theme.ink.withAlpha(down ? 200 : 140))
        g.text("Salta", x: skip.midX, y: skip.midY - 3, Theme.lime, align: TextAlign.center)

        if cardVisible { drawCard(app, g, time: ui.time) }
    }

    private func drawDialog(_ app: App, _ g: Canvas, time: Double) {
        let safe: Rect = app.safe
        let narrating: Bool = speaker == nil
        let boxW: Int = min(safe.w - 10, 470)
        var boxH: Int = min(80, Int(Double(safe.h) * 0.34))
        let portraitScale: Int = boxW >= 380 && boxH >= 66 ? 2 : 1
        let portraitW: Int = narrating ? 0 : 44 * portraitScale
        let textLeft: Int = narrating ? 14 : portraitW + 18
        let textW: Int = boxW - textLeft - 18
        if wrappedWidth != textW {
            wrapped = PixelFont.shared.wrap(fullText, maxWidth: textW)
            wrappedWidth = textW
        }
        let textTop: Int = narrating ? 10 : 24
        // Se la battuta è lunga, il riquadro cresce verso l'alto.
        boxH = max(boxH, textTop + wrapped.count * PixelFont.lineHeight + 8)
        let box: Rect = Rect(safe.midX - boxW / 2, safe.maxY - 4 - boxH, boxW, boxH)

        g.roundRect(box, radius: 8, narrating ? Theme.ink.withAlpha(225) : Theme.lime)
        g.roundOutline(box, radius: 8, narrating ? Theme.lime.withAlpha(128) : Theme.ink.withAlpha(217))

        let ink: RGBA = narrating ? Theme.lime : Theme.ink
        if let member: CastMember = speaker, let prefix: String = member.portrait {
            let image: Image = Sprites.shared.find("\(prefix)_\(mood)") ?? Sprites.shared.get("\(prefix)_calm")
            let cx: Int = box.x + 9 + portraitW / 2
            let bottom: Int = box.maxY - 2
            g.draw(image, x: cx - image.anchorX * portraitScale, y: bottom - (image.anchorY + 1) * portraitScale, scale: portraitScale)
            // Etichetta col nome, nel colore del personaggio.
            let name: String = member.name.text()
            let tag: Rect = Rect(box.x + textLeft, box.y + 6, PixelFont.shared.width(name) + 12, 13)
            g.roundRect(tag, radius: 6, RGBA(hexString: member.color) ?? Theme.turquoise)
            g.text(name, x: tag.x + 6, y: tag.y + 3, Theme.ink)
        }

        // Il testo compare lettera per lettera, già andato a capo dove andrà alla fine.
        var left: Int = max(shownLetters, 0)
        var row: Int = 0
        while row < wrapped.count && left > 0 {
            let line: String = wrapped[row]
            let visible: String = left >= line.count ? line : String(line.prefix(left))
            g.text(visible, x: box.x + textLeft, y: box.y + textTop + row * PixelFont.lineHeight, ink)
            left -= line.count + 1
            row += 1
        }
        // Freccia che invita a proseguire, quando la battuta è completa.
        if shownLetters >= fullText.count {
            let bob: Int = sin(time * Double.pi / 0.35) > 0 ? 1 : 0
            let ax: Int = box.maxX - 14
            let ay: Int = box.maxY - 11 + bob
            var i: Int = 0
            while i < 4 {
                g.fill(x: ax - 3 + i, y: ay + i, w: 7 - i * 2, h: 1, Theme.terracotta)
                i += 1
            }
        }
    }

    private func drawCard(_ app: App, _ g: Canvas, time: Double) {
        let safe: Rect = app.safe
        let a: Double = cardAlpha
        g.fill(x: 0, y: 0, w: g.width, h: g.height, Theme.ink.withAlpha(UInt8(240 * a)))
        let titleScale: Int = 2
        let titleLines: [String] = PixelFont.shared.wrap(cardTitle, maxWidth: Int(Double(safe.w) * 0.8), scale: titleScale)
        let subLines: [String] = PixelFont.shared.wrap(cardSub, maxWidth: Int(Double(safe.w) * 0.7))
        let titleStep: Int = PixelFont.lineHeight * titleScale
        var y: Int = safe.midY - 6 - titleLines.count * titleStep
        for line in titleLines {
            g.text(line, x: safe.midX, y: y, Theme.lime.withAlpha(UInt8(255 * a)), align: TextAlign.center, scale: titleScale)
            y += titleStep
        }
        y = safe.midY + 14
        for line in subLines {
            g.text(line, x: safe.midX, y: y, Theme.ochre.withAlpha(UInt8(255 * a)), align: TextAlign.center)
            y += PixelFont.lineHeight
        }
        g.text("Tocca per continuare", x: safe.midX, y: safe.maxY - 22, Theme.lime.withAlpha(UInt8(150 * a)), align: TextAlign.center)
    }
}
