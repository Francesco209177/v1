/// Interfaccia "a modo immediato": a ogni fotogramma la schermata ridisegna i suoi comandi e chiede
/// a ciascuno se è stato premuto. Niente alberi di viste da tenere allineati con lo stato del gioco.
///
/// Con le dita: un comando scatta quando il dito si alza dentro di esso senza aver trascinato.
/// Col controller: la croce sposta la selezione verso il comando più vicino in quella direzione,
/// il tasto A lo attiva. Le liste scorrono col dito, con inerzia, e seguono la selezione.
final class UI {
    struct Press {
        let clicked: Bool
        let down: Bool
        let focused: Bool
    }

    private struct ScrollState {
        var offset: Double = 0
        var velocity: Double = 0
        var content: Int = 0
        var lastY: Double? = nil
    }

    private struct ScrollFrame {
        let id: String
        let rect: Rect
        let absolute: Rect
        let oldClip: Rect
        let oldOy: Int
        let firstItem: Int
    }

    var g: Canvas
    let input: Input
    /// true mentre una finestra sopra copre i comandi di sotto: non reagiscono e non prendono la selezione.
    var blocked: Bool = false
    private(set) var focus: String? = nil
    private(set) var showFocus: Bool = false
    private(set) var time: Double = 0
    private var dt: Double = 0
    private var items: [(id: String, rect: Rect)] = []
    private var activate: String? = nil
    private var justShown: Bool = false
    private var scrolls: [String: ScrollState] = [:]
    private var scrollStack: [ScrollFrame] = []
    /// Chiamata a ogni pressione andata a segno (suono e vibrazione).
    var onClick: (() -> Void)?

    init(canvas: Canvas, input: Input) {
        g = canvas
        self.input = input
    }

    // MARK: Fotogramma

    func begin(dt: Double) {
        self.dt = dt
        time += dt
        items.removeAll(keepingCapacity: true)
        scrollStack.removeAll()
        activate = nil
        blocked = false
        justShown = false
        if input.touches.contains(where: { $0.began }) { showFocus = false }
        if input.navX != 0 || input.navY != 0 || input.confirm {
            if !showFocus {
                // La prima pressione fa solo comparire la selezione.
                showFocus = true
                justShown = true
            }
        }
        if input.confirm && showFocus && !justShown, let current: String = focus { activate = current }
    }

    func end() {
        if let current: String = focus, !items.contains(where: { $0.id == current }) { focus = nil }
        if !showFocus { return }
        if focus == nil {
            focus = items.first?.id
        } else if (input.navX != 0 || input.navY != 0) && !justShown {
            moveFocus(dx: input.navX, dy: input.navY)
        }
    }

    /// Porta la selezione su un comando preciso (per esempio all'apertura di una finestra).
    func setFocus(_ id: String?) {
        focus = id
    }

    private func moveFocus(dx: Int, dy: Int) {
        guard let current: String = focus, let from: Rect = items.first(where: { $0.id == current })?.rect else { return }
        var best: String? = nil
        var bestScore: Double = Double.greatestFiniteMagnitude
        for item in items where item.id != current {
            let ddx: Double = Double(item.rect.midX - from.midX)
            let ddy: Double = Double(item.rect.midY - from.midY)
            let along: Double = ddx * Double(dx) + ddy * Double(dy)
            if along <= 1 { continue }
            let across: Double = abs(ddx * Double(dy)) + abs(ddy * Double(dx))
            let score: Double = along + across * 2.6
            if score < bestScore {
                bestScore = score
                best = item.id
            }
        }
        if let best: String = best { focus = best }
    }

    // MARK: Pressioni

    /// Zona sensibile generica. Va chiamata una volta per fotogramma per ogni comando visibile.
    func press(_ id: String, _ rect: Rect, enabled: Bool = true) -> Press {
        let full: Rect = Rect(rect.x + g.ox, rect.y + g.oy, rect.w, rect.h)
        let visible: Rect = full.intersection(g.clip)
        if blocked || !enabled { return Press(clicked: false, down: false, focused: false) }
        let inScroll: Bool = !scrollStack.isEmpty
        if visible.w <= 0 || visible.h <= 0 {
            // Fuori vista dentro una lista: resta raggiungibile con la croce, che farà scorrere la lista.
            if inScroll { items.append((id: id, rect: full)) }
            return Press(clicked: false, down: false, focused: false)
        }
        items.append((id: id, rect: inScroll ? full : visible))
        var clicked: Bool = false
        var down: Bool = false
        for touch in input.touches where touch.owner == nil {
            if !visible.contains(touch.startX, touch.startY) { continue }
            let inside: Bool = visible.contains(touch.x, touch.y)
            if touch.ended {
                if inside && touch.travel < 12 { clicked = true }
            } else if inside && touch.travel < 12 {
                down = true
            }
        }
        if activate == id {
            clicked = true
            activate = nil
        }
        if clicked {
            focus = id
            onClick?()
        }
        return Press(clicked: clicked, down: down, focused: showFocus && focus == id)
    }

    // MARK: Liste che scorrono

    /// Apre una zona che scorre in verticale: ciò che si disegna fino a `endScroll` è ritagliato
    /// e spostato. Le coordinate restano quelle della schermata (il contenuto parte da `rect.y`).
    func beginScroll(_ id: String, _ rect: Rect) {
        var state: ScrollState = scrolls[id] ?? ScrollState()
        let absolute: Rect = Rect(rect.x + g.ox, rect.y + g.oy, rect.w, rect.h)
        let owner: String = "scroll:" + id
        if !blocked {
            if let touch: TouchPoint = input.touch(owner: owner) {
                if let last: Double = state.lastY {
                    let delta: Double = touch.y - last
                    state.offset -= delta
                    state.velocity = -delta / max(dt, 0.001)
                }
                state.lastY = touch.ended ? nil : touch.y
            } else {
                state.lastY = nil
                let candidate: TouchPoint? = input.touches.first(where: { (t: TouchPoint) -> Bool in
                    return t.owner == nil && !t.ended && absolute.contains(t.startX, t.startY) && t.travel > 6
                        && abs(t.y - t.startY) > abs(t.x - t.startX)
                })
                if let touch: TouchPoint = candidate {
                    input.claim(touch.id, owner: owner)
                    state.lastY = touch.y
                    state.velocity = 0
                } else {
                    state.offset += state.velocity * dt
                    state.velocity *= max(0, 1 - 4.5 * dt)
                    if abs(state.velocity) < 4 { state.velocity = 0 }
                }
            }
        }
        let limit: Double = Double(max(0, state.content - rect.h))
        if state.offset < 0 || state.offset > limit { state.velocity = 0 }
        state.offset = min(max(state.offset, 0), limit)
        scrolls[id] = state
        let oldClip: Rect = g.pushClip(rect)
        scrollStack.append(ScrollFrame(id: id, rect: rect, absolute: absolute, oldClip: oldClip, oldOy: g.oy, firstItem: items.count))
        g.oy -= Int(state.offset.rounded())
    }

    /// Chiude la zona aperta con `beginScroll`. `contentHeight` è l'altezza di ciò che è stato disegnato.
    func endScroll(contentHeight: Int) {
        guard let frame: ScrollFrame = scrollStack.popLast() else { return }
        g.oy = frame.oldOy
        g.restoreClip(frame.oldClip)
        var state: ScrollState = scrolls[frame.id] ?? ScrollState()
        state.content = contentHeight
        // La selezione del controller resta in vista.
        if showFocus, let current: String = focus {
            var index: Int = frame.firstItem
            while index < items.count {
                if items[index].id == current {
                    let r: Rect = items[index].rect
                    if r.y < frame.absolute.y {
                        state.offset -= Double(frame.absolute.y - r.y + 6)
                    } else if r.maxY > frame.absolute.maxY {
                        state.offset += Double(r.maxY - frame.absolute.maxY + 6)
                    }
                    break
                }
                index += 1
            }
        }
        // Gli elementi fuori vista restano selezionabili ma con il rettangolo schiacciato sul bordo.
        var index: Int = frame.firstItem
        while index < items.count {
            let r: Rect = items[index].rect
            if r.maxY <= frame.absolute.y {
                items[index].rect = Rect(r.x, frame.absolute.y - 1 - (frame.absolute.y - r.maxY) / 8, r.w, 1)
            } else if r.y >= frame.absolute.maxY {
                items[index].rect = Rect(r.x, frame.absolute.maxY + (r.y - frame.absolute.maxY) / 8, r.w, 1)
            }
            index += 1
        }
        scrolls[frame.id] = state
        // Cursore di scorrimento.
        if contentHeight > frame.rect.h && frame.rect.h > 12 {
            let track: Int = frame.rect.h - 4
            let thumb: Int = max(10, track * frame.rect.h / contentHeight)
            let limit: Double = Double(contentHeight - frame.rect.h)
            let pos: Int = Int((Double(track - thumb) * (limit > 0 ? state.offset / limit : 0)).rounded())
            g.fill(x: frame.rect.maxX - 3, y: frame.rect.y + 2 + pos, w: 2, h: thumb, Theme.ink.withAlpha(90))
        }
    }

    /// Riporta in cima una lista (cambio di scheda).
    func resetScroll(_ id: String) {
        scrolls[id] = nil
    }

    // MARK: Comandi disegnati

    /// Pulsante dei menu: titolo, eventuale sottotitolo, eventuale icona a sinistra.
    @discardableResult
    func button(_ id: String, _ rect: Rect, _ title: String, sub: String? = nil, fill: RGBA = Theme.turquoise,
                text: RGBA = Theme.ink, enabled: Bool = true, icon: String? = nil) -> Bool {
        let state: Press = press(id, rect, enabled: enabled)
        let lift: Int = state.down ? 1 : 0
        let body: Rect = Rect(rect.x, rect.y + lift, rect.w, rect.h - 1)
        let base: RGBA = enabled ? fill : fill.mixed(with: Theme.shade, 0.6)
        // Bordo inferiore più scuro: dà spessore al pulsante.
        g.roundRect(Rect(rect.x, rect.y + 1, rect.w, rect.h - 1), radius: 3, base.scaled(0.72))
        g.roundRect(body, radius: 3, state.down ? base.scaled(0.9) : base)
        let ink: RGBA = enabled ? text : text.withAlpha(110)
        var cx: Int = body.midX
        if let icon: String = icon, let image: Image = Sprites.shared.find(icon) {
            let total: Int = image.width + 4 + PixelFont.shared.width(title)
            let left: Int = body.midX - total / 2
            g.draw(image, x: left, y: body.midY - image.height / 2, ink: enabled ? Ink.normal : Ink.alpha(110))
            cx = left + image.width + 4 + PixelFont.shared.width(title) / 2
        }
        if let sub: String = sub {
            g.text(title, x: cx, y: body.midY - 9, ink, align: TextAlign.center)
            g.text(sub, x: cx, y: body.midY + 2, ink.withAlpha(enabled ? 170 : 90), align: TextAlign.center)
        } else {
            g.text(title, x: cx, y: body.midY - 3, ink, align: TextAlign.center)
        }
        if state.focused { focusRing(rect) }
        return state.clicked
    }

    /// Pulsante piccolo con solo un'icona.
    @discardableResult
    func iconButton(_ id: String, _ rect: Rect, icon: String, fill: RGBA = Theme.lime, enabled: Bool = true) -> Bool {
        let state: Press = press(id, rect, enabled: enabled)
        g.roundRect(Rect(rect.x, rect.y + 1, rect.w, rect.h - 1), radius: 3, fill.scaled(0.72))
        g.roundRect(Rect(rect.x, rect.y + (state.down ? 1 : 0), rect.w, rect.h - 1), radius: 3, state.down ? fill.scaled(0.9) : fill)
        let image: Image = Sprites.shared.get(icon)
        g.draw(image, x: rect.midX - image.width / 2, y: rect.midY - image.height / 2 + (state.down ? 1 : 0),
               ink: enabled ? Ink.normal : Ink.alpha(100))
        if state.focused { focusRing(rect) }
        return state.clicked
    }

    func focusRing(_ rect: Rect) {
        g.roundOutline(Rect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4), radius: 4, Theme.ink)
        g.roundOutline(Rect(rect.x - 1, rect.y - 1, rect.w + 2, rect.h + 2), radius: 3, Theme.white)
    }

    /// Riquadro chiaro, base di ogni schermata di menu.
    func card(_ rect: Rect) {
        g.roundRect(Rect(rect.x + 1, rect.y + 2, rect.w, rect.h), radius: 5, RGBA(r: 0, g: 0, b: 0, a: 70))
        g.roundRect(rect, radius: 5, Theme.lime)
    }

    /// Riquadro interno, appena più scuro, per raggruppare.
    func well(_ rect: Rect, color: RGBA = Theme.shade) {
        g.roundRect(rect, radius: 3, color)
    }

    /// Linguette in fila. Ritorna l'indice scelto.
    func tabs(_ id: String, _ rect: Rect, _ titles: [String], selected: Int) -> Int {
        var result: Int = selected
        if titles.isEmpty { return result }
        let gap: Int = 2
        let w: Int = (rect.w - gap * (titles.count - 1)) / titles.count
        var index: Int = 0
        while index < titles.count {
            let r: Rect = Rect(rect.x + index * (w + gap), rect.y, w, rect.h)
            let state: Press = press("\(id).\(index)", r)
            let on: Bool = index == selected
            g.roundRect(r, radius: 3, on ? Theme.cobalt : (state.down ? Theme.shade.scaled(0.9) : Theme.shade))
            g.text(titles[index], x: r.midX, y: r.midY - 3, on ? Theme.lime : Theme.ink, align: TextAlign.center)
            if state.focused { focusRing(r) }
            if state.clicked { result = index }
            index += 1
        }
        return result
    }

    /// Barra di avanzamento.
    func bar(_ rect: Rect, fraction: Double, fill: RGBA, back: RGBA = Theme.shade) {
        g.roundRect(rect, radius: min(2, rect.h / 2), back)
        let w: Int = Int((Double(rect.w) * MathUtil.clamp(fraction, 0, 1)).rounded())
        if w > 0 { g.roundRect(Rect(rect.x, rect.y, max(w, min(rect.h, rect.w)), rect.h), radius: min(2, rect.h / 2), fill) }
    }

    /// Interruttore acceso/spento con la sua etichetta. Ritorna il nuovo valore.
    func toggle(_ id: String, _ rect: Rect, _ title: String, value: Bool) -> Bool {
        let state: Press = press(id, rect)
        g.text(title, x: rect.x, y: rect.midY - 3, Theme.ink)
        let sw: Rect = Rect(rect.maxX - 26, rect.midY - 6, 26, 12)
        g.roundRect(sw, radius: 6, value ? Theme.turquoise : Theme.shade.scaled(0.85))
        g.disc(value ? sw.maxX - 7 : sw.x + 6, sw.midY, radius: 4, Theme.white)
        if state.focused { focusRing(rect.inset(dx: -3, dy: 0)) }
        return state.clicked ? !value : value
    }

    /// Regolatore a dieci tacche con i tasti meno e più. Ritorna il nuovo valore (0...1).
    func stepper(_ id: String, _ rect: Rect, _ title: String, value: Double) -> Double {
        g.text(title, x: rect.x, y: rect.midY - 3, Theme.ink)
        var out: Double = value
        let right: Int = rect.maxX
        if button("\(id).meno", Rect(right - 104, rect.midY - 8, 18, 16), "-", fill: Theme.shade) {
            out = max(0, (value * 10).rounded() / 10 - 0.1)
        }
        if button("\(id).piu", Rect(right - 18, rect.midY - 8, 18, 16), "+", fill: Theme.shade) {
            out = min(1, (value * 10).rounded() / 10 + 0.1)
        }
        let steps: Int = Int((value * 10).rounded())
        var i: Int = 0
        while i < 10 {
            g.fill(x: right - 82 + i * 6, y: rect.midY - 5, w: 4, h: 10, i < steps ? Theme.cobalt : Theme.shade)
            i += 1
        }
        return out
    }

    /// Etichetta piccola su fondo colorato ("NUOVO", "x3").
    func chip(_ text: String, x: Int, y: Int, fill: RGBA, color: RGBA = Theme.ink) -> Int {
        let w: Int = PixelFont.shared.width(text) + 8
        g.roundRect(Rect(x, y, w, 11), radius: 3, fill)
        g.text(text, x: x + 4, y: y + 2, color)
        return w
    }

    /// Icona con una quantità accanto ("[moneta] 120"). Ritorna la larghezza occupata.
    @discardableResult
    func stat(icon: String, _ text: String, x: Int, y: Int, color: RGBA = Theme.ink, shadow: RGBA? = nil) -> Int {
        var cx: Int = x
        if let image: Image = Sprites.shared.find(icon) {
            g.draw(image, x: cx, y: y + 3 - image.height / 2)
            cx += image.width + 3
        }
        cx += g.text(text, x: cx, y: y, color, shadow: shadow)
        return cx - x
    }
}
