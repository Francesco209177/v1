/// Acqua e luce disegnate a mano, senza shader: servono al titolo, all'immersione e alle scene sott'acqua.
enum WaterPaint {
    /// Sfumatura dell'acqua a fasce.
    static func fill(_ g: Canvas, top: RGBA, bottom: RGBA) {
        g.gradient(Rect(0, 0, g.width, g.height), top: top, bottom: bottom, band: 4)
    }

    /// Fasci di luce obliqui che scendono dalla superficie e si spengono verso il basso.
    /// - Parameters:
    ///   - strength: da 0 a 1.
    ///   - surfaceY: riga della tela dove si trova la superficie (può essere sopra lo schermo).
    static func rays(_ g: Canvas, time: Double, strength: Double, surfaceY: Int = 0, offsetX: Double = 0) {
        if strength <= 0.01 { return }
        let count: Int = 7
        let reach: Double = Double(g.height) * 0.95
        var i: Int = 0
        while i < count {
            let phase: Double = Double(i) * 1.7
            let base: Double = (Double(i) + 0.5) / Double(count) * Double(g.width + 160) - 80 - offsetX.truncatingRemainder(dividingBy: Double(g.width + 160))
            let sway: Double = sin(time * 0.35 + phase) * 14
            let width: Int = 10 + Int((sin(phase * 2.3) * 0.5 + 0.5) * 16)
            let pulse: Double = 0.55 + 0.45 * sin(time * 0.8 + phase * 1.3)
            // Quando la superficie è sopra lo schermo i fasci partono dal bordo alto: la luce arriva comunque.
            let top: Int = max(0, surfaceY)
            var y: Int = top
            while y < g.height {
                let depth: Double = Double(y - top) / reach
                if depth >= 1 { break }
                let fade: Double = (1 - depth) * (1 - depth)
                // Pochi gradini di intensità invece di una sfumatura continua.
                let level: Int = Int((fade * strength * pulse * 60).rounded(.down) / 6) * 6
                if level > 0 {
                    var x: Int = Int(base + sway + Double(y - surfaceY) * 0.42)
                    let span: Int = g.width + 160
                    x = ((x + 80) % span + span) % span - 80
                    g.addLight(x: x, y: y, w: width, h: 2, RGBA(r: UInt8(level), g: UInt8(level), b: UInt8(min(255, level * 9 / 10)), a: 255))
                }
                y += 2
            }
            i += 1
        }
    }
}

/// Bollicina che sale e svanisce.
struct RisingBubble {
    var x: Double
    var y: Double
    var vx: Double
    var age: Double
    let life: Double
    let sprite: String
}

/// Schermata del titolo e scelta della partita: mare aperto, raggi di luce, Tecla che nuota sotto il nome del gioco.
final class TitleScreen: Screen {
    private var swimmerX: Double = -200
    private var bubbles: [RisingBubble] = []
    private var bubbleTimer: Double = 0
    private var choosing: Bool
    private var deleting: Int? = nil
    private var fade: Double = 0
    private var slots: [GameState?] = []

    init(choosing: Bool = false) {
        self.choosing = choosing
    }

    override func enter(_ app: App) {
        Mixer.shared.music("porto")
        Mixer.shared.setUnderwater(0, immediately: true)
        reloadSlots()
    }

    private func reloadSlots() {
        slots = []
        var slot: Int = 0
        while slot < SaveStore.slotCount {
            slots.append(GameSession.shared.summary(slot: slot))
            slot += 1
        }
    }

    override func update(_ app: App, _ dt: Double) {
        let half: Double = Double(app.worldCanvas.width) / 2 + 40
        swimmerX += dt * 46
        if swimmerX > half { swimmerX = -half }
        bubbleTimer -= dt
        if bubbleTimer <= 0 {
            bubbleTimer = 0.35 + Double(app.frameCount % 5) * 0.07
            let y: Double = 18 - sin(app.time * 1.3) * 5
            bubbles.append(RisingBubble(x: swimmerX + 16, y: y - 3, vx: Double(-6 + app.frameCount % 13) / 2.2, age: 0, life: 2.2,
                                        sprite: "bubble_\(app.frameCount % 3)"))
        }
        var i: Int = 0
        while i < bubbles.count {
            bubbles[i].age += dt
            let t: Double = bubbles[i].age / bubbles[i].life
            bubbles[i].y -= 70 / bubbles[i].life * (1.6 - t * 1.2) * dt
            bubbles[i].x += bubbles[i].vx * dt
            i += 1
        }
        bubbles.removeAll(where: { $0.age >= $0.life })
        fade = min(1, fade + dt * (choosing ? 4 : -4))
        fade = max(0, fade)
        if !choosing && !app.isChanging {
            if app.input.touches.contains(where: { $0.ended && $0.travel < 20 }) || !app.input.pressed.isEmpty || app.input.confirm {
                choosing = true
                Feedback.tap()
            }
        }
    }

    override func drawWorld(_ app: App, _ g: Canvas) {
        WaterPaint.fill(g, top: RGBA(hex: 0x3CC4C8), bottom: RGBA(hex: 0x0B2E57))
        WaterPaint.rays(g, time: app.time, strength: 0.75)
        let cx: Int = g.width / 2
        let cy: Int = g.height / 2
        for bubble in bubbles {
            let alpha: Double = bubble.age > 1.5 ? max(0, 1 - (bubble.age - 1.5) / 0.7) : 0.9
            g.sprite(Sprites.shared.get(bubble.sprite), x: cx + Int(bubble.x.rounded()), y: cy + Int(bubble.y.rounded()), ink: Ink.alpha(Int(alpha * 255)))
        }
        let frames: Int = max(1, Sprites.shared.frameCount("tecla_swim"))
        let frame: Int = Int(app.time / 0.11) % frames
        let y: Double = 18 - sin(app.time * 1.3) * 5
        g.sprite(Sprites.shared.get("tecla_swim_\(frame)"), x: cx + Int(swimmerX.rounded()), y: cy + Int(y.rounded()))
    }

    override func drawUI(_ app: App, _ ui: UI) {
        let g: Canvas = ui.g
        let shadow: RGBA = RGBA(hex: 0x081A38)
        if fade < 1 {
            let alpha: UInt8 = UInt8((1 - fade) * 255)
            let scale: Int = g.width > 400 ? 4 : 3
            g.text("MAREA PROFONDA", x: g.width / 2, y: Int(Double(g.height) * 0.26), Theme.white.withAlpha(alpha), align: TextAlign.center,
                   scale: scale, shadow: shadow.withAlpha(alpha))
            let blink: Double = 0.62 + 0.38 * sin(ui.time * 3.9)
            g.text("TOCCA PER IMMERGERTI", x: g.width / 2, y: app.safe.maxY - 30, RGBA(hex: 0xFFEB9E).withAlpha(UInt8(Double(alpha) * blink)),
                   align: TextAlign.center, scale: 2, shadow: shadow.withAlpha(UInt8(Double(alpha) * blink)))
            g.text("versione Android", x: app.safe.maxX - 6, y: app.safe.maxY - 10, Theme.white.withAlpha(UInt8(Double(alpha) * 0.5)), align: TextAlign.right)
        }
        if fade <= 0 { return }
        g.fill(x: 0, y: 0, w: g.width, h: g.height, Theme.ink.withAlpha(UInt8(fade * 150)))
        if fade < 0.98 { return }
        drawSlots(app, ui)
    }

    private func drawSlots(_ app: App, _ ui: UI) {
        let g: Canvas = ui.g
        let safe: Rect = app.safe
        g.text("Scegli una partita", x: safe.midX, y: safe.y + 16, Theme.lime, align: TextAlign.center, scale: 2)
        let count: Int = SaveStore.slotCount
        let gap: Int = 8
        let cardW: Int = min(132, (safe.w - 24 - gap * (count - 1)) / count)
        let cardH: Int = 112
        let left: Int = safe.midX - (cardW * count + gap * (count - 1)) / 2
        let top: Int = safe.y + 44
        let confirming: Bool = deleting != nil
        if confirming { ui.blocked = true }
        var slot: Int = 0
        while slot < count {
            let card: Rect = Rect(left + slot * (cardW + gap), top, cardW, cardH)
            ui.card(card)
            g.text("Partita \(slot + 1)", x: card.midX, y: card.y + 9, Theme.ink, align: TextAlign.center)
            if slot < slots.count, let state: GameState = slots[slot] {
                let rank: String = GameData.shared.balance.rank(fame: state.fame)?.name.text() ?? ""
                g.text("Giorno \(state.day) · \(GameEnvironment.phaseName(state.phase))", x: card.midX, y: card.y + 26, Theme.muted, align: TextAlign.center)
                g.text("\(state.gold) oro", x: card.midX, y: card.y + 38, Theme.muted, align: TextAlign.center)
                g.text(rank, x: card.midX, y: card.y + 50, Theme.muted, align: TextAlign.center)
                if ui.button("slot.\(slot)", Rect(card.x + 8, card.y + 64, card.w - 16, 22), "Continua") { play(app, slot) }
                let erase: Rect = Rect(card.midX - 24, card.y + 92, 48, 14)
                let state: UI.Press = ui.press("slot.elimina.\(slot)", erase)
                g.text("Elimina", x: erase.midX, y: erase.y + 3, state.down ? Theme.danger.scaled(0.7) : Theme.danger, align: TextAlign.center)
                if state.focused { ui.focusRing(erase) }
                if state.clicked { deleting = slot }
            } else {
                g.text("Vuota", x: card.midX, y: card.y + 34, Theme.muted, align: TextAlign.center)
                if ui.button("slot.\(slot)", Rect(card.x + 8, card.y + 64, card.w - 16, 22), "Nuova partita", fill: Theme.ochre) { play(app, slot) }
            }
            slot += 1
        }
        if ui.button("slot.indietro", Rect(safe.midX - 55, top + cardH + 12, 110, 22), "Indietro", fill: Theme.lime) {
            choosing = false
        }
        if let slot: Int = deleting {
            ui.blocked = false
            g.fill(x: 0, y: 0, w: g.width, h: g.height, Theme.ink.withAlpha(150))
            let box: Rect = Rect(safe.midX - 100, safe.midY - 40, 200, 80)
            ui.card(box)
            g.text("Eliminare la partita \(slot + 1)?", x: box.midX, y: box.y + 14, Theme.ink, align: TextAlign.center)
            g.text("Non si può tornare indietro.", x: box.midX, y: box.y + 28, Theme.muted, align: TextAlign.center)
            if ui.button("slot.elimina.si", Rect(box.x + 12, box.y + 48, 82, 22), "Elimina", fill: Theme.danger, text: Theme.lime) {
                GameSession.shared.delete(slot: slot)
                deleting = nil
                reloadSlots()
            }
            if ui.button("slot.elimina.no", Rect(box.maxX - 94, box.y + 48, 82, 22), "Annulla", fill: Theme.shade) {
                deleting = nil
            }
        }
    }

    private func play(_ app: App, _ slot: Int) {
        GameSession.shared.start(slot: slot)
        Flow.showHub(app)
    }

    override func back(_ app: App) -> Bool {
        if deleting != nil {
            deleting = nil
            return true
        }
        if choosing {
            choosing = false
            return true
        }
        return false
    }
}
