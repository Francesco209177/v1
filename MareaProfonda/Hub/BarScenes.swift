import SpriteKit
import UIKit

/// Riquadro di fine partita dei giochi del bar: titolo, due righe, un pulsante.
final class MiniResult: SKNode {
    private let veil: SKSpriteNode = SKSpriteNode(color: Theme.ink, size: CGSize(width: 10, height: 10))
    private let card: SKShapeNode = SKShapeNode()
    private let titleLabel: SKLabelNode
    private let detailLabel: SKLabelNode = SKLabelNode()
    private let button: PillButton = PillButton(text: String(localized: "Continua"), size: CGSize(width: 180, height: 44), fill: Theme.turquoise)
    private var pressed: Bool = false
    var onDone: (() -> Void)?

    init(title: String, detail: String) {
        titleLabel = Theme.label(title, size: 24, weight: UIFont.Weight.heavy, color: Theme.ink)
        super.init()
        veil.alpha = 0.72
        addChild(veil)
        card.fillColor = Theme.lime
        card.strokeColor = SKColor.clear
        card.zPosition = 1
        card.path = CGPath(roundedRect: CGRect(x: -190, y: -92, width: 380, height: 184), cornerWidth: 22, cornerHeight: 22, transform: nil)
        addChild(card)
        titleLabel.zPosition = 2
        titleLabel.position = CGPoint(x: 0, y: 52)
        addChild(titleLabel)
        detailLabel.numberOfLines = 0
        detailLabel.preferredMaxLayoutWidth = 330
        detailLabel.lineBreakMode = NSLineBreakMode.byWordWrapping
        detailLabel.horizontalAlignmentMode = SKLabelHorizontalAlignmentMode.center
        detailLabel.verticalAlignmentMode = SKLabelVerticalAlignmentMode.center
        detailLabel.attributedText = Theme.attributed(detail, size: 14, weight: UIFont.Weight.semibold, color: Theme.ink.withAlphaComponent(0.8))
        detailLabel.zPosition = 2
        detailLabel.position = CGPoint(x: 0, y: 6)
        addChild(detailLabel)
        button.zPosition = 2
        button.position = CGPoint(x: 0, y: -56)
        addChild(button)
    }

    required init?(coder aDecoder: NSCoder) {
        titleLabel = SKLabelNode()
        super.init(coder: aDecoder)
    }

    func layout(sceneSize: CGSize) {
        veil.size = CGSize(width: sceneSize.width + 4, height: sceneSize.height + 4)
    }

    func touchBegan(at point: CGPoint) {
        if button.contains(point: point) {
            pressed = true
            button.setPressed(true)
        }
    }

    func touchEnded(at point: CGPoint) {
        let was: Bool = pressed
        pressed = false
        button.setPressed(false)
        if was && button.contains(point: point) { confirm() }
    }

    func confirm() {
        Feedback.tap()
        let done: (() -> Void)? = onDone
        onDone = nil
        done?()
    }
}

/// Base comune dei giochi del bar: comandi a schermo, pausa che fa uscire, riquadro finale.
class BarGameScene: BaseScene {
    let controls: TouchControls = TouchControls()
    private(set) var result: MiniResult?
    private var leaving: Bool = false
    /// true nella prova automatica: la partita si gioca da sola.
    var autoplay: Bool = false
    let titleLabel: SKLabelNode = Theme.label("", size: 16, weight: UIFont.Weight.heavy, color: Theme.lime)
    let infoLabel: SKLabelNode = Theme.label("", size: 13, weight: UIFont.Weight.semibold, color: Theme.ochre)

    private var lastInfo: String = ""

    /// Pulsanti che servono a questo gioco.
    var buttons: [GameButtons] { return [GameButtons.primary, GameButtons.pause] }

    /// Riga di stato sotto il titolo: si ridisegna solo quando cambia.
    func setInfo(_ text: String) {
        if text == lastInfo { return }
        lastInfo = text
        infoLabel.attributedText = Theme.attributed(text, size: 13, color: Theme.ochre)
    }

    func setupHUD() {
        ControllerSupport.shared.start()
        controls.zPosition = 10
        controls.configure(actions: buttons)
        hud.addChild(controls)
        titleLabel.zPosition = 5
        hud.addChild(titleLabel)
        infoLabel.zPosition = 5
        hud.addChild(infoLabel)
    }

    override func layoutHUD() {
        let safe: CGRect = hudSafeRect
        controls.layout(safe: safe, iconScale: hudIconScale(2.0))
        titleLabel.position = CGPoint(x: 0, y: safe.maxY - 16)
        infoLabel.position = CGPoint(x: 0, y: safe.maxY - 36)
        result?.layout(sceneSize: size)
    }

    func showResult(title: String, detail: String) {
        if result != nil { return }
        controls.releaseAll()
        controls.isHidden = true
        let panel: MiniResult = MiniResult(title: title, detail: detail)
        panel.zPosition = 700
        panel.layout(sceneSize: size)
        panel.onDone = { [weak self] in self?.leave() }
        hud.addChild(panel)
        result = panel
    }

    func leave() {
        if leaving { return }
        leaving = true
        if GameSession.shared.state != nil {
            SceneRouter.shared.showHub()
        } else {
            SceneRouter.shared.showTitle(animated: true)
        }
    }

    /// Da chiamare all'inizio di ogni fotogramma: ritorna false se la partita è finita o si sta uscendo.
    func beginTick() -> Bool {
        let input: InputManager = InputManager.shared
        input.beginFrame()
        if let panel: MiniResult = result {
            if input.pressed.contains(GameButtons.interact) || input.pressed.contains(GameButtons.primary) { panel.confirm() }
            return false
        }
        if input.pressed.contains(GameButtons.pause) {
            leave()
            return false
        }
        return !leaving
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            let point: CGPoint = touch.location(in: hud)
            if let panel: MiniResult = result {
                panel.touchBegan(at: point)
            } else {
                _ = controls.touchBegan(touch, at: point)
            }
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        if result != nil { return }
        for touch in touches { controls.touchMoved(touch, at: touch.location(in: hud)) }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            if let panel: MiniResult = result {
                panel.touchEnded(at: touch.location(in: hud))
            } else {
                controls.touchEnded(touch)
            }
        }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches { controls.touchEnded(touch) }
    }
}

// MARK: - Bocce

/// Una mano di bocce contro Don Pinuccio, vista dall'alto. La levetta sceglie la direzione;
/// tenendo premuto il tasto la forza sale e scende, e al rilascio la boccia parte.
final class BocceScene: BarGameScene {
    static let bet: Int = 20
    private var sim: BocceSim
    private let unit: Double = 1.55
    private var ballNodes: [SKSpriteNode] = []
    private let arrow: SKSpriteNode = SKSpriteNode(color: Theme.lime, size: CGSize(width: 30, height: 2))
    private let power: MeterBar = MeterBar()
    private var angle: Double = 0
    private var charge: Double = 0
    private var charging: Bool = false
    private var rivalClock: Double = 1.0
    private var settled: Bool = false

    init(size: CGSize, seed: UInt64) {
        sim = BocceSim(seed: seed)
        super.init(size: size)
    }

    required init?(coder aDecoder: NSCoder) {
        return nil
    }

    /// Dal campo (x larghezza, y in avanti) alla scena: il campo è disegnato in orizzontale.
    private func point(_ p: Vec2) -> CGPoint {
        return CGPoint(x: (p.y - BocceSim.length / 2) * unit, y: (BocceSim.width / 2 - p.x) * unit - 8)
    }

    override func setup() {
        backgroundColor = SKColor(hex: 0x2F5F3A)
        let w: Double = BocceSim.length * unit
        let h: Double = BocceSim.width * unit
        let border: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0x6A4E2A), size: CGSize(width: w + 12, height: h + 12))
        border.position = CGPoint(x: 0, y: -8)
        border.zPosition = 0
        world.addChild(border)
        let lane: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0xD9C58F), size: CGSize(width: w, height: h))
        lane.position = CGPoint(x: 0, y: -8)
        lane.zPosition = 1
        world.addChild(lane)
        // Rigature della terra battuta.
        var x: Double = -w / 2 + 20
        while x < w / 2 {
            let line: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0xC9B27C), size: CGSize(width: 1, height: h))
            line.position = CGPoint(x: x, y: -8)
            line.zPosition = 2
            world.addChild(line)
            x += 20
        }
        for (name, px, flip) in [("tecla_stand_0", -w / 2 - 26, false), ("pinuccio_stand_0", -w / 2 - 26, false)] {
            let figure: SKSpriteNode = SpriteForge.shared.node(name)
            figure.position = CGPoint(x: px, y: name.hasPrefix("tecla") ? 6.0 : -60.0)
            figure.xScale = flip ? -1 : 1
            figure.zPosition = 3
            world.addChild(figure)
        }
        arrow.anchorPoint = CGPoint(x: 0, y: 0.5)
        arrow.zPosition = 6
        world.addChild(arrow)
        setCamera(x: 0, y: 0)

        setupHUD()
        power.zPosition = 5
        hud.addChild(power)
        titleLabel.attributedText = Theme.attributed(String(localized: "Bocce contro Don Pinuccio"), size: 16, weight: UIFont.Weight.heavy, color: Theme.lime)
        syncBalls()
    }

    override func layoutHUD() {
        super.layoutHUD()
        power.resize(CGSize(width: 180, height: 12))
        power.position = CGPoint(x: -90, y: hudSafeRect.minY + 22)
    }

    private func syncBalls() {
        while ballNodes.count < sim.balls.count {
            let ball: BocceBall = sim.balls[ballNodes.count]
            let node: SKSpriteNode = SpriteForge.shared.node(ball.owner == 2 ? "pallino_0" : "boccia_\(ball.owner)")
            node.zPosition = 5
            world.addChild(node)
            ballNodes.append(node)
        }
        var i: Int = 0
        while i < sim.balls.count {
            ballNodes[i].position = point(sim.balls[i].position)
            i += 1
        }
    }

    override func tick(_ dt: Double) {
        if !beginTick() { return }
        let input: InputManager = InputManager.shared
        let myTurn: Bool = sim.turn == 0 && !sim.rolling && !sim.finished

        if myTurn && !autoplay {
            // Direzione con la levetta (su e giù), forza tenendo premuto.
            angle = MathUtil.clamp(angle - input.move.y * 0.9 * dt, -0.42, 0.42)
            if input.held.contains(GameButtons.primary) {
                charging = true
                charge += dt * 1.25
            } else if charging {
                charging = false
                let level: Double = 1 - abs(1 - charge.truncatingRemainder(dividingBy: 2))
                handle(sim.throwBall(angle: angle, power: level))
                charge = 0
            }
        } else if !sim.rolling && !sim.finished {
            rivalClock -= dt
            if rivalClock <= 0 {
                rivalClock = 1.1
                let shot: (angle: Double, power: Double) = sim.rivalThrow(skill: sim.turn == 0 ? 0.9 : 0.72)
                handle(sim.throwBall(angle: shot.angle, power: shot.power))
            }
        }
        handle(sim.step(dt: dt))
        syncBalls()

        let level: Double = 1 - abs(1 - charge.truncatingRemainder(dividingBy: 2))
        power.set(value: charging ? level : 0, color: Theme.ochre)
        power.isHidden = !myTurn || autoplay
        arrow.isHidden = !myTurn || autoplay
        arrow.position = point(sim.startPoint)
        arrow.zRotation = CGFloat(-angle)
        let score: (winner: Int, points: Int) = sim.score()
        let mine: Int = BocceSim.ballsEach - sim.thrown[0]
        let his: Int = BocceSim.ballsEach - sim.thrown[1]
        let leader: String = sim.balls.count < 3 ? "" : (score.winner == 0 ? String(localized: " · sei più vicina tu") : String(localized: " · è più vicino lui"))
        setInfo(String(localized: "Bocce tue: \(mine) · sue: \(his)\(leader)"))

        if sim.finished && !settled {
            settled = true
            let won: Bool = score.winner == 0 && score.points > 0
            if won {
                GameSession.shared.pay(-BocceScene.bet * 2)
                GameSession.shared.record(game: "bocce", score: score.points)
            }
            Feedback.success()
            showResult(title: won ? String(localized: "Hai vinto!") : String(localized: "Ha vinto Don Pinuccio"),
                       detail: won ? String(localized: "\(score.points) punti a te. «La provvidenza ha il braccio corto, stasera.» Vinci \(BocceScene.bet) monete.")
                                   : String(localized: "\(score.points) punti a lui. «Offri tu, figliola.» Perdi le \(BocceScene.bet) monete della scommessa."))
        }
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

    override var debugSummary: String {
        return "bocce=\(sim.balls.count - 1) turno=\(sim.turn) finita=\(sim.finished)"
    }
}

// MARK: - Cabinato

/// «Acchiappasarde»: il vecchio cabinato del bar. La levetta muove la cassetta.
final class ArcadeScene: BarGameScene {
    static let coin: Int = 5
    private var sim: ArcadeSim
    private let unit: Double = 1.4
    private let screen: SKNode = SKNode()
    private let basket: SKSpriteNode = SpriteForge.shared.node("port_crate")
    private var itemNodes: [Int: SKSpriteNode] = [:]
    private var settled: Bool = false

    override var buttons: [GameButtons] { return [GameButtons.pause] }

    init(size: CGSize, seed: UInt64) {
        sim = ArcadeSim(seed: seed)
        super.init(size: size)
    }

    required init?(coder aDecoder: NSCoder) {
        return nil
    }

    private func point(x: Double, y: Double) -> CGPoint {
        return CGPoint(x: (x - ArcadeSim.width / 2) * unit, y: (ArcadeSim.height / 2 - y) * unit)
    }

    override func setup() {
        backgroundColor = SKColor(hex: 0x16101C)
        let w: Double = ArcadeSim.width * unit
        let h: Double = ArcadeSim.height * unit
        // Il mobile: legno scuro, cornice, schermo blu notte.
        let cabinet: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0x4A2E22), size: CGSize(width: w + 44, height: h + 30))
        cabinet.zPosition = 0
        world.addChild(cabinet)
        let bezel: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0x1A1626), size: CGSize(width: w + 10, height: h + 10))
        bezel.zPosition = 1
        world.addChild(bezel)
        let glass: SKSpriteNode = SKSpriteNode(color: SKColor(hex: 0x10305A), size: CGSize(width: w, height: h))
        glass.zPosition = 2
        world.addChild(glass)
        screen.zPosition = 3
        world.addChild(screen)
        basket.zPosition = 2
        screen.addChild(basket)
        // Righe di scansione del tubo catodico.
        var image: PixelBuffer = PixelBuffer(width: 2, height: 2)
        image.set(0, 1, RGBA(r: 0, g: 0, b: 0, a: 70))
        image.set(1, 1, RGBA(r: 0, g: 0, b: 0, a: 70))
        let lines: SKTexture = TextureFactory.texture(from: image)
        var y: Double = -h / 2
        while y < h / 2 {
            let row: SKSpriteNode = SKSpriteNode(texture: lines, size: CGSize(width: w, height: 2))
            row.anchorPoint = CGPoint(x: 0.5, y: 0)
            row.position = CGPoint(x: 0, y: y)
            row.zPosition = 8
            row.alpha = 0.6
            world.addChild(row)
            y += 2
        }
        setCamera(x: 0, y: 0)
        setupHUD()
        titleLabel.attributedText = Theme.attributed(String(localized: "Acchiappasarde"), size: 16, weight: UIFont.Weight.heavy, color: Theme.lime)
    }

    override func tick(_ dt: Double) {
        if !beginTick() { return }
        var move: Double = InputManager.shared.move.x
        if autoplay {
            let target: ArcadeItem? = sim.items.filter { $0.kind != ArcadeItem.Kind.riccio }.max(by: { $0.y < $1.y })
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
        basket.position = point(x: sim.basketX, y: ArcadeSim.basketY + 8)
        var seen: Set<Int> = []
        for item in sim.items {
            seen.insert(item.id)
            let node: SKSpriteNode
            if let existing: SKSpriteNode = itemNodes[item.id] {
                node = existing
            } else {
                let name: String = item.kind == ArcadeItem.Kind.riccio ? "pickup_riccio" : (item.kind == ArcadeItem.Kind.orata ? "orata_swim_0" : "sardina_swim_0")
                node = SpriteForge.shared.node(name)
                node.anchorPoint = CGPoint(x: 0.5, y: 0.5)
                node.zPosition = 1
                screen.addChild(node)
                itemNodes[item.id] = node
            }
            node.position = point(x: item.x, y: item.y)
        }
        for (id, node) in itemNodes where !seen.contains(id) {
            node.removeFromParent()
            itemNodes[id] = nil
        }
        let best: Int = GameSession.shared.state?.village.records["cabinato"] ?? 0
        setInfo(String(localized: "Punti \(sim.score) · Vite \(sim.lives) · Primato \(max(best, sim.score))"))

        if sim.finished && !settled {
            settled = true
            let isRecord: Bool = GameSession.shared.record(game: "cabinato", score: sim.score)
            let prize: Int = sim.score / 4
            if prize > 0 { GameSession.shared.pay(-prize) }
            showResult(title: isRecord ? String(localized: "Nuovo primato!") : String(localized: "Partita finita"),
                       detail: String(localized: "\(sim.score) punti. Il barista ti allunga \(prize) monete di premio."))
        }
    }

    override var debugSummary: String {
        return "punti=\(sim.score) vite=\(sim.lives) oggetti=\(sim.items.count)"
    }
}

// MARK: - Sfida a ritmo

/// La sfida di Chef Lustri: due corsie di note che scorrono verso la linea. Il tasto dell'arpione
/// è il coltello (corsia alta), il tasto azione la padella (corsia bassa).
final class RhythmScene: BarGameScene {
    private var sim: RhythmSim
    private let rivalSkill: Double = 0.70
    private let noteSpeed: Double = 150
    private let hitX: Double = -150
    private var noteNodes: [Int: SKSpriteNode] = [:]
    private let hitLine: SKSpriteNode = SKSpriteNode(color: Theme.lime, size: CGSize(width: 3, height: 86))
    private let judge: SKLabelNode = Theme.label("", size: 20, weight: UIFont.Weight.heavy, color: Theme.lime)
    private let scoreLabel: SKLabelNode = Theme.label("", size: 15, weight: UIFont.Weight.heavy, color: Theme.lime)
    private let tecla: SKSpriteNode = SpriteForge.shared.node("port_tecla_calm")
    private let lustri: SKSpriteNode = SpriteForge.shared.node("port_lustri_calm")
    private var settled: Bool = false
    private var lastScoreText: String = ""

    override var buttons: [GameButtons] { return [GameButtons.primary, GameButtons.interact, GameButtons.pause] }

    init(size: CGSize, seed: UInt64) {
        sim = RhythmSim(seed: seed)
        super.init(size: size)
    }

    required init?(coder aDecoder: NSCoder) {
        return nil
    }

    private func laneY(_ lane: Int) -> Double { return lane == 0 ? 22 : -22 }

    override func setup() {
        backgroundColor = SKColor(hex: 0x2A1A1E)
        for lane in 0..<2 {
            let track: SKSpriteNode = SKSpriteNode(color: SKColor(hex: lane == 0 ? 0x4A2A26 : 0x243A40), size: CGSize(width: 520, height: 34))
            track.position = CGPoint(x: 0, y: laneY(lane))
            track.zPosition = 0
            world.addChild(track)
            let target: SKSpriteNode = SpriteForge.shared.node("note_\(lane)")
            target.position = CGPoint(x: hitX, y: laneY(lane))
            target.alpha = 0.35
            target.zPosition = 1
            world.addChild(target)
        }
        hitLine.position = CGPoint(x: hitX, y: 0)
        hitLine.zPosition = 2
        hitLine.alpha = 0.7
        world.addChild(hitLine)
        tecla.position = CGPoint(x: -210, y: 96)
        tecla.zPosition = 3
        world.addChild(tecla)
        lustri.position = CGPoint(x: 210, y: 96)
        lustri.xScale = -1
        lustri.zPosition = 3
        world.addChild(lustri)
        setCamera(x: 0, y: 22)

        setupHUD()
        judge.zPosition = 6
        hud.addChild(judge)
        scoreLabel.zPosition = 6
        hud.addChild(scoreLabel)
        titleLabel.attributedText = Theme.attributed(String(localized: "La sfida di Lustri"), size: 16, weight: UIFont.Weight.heavy, color: Theme.lime)
        setInfo(String(localized: "Arpione = coltello (sopra) · Azione = padella (sotto)"))
    }

    override func layoutHUD() {
        super.layoutHUD()
        judge.position = CGPoint(x: 0, y: -hudSafeRect.height * 0.30)
        scoreLabel.position = CGPoint(x: 0, y: hudSafeRect.maxY - 58)
    }

    private func show(_ text: String, color: SKColor) {
        judge.attributedText = Theme.attributed(text, size: 20, weight: UIFont.Weight.heavy, color: color)
        judge.removeAllActions()
        judge.alpha = 1
        judge.run(SKAction.sequence([SKAction.wait(forDuration: 0.35), SKAction.fadeOut(withDuration: 0.25)]))
    }

    private func mood(_ sprite: SKSpriteNode, _ name: String) {
        let texture: SKTexture = SpriteForge.shared.texture(name)
        if sprite.texture !== texture { sprite.texture = texture }
    }

    override func tick(_ dt: Double) {
        if !beginTick() { return }
        let input: InputManager = InputManager.shared
        var pressed: [Bool] = [input.pressed.contains(GameButtons.primary), input.pressed.contains(GameButtons.interact)]
        if autoplay {
            // Il giocatore automatico preme nell'istante giusto.
            for note in sim.notes where note.judgement == nil && abs(note.time - sim.time) <= dt * 0.6 { pressed[note.lane] = true }
        }
        for event in sim.step(dt: dt, pressed: pressed) {
            switch event {
            case .hit(_, let judgement):
                Feedback.hit()
                show(judgement == RhythmJudgement.perfect ? String(localized: "Perfetto!") : String(localized: "Bene"),
                     color: judgement == RhythmJudgement.perfect ? Theme.ochre : Theme.lime)
                mood(tecla, "port_tecla_happy")
            case .missed:
                show(String(localized: "Mancata"), color: Theme.danger)
                mood(tecla, "port_tecla_sad")
            case .stray:
                Feedback.thud()
                mood(tecla, "port_tecla_shock")
            case .beat:
                // Il battito: una pulsazione della linea e un tocco leggero, come un metronomo.
                Feedback.tap()
                hitLine.removeAllActions()
                hitLine.xScale = 2.2
                hitLine.run(SKAction.scaleX(to: 1, duration: 0.18))
            case .finished:
                break
            }
        }

        // Le note scorrono da destra verso la linea.
        var index: Int = 0
        for note in sim.notes {
            let x: Double = hitX + (note.time - sim.time) * noteSpeed
            let visible: Bool = note.judgement == nil && x < 290 && x > hitX - 40
            if visible {
                let node: SKSpriteNode
                if let existing: SKSpriteNode = noteNodes[index] {
                    node = existing
                } else {
                    node = SpriteForge.shared.node("note_\(note.lane)")
                    node.zPosition = 4
                    world.addChild(node)
                    noteNodes[index] = node
                }
                node.position = CGPoint(x: x, y: laneY(note.lane))
            } else if let existing: SKSpriteNode = noteNodes[index] {
                existing.removeFromParent()
                noteNodes[index] = nil
            }
            index += 1
        }

        // Lustri accumula i suoi punti in proporzione al tempo trascorso.
        let progress: Double = MathUtil.clamp(sim.time / max(sim.duration, 1), 0, 1)
        let rival: Int = Int(Double(sim.rivalScore(skill: rivalSkill)) * progress)
        mood(lustri, sim.score >= rival ? "port_lustri_angry" : "port_lustri_happy")
        let scoreText: String = String(localized: "Tecla \(sim.score)  —  Lustri \(rival)   ·   serie ×\(sim.combo)")
        if scoreText != lastScoreText {
            lastScoreText = scoreText
            scoreLabel.attributedText = Theme.attributed(scoreText, size: 15, weight: UIFont.Weight.heavy, color: Theme.lime)
        }

        if sim.finished && !settled {
            settled = true
            let target: Int = sim.rivalScore(skill: rivalSkill)
            let won: Bool = sim.score >= target
            GameSession.shared.finishDuel(won: won)
            GameSession.shared.record(game: "sfida", score: sim.score)
            Feedback.success()
            showResult(title: won ? String(localized: "Lustri battuto!") : String(localized: "Ha vinto Lustri"),
                       detail: won ? String(localized: "\(sim.score) a \(target). «Fortuna da principiante.» Vinci 120 monete e 8 punti di fama.")
                                   : String(localized: "\(sim.score) a \(target). «Si alleni, signorina.» Si può riprovare alla prossima sfida."))
        }
    }

    override var debugSummary: String {
        return "punti=\(sim.score) perfette=\(sim.perfects) mancate=\(sim.misses) tempo=\(Int(sim.time))"
    }
}
