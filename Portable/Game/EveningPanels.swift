/// Aiuti comuni ai pannelli chiari sopra il porto: menu della sera, riepilogo, Giornale di bordo.
enum BoardKit {
    /// Una riga di testo di una scheda: colore e se va a capo o si accorcia.
    struct Line {
        let text: String
        let color: RGBA
        let wrap: Bool

        init(_ text: String, _ color: RGBA, wrap: Bool = false) {
            self.text = text
            self.color = color
            self.wrap = wrap
        }
    }

    /// Velo scuro sul porto, come lo sfondo dei menu su iOS.
    static func dim(_ ui: UI) {
        ui.g.fill(Rect(0, 0, ui.g.width, ui.g.height), Theme.ink.withAlpha(120))
    }

    /// Riquadro centrato nell'area sicura, largo al più `maxWidth` e alto al più `height`.
    static func frame(_ app: App, maxWidth: Int, height: Int? = nil, margin: Int = 6) -> Rect {
        let safe: Rect = app.safe
        let w: Int = min(maxWidth, safe.w - margin * 2)
        let room: Int = safe.h - margin * 2
        let h: Int = min(height ?? room, room)
        return Rect(safe.midX - w / 2, safe.midY - h / 2, w, h)
    }

    /// Accorcia un testo con i puntini perché stia nella larghezza data.
    static func fit(_ text: String, _ maxWidth: Int) -> String {
        let font: PixelFont = PixelFont.shared
        if font.width(text) <= maxWidth { return text }
        var chars: [Character] = Array(text)
        while !chars.isEmpty && font.width(String(chars) + "…") > maxWidth {
            chars.removeLast()
        }
        return String(chars) + "…"
    }

    /// Righe pronte da disegnare: quelle che vanno a capo vengono spezzate, le altre accorciate.
    static func layout(_ lines: [Line], width: Int) -> [Line] {
        var out: [Line] = []
        var index: Int = 0
        while index < lines.count {
            let line: Line = lines[index]
            if line.wrap {
                let parts: [String] = PixelFont.shared.wrap(line.text, maxWidth: width)
                var p: Int = 0
                while p < parts.count {
                    out.append(Line(parts[p], line.color))
                    p += 1
                }
            } else {
                out.append(Line(fit(line.text, width), line.color))
            }
            index += 1
        }
        return out
    }

    /// Disegna righe già pronte una sotto l'altra. Ritorna l'altezza occupata.
    @discardableResult
    static func draw(_ g: Canvas, _ lines: [Line], x: Int, y: Int) -> Int {
        var row: Int = 0
        while row < lines.count {
            g.text(lines[row].text, x: x, y: y + row * PixelFont.lineHeight, lines[row].color)
            row += 1
        }
        return lines.count * PixelFont.lineHeight
    }

    /// Fondo di una riga dentro un pannello, appena più scuro del riquadro.
    static func rowBack(_ g: Canvas, _ r: Rect, strong: Bool = false) {
        g.roundRect(r, radius: 4, Theme.ink.withAlpha(strong ? 30 : 15))
    }

    /// Etichetta a sinistra e valore a destra (riepilogo, conti).
    static func summaryLine(_ g: Canvas, _ label: String, _ value: String, x: Int, y: Int, w: Int, color: RGBA = Theme.ink) {
        let valueW: Int = PixelFont.shared.width(value)
        g.text(fit(label, max(10, w - valueW - 8)), x: x, y: y, color)
        g.text(value, x: x + w, y: y, color, align: TextAlign.right)
    }

    /// Ingredienti di una ricetta ("3× Sardina + 1× Lattuga di mare").
    static func ingredients(_ recipe: Recipe) -> String {
        var parts: [String] = []
        var index: Int = 0
        while index < recipe.ingredients.count {
            let ingredient: RecipeIngredient = recipe.ingredients[index]
            parts.append("\(ingredient.count)× \(itemName(ingredient.item))")
            index += 1
        }
        return parts.joined(separator: " + ")
    }
}

// MARK: - Menu della sera

/// Menu di stasera: quante preparazioni di ogni ricetta conosciuta, poi si apre l'osteria.
final class MenuPanel: Panel {
    /// Preparazioni scelte per ricetta.
    var batches: [String: Int] = [:]

    override func back(_ app: App) -> Bool {
        Flow.backToHub(app)
        return true
    }

    /// Dispensa che resterebbe dopo le preparazioni già scelte.
    private func remainingPantry(_ state: GameState) -> Pantry {
        var pantry: Pantry = state.pantry
        for (id, n) in batches where n > 0 {
            guard let recipe: Recipe = GameData.shared.recipes.find(id) else { continue }
            var index: Int = 0
            while index < recipe.ingredients.count {
                let ingredient: RecipeIngredient = recipe.ingredients[index]
                _ = pantry.take(ingredient.item, count: ingredient.count * n)
                index += 1
            }
        }
        return pantry
    }

    private func confirm(_ app: App) {
        var plan: [(recipeId: String, batches: Int)] = []
        for (id, n) in batches where n > 0 { plan.append((recipeId: id, batches: n)) }
        plan.sort { (a: (recipeId: String, batches: Int), b: (recipeId: String, batches: Int)) -> Bool in a.recipeId < b.recipeId }
        if GameSession.shared.prepareMenu(plan) {
            Flow.startService(app)
        } else {
            Feedback.warning()
        }
    }

    override func draw(_ app: App, _ ui: UI) {
        let g: Canvas = ui.g
        let session: GameSession = GameSession.shared
        guard let state: GameState = session.state else { return }
        let data: GameData = GameData.shared
        var known: [Recipe] = []
        var r: Int = 0
        while r < data.recipes.recipes.count {
            if state.recipes[data.recipes.recipes[r].id] != nil { known.append(data.recipes.recipes[r]) }
            r += 1
        }
        let slots: Int = session.rank?.menuSlots ?? 2
        var chosen: Int = 0
        var portions: Int = 0
        for (id, n) in batches where n > 0 {
            chosen += 1
            portions += (data.recipes.find(id)?.portions ?? 0) * n
        }
        let pantry: Pantry = remainingPantry(state)

        BoardKit.dim(ui)
        let card: Rect = BoardKit.frame(app, maxWidth: 470)
        ui.card(card)
        let left: Int = card.x + 8
        let width: Int = card.w - 16
        let counter: String = "\(chosen)/\(slots) piatti · \(portions) porzioni"
        g.text(counter, x: card.maxX - 8, y: card.y + 8, Theme.terracotta, align: TextAlign.right)
        g.text(BoardKit.fit("Menu di stasera", width - PixelFont.shared.width(counter) - 8), x: left, y: card.y + 8, Theme.ink)

        // Pulsanti in fondo.
        let buttonH: Int = 22
        let buttonsY: Int = card.maxY - 7 - buttonH
        let backW: Int = min(110, width / 3)
        if ui.button("menu.indietro", Rect(left, buttonsY, backW, buttonH), "Indietro", fill: Theme.shade) {
            Flow.backToHub(app)
            return
        }
        if ui.button("menu.apri", Rect(left + backW + 6, buttonsY, width - backW - 6, buttonH), "Apri l'osteria",
                     fill: Theme.ochre, enabled: chosen > 0) {
            confirm(app)
            return
        }

        let list: Rect = Rect(left, card.y + 22, width, buttonsY - 5 - (card.y + 22))
        if known.isEmpty {
            g.text("Non conosci ancora nessuna ricetta.", x: left, y: list.y + 4, Theme.ink.withAlpha(170))
            return
        }
        ui.beginScroll("menu.lista", list)
        let rowH: Int = 38
        var y: Int = list.y
        var index: Int = 0
        while index < known.count {
            let recipe: Recipe = known[index]
            let count: Int = batches[recipe.id] ?? 0
            let room: Bool = count > 0 || chosen < slots
            let more: Bool = MenuPlanner.maxBatches(recipe, pantry: pantry) >= 1
            let price: Int = MenuPlanner.price(recipe, averageStars: 2, level: state.recipes[recipe.id] ?? 1, balance: data.balance, fame: state.fame)
            let row: Rect = Rect(list.x, y, list.w - 5, rowH)
            if let value: Int = drawRow(ui, recipe: recipe, row: row, count: count, canAdd: room && more, price: price) {
                batches[recipe.id] = max(0, value)
            }
            y += rowH + 4
            index += 1
        }
        ui.endScroll(contentHeight: y - list.y)
    }

    /// Una ricetta con i tasti meno e più. Ritorna il nuovo numero di preparazioni se è cambiato.
    private func drawRow(_ ui: UI, recipe: Recipe, row: Rect, count: Int, canAdd: Bool, price: Int) -> Int? {
        let g: Canvas = ui.g
        BoardKit.rowBack(g, row, strong: count > 0)
        let plate: Image = Sprites.shared.get("plate_\(recipe.plate)")
        let plateScale: Int = plate.width * 2 <= 32 ? 2 : 1
        g.draw(plate, x: row.x + 18 - plate.width * plateScale / 2, y: row.midY - plate.height * plateScale / 2, scale: plateScale)
        let textX: Int = row.x + 36
        let controlsW: Int = 66
        let textW: Int = row.maxX - controlsW - 6 - textX
        g.text(BoardKit.fit(recipe.name.text(), textW), x: textX, y: row.y + 4, Theme.ink)
        g.text(BoardKit.fit(BoardKit.ingredients(recipe), textW), x: textX, y: row.y + 15, Theme.ink.withAlpha(170))
        g.text(BoardKit.fit("\(recipe.portions) porzioni · \(price) oro l'una", textW), x: textX, y: row.y + 26, Theme.terracotta)
        var result: Int? = nil
        let plus: Rect = Rect(row.maxX - 22, row.midY - 9, 18, 18)
        let minus: Rect = Rect(plus.x - 44, plus.y, 18, 18)
        if ui.button("menu.meno.\(recipe.id)", minus, "-", fill: Theme.ochre, enabled: count > 0) { result = count - 1 }
        g.text("\(count)", x: minus.maxX + 13, y: row.midY - 3, Theme.ink, align: TextAlign.center)
        if ui.button("menu.piu.\(recipe.id)", plus, "+", fill: Theme.ochre, enabled: canAdd) { result = count + 1 }
        return result
    }
}

// MARK: - Riepilogo della serata

/// Conti della serata appena chiusa; "Continua" riporta al porto (ormai di notte).
final class SummaryPanel: Panel {
    override func back(_ app: App) -> Bool {
        Flow.showHub(app)
        return true
    }

    override func draw(_ app: App, _ ui: UI) {
        let g: Canvas = ui.g
        let session: GameSession = GameSession.shared
        let result: ServiceResult = session.lastService ?? ServiceResult()
        guard let state: GameState = session.state else { return }
        let balance: Balance = GameData.shared.balance
        let before: Int = balance.rankIndex(fame: session.lastFameBefore)
        let after: Int = balance.rankIndex(fame: state.fame)
        let rankName: String = balance.rank(fame: state.fame)?.name.text() ?? ""
        let next: Int? = balance.fameToNextRank(fame: state.fame)

        var lines: [(label: String, value: String)] = [
            (label: "Piatti e vino", value: "\(result.revenue) oro"),
            (label: "Mance", value: "\(result.tips) oro"),
            (label: "Clienti serviti", value: "\(result.served)"),
            (label: "Clienti persi", value: "\(result.lost)"),
            (label: "Serie migliore", value: "×\(result.bestCombo)")
        ]
        if session.lastWages > 0 { lines.append((label: "Paghe del personale", value: "−\(session.lastWages) oro")) }

        let width: Int = min(270, app.safe.w - 12)
        let inner: Int = width - 20
        var note: String = ""
        var noteColor: RGBA = Theme.ink.withAlpha(170)
        if after > before {
            note = "L'osteria sale di rango: \(rankName)!"
            noteColor = Theme.terracotta
        } else if let next: Int = next {
            note = "\(rankName) · mancano \(next) punti di fama al prossimo rango"
        }
        let noteLines: [String] = note.isEmpty ? [] : PixelFont.shared.wrap(note, maxWidth: inner)
        let titleScale: Int = PixelFont.shared.width("Serata conclusa", scale: 2) <= inner ? 2 : 1
        let lineH: Int = 12
        let height: Int = 10 + PixelFont.capHeight * titleScale + 8 + lines.count * lineH + 7 + 2 * lineH
            + (noteLines.isEmpty ? 0 : 4 + noteLines.count * PixelFont.lineHeight) + 8 + 22 + 8

        BoardKit.dim(ui)
        let card: Rect = BoardKit.frame(app, maxWidth: width, height: height)
        ui.card(card)
        let left: Int = card.x + 10
        var y: Int = card.y + 10
        g.text("Serata conclusa", x: card.midX, y: y, Theme.ink, align: TextAlign.center, scale: titleScale)
        y += PixelFont.capHeight * titleScale + 8
        var index: Int = 0
        while index < lines.count {
            BoardKit.summaryLine(g, lines[index].label, lines[index].value, x: left, y: y, w: inner)
            y += lineH
            index += 1
        }
        g.fill(x: left, y: y + 1, w: inner, h: 1, Theme.ink.withAlpha(60))
        y += 7
        BoardKit.summaryLine(g, "Incasso", "+\(result.total - session.lastWages) oro", x: left, y: y, w: inner, color: Theme.cobalt)
        y += lineH
        BoardKit.summaryLine(g, "Fama", "+\(result.fame)", x: left, y: y, w: inner, color: Theme.cobalt)
        y += lineH
        if !noteLines.isEmpty {
            y += 4
            var row: Int = 0
            while row < noteLines.count {
                g.text(noteLines[row], x: card.midX, y: y, noteColor, align: TextAlign.center)
                y += PixelFont.lineHeight
                row += 1
            }
        }
        if ui.button("riepilogo.continua", Rect(left, card.maxY - 8 - 22, inner, 22), "Continua") {
            Flow.showHub(app)
        }
    }
}
