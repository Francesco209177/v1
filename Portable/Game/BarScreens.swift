/// I tre giochi del bar del porto: bocce contro Don Pinuccio, il cabinato «Acchiappasarde»
/// e la sfida a ritmo contro Chef Lustri. La logica è in `BocceSim`, `ArcadeSim` e `RhythmSim`;
/// qui il disegno, i comandi e la chiusura della partita.

/// Base comune dei giochi del bar: titolo e riga informativa in alto, comandi a schermo,
/// pausa con uscita, riquadro del risultato con il pulsante per tornare al Paese.
class BarScreen: Screen {
    /// true nella prova automatica: la partita si gioca da sola.
    var autoplay: Bool = false

    static let shadow: RGBA = RGBA(hex: 0x120C10)

    let pad: TouchPad = TouchPad()
    /// Titolo del gioco e riga di stato sotto il titolo.
    var title: String = ""
    var info: String = ""
    private(set) var result: (title: String, detail: String)? = nil
    private(set) var paused: Bool = false
    private(set) var leaving: Bool = false

    /// Pulsanti che servono a questo gioco.
    var buttons: [GameButtons] { return [GameButtons.primary, GameButtons.pause] }
    /// Musica di fondo: nil per il silenzio.
    var musicId: String? { return "porto" }

    /// Il gioco è in corso: niente pausa, niente risultato, nessuna uscita in corso.
    var playing: Bool { return result == nil && !paused && !leaving }

    /// Altezza del mondo che lascia vedere almeno `width` pixel d'arte in larghezza.
    static func fitHeight(width: Double, minimum: Double) -> Double {
        let app: App = App.shared
        let ratio: Double = Double(app.deviceHeight) / Double(max(app.deviceWidth, 1))
        return max(minimum, width * ratio)
    }

    override func enter(_ app: App) {
        Mixer.shared.music(musicId)
        pad.configure(actions: buttons)
        pad.layout(safe: app.safe)
    }

    override func leave(_ app: App) {
        pad.releaseAll(app.input)
    }

    /// Legge i comandi a schermo. Le sottoclassi prendono prima i loro tocchi diretti e poi chiamano questa.
    override func controls(_ app: App) {
        pad.layout(safe: app.safe)
        pad.hidden = !playing
        pad.read(app.input)
    }

    override func back(_ app: App) -> Bool {
        if leaving { return true }
        if result != nil {
            leaveGame(app)
        } else {
            setPaused(!paused, app)
        }
        return true
    }

    private func setPaused(_ value: Bool, _ app: App) {
        paused = value
        pad.releaseAll(app.input)
    }

    /// Un tocco nuovo non ancora preso da nessuno, lontano dai pulsanti a schermo.
    func freshTouches(_ app: App) -> [TouchPoint] {
        var out: [TouchPoint] = []
        for touch in app.input.touches where touch.began && touch.owner == nil && !onPadButton(touch.x, touch.y) {
            out.append(touch)
        }
        return out
    }

    private func onPadButton(_ x: Double, _ y: Double) -> Bool {
        for action in buttons {
            guard let center: (x: Int, y: Int) = pad.center(of: action) else { continue }
            let dx: Double = x - Double(center.x)
            let dy: Double = y - Double(center.y)
            let reach: Double = action == GameButtons.pause ? 18 : 30
            if dx * dx + dy * dy <= reach * reach { return true }
        }
        return false
    }

    /// Da chiamare all'inizio di ogni fotogramma: ritorna false se la partita è ferma o finita.
    func beginTick(_ app: App) -> Bool {
        let input: Input = app.input
        if leaving { return false }
        if result != nil {
            if input.pressed.contains(GameButtons.interact) || input.pressed.contains(GameButtons.primary) {
                Feedback.tap()
                leaveGame(app)
            }
            return false
        }
        if input.pressed.contains(GameButtons.pause) { setPaused(!paused, app) }
        if paused {
            if input.pressed.contains(GameButtons.interact) { setPaused(false, app) }
            return false
        }
        return true
    }

    func showResult(title: String, detail: String, _ app: App) {
        if result != nil { return }
        result = (title: title, detail: detail)
        paused = false
        pad.releaseAll(app.input)
    }

    /// Torna al Paese (o al titolo, se non c'è una partita).
    func leaveGame(_ app: App) {
        if leaving { return }
        leaving = true
        pad.releaseAll(app.input)
        if GameSession.shared.state != nil {
            Flow.showHub(app, panel: VillagePanel())
        } else {
            Flow.showTitle(app)
        }
    }

    // MARK: Interfaccia comune

    /// Titolo e riga di stato in alto al centro. Ritorna il bordo libero sotto.
    @discardableResult
    func drawHeader(_ app: App, _ g: Canvas) -> Int {
        let safe: Rect = app.safe
        let scale: Int = PixelFont.shared.width(title, scale: 2) <= safe.w - 90 ? 2 : 1
        var y: Int = safe.y + 6
        g.text(title, x: safe.midX, y: y, Theme.lime, align: TextAlign.center, scale: scale, shadow: BarScreen.shadow)
        y += scale == 2 ? 18 : 12
        if !info.isEmpty {
            for line in PixelFont.shared.wrap(info, maxWidth: safe.w - 70) {
                g.text(line, x: safe.midX, y: y, Theme.ochre, align: TextAlign.center, shadow: BarScreen.shadow)
                y += PixelFont.lineHeight
            }
        }
        return y
    }

    /// Comandi a schermo, pausa e riquadro del risultato: da chiamare alla fine di `drawUI`.
    func drawOverlay(_ app: App, _ ui: UI) {
        pad.draw(ui.g, usingController: app.input.usingController)
        if let shown: (title: String, detail: String) = result {
            drawResult(app, ui, shown)
        } else if paused {
            drawPause(app, ui)
        }
    }

    private func drawPause(_ app: App, _ ui: UI) {
        let g: Canvas = ui.g
        let safe: Rect = app.safe
        g.fill(x: 0, y: 0, w: g.width, h: g.height, Theme.ink.withAlpha(184))
        g.text("PAUSA", x: safe.midX, y: safe.y + Int(Double(safe.h) * 0.22), Theme.white, align: TextAlign.center, scale: 3)
        let by: Int = safe.midY + 4
        if ui.button("bar.riprendi", Rect(safe.midX - 70, by, 140, 26), "Riprendi") { setPaused(false, app) }
        if ui.button("bar.esci", Rect(safe.midX - 70, by + 34, 140, 26), "Torna al Paese", fill: Theme.lime) { leaveGame(app) }
    }

    /// Riquadro di fine partita: titolo, due righe, un pulsante.
    private func drawResult(_ app: App, _ ui: UI, _ shown: (title: String, detail: String)) {
        let g: Canvas = ui.g
        let safe: Rect = app.safe
        g.fill(x: 0, y: 0, w: g.width, h: g.height, Theme.ink.withAlpha(184))
        let w: Int = min(240, safe.w - 20)
        let lines: [String] = PixelFont.shared.wrap(shown.detail, maxWidth: w - 26)
        let titleScale: Int = PixelFont.shared.width(shown.title, scale: 2) <= w - 20 ? 2 : 1
        let titleH: Int = titleScale == 2 ? 14 : 7
        let h: Int = 12 + titleH + 10 + lines.count * PixelFont.lineHeight + 8 + 26 + 10
        let card: Rect = Rect(safe.midX - w / 2, safe.midY - h / 2, w, h)
        g.roundRect(card, radius: 12, Theme.lime)
        var y: Int = card.y + 12
        g.text(shown.title, x: card.midX, y: y, Theme.ink, align: TextAlign.center, scale: titleScale)
        y += titleH + 10
        for line in lines {
            g.text(line, x: card.midX, y: y, Theme.ink.withAlpha(204), align: TextAlign.center)
            y += PixelFont.lineHeight
        }
        let button: Rect = Rect(card.midX - 56, card.maxY - 36, 112, 26)
        if ui.button("bar.continua", button, "Continua", fill: Theme.turquoise) { leaveGame(app) }
    }
}

// MARK: - Bocce

/// Una mano di bocce contro Don Pinuccio, vista dall'alto. La levetta (o il dito sul campo) sceglie
/// la direzione; tenendo premuto la forza sale e scende, e al rilascio la boccia parte.
final class BocceScreen: BarScreen {
    static let bet: Int = 20
    private static let unit: Double = 1.25
    private static let earth: RGBA = RGBA(hex: 0xD9C58F)
    private static let groove: RGBA = RGBA(hex: 0xC9B27C)
    private static let border: RGBA = RGBA(hex: 0x6A4E2A)
    private static let grass: RGBA = RGBA(hex: 0x2F5F3A)

    private var sim: BocceSim
    private var angle: Double = 0
    private var charge: Double = 0
    private var charging: Bool = false
    private var touchAiming: Bool = false
    private var rivalClock: Double = 1.0
    private var settled: Bool = false
    // Angolo in alto a sinistra del campo sulla tela del mondo.
    private var originX: Double = 0
    private var originY: Double = 0

    init(seed: UInt64) {
        sim = BocceSim(seed: seed)
        super.init()
        title = "Bocce contro Don Pinuccio"
        refreshInfo()
    }

    override var worldHeight: Double { return BarScreen.fitHeight(width: 400, minimum: 180) }

    private var myTurn: Bool { return sim.turn == 0 && !sim.rolling && !sim.finished }

    /// Il campo, disegnato in orizzontale e un po' spostato a destra per far posto ai giocatori.
    private func layoutField(width: Int, height: Int) {
        let w: Double = BocceSim.length * BocceScreen.unit
        let h: Double = BocceSim.width * BocceScreen.unit
        originX = (Double(width) - w) / 2 + 12
        originY = (Double(height) - h) / 2 + 8
    }

    /// Dal campo (x larghezza, y in avanti) alla tela del mondo.
    private func point(_ p: Vec2) -> Vec2 {
        return Vec2(originX + p.y * BocceScreen.unit, originY + p.x * BocceScreen.unit)
    }

    private func powerLevel() -> Double {
        return 1 - abs(1 - charge.truncatingRemainder(dividingBy: 2))
    }

    // MARK: Comandi

    override func controls(_ app: App) {
        if playing && myTurn && !autoplay {
            layoutField(width: app.worldCanvas.width, height: app.worldCanvas.height)
            // Un dito sul campo: mira verso il dito e carica finché resta appoggiato.
            for touch in freshTouches(app) where !touchAiming {
                let wx: Double = app.worldFromUI(touch.x)
                let wy: Double = app.worldFromUI(touch.y)
                let field: Double = BocceSim.width * BocceScreen.unit
                if wx >= originX - 8 && wy >= originY - 24 && wy <= originY + field + 24 {
                    app.input.claim(touch.id, owner: "bocce.tiro")
                    touchAiming = true
                }
            }
            if touchAiming {
                if let touch: TouchPoint = app.input.touch(owner: "bocce.tiro"), !touch.ended {
                    aim(at: Vec2(app.worldFromUI(touch.x), app.worldFromUI(touch.y)))
                } else {
                    touchAiming = false
                }
            }
        } else {
            touchAiming = false
        }
        super.controls(app)
    }

    /// Punta la boccia verso un punto della tela del mondo.
    private func aim(at world: Vec2) {
        let start: Vec2 = point(sim.startPoint)
        let forward: Double = max(world.x - start.x, 12)
        angle = MathUtil.clamp(atan2(world.y - start.y, forward), -0.42, 0.42)
    }

    // MARK: Ciclo

    override func update(_ app: App, _ dt: Double) {
        if !beginTick(app) { return }
        let input: Input = app.input
        if myTurn && !autoplay {
            // Direzione con la levetta (su e giù), forza tenendo premuto.
            angle = MathUtil.clamp(angle - input.move.y * 0.9 * dt, -0.42, 0.42)
            if input.held.contains(GameButtons.primary) || touchAiming {
                charging = true
                charge += dt * 1.25
            } else if charging {
                charging = false
                handle(sim.throwBall(angle: angle, power: powerLevel()))
                charge = 0
            }
        } else if !sim.rolling && !sim.finished {
            charging = false
            charge = 0
            rivalClock -= dt
            if rivalClock <= 0 {
                rivalClock = 1.1
                let shot: (angle: Double, power: Double) = sim.rivalThrow(skill: sim.turn == 0 ? 0.9 : 0.72)
                handle(sim.throwBall(angle: shot.angle, power: shot.power))
            }
        }
        handle(sim.step(dt: dt))
        refreshInfo()

        if sim.finished && !settled {
            settled = true
            let score: (winner: Int, points: Int) = sim.score()
            let won: Bool = score.winner == 0 && score.points > 0
            if won {
                GameSession.shared.pay(-BocceScreen.bet * 2)
                GameSession.shared.record(game: "bocce", score: score.points)
            }
            Feedback.success()
            showResult(title: won ? "Hai vinto!" : "Ha vinto Don Pinuccio",
                       detail: won ? "\(score.points) punti a te. «La provvidenza ha il braccio corto, stasera.» Vinci \(BocceScreen.bet) monete."
                                   : "\(score.points) punti a lui. «Offri tu, figliola.» Perdi le \(BocceScreen.bet) monete della scommessa.", app)
        }
    }

    private func refreshInfo() {
        let score: (winner: Int, points: Int) = sim.score()
        let mine: Int = BocceSim.ballsEach - sim.thrown[0]
        let his: Int = BocceSim.ballsEach - sim.thrown[1]
        let leader: String = sim.balls.count < 3 ? "" : (score.winner == 0 ? " · sei più vicina tu" : " · è più vicino lui")
        info = "Bocce tue: \(mine) · sue: \(his)\(leader)"
    }

    private func handle(_ events: [BocceEvent]) {
        for event in events {
            switch event {
            case .thrown: Feedback.tap()
            case .clack: Feedback.hit()
            case .settled: Feedback.tap()
            }
        }
    }

    // MARK: Disegno

    override func drawWorld(_ app: App, _ g: Canvas) {
        g.clear(BocceScreen.grass)
        layoutField(width: g.width, height: g.height)
        let w: Int = Int((BocceSim.length * BocceScreen.unit).rounded())
        let h: Int = Int((BocceSim.width * BocceScreen.unit).rounded())
        let x0: Int = Int(originX.rounded())
        let y0: Int = Int(originY.rounded())
        g.fill(x: x0 - 6, y: y0 - 6, w: w + 12, h: h + 12, BocceScreen.border)
        g.fill(x: x0, y: y0, w: w, h: h, BocceScreen.earth)
        // Rigature della terra battuta.
        var x: Int = 16
        while x < w {
            g.fill(x: x0 + x, y: y0, w: 1, h: h, BocceScreen.groove)
            x += 16
        }

        // I due giocatori, a sinistra del campo.
        let sprites: Sprites = Sprites.shared
        g.sprite(sprites.get("tecla_stand_0"), x: x0 - 22, y: y0 + h / 2 - 8)
        g.sprite(sprites.get("pinuccio_stand_0"), x: x0 - 22, y: y0 + h + 10)

        // Bocce e pallino.
        for ball in sim.balls {
            let p: Vec2 = point(ball.position)
            let name: String = ball.owner == 2 ? "pallino_0" : "boccia_\(ball.owner)"
            g.sprite(sprites.get(name), x: Int(p.x.rounded()), y: Int(p.y.rounded()))
        }

        // Freccia di mira.
        if myTurn && !autoplay && playing {
            let start: Vec2 = point(sim.startPoint)
            let tip: Vec2 = Vec2(start.x + cos(angle) * 30, start.y + sin(angle) * 30)
            g.line(start.x, start.y, tip.x, tip.y, thickness: 2, Theme.lime)
        }
    }

    override func drawUI(_ app: App, _ ui: UI) {
        let g: Canvas = ui.g
        let safe: Rect = app.safe
        drawHeader(app, g)
        if myTurn && !autoplay && playing {
            let bar: Rect = Rect(safe.midX - 56, safe.maxY - 18, 112, 8)
            ui.bar(bar, fraction: charging ? powerLevel() : 0, fill: Theme.ochre, back: Theme.ink.withAlpha(170))
        }
        drawOverlay(app, ui)
    }
}

// MARK: - Cabinato

/// «Acchiappasarde»: il vecchio cabinato del bar. La levetta (o il dito) muove la cassetta.
final class ArcadeScreen: BarScreen {
    static let coin: Int = 5
    private static let unit: Double = 1.4

    private var sim: ArcadeSim
    private var settled: Bool = false
    private var dragging: Bool = false
    private var dragX: Double = 0
    // Angolo in alto a sinistra dello schermo del cabinato sulla tela del mondo.
    private var originX: Double = 0
    private var originY: Double = 0

    override var buttons: [GameButtons] { return [GameButtons.pause] }

    init(seed: UInt64) {
        sim = ArcadeSim(seed: seed)
        super.init()
        title = "Acchiappasarde"
        refreshInfo()
    }

    override var worldHeight: Double { return 244 }

    private func layoutScreen(width: Int, height: Int) {
        originX = ((Double(width) - ArcadeSim.width * ArcadeScreen.unit) / 2).rounded()
        originY = ((Double(height) - ArcadeSim.height * ArcadeScreen.unit) / 2).rounded()
    }

    private func point(x: Double, y: Double) -> Vec2 {
        return Vec2(originX + x * ArcadeScreen.unit, originY + y * ArcadeScreen.unit)
    }

    override func controls(_ app: App) {
        if playing && !autoplay {
            layoutScreen(width: app.worldCanvas.width, height: app.worldCanvas.height)
            // Un dito ovunque: la cassetta lo insegue.
            for touch in freshTouches(app) where !dragging {
                app.input.claim(touch.id, owner: "cabinato.dito")
                dragging = true
            }
            if dragging {
                if let touch: TouchPoint = app.input.touch(owner: "cabinato.dito"), !touch.ended {
                    dragX = (app.worldFromUI(touch.x) - originX) / ArcadeScreen.unit
                } else {
                    dragging = false
                }
            }
        } else {
            dragging = false
        }
        super.controls(app)
    }

    override func update(_ app: App, _ dt: Double) {
        if !beginTick(app) { return }
        var move: Double = app.input.move.x
        if dragging {
            move = MathUtil.clamp((dragX - sim.basketX) / 6, -1, 1)
        }
        if autoplay {
            var target: ArcadeItem? = nil
            for item in sim.items where item.kind != ArcadeItem.Kind.riccio {
                if target == nil || item.y > (target?.y ?? 0) { target = item }
            }
            if let item: ArcadeItem = target {
                move = item.x > sim.basketX + 2 ? 1.0 : (item.x < sim.basketX - 2 ? -1.0 : 0.0)
            } else {
                move = 0
            }
        }
        for event in sim.step(moveX: move, dt: dt) {
            switch event {
            case .caught(let kind, _):
                if kind == ArcadeItem.Kind.orata {
                    Feedback.success()
                } else {
                    Feedback.tap()
                }
            case .stung: Feedback.thud()
            case .gameOver: Feedback.warning()
            }
        }
        refreshInfo()

        if sim.finished && !settled {
            settled = true
            let isRecord: Bool = GameSession.shared.record(game: "cabinato", score: sim.score)
            let prize: Int = sim.score / 4
            if prize > 0 { GameSession.shared.pay(-prize) }
            showResult(title: isRecord ? "Nuovo primato!" : "Partita finita",
                       detail: "\(sim.score) punti. Il barista ti allunga \(prize) monete di premio.", app)
        }
    }

    private func refreshInfo() {
        let best: Int = GameSession.shared.state?.village.records["cabinato"] ?? 0
        info = "Punti \(sim.score) · Vite \(sim.lives) · Primato \(max(best, sim.score))"
    }

    override func drawWorld(_ app: App, _ g: Canvas) {
        g.clear(RGBA(hex: 0x16101C))
        layoutScreen(width: g.width, height: g.height)
        let w: Int = Int((ArcadeSim.width * ArcadeScreen.unit).rounded())
        let h: Int = Int((ArcadeSim.height * ArcadeScreen.unit).rounded())
        let x0: Int = Int(originX)
        let y0: Int = Int(originY)
        // Il mobile: legno scuro, cornice, schermo blu notte.
        g.fill(x: x0 - 22, y: y0 - 15, w: w + 44, h: h + 30, RGBA(hex: 0x4A2E22))
        g.fill(x: x0 - 5, y: y0 - 5, w: w + 10, h: h + 10, RGBA(hex: 0x1A1626))
        g.fill(x: x0, y: y0, w: w, h: h, RGBA(hex: 0x10305A))

        let sprites: Sprites = Sprites.shared
        let clip: Rect = g.pushClip(Rect(x0, y0, w, h))
        for item in sim.items {
            let name: String = item.kind == ArcadeItem.Kind.riccio ? "pickup_riccio" : (item.kind == ArcadeItem.Kind.orata ? "orata_swim_0" : "sardina_swim_0")
            let image: Image = sprites.get(name)
            let p: Vec2 = point(x: item.x, y: item.y)
            g.draw(image, x: Int(p.x.rounded()) - image.width / 2, y: Int(p.y.rounded()) - image.height / 2)
        }
        let crate: Image = sprites.get("port_crate")
        let b: Vec2 = point(x: sim.basketX, y: ArcadeSim.basketY)
        g.draw(crate, x: Int(b.x.rounded()) - crate.width / 2, y: Int(b.y.rounded()) - 3)
        g.restoreClip(clip)

        // Righe di scansione del tubo catodico.
        var y: Int = y0 + 1
        while y < y0 + h {
            g.fill(x: x0, y: y, w: w, h: 1, RGBA(r: 0, g: 0, b: 0, a: 42))
            y += 2
        }
    }

    override func drawUI(_ app: App, _ ui: UI) {
        drawHeader(app, ui.g)
        drawOverlay(app, ui)
    }
}

// MARK: - Sfida a ritmo

/// La sfida di Chef Lustri: due corsie di note che scorrono verso la linea. Il tasto dell'arpione
/// è il coltello (corsia alta), il tasto azione la padella (corsia bassa); col dito si tocca la corsia.
final class RhythmScreen: BarScreen {
    private static let rivalSkill: Double = 0.70
    private static let noteSpeed: Double = 150

    private var sim: RhythmSim
    private var settled: Bool = false
    private var touchPressed: [Bool] = [false, false]
    private var teclaMood: String = "port_tecla_calm"
    private var lustriMood: String = "port_lustri_calm"
    private var judgeText: String = ""
    private var judgeColor: RGBA = Theme.lime
    private var judgeClock: Double = 9
    private var pulse: Double = 1
    private var rival: Int = 0
    // Centro della tela e linea di battuta, ricalcolati a ogni disegno.
    private var centerX: Double = 0
    private var centerY: Double = 0
    private var hitX: Double = -150

    override var buttons: [GameButtons] { return [GameButtons.primary, GameButtons.interact, GameButtons.pause] }
    /// Niente musica di fondo: il tempo lo tengono cassa e rullante.
    override var musicId: String? { return nil }

    init(seed: UInt64) {
        sim = RhythmSim(seed: seed)
        super.init()
        title = "La sfida di Lustri"
        info = "Arpione = coltello (sopra) · Azione = padella (sotto)"
    }

    override var worldHeight: Double { return BarScreen.fitHeight(width: 400, minimum: 200) }

    private func layoutStage(width: Int, height: Int) {
        centerX = Double(width / 2)
        centerY = Double(height / 2) + 6
        hitX = -min(150, Double(width) / 2 - 50)
    }

    /// Quota delle corsie sulla tela (y verso il basso): sopra il coltello, sotto la padella.
    private func laneY(_ lane: Int) -> Double { return centerY + (lane == 0 ? -22 : 22) }

    override func controls(_ app: App) {
        touchPressed = [false, false]
        if playing && !autoplay {
            layoutStage(width: app.worldCanvas.width, height: app.worldCanvas.height)
            // Un tocco sulla metà alta è il coltello, sulla metà bassa la padella.
            for touch in freshTouches(app) {
                app.input.claim(touch.id, owner: "sfida.\(touch.id)")
                touchPressed[app.worldFromUI(touch.y) < centerY ? 0 : 1] = true
            }
        }
        super.controls(app)
    }

    private func show(_ text: String, color: RGBA) {
        judgeText = text
        judgeColor = color
        judgeClock = 0
    }

    override func update(_ app: App, _ dt: Double) {
        judgeClock += dt
        pulse = max(1, pulse - dt * 1.2 / 0.18)
        if !beginTick(app) { return }
        let input: Input = app.input
        var pressed: [Bool] = [input.pressed.contains(GameButtons.primary) || touchPressed[0],
                               input.pressed.contains(GameButtons.interact) || touchPressed[1]]
        if autoplay {
            // Il giocatore automatico preme nell'istante giusto.
            for note in sim.notes where note.judgement == nil && abs(note.time - sim.time) <= dt * 0.6 { pressed[note.lane] = true }
        }
        for event in sim.step(dt: dt, pressed: pressed) {
            switch event {
            case .hit(_, let judgement):
                Feedback.hit(sound: SFXKind.hat)
                show(judgement == RhythmJudgement.perfect ? "Perfetto!" : "Bene",
                     color: judgement == RhythmJudgement.perfect ? Theme.ochre : Theme.lime)
                teclaMood = "port_tecla_happy"
            case .missed:
                show("Mancata", color: Theme.danger)
                teclaMood = "port_tecla_sad"
            case .stray:
                Feedback.thud()
                teclaMood = "port_tecla_shock"
            case .beat(let number):
                // Il battito: cassa e rullante alternati e una pulsazione della linea.
                Feedback.tap(sound: number % 2 == 0 ? SFXKind.kick : SFXKind.snare)
                pulse = 2.2
            case .finished:
                break
            }
        }

        // Lustri accumula i suoi punti in proporzione al tempo trascorso.
        let progress: Double = MathUtil.clamp(sim.time / max(sim.duration, 1), 0, 1)
        rival = Int(Double(sim.rivalScore(skill: RhythmScreen.rivalSkill)) * progress)
        lustriMood = sim.score >= rival ? "port_lustri_angry" : "port_lustri_happy"

        if sim.finished && !settled {
            settled = true
            let target: Int = sim.rivalScore(skill: RhythmScreen.rivalSkill)
            let won: Bool = sim.score >= target
            GameSession.shared.finishDuel(won: won)
            GameSession.shared.record(game: "sfida", score: sim.score)
            Feedback.success()
            showResult(title: won ? "Lustri battuto!" : "Ha vinto Lustri",
                       detail: won ? "\(sim.score) a \(target). «Fortuna da principiante.» Vinci 120 monete e 8 punti di fama."
                                   : "\(sim.score) a \(target). «Si alleni, signorina.» Si può riprovare alla prossima sfida.", app)
        }
    }

    override func drawWorld(_ app: App, _ g: Canvas) {
        g.clear(RGBA(hex: 0x2A1A1E))
        layoutStage(width: g.width, height: g.height)
        let sprites: Sprites = Sprites.shared
        let hx: Int = Int((centerX + hitX).rounded())
        var lane: Int = 0
        while lane < 2 {
            let y: Int = Int(laneY(lane).rounded())
            g.fill(x: 0, y: y - 17, w: g.width, h: 34, RGBA(hex: lane == 0 ? 0x4A2A26 : 0x243A40))
            g.sprite(sprites.get("note_\(lane)"), x: hx, y: y, ink: Ink.alpha(89))
            lane += 1
        }
        let lineW: Int = max(3, Int((3 * pulse).rounded()))
        g.fill(x: hx - lineW / 2, y: Int(centerY.rounded()) - 43, w: lineW, h: 86, Theme.lime.withAlpha(178))

        // Le note scorrono da destra verso la linea.
        let right: Double = Double(g.width) + 12
        for note in sim.notes where note.judgement == nil {
            let x: Double = centerX + hitX + (note.time - sim.time) * RhythmScreen.noteSpeed
            if x > right { break }
            if x < centerX + hitX - 40 { continue }
            g.sprite(sprites.get("note_\(note.lane)"), x: Int(x.rounded()), y: Int(laneY(note.lane).rounded()))
        }

        // Tecla e Lustri ai due lati, in alto.
        let side: Int = Int(min(210, centerX - 30))
        let feet: Int = Int(centerY.rounded()) - 52
        g.sprite(sprites.get(teclaMood), x: Int(centerX) - side, y: feet)
        g.sprite(sprites.get(lustriMood), x: Int(centerX) + side, y: feet, flipX: true)
    }

    override func drawUI(_ app: App, _ ui: UI) {
        let g: Canvas = ui.g
        let safe: Rect = app.safe
        let bottom: Int = drawHeader(app, g)
        g.text("Tecla \(sim.score)  —  Lustri \(rival)   ·   serie ×\(sim.combo)", x: safe.midX, y: bottom + 3, Theme.white,
               align: TextAlign.center, shadow: BarScreen.shadow)
        if judgeClock < 0.6 && !judgeText.isEmpty {
            let alpha: Double = judgeClock < 0.35 ? 1 : max(0, 1 - (judgeClock - 0.35) / 0.25)
            let a: UInt8 = UInt8(alpha * 255)
            g.text(judgeText, x: safe.midX, y: safe.midY + Int(Double(safe.h) * 0.30) - 7, judgeColor.withAlpha(a),
                   align: TextAlign.center, scale: 2, shadow: BarScreen.shadow.withAlpha(a))
        }
        drawOverlay(app, ui)
    }
}
