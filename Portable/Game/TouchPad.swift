/// Comandi a schermo: joystick analogico che compare dove si appoggia il pollice sinistro,
/// pulsanti rotondi a destra. Legge i tocchi e scrive in `Input`; il gioco non legge mai i tocchi direttamente.
final class TouchPad {
    private struct Button {
        let action: GameButtons
        let icon: String
        let tint: RGBA
        let radius: Int
        var x: Int = 0
        var y: Int = 0
        var held: Bool = false
    }

    var hidden: Bool = false
    private var buttons: [Button] = []
    private var safe: Rect = Rect(0, 0, 0, 0)
    private var leftZoneMaxX: Double = 0
    private let joyRadius: Double = 28
    private var joyActive: Bool = false
    private var joyOrigin: Vec2 = Vec2.zero
    private var joyKnob: Vec2 = Vec2.zero

    /// Sceglie quali pulsanti mostrare: solo quelli che in questa scena fanno qualcosa.
    func configure(actions: [GameButtons]) {
        buttons.removeAll()
        for action in actions {
            switch action {
            case .primary: buttons.append(Button(action: action, icon: "icon_harpoon", tint: Theme.ochre, radius: 22))
            case .interact: buttons.append(Button(action: action, icon: "icon_hand", tint: Theme.lime, radius: 17))
            case .secondary: buttons.append(Button(action: action, icon: "icon_net", tint: Theme.lime, radius: 15))
            case .inventory: buttons.append(Button(action: action, icon: "icon_bag", tint: Theme.lime, radius: 13))
            case .dash: buttons.append(Button(action: action, icon: "icon_dash", tint: Theme.turquoise, radius: 17))
            default: buttons.append(Button(action: action, icon: "icon_pause", tint: Theme.lime, radius: 11))
            }
        }
    }

    func layout(safe area: Rect) {
        safe = area
        leftZoneMaxX = Double(area.x) + Double(area.w) * 0.46
        let right: Int = area.maxX
        let bottom: Int = area.maxY
        let top: Int = area.y
        let hasPrimary: Bool = buttons.contains(where: { $0.action == GameButtons.primary })
        var i: Int = 0
        while i < buttons.count {
            switch buttons[i].action {
            case .primary:
                buttons[i].x = right - 32
                buttons[i].y = bottom - 36
            case .dash:
                buttons[i].x = hasPrimary ? right - 84 : right - 34
                buttons[i].y = hasPrimary ? bottom - 25 : bottom - 36
            case .interact:
                buttons[i].x = right - 74
                buttons[i].y = bottom - 68
            case .secondary:
                buttons[i].x = right - 28
                buttons[i].y = bottom - 86
            case .inventory:
                buttons[i].x = right - 48
                buttons[i].y = top + 16
            default:
                buttons[i].x = right - 16
                buttons[i].y = top + 16
            }
            i += 1
        }
    }

    /// Centro del pulsante di un'azione, se è in scena (per posare un'etichetta accanto).
    func center(of action: GameButtons) -> (x: Int, y: Int)? {
        guard let button: Button = buttons.first(where: { $0.action == action }) else { return nil }
        return (x: button.x, y: button.y)
    }

    /// Legge i tocchi di questo fotogramma. Da chiamare in `Screen.controls`.
    func read(_ input: Input) {
        if hidden {
            releaseAll(input)
            return
        }
        // Tocchi nuovi: prima i pulsanti, poi il joystick nella metà sinistra.
        for touch in input.touches where touch.began && touch.owner == nil {
            var taken: Bool = false
            var i: Int = 0
            while i < buttons.count {
                let dx: Double = touch.x - Double(buttons[i].x)
                let dy: Double = touch.y - Double(buttons[i].y)
                let reach: Double = Double(buttons[i].radius) + 5
                if !buttons[i].held && dx * dx + dy * dy <= reach * reach {
                    buttons[i].held = true
                    input.claim(touch.id, owner: "pad.\(buttons[i].action.key)")
                    input.touchHeld.insert(buttons[i].action)
                    Feedback.tap()
                    taken = true
                    break
                }
                i += 1
            }
            if !taken && !joyActive && touch.x <= leftZoneMaxX {
                joyActive = true
                joyOrigin = Vec2(touch.x, touch.y)
                joyKnob = joyOrigin
                input.claim(touch.id, owner: "pad.joy")
                input.touchMove = Vec2.zero
            }
        }
        // Joystick.
        if joyActive {
            if let touch: TouchPoint = input.touch(owner: "pad.joy"), !touch.ended {
                var dx: Double = touch.x - joyOrigin.x
                var dy: Double = touch.y - joyOrigin.y
                let dist: Double = (dx * dx + dy * dy).squareRoot()
                if dist > joyRadius {
                    // Il joystick segue il pollice: la base si sposta per restare a portata.
                    let excess: Double = dist - joyRadius
                    joyOrigin.x += dx / dist * excess
                    joyOrigin.y += dy / dist * excess
                    dx = touch.x - joyOrigin.x
                    dy = touch.y - joyOrigin.y
                }
                joyKnob = Vec2(joyOrigin.x + dx, joyOrigin.y + dy)
                // Sullo schermo la y cresce verso il basso; il gioco vuole "su" positivo.
                var value: Vec2 = Vec2(dx / joyRadius, -dy / joyRadius)
                let magnitude: Double = value.length
                if magnitude < 0.12 {
                    value = Vec2.zero
                } else {
                    // Zona morta riscalata: la risposta parte da zero appena fuori dal centro.
                    value = value.normalized() * min((magnitude - 0.12) / 0.88, 1)
                }
                input.touchMove = value
            } else {
                joyActive = false
                input.touchMove = Vec2.zero
            }
        }
        // Pulsanti tenuti: rilascio e, per l'arpione, mira trascinando il dito.
        var i: Int = 0
        while i < buttons.count {
            if buttons[i].held {
                let owner: String = "pad.\(buttons[i].action.key)"
                if let touch: TouchPoint = input.touch(owner: owner), !touch.ended {
                    if buttons[i].action == GameButtons.primary {
                        let dx: Double = touch.x - Double(buttons[i].x)
                        let dy: Double = touch.y - Double(buttons[i].y)
                        input.touchAim = dx * dx + dy * dy > 12 * 12 ? Vec2(dx, -dy).normalized() : nil
                    }
                } else {
                    buttons[i].held = false
                    input.touchHeld.remove(buttons[i].action)
                    if buttons[i].action == GameButtons.primary { input.touchAim = nil }
                }
            }
            i += 1
        }
    }

    func releaseAll(_ input: Input) {
        joyActive = false
        input.touchMove = Vec2.zero
        var i: Int = 0
        while i < buttons.count {
            buttons[i].held = false
            i += 1
        }
        input.touchHeld = []
        input.touchAim = nil
    }

    func draw(_ g: Canvas, usingController: Bool) {
        if hidden { return }
        if joyActive {
            let ox: Int = Int(joyOrigin.x.rounded())
            let oy: Int = Int(joyOrigin.y.rounded())
            g.disc(ox, oy, radius: Int(joyRadius), Theme.lime.withAlpha(20))
            g.ring(ox, oy, radius: Int(joyRadius), thickness: 1, Theme.lime.withAlpha(97))
            g.disc(Int(joyKnob.x.rounded()), Int(joyKnob.y.rounded()), radius: 13, Theme.lime.withAlpha(140))
        }
        for button in buttons {
            // Col controller i pulsanti restano come promemoria, più tenui.
            let base: Int = usingController ? 46 : 87
            let alpha: Int = button.held ? 150 : base
            g.disc(button.x, button.y, radius: button.radius, Theme.ink.withAlpha(UInt8(alpha)))
            g.ring(button.x, button.y, radius: button.radius, thickness: 1, button.tint.withAlpha(UInt8(min(255, alpha + 80))))
            let icon: Image = Sprites.shared.get(button.icon)
            let scale: Int = button.action == GameButtons.primary ? 2 : 1
            g.draw(icon, x: button.x - icon.width * scale / 2, y: button.y - icon.height * scale / 2, scale: scale,
                   ink: Ink.tint(button.tint.withAlpha(button.held ? 255 : 225)))
        }
    }
}

/// Riquadro di istruzioni che compare la prima volta che si fa una cosa: resta qualche secondo,
/// non blocca il gioco e poi svanisce.
struct HintBox {
    private var lines: [String] = []
    private var width: Int = 0
    private var clock: Double = 0
    private var duration: Double = 0

    var isVisible: Bool { return clock < duration + 0.9 && !lines.isEmpty }
    /// Altezza del riquadro, per chi lo vuole appoggiare al bordo inferiore.
    var height: Int { return lines.count * PixelFont.lineHeight + 10 }

    mutating func show(_ text: String, width: Int, seconds: Double = 10) {
        self.width = width
        lines = PixelFont.shared.wrap(text, maxWidth: width - 16)
        clock = 0
        duration = seconds
    }

    mutating func update(_ dt: Double) {
        if !lines.isEmpty { clock += dt }
    }

    /// Disegna il riquadro centrato in orizzontale su `centerX`, con il bordo superiore in `top`.
    func draw(_ g: Canvas, centerX: Int, top: Int) {
        if !isVisible { return }
        var alpha: Double = 1
        if clock < 0.3 {
            alpha = clock / 0.3
        } else if clock > duration + 0.3 {
            alpha = max(0, 1 - (clock - duration - 0.3) / 0.6)
        }
        let h: Int = lines.count * PixelFont.lineHeight + 10
        let box: Rect = Rect(centerX - width / 2, top, width, h)
        g.roundRect(box, radius: 5, Theme.ink.withAlpha(UInt8(alpha * 220)))
        g.roundOutline(box, radius: 5, Theme.ochre.withAlpha(UInt8(alpha * 204)))
        var row: Int = 0
        while row < lines.count {
            g.text(lines[row], x: centerX, y: top + 7 + row * PixelFont.lineHeight, Theme.lime.withAlpha(UInt8(alpha * 255)), align: TextAlign.center)
            row += 1
        }
    }
}

/// Messaggio breve a centro schermo che compare e svanisce (lenza spezzata, pressione, cattura...).
struct Toast {
    private var text: String = ""
    private var color: RGBA = Theme.lime
    private var clock: Double = 99

    mutating func show(_ message: String, color: RGBA = Theme.lime) {
        text = message
        self.color = color
        clock = 0
    }

    mutating func update(_ dt: Double) {
        clock += dt
    }

    func draw(_ g: Canvas, centerX: Int, y: Int) {
        if clock >= 1.92 || text.isEmpty { return }
        var alpha: Double = 1
        if clock < 0.12 {
            alpha = clock / 0.12
        } else if clock > 1.52 {
            alpha = max(0, 1 - (clock - 1.52) / 0.4)
        }
        let w: Int = PixelFont.shared.width(text) + 14
        g.roundRect(Rect(centerX - w / 2, y - 4, w, 15), radius: 5, Theme.ink.withAlpha(UInt8(alpha * 150)))
        g.text(text, x: centerX, y: y, color.withAlpha(UInt8(alpha * 255)), align: TextAlign.center)
    }
}

/// Scintille, numeri di danno, anelli e bolle: piccoli effetti a tempo, in coordinate del mondo (y verso il basso).
struct Effects {
    private struct Spark {
        var x: Double
        var y: Double
        let vx: Double
        let vy: Double
        var age: Double
        let color: RGBA
    }
    private struct Number {
        let text: String
        let x: Double
        let y: Double
        var age: Double
        let color: RGBA
    }
    private struct Ring {
        let x: Double
        let y: Double
        let radius: Double
        var age: Double
        let color: RGBA
    }

    private var sparks: [Spark] = []
    private var numbers: [Number] = []
    private var rings: [Ring] = []
    private(set) var bubbles: [RisingBubble] = []
    private var rng: SeededRNG

    init(seed: UInt64) {
        rng = SeededRNG(seed: seed)
    }

    mutating func sparks(at point: Vec2, color: RGBA, count: Int) {
        var i: Int = 0
        while i < count && sparks.count < 160 {
            let angle: Double = rng.range(0, 2 * Double.pi)
            let reach: Double = rng.range(6, 16)
            sparks.append(Spark(x: point.x, y: point.y, vx: cos(angle) * reach / 0.28, vy: sin(angle) * reach / 0.28, age: 0, color: color))
            i += 1
        }
    }

    mutating func number(_ value: Int, at point: Vec2, color: RGBA) {
        numbers.append(Number(text: "\(value)", x: point.x, y: point.y - 8, age: 0, color: color))
    }

    mutating func ring(at point: Vec2, radius: Double, color: RGBA) {
        rings.append(Ring(x: point.x, y: point.y, radius: max(radius, 4), age: 0, color: color))
    }

    /// Bolla che sale da un punto; `ceiling` è la quota oltre cui non deve andare (pelo dell'acqua).
    mutating func bubble(at point: Vec2, spread: Double, ceiling: Double) {
        if bubbles.count > 70 { return }
        let names: [String] = ["bubble_0", "bubble_0", "bubble_1", "bubble_1", "bubble_2"]
        let x: Double = point.x + rng.range(-spread, spread)
        let y: Double = point.y + rng.range(-spread, spread)
        let room: Double = max(8, y - ceiling - 2)
        let climb: Double = min(rng.range(55, 95), room)
        bubbles.append(RisingBubble(x: x, y: y, vx: rng.range(-9, 9) / max(climb / 38, 0.1), age: 0, life: climb / 38, sprite: names[rng.int(0, names.count - 1)]))
    }

    mutating func update(_ dt: Double) {
        var i: Int = 0
        while i < sparks.count {
            let slow: Double = max(0, 1 - sparks[i].age / 0.28)
            sparks[i].x += sparks[i].vx * dt * slow * 2
            sparks[i].y += sparks[i].vy * dt * slow * 2
            sparks[i].age += dt
            i += 1
        }
        sparks.removeAll(where: { $0.age >= 0.28 })
        i = 0
        while i < numbers.count {
            numbers[i].age += dt
            i += 1
        }
        numbers.removeAll(where: { $0.age >= 0.6 })
        i = 0
        while i < rings.count {
            rings[i].age += dt
            i += 1
        }
        rings.removeAll(where: { $0.age >= 0.43 })
        i = 0
        while i < bubbles.count {
            let t: Double = bubbles[i].age / bubbles[i].life
            // Salita che rallenta, come una bolla vera.
            bubbles[i].y -= 38 * (1.7 - 1.4 * t) * dt
            bubbles[i].x += bubbles[i].vx * dt
            bubbles[i].age += dt
            i += 1
        }
        bubbles.removeAll(where: { $0.age >= $0.life })
    }

    /// Bolle: dietro le scintille, davanti alle creature.
    func drawBubbles(_ g: Canvas, camX: Double, camY: Double) {
        let ox: Double = Double(g.width) / 2 - camX
        let oy: Double = Double(g.height) / 2 - camY
        for bubble in bubbles {
            let t: Double = bubble.age / bubble.life
            let alpha: Int = t > 0.65 ? Int(max(0, 1 - (t - 0.65) / 0.35) * 255) : 255
            g.sprite(Sprites.shared.get(bubble.sprite), x: Int((bubble.x + ox).rounded()), y: Int((bubble.y + oy).rounded()), ink: Ink.alpha(alpha))
        }
    }

    func draw(_ g: Canvas, camX: Double, camY: Double) {
        let ox: Double = Double(g.width) / 2 - camX
        let oy: Double = Double(g.height) / 2 - camY
        for ring in rings {
            let grow: Double = min(1, ring.age / 0.18)
            let eased: Double = 1 - (1 - grow) * (1 - grow)
            let radius: Int = Int((ring.radius * (0.3 + 0.7 * eased)).rounded())
            let alpha: Double = ring.age > 0.18 ? max(0, 1 - (ring.age - 0.18) / 0.25) : 1
            let cx: Int = Int((ring.x + ox).rounded())
            let cy: Int = Int((ring.y + oy).rounded())
            g.disc(cx, cy, radius: radius, ring.color.withAlpha(UInt8(alpha * 30)))
            g.ring(cx, cy, radius: radius, thickness: 1, ring.color.withAlpha(UInt8(alpha * 255)))
        }
        for spark in sparks {
            let alpha: Double = max(0, 1 - spark.age / 0.28)
            g.fill(x: Int((spark.x + ox).rounded()), y: Int((spark.y + oy).rounded()), w: 1, h: 1, spark.color.withAlpha(UInt8(alpha * 255)))
        }
        for number in numbers {
            let t: Double = number.age / 0.6
            let rise: Double = 16 * (1 - (1 - t) * (1 - t))
            let alpha: Double = number.age > 0.35 ? max(0, 1 - (number.age - 0.35) / 0.25) : 1
            g.text(number.text, x: Int((number.x + ox).rounded()), y: Int((number.y - rise + oy).rounded()), number.color.withAlpha(UInt8(alpha * 255)),
                   align: TextAlign.center, shadow: RGBA(hex: 0x06142A).withAlpha(UInt8(alpha * 255)))
        }
    }
}
