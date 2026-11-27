/// Il servizio della sera all'osteria. La logica è in `ServiceSim`; qui la sala, i personaggi,
/// i fumetti dei clienti, il gioco del vino e l'interfaccia. Le misure della sala sono quelle di iOS
/// (y verso l'alto, pavimento a quota 0): `place` le converte per la tela.
final class RestaurantScreen: Screen {
    /// Stato del disegno di un cliente: fotogramma e fase vista l'ultima volta.
    private struct CustomerLook {
        let prefix: String
        var clock: Double = 0
        var lastPhase: CustomerPhase = CustomerPhase.arriving
    }

    /// Monetina o cuoricino che sale dal tavolo e svanisce.
    private struct Pop {
        let icon: String
        let text: String?
        let x: Double
        let color: RGBA
        var age: Double = 0
    }

    /// Chiamata a servizio concluso.
    var onFinished: ((ServiceResult) -> Void)?
    /// Prova automatica: il servizio lo conduce `ServiceBot`.
    var autopilot: Bool = false

    private static let background: RGBA = RGBA(hex: 0x1A1216)
    private static let shadow: RGBA = RGBA(hex: 0x120C10)
    private static let gold: RGBA = RGBA(hex: 0xFFE27A)
    private static let wine: RGBA = RGBA(hex: 0x9A2848)
    /// Bicchiere del gioco del vino, in pixel dell'interfaccia.
    private static let glassW: Int = 30
    private static let glassH: Int = 58
    /// Quota della camera sopra il pavimento, come su iOS.
    private static let cameraHeight: Double = 36

    private let vipSprite: String
    private let dishIds: [String]
    private var sim: ServiceSim
    private var bot: ServiceBot = ServiceBot(pourSkill: 0.95)
    private let pad: TouchPad = TouchPad()
    private var hint: HintBox = HintBox()
    private var toast: Toast = Toast()
    private var pops: [Pop] = []
    private var looks: [Int: CustomerLook] = [:]
    private var frameCache: [String: [Image]] = [:]
    private let glow: Image
    private var decor: [(name: String, x: Double, top: Double, index: Int)] = []

    private var teclaClock: Double = 0
    private var inesClock: Double = 0
    private var inesShout: Double = 0
    private var elapsed: Double = 0
    private var cameraX: Double = 0
    private var paused: Bool = false
    private var closing: Bool = false
    // Spostamento della sala sulla tela, calcolato a ogni disegno.
    private var originX: Double = 0
    private var originY: Double = 0

    init(setup: ServiceSetup, vipSprite: String?) {
        self.vipSprite = vipSprite ?? "pinuccio"
        sim = ServiceSim(setup: setup)
        var ids: [String] = []
        for dish in setup.dishes { ids.append(dish.recipeId) }
        dishIds = ids
        glow = RestaurantScreen.makeGlow(side: 96)
        super.init()
        buildDecor()
    }

    /// Negli interni la camera è più vicina: personaggi più grandi ed espressivi.
    override var worldHeight: Double { return 156 }

    // MARK: - Ingresso

    override func enter(_ app: App) {
        Mixer.shared.music("osteria")
        pad.configure(actions: [GameButtons.interact, GameButtons.pause])
        pad.layout(safe: app.safe)
        cameraX = clampCamera(sim.teclaX, viewWidth: Double(app.worldCanvas.width))
        // Le istruzioni della prima serata.
        if !autopilot && GameSession.shared.firstTime("servizio") {
            hint.show("Vai dal cliente e premi la mano per prendere l'ordinazione. Ritira i piatti al passavivande e portali al tavolo giusto. Alla botte tieni premuto per versare il vino e molla nella fascia verde. I tavoli sporchi vanno puliti.",
                      width: min(Int(Double(app.uiWidth) * 0.62), 322), seconds: 14)
        }
    }

    override func leave(_ app: App) {
        pad.releaseAll(app.input)
    }

    /// Arredi alle pareti, a ritmo regolare (come su iOS).
    private func buildDecor() {
        let names: [String] = ["room_lantern", "room_window", "room_lantern", "room_shelf", "room_garlic", "room_picture"]
        var d: Int = 0
        var dx: Double = 132
        while dx < sim.doorX - 30 {
            let name: String = names[d % names.count]
            let top: Double = name == "room_lantern" || name == "room_garlic" ? 96 : (name == "room_window" ? 92 : 84)
            decor.append((name: name, x: dx, top: top, index: d))
            dx += name == "room_window" ? 66 : 52
            d += 1
        }
    }

    /// Alone caldo delle lanterne: un cerchio sfumato dipinto una volta sola.
    private static func makeGlow(side: Int) -> Image {
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
                    let a: Double = (1 - d) * (1 - d)
                    image.set(x, y, RGBA(r: 255, g: 196, b: 110, a: UInt8(max(0, min(255, a * 255)))))
                }
                x += 1
            }
            y += 1
        }
        return Image(image, anchorX: side / 2, anchorY: side / 2)
    }

    // MARK: - Comandi

    override func controls(_ app: App) {
        pad.layout(safe: app.safe)
        pad.hidden = paused || closing
        pad.read(app.input)
    }

    override func back(_ app: App) -> Bool {
        if closing { return true }
        setPaused(!paused, app)
        return true
    }

    // MARK: - Ciclo

    override func update(_ app: App, _ dt: Double) {
        let input: Input = app.input
        toast.update(dt)
        hint.update(dt)
        if closing { return }
        if input.pressed.contains(GameButtons.pause) { setPaused(!paused, app) }
        if paused {
            if input.pressed.contains(GameButtons.interact) { setPaused(false, app) }
            return
        }
        elapsed += dt
        GameSession.shared.addPlayTime(dt)

        var command: ServiceInput = ServiceInput()
        command.moveX = input.move.x
        command.interact = input.pressed.contains(GameButtons.interact) || input.pressed.contains(GameButtons.primary)
        command.pourHeld = input.held.contains(GameButtons.interact) || input.held.contains(GameButtons.primary)
        if autopilot { command = bot.decide(sim, dt: dt) }

        let events: [ServiceEvent] = sim.step(input: command, dt: dt)
        handle(events)
        animate(dt, viewWidth: Double(app.worldCanvas.width))

        if sim.finished { finish(app) }
    }

    private func clampCamera(_ x: Double, viewWidth: Double) -> Double {
        let half: Double = viewWidth / 2
        let minX: Double = -16 + half
        let maxX: Double = sim.doorX + 64 - half
        if maxX < minX { return (minX + maxX) / 2 }
        return MathUtil.clamp(x, minX, maxX)
    }

    private func frames(_ prefix: String) -> [Image] {
        if let cached: [Image] = frameCache[prefix] { return cached }
        var loaded: [Image] = []
        let count: Int = Sprites.shared.frameCount(prefix)
        var i: Int = 0
        while i < count {
            loaded.append(Sprites.shared.get("\(prefix)_\(i)"))
            i += 1
        }
        frameCache[prefix] = loaded
        return loaded
    }

    /// Animazione di Tecla secondo quello che sta facendo: prefisso e fotogrammi al secondo.
    private func teclaAnimation() -> (prefix: String, rate: Double) {
        if sim.cleaning > 0 { return (prefix: "tecla_clean", rate: 10) }
        if sim.pouring { return (prefix: "tecla_pour", rate: 6) }
        var hasDish: Bool = false
        var hasWine: Bool = false
        for item in sim.carrying {
            if case Carried.dish = item { hasDish = true }
            if case Carried.wine = item { hasWine = true }
        }
        if sim.isWalking {
            return (prefix: hasDish ? "tecla_carry" : (hasWine ? "tecla_carrywine" : "tecla_walk"), rate: 11)
        }
        return (prefix: hasDish ? "tecla_hold" : (hasWine ? "tecla_pour" : "tecla_stand"), rate: 3)
    }

    /// Animazione di un cliente: prefisso, fotogrammi al secondo e se è seduto.
    private func customerAnimation(_ customer: Customer, prefix: String) -> (prefix: String, rate: Double, seated: Bool) {
        switch customer.phase {
        case .arriving, .leavingHappy:
            return (prefix: "\(prefix)_walk", rate: 8, seated: false)
        case .leavingAngry:
            return (prefix: "\(prefix)_walk", rate: 10, seated: false)
        case .waitingToOrder, .waitingFood:
            return (prefix: customer.patience < 0.3 ? "\(prefix)_angry" : "\(prefix)_sit", rate: 3, seated: true)
        case .eating:
            return (prefix: "\(prefix)_eat", rate: 5, seated: true)
        }
    }

    private func animate(_ dt: Double, viewWidth: Double) {
        teclaClock += dt * teclaAnimation().rate
        // Nonna Ines: mescola, e strilla quando un piatto è pronto.
        inesClock += dt * 5
        if inesShout > 0 { inesShout -= dt }

        // Clienti: un orologio per ciascuno, che riparte a ogni cambio di fase.
        var present: Set<Int> = []
        for customer in sim.customers {
            present.insert(customer.id)
            var look: CustomerLook = looks[customer.id]
                ?? CustomerLook(prefix: customer.look >= 100 ? vipSprite : "cust\(customer.look % 8)")
            if customer.phase != look.lastPhase {
                look.lastPhase = customer.phase
                look.clock = 0
            }
            look.clock += dt * customerAnimation(customer, prefix: look.prefix).rate
            looks[customer.id] = look
        }
        if looks.count != present.count {
            for id in Array(looks.keys) where !present.contains(id) { looks[id] = nil }
        }

        var i: Int = 0
        while i < pops.count {
            pops[i].age += dt
            i += 1
        }
        pops.removeAll(where: { (pop: Pop) -> Bool in pop.age >= 0.8 })

        let target: Double = clampCamera(sim.teclaX + (sim.facingRight ? 26 : -26), viewWidth: viewWidth)
        cameraX = MathUtil.damp(cameraX, target, rate: 4, dt: max(dt, 0.001))
    }

    // MARK: - Eventi

    private func pop(_ icon: String, text: String?, at x: Double, color: RGBA) {
        pops.append(Pop(icon: icon, text: text, x: x, color: color))
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
                Feedback.tap(sound: SFXKind.bell)
            case .pickedUp:
                Feedback.tap()
            case .served(let table, let gold, let tip):
                Feedback.success(sound: SFXKind.coin)
                pop("icon_coin", text: "+\(gold + tip)", at: sim.tables[table].x, color: RestaurantScreen.gold)
            case .wineServed(let table, let perfect, let gold):
                Feedback.hit()
                pop(perfect ? "icon_heart" : "icon_coin", text: "+\(gold)", at: sim.tables[table].x, color: RestaurantScreen.gold)
            case .tableCleaned:
                Feedback.tap()
            case .leftAngry(let table):
                Feedback.thud()
                pop("icon_anger", text: nil, at: sim.tables[table].x + 14, color: Theme.white)
                toast.show("Un cliente se n'è andato arrabbiato", color: Theme.danger)
            case .leftEmptyHanded:
                toast.show("Finito tutto: il cliente torna un'altra sera", color: Theme.ochre)
            case .pourStarted:
                Feedback.tap(sound: SFXKind.pour)
            case .pourSpilled:
                Feedback.thud()
                toast.show("Traboccato! Riprova", color: Theme.danger)
            case .pourTooLittle:
                toast.show("Troppo poco: riempi fino alla fascia verde", color: Theme.ochre)
            case .pourDone(let perfect):
                Feedback.success()
                if perfect { toast.show("Versata perfetta!", color: Theme.turquoise) }
            case .comboLost, .closed:
                break
            case .vipDelighted:
                Feedback.success()
                toast.show("L'ospite speciale è entusiasta!", color: Theme.ochre)
            case .staffHelped:
                Feedback.tap()
            }
        }
    }

    // MARK: - Pausa e chiusura

    private func setPaused(_ value: Bool, _ app: App) {
        if closing { return }
        paused = value
        pad.releaseAll(app.input)
    }

    /// Chiamata quando l'app perde il primo piano.
    func pauseForBackground(_ app: App) {
        if !paused && !closing { setPaused(true, app) }
    }

    private func finish(_ app: App) {
        if closing { return }
        closing = true
        paused = false
        pad.releaseAll(app.input)
        onFinished?(sim.result)
    }

    // MARK: - Disegno della sala

    /// Posa uno sprite con le misure di iOS: `x` lungo la sala, `y` in altezza sopra il pavimento.
    private func place(_ g: Canvas, _ image: Image, _ x: Double, _ y: Double, flip: Bool = false, ink: Ink = Ink.normal) {
        g.sprite(image, x: Int((x + originX).rounded()), y: Int((originY - y).rounded()), flipX: flip, ink: ink)
    }

    /// Posa un piatto appoggiato col fondo in (x, y), come i nodi iOS con ancora in basso al centro.
    private func placePlate(_ g: Canvas, _ dishId: String, _ x: Double, _ y: Double) {
        let image: Image = Sprites.shared.get(plateName(dishId))
        g.draw(image, x: Int((x + originX).rounded()) - image.width / 2, y: Int((originY - y).rounded()) - image.height)
    }

    private func plateName(_ dishId: String) -> String {
        return "plate_\(GameData.shared.recipes.find(dishId)?.plate ?? "fried")"
    }

    override func drawWorld(_ app: App, _ g: Canvas) {
        let sprites: Sprites = Sprites.shared
        g.clear(RestaurantScreen.background)
        originX = Double(g.width) / 2 - cameraX.rounded()
        originY = Double(g.height) / 2 + RestaurantScreen.cameraHeight
        let roomWidth: Double = sim.doorX + 64

        // Pavimento (anche sotto, se lo schermo è più alto di quello di iOS) e pareti.
        let floor: Image = sprites.get("room_floor")
        var row: Double = 0
        while originY - row < Double(g.height) + 32 {
            var x: Double = -32
            while x < roomWidth + 32 {
                place(g, floor, x, row)
                x += 32
            }
            row -= Double(max(floor.height, 8))
        }
        place(g, sprites.get("room_kitchen"), -16, 0)
        var x: Double = 104
        var variant: Int = 0
        while x < sim.doorX - 4 {
            place(g, sprites.get("room_wall\(variant % 2)"), x, 0)
            x += 64
            variant += 1
        }
        place(g, sprites.get("room_door"), x, 0)
        place(g, sprites.get("room_wall1"), -80, 0)
        for item in decor { place(g, sprites.get(item.name), item.x, item.top) }

        // Nonna Ines dietro il passavivande; il personale assunto vicino alla botte.
        let ines: [Image] = frames(inesShout > 0 ? "ines_shout" : "ines_cook")
        if !ines.isEmpty { place(g, ines[Int(inesClock) % ines.count], 62, 30) }
        var staffIndex: Int = 0
        for name in sim.setup.staffSprites.prefix(4) where sprites.has("\(name)_walk_0") {
            let period: Double = 1.0 + Double(staffIndex) * 0.14
            let bob: Double = (elapsed.truncatingRemainder(dividingBy: period)) < period / 2 ? 0 : 1
            place(g, sprites.get("\(name)_walk_0"), 128 + Double(staffIndex) * 20, 8 + bob)
            staffIndex += 1
        }
        place(g, sprites.get("room_kitchen_front"), -16, 0)
        place(g, sprites.get("room_barrel"), ServiceSim.barrelX, -3)
        for table in sim.tables { place(g, sprites.get("room_chair"), table.x + 22, -4) }

        // Piatti pronti sulla mensola.
        var p: Int = 0
        while p < sim.pass.count && p < 4 {
            placePlate(g, sim.pass[p].dishId, 18 + Double(p) * 18, 38)
            p += 1
        }

        drawCustomers(g, seated: true)
        for table in sim.tables { place(g, sprites.get(table.dirty ? "room_table_dirty" : "room_table"), table.x, -4) }
        for customer in sim.customers where customer.phase == CustomerPhase.eating && customer.table < sim.tables.count {
            if let dish: String = customer.dishId { placePlate(g, dish, sim.tables[customer.table].x + 4, 21) }
        }
        drawCustomers(g, seated: false)

        // Tecla.
        let tecla: [Image] = frames(teclaAnimation().prefix)
        if !tecla.isEmpty { place(g, tecla[Int(teclaClock) % tecla.count], sim.teclaX.rounded(), -18, flip: !sim.facingRight) }

        // Alone delle lanterne, che tremola piano.
        for item in decor where item.name == "room_lantern" {
            let speed: Double = 1.0 / (1.6 + Double(item.index) * 0.24)
            let flicker: Double = 0.31 + 0.05 * sin(elapsed * 2 * Double.pi * speed + Double(item.index))
            place(g, glow, item.x, 80, ink: Ink.add(Int(flicker * 255)))
        }

        drawBubbles(g)
        drawPops(g)
    }

    private func drawCustomers(_ g: Canvas, seated: Bool) {
        for customer in sim.customers {
            guard let look: CustomerLook = looks[customer.id] else { continue }
            let anim: (prefix: String, rate: Double, seated: Bool) = customerAnimation(customer, prefix: look.prefix)
            if anim.seated != seated { continue }
            var images: [Image] = frames(anim.prefix)
            if images.isEmpty { images = frames("\(look.prefix)_walk") }
            if images.isEmpty { continue }
            // Seduti guardano il tavolo (a sinistra); in piedi camminano nella loro direzione.
            let goingOut: Bool = customer.phase == CustomerPhase.leavingHappy || customer.phase == CustomerPhase.leavingAngry
            place(g, images[Int(look.clock) % images.count], customer.x.rounded(), seated ? -2 : -10, flip: !goingOut)
        }
    }

    /// Fumetti sopra i clienti: vuole ordinare, aspetta un piatto, vuole il vino; con la pazienza.
    private func drawBubbles(_ g: Canvas) {
        let sprites: Sprites = Sprites.shared
        for customer in sim.customers {
            let x: Double = customer.x.rounded()
            let y: Double = -2
            var icon: String? = nil
            if customer.phase == CustomerPhase.waitingToOrder {
                icon = "icon_order"
            } else if customer.phase == CustomerPhase.waitingFood, let dish: String = customer.dishId {
                icon = plateName(dish)
            }
            if let name: String = icon {
                place(g, sprites.get("bubble"), x + 2, y + 34)
                let image: Image = sprites.get(name)
                g.draw(image, x: Int((x + 6 + originX).rounded()) - image.width / 2, y: Int((originY - y - 44).rounded()) - image.height / 2)
                let ratio: Double = MathUtil.clamp(customer.patience, 0, 1)
                let bx: Int = Int((x - 5 + originX).rounded())
                let by: Int = Int((originY - y - 31).rounded())
                g.fill(x: bx, y: by - 1, w: 18, h: 3, RGBA(hex: 0x2A1A1E))
                let color: RGBA = ratio > 0.5 ? RGBA(hex: 0x58C070) : (ratio > 0.25 ? RGBA(hex: 0xF2B830) : Theme.danger)
                let fill: Int = Int((16 * ratio).rounded())
                if fill > 0 { g.fill(x: bx + 1, y: by, w: fill, h: 1, color) }
            }
            let wantsWine: Bool = customer.wantsWine && !customer.wineServed
                && (customer.phase == CustomerPhase.waitingFood || customer.phase == CustomerPhase.eating)
            if wantsWine { place(g, sprites.get("icon_wine"), x - 10, y + 40) }
        }
    }

    private func drawPops(_ g: Canvas) {
        for pop in pops {
            let t: Double = min(pop.age / 0.8, 1)
            let rise: Double = 18 * (1 - (1 - t) * (1 - t))
            let alpha: Double = pop.age < 0.5 ? 1 : max(0, 1 - (pop.age - 0.5) / 0.3)
            let a: UInt8 = UInt8(alpha * 255)
            place(g, Sprites.shared.get(pop.icon), pop.x, 40 + rise, ink: Ink.alpha(Int(a)))
            if let text: String = pop.text {
                g.text(text, x: Int((pop.x + 7 + originX).rounded()), y: Int((originY - 40 - rise).rounded()) - 3,
                       pop.color.withAlpha(a), shadow: RestaurantScreen.shadow.withAlpha(a))
            }
        }
    }

    // MARK: - Interfaccia

    override func drawUI(_ app: App, _ ui: UI) {
        let g: Canvas = ui.g
        let safe: Rect = app.safe
        drawHUD(g, safe: safe)
        if !paused && !closing {
            drawPrompt(app, g)
            if sim.pouring { drawPour(g, safe: safe) }
        }
        toast.draw(g, centerX: safe.midX, y: safe.y + Int(Double(safe.h) * 0.30))
        hint.draw(g, centerX: safe.midX, top: safe.y + 32)
        pad.draw(g, usingController: app.input.usingController)
        if paused { drawPause(app, ui) }
    }

    /// Riquadro in alto a sinistra: tempo, incasso, porzioni rimaste di ogni piatto; sotto, la combo.
    private func drawHUD(_ g: Canvas, safe: Rect) {
        let sprites: Sprites = Sprites.shared
        let width: Int = min(safe.w - 44, 93 + dishIds.count * 36)
        let box: Rect = Rect(safe.x + 4, safe.y + 4, width, 21)
        g.roundRect(box, radius: 7, Theme.ink.withAlpha(140))
        let textY: Int = box.midY - 3
        let shadow: RGBA = RestaurantScreen.shadow
        let seconds: Int = Int(sim.timeLeft.rounded(.up))
        g.text(Fmt.clock(Double(seconds)), x: box.x + 8, y: textY, seconds <= 15 ? RGBA(hex: 0xFF8A80) : Theme.white, shadow: shadow)
        let coin: Image = sprites.get("icon_coin")
        g.draw(coin, x: box.x + 41 - coin.width / 2, y: box.midY - coin.height / 2)
        g.text("\(sim.result.total)", x: box.x + 49, y: textY, RestaurantScreen.gold, shadow: shadow)
        var i: Int = 0
        while i < dishIds.count {
            let cx: Int = box.x + 88 + i * 36
            if cx + 20 > box.maxX { break }
            let left: Int = sim.portions[dishIds[i]] ?? 0
            let plate: Image = sprites.get(plateName(dishIds[i]))
            g.draw(plate, x: cx - plate.width / 2, y: box.midY - plate.height / 2, ink: left == 0 ? Ink.alpha(102) : Ink.normal)
            g.text("\(left)", x: cx + 11, y: textY, left == 0 ? RGBA(hex: 0x9A8A80) : Theme.white, shadow: shadow)
            i += 1
        }
        if sim.combo >= 2 {
            g.text("COMBO ×\(sim.combo)", x: safe.midX, y: box.maxY + 8, RGBA(hex: 0xFF8A60), align: TextAlign.center, scale: 2, shadow: shadow)
        }
    }

    /// Suggerimento dell'azione disponibile, sopra la testa di Tecla.
    private func drawPrompt(_ app: App, _ g: Canvas) {
        guard let action: ServiceAction = sim.availableAction() else { return }
        let text: String
        switch action {
        case .takeOrder: text = "Prendi l'ordine"
        case .serveDish: text = "Servi"
        case .serveWine: text = "Servi il vino"
        case .clean: text = "Pulisci"
        case .pickUp: text = "Prendi il piatto"
        case .pour: text = "Spilla il vino"
        }
        let wx: Double = sim.teclaX.rounded() + originX
        let wy: Double = originY - (-18 + 40)
        let x: Int = Int(app.uiFromWorld(wx).rounded())
        let y: Int = Int(app.uiFromWorld(wy).rounded())
        let icon: Image = Sprites.shared.get("icon_hand")
        let w: Int = PixelFont.shared.width(text) + icon.width + 13
        let box: Rect = Rect(max(app.safe.x + 2, min(app.safe.maxX - w - 2, x - w / 2)), max(app.safe.y + 2, y - 7), w, 15)
        g.roundRect(box, radius: 7, Theme.lime.withAlpha(242))
        g.draw(icon, x: box.x + 5, y: box.midY - icon.height / 2, ink: Ink.tint(Theme.ink))
        g.text(text, x: box.x + icon.width + 8, y: box.y + 4, Theme.ink)
    }

    /// Gioco del vino: un bicchiere grande al centro, da riempire fino alla fascia verde.
    private func drawPour(_ g: Canvas, safe: Rect) {
        let gw: Int = RestaurantScreen.glassW
        let gh: Int = RestaurantScreen.glassH
        let glass: Rect = Rect(safe.midX - gw / 2, safe.midY - gh / 2 - 8, gw, gh)
        let frame: Rect = Rect(glass.x - 3, glass.y - 3, gw + 6, gh + 6)
        g.roundRect(frame, radius: 6, Theme.ink.withAlpha(178))
        g.roundOutline(frame, radius: 6, Theme.lime)
        g.roundOutline(Rect(frame.x + 1, frame.y + 1, frame.w - 2, frame.h - 2), radius: 5, Theme.lime)
        let low: Double = ServiceSim.pourTarget - 0.06
        let zoneTop: Int = glass.maxY - Int((Double(gh) * ServiceSim.pourLimit).rounded())
        let zoneBottom: Int = glass.maxY - Int((Double(gh) * low).rounded())
        g.fill(x: glass.x, y: zoneTop, w: gw, h: zoneBottom - zoneTop, RGBA(hex: 0x58C070).withAlpha(140))
        let level: Int = max(1, Int((Double(gh) * MathUtil.clamp(sim.pourLevel, 0, 1)).rounded()))
        g.fill(x: glass.x, y: glass.maxY - level, w: gw, h: level, RestaurantScreen.wine)
        g.text("Tieni premuto e molla nella fascia verde", x: safe.midX, y: frame.maxY + 8, Theme.lime, align: TextAlign.center,
               shadow: RestaurantScreen.shadow)
    }

    private func drawPause(_ app: App, _ ui: UI) {
        let g: Canvas = ui.g
        let safe: Rect = app.safe
        g.fill(x: 0, y: 0, w: g.width, h: g.height, Theme.ink.withAlpha(184))
        g.text("PAUSA", x: safe.midX, y: safe.y + Int(Double(safe.h) * 0.22), Theme.white, align: TextAlign.center, scale: 3)
        let by: Int = safe.midY + 10
        if ui.button("osteria.riprendi", Rect(safe.midX - 70, by, 140, 26), "Riprendi") { setPaused(false, app) }
        if ui.button("osteria.chiudi", Rect(safe.midX - 70, by + 34, 140, 26), "Chiudi l'osteria", fill: Theme.lime) { finish(app) }
    }
}
