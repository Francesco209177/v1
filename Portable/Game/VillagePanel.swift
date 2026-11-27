/// Il paese di Pietrasale: chi lavora all'osteria, l'orto di Saverio, il vivaio delle saline,
/// le nasse, la collezione di maioliche e cartoline, il bar del porto.
final class VillagePanel: Panel {
    static let titles: [String] = ["Personale", "Orto", "Vivaio", "Nasse", "Collezione", "Bar"]
    static let scrollId: String = "paese.lista"

    private(set) var tab: Int
    /// Pezzo della collezione scelto, di cui si legge la descrizione.
    private var selected: String? = nil
    /// Gioco del bar da far partire a fine disegno, dopo aver chiuso la lista che scorre.
    private var pending: ((App) -> Void)? = nil

    init(tab: Int = 0) {
        self.tab = max(0, min(tab, VillagePanel.titles.count - 1))
    }

    override func enter(_ app: App) {
        app.ui.resetScroll(VillagePanel.scrollId)
    }

    override func back(_ app: App) -> Bool {
        Flow.backToHub(app)
        return true
    }

    override func draw(_ app: App, _ ui: UI) {
        let g: Canvas = ui.g
        guard let state: GameState = GameSession.shared.state else { return }
        BoardKit.dim(ui)
        let card: Rect = BoardKit.frame(app, maxWidth: 500)
        ui.card(card)
        let left: Int = card.x + 7
        let width: Int = card.w - 14
        let tabH: Int = 15
        let top0: Int = card.y + 7

        // Denaro e "Chiudi" a destra, le linguette nello spazio che resta.
        let closeW: Int = PixelFont.shared.width("Chiudi") + 16
        let closeR: Rect = Rect(card.maxX - 7 - closeW, top0, closeW, tabH)
        let goldText: String = "\(state.gold)"
        let coin: Image? = Sprites.shared.find("icon_coin")
        let goldW: Int = PixelFont.shared.width(goldText) + 12 + (coin.map { (image: Image) -> Int in image.width + 3 } ?? 0)
        let goldR: Rect = Rect(closeR.x - 4 - goldW, top0, goldW, tabH)
        g.roundRect(goldR, radius: 4, Theme.ink.withAlpha(220))
        var gx: Int = goldR.x + 6
        if let image: Image = coin {
            g.draw(image, x: gx, y: goldR.midY - image.height / 2)
            gx += image.width + 3
        }
        g.text(goldText, x: gx, y: goldR.midY - 3, Theme.ochre)

        let tabsW: Int = goldR.x - 6 - left
        let picked: Int = drawTabs(ui, x: left, y: top0, w: tabsW, h: tabH)
        let tabsH: Int = tabsFitOneRow(tabsW) ? tabH : tabH * 2 + 3
        if picked != tab {
            tab = picked
            selected = nil
            ui.resetScroll(VillagePanel.scrollId)
        }
        if ui.button("paese.chiudi", closeR, "Chiudi", fill: Theme.shade) {
            Flow.backToHub(app)
            return
        }
        let top: Int = top0 + tabsH
        g.fill(x: left, y: top + 4, w: width, h: 1, Theme.ink.withAlpha(50))

        let list: Rect = Rect(left, top + 8, width, card.maxY - 6 - (top + 8))
        ui.beginScroll(VillagePanel.scrollId, list)
        let x: Int = list.x
        let w: Int = list.w - 6
        var y: Int = list.y
        switch tab {
        case 0: y = drawStaff(ui, state: state, x: x, y: y, w: w)
        case 1: y = drawGarden(ui, state: state, x: x, y: y, w: w)
        case 2: y = drawPens(ui, state: state, x: x, y: y, w: w)
        case 3: y = drawTraps(ui, state: state, x: x, y: y, w: w)
        case 4: y = drawCollection(ui, state: state, x: x, y: y, w: w)
        default: y = drawBar(ui, state: state, x: x, y: y, w: w)
        }
        ui.endScroll(contentHeight: y - list.y)
        if let start: (App) -> Void = pending {
            pending = nil
            start(app)
        }
    }

    // MARK: Linguette

    private func tabsFitOneRow(_ w: Int) -> Bool {
        var widest: Int = 0
        var index: Int = 0
        while index < VillagePanel.titles.count {
            widest = max(widest, PixelFont.shared.width(VillagePanel.titles[index]))
            index += 1
        }
        let n: Int = VillagePanel.titles.count
        return (widest + 8) * n + 2 * (n - 1) <= w
    }

    /// Linguette su una riga se ci stanno, altrimenti su due righe da tre. Ritorna la scheda scelta.
    private func drawTabs(_ ui: UI, x: Int, y: Int, w: Int, h: Int) -> Int {
        if tabsFitOneRow(w) {
            return ui.tabs("paese.schede", Rect(x, y, w, h), VillagePanel.titles, selected: tab)
        }
        let half: Int = VillagePanel.titles.count / 2
        let first: [String] = Array(VillagePanel.titles.prefix(half))
        let second: [String] = Array(VillagePanel.titles.suffix(VillagePanel.titles.count - half))
        let selA: Int = tab < half ? tab : -1
        let selB: Int = tab >= half ? tab - half : -1
        let a: Int = ui.tabs("paese.schede.a", Rect(x, y, w, h), first, selected: selA)
        let b: Int = ui.tabs("paese.schede.b", Rect(x, y + h + 3, w, h), second, selected: selB)
        if a != selA { return a }
        if b != selB { return b + half }
        return tab
    }

    // MARK: Aiuti

    /// Larghezza di un pulsante di riga per il suo titolo.
    private func buttonWidth(_ title: String) -> Int {
        return PixelFont.shared.width(title) + 14
    }

    /// Testo di spiegazione in cima a una sezione. Ritorna la y sotto il testo.
    private func note(_ g: Canvas, _ text: String, x: Int, y: Int, w: Int) -> Int {
        let lines: [BoardKit.Line] = BoardKit.layout([BoardKit.Line(text, Theme.ink.withAlpha(190), wrap: true)], width: w - 4)
        return y + BoardKit.draw(g, lines, x: x + 2, y: y + 1) + 4
    }

    /// Riga con un'icona a sinistra, il testo e, a destra, lo spazio per pulsanti larghi in tutto `buttonsW`.
    /// Sotto il testo può lasciare spazio a una fila di pulsanti (`flow`). Ritorna la riga, dove comincia il testo e dove la fila.
    private func row(_ g: Canvas, _ lines: [BoardKit.Line], x: Int, y: Int, w: Int, iconW: Int = 0, buttonsW: Int = 0,
                     minHeight: Int = 0, flowH: Int = 0) -> (row: Rect, textX: Int, flowY: Int) {
        let textX: Int = x + 6 + iconW
        let textW: Int = w - 12 - iconW - (buttonsW > 0 ? buttonsW + 6 : 0)
        let shown: [BoardKit.Line] = BoardKit.layout(lines, width: max(20, textW))
        let textH: Int = shown.count * PixelFont.lineHeight
        let h: Int = max(minHeight, 9 + textH + (flowH > 0 ? flowH + 3 : 0))
        let r: Rect = Rect(x, y, w, h)
        BoardKit.rowBack(g, r)
        BoardKit.draw(g, shown, x: textX, y: y + 5)
        return (row: r, textX: textX, flowY: y + 5 + textH + 1)
    }

    /// Pulsanti a destra di una riga, da destra verso sinistra. Ritorna l'indice di quello premuto.
    private func rowButtons(_ ui: UI, _ r: Rect, ids: [String], titles: [String], fills: [RGBA], enabled: [Bool]) -> Int? {
        var clicked: Int? = nil
        var bx: Int = r.maxX - 6
        var index: Int = titles.count - 1
        while index >= 0 {
            let bw: Int = buttonWidth(titles[index])
            bx -= bw
            if ui.button(ids[index], Rect(bx, r.midY - 9, bw, 18), titles[index], fill: fills[index], enabled: enabled[index]) {
                clicked = index
            }
            bx -= 4
            index -= 1
        }
        return clicked
    }

    private func rowButtonsWidth(_ titles: [String]) -> Int {
        var total: Int = 0
        var index: Int = 0
        while index < titles.count {
            total += buttonWidth(titles[index]) + (index > 0 ? 4 : 0)
            index += 1
        }
        return total
    }

    /// Posizioni di una fila di pulsanti che va a capo, relative all'origine. Ritorna i rettangoli e l'altezza.
    private func flowLayout(_ titles: [String], w: Int) -> (rects: [Rect], height: Int) {
        var rects: [Rect] = []
        var cx: Int = 0
        var cy: Int = 0
        var index: Int = 0
        while index < titles.count {
            let bw: Int = min(w, buttonWidth(titles[index]))
            if cx > 0 && cx + bw > w {
                cx = 0
                cy += 22
            }
            rects.append(Rect(cx, cy, bw, 18))
            cx += bw + 4
            index += 1
        }
        return (rects: rects, height: titles.isEmpty ? 0 : cy + 18)
    }

    /// Disegna uno sprite centrato in un riquadro, rimpicciolito se non ci sta e ingrandito fino a `maxScale`.
    private func drawFitted(_ g: Canvas, _ name: String, in box: Rect, maxScale: Int = 1, ink: Ink = Ink.normal) {
        guard let image: Image = Sprites.shared.find(name), !image.isEmpty else { return }
        var scale: Int = maxScale
        while scale > 1 && (image.width * scale > box.w || image.height * scale > box.h) { scale -= 1 }
        if image.width * scale <= box.w && image.height * scale <= box.h {
            g.draw(image, x: box.midX - image.width * scale / 2, y: box.midY - image.height * scale / 2, scale: scale, ink: ink)
            return
        }
        let s: Double = min(Double(box.w) / Double(image.width), Double(box.h) / Double(image.height))
        let ax: Double = Double(box.midX) + (Double(image.anchorX) - Double(image.width) / 2) * s
        let ay: Double = Double(box.midY) + (Double(image.anchorY) - Double(image.height) / 2) * s
        g.sprite(image, x: ax, y: ay, rotation: 0, scaleX: s, scaleY: s, ink: ink)
    }

    /// Applica una modifica al paese e la fa sentire.
    private func change(_ edit: (inout GameState, GameData) -> Bool) {
        if GameSession.shared.village(edit) { Feedback.success() } else { Feedback.warning() }
    }

    // MARK: Personale

    private func drawStaff(_ ui: UI, state: GameState, x: Int, y: Int, w: Int) -> Int {
        let g: Canvas = ui.g
        let book: VillageBook = GameData.shared.village
        var cy: Int = y
        if !Village.staffUnlocked(state) {
            cy = note(g, "Quando l'osteria sarà una trattoria (40 punti di fama) potrai assumere qualcuno che ti dia una mano in sala e in cucina.", x: x, y: cy, w: w)
        } else {
            cy = note(g, "Chi assumi lavora ogni sera e va pagato a fine servizio.", x: x, y: cy, w: w)
        }
        let buttonsW: Int = max(buttonWidth("Licenzia"), buttonWidth("Assumi"))
        var index: Int = 0
        while index < book.staff.count {
            let info: StaffInfo = book.staff[index]
            let hired: Bool = state.village.staff.contains(info.id)
            let can: Bool = state.fame >= info.minFame && state.gold >= info.hire
            let extra: String = hired ? "Al lavoro · paga \(info.wage) oro a serata"
                : "Assunzione \(info.hire) oro · paga \(info.wage) a serata · serve fama \(info.minFame)"
            let lines: [BoardKit.Line] = [
                BoardKit.Line("\(info.name.text()) — \(info.role.text())", Theme.ink, wrap: true),
                BoardKit.Line(info.note.text(), Theme.ink.withAlpha(200), wrap: true),
                BoardKit.Line(extra, Theme.terracotta, wrap: true)
            ]
            let laid: (row: Rect, textX: Int, flowY: Int) = row(g, lines, x: x, y: cy, w: w, iconW: 30, buttonsW: buttonsW, minHeight: 42)
            drawFitted(g, "\(info.sprite)_walk_0", in: Rect(laid.row.x + 4, laid.row.y + 3, 28, laid.row.h - 6))
            if hired {
                if rowButtons(ui, laid.row, ids: ["paese.licenzia.\(info.id)"], titles: ["Licenzia"], fills: [Theme.shade], enabled: [true]) != nil {
                    let id: String = info.id
                    GameSession.shared.village { (s: inout GameState, _: GameData) -> Bool in
                        Village.dismiss(id, state: &s)
                        return true
                    }
                }
            } else if rowButtons(ui, laid.row, ids: ["paese.assumi.\(info.id)"], titles: ["Assumi"], fills: [Theme.ochre], enabled: [can]) != nil {
                let id: String = info.id
                change { (s: inout GameState, data: GameData) -> Bool in
                    Village.hire(id, state: &s, book: data.village) == Village.HireOutcome.hired
                }
            }
            cy += laid.row.h + 5
            index += 1
        }
        return cy
    }

    // MARK: Orto

    private func drawGarden(_ ui: UI, state: GameState, x: Int, y: Int, w: Int) -> Int {
        let g: Canvas = ui.g
        let book: VillageBook = GameData.shared.village
        var cy: Int = y
        if !Village.farmUnlocked(state) {
            return note(g, "Saverio ti presterà due aiuole del suo orto quando la Baronessa avrà smesso di svuotare le nasse: dal secondo capitolo.", x: x, y: cy, w: w)
        }
        cy = note(g, "Semina, aspetta qualche giorno, raccogli: gli ortaggi finiscono in dispensa e insegnano ricette nuove.", x: x, y: cy, w: w)
        let count: Int = Village.plotCount(state)
        var index: Int = 0
        while index < count {
            let plot: PlotState = index < state.village.plots.count ? state.village.plots[index] : PlotState()
            let plotIndex: Int = index
            if let id: String = plot.crop, let crop: CropInfo = book.crop(id),
               let left: Int = Village.daysLeft(plot: plot, day: state.day, book: book) {
                let detail: String = left == 0 ? "Pronti da raccogliere: \(crop.yield) in dispensa."
                    : (left == 1 ? "Pronti domani." : "Pronti tra \(left) giorni.")
                let lines: [BoardKit.Line] = [
                    BoardKit.Line("Aiuola \(index + 1): \(crop.name.text())", Theme.ink, wrap: true),
                    BoardKit.Line(detail, left == 0 ? Theme.terracotta : Theme.ink.withAlpha(200), wrap: true)
                ]
                let buttonsW: Int = left == 0 ? buttonWidth("Raccogli") : 0
                let laid: (row: Rect, textX: Int, flowY: Int) = row(g, lines, x: x, y: cy, w: w, iconW: 30, buttonsW: buttonsW, minHeight: 34)
                drawFitted(g, "crop_\(crop.id)", in: Rect(laid.row.x + 3, laid.row.y + 3, 30, laid.row.h - 6), maxScale: 2)
                if left == 0 && rowButtons(ui, laid.row, ids: ["paese.raccogli.\(index)"], titles: ["Raccogli"], fills: [Theme.ochre], enabled: [true]) != nil {
                    change { (s: inout GameState, data: GameData) -> Bool in
                        Village.harvest(plot: plotIndex, state: &s, book: data.village) > 0
                    }
                }
                cy += laid.row.h + 5
            } else {
                var titles: [String] = []
                var c: Int = 0
                while c < book.crops.count {
                    titles.append("\(book.crops[c].name.text()) · \(book.crops[c].seedCost)")
                    c += 1
                }
                let flow: (rects: [Rect], height: Int) = flowLayout(titles, w: w - 12)
                let laid: (row: Rect, textX: Int, flowY: Int) = row(g, [BoardKit.Line("Aiuola \(index + 1): vuota. Che cosa semini?", Theme.ink, wrap: true)],
                                                                    x: x, y: cy, w: w, flowH: flow.height)
                c = 0
                while c < book.crops.count {
                    let crop: CropInfo = book.crops[c]
                    let r: Rect = flow.rects[c]
                    if ui.button("paese.semina.\(index).\(crop.id)", Rect(laid.row.x + 6 + r.x, laid.flowY + r.y, r.w, r.h), BoardKit.fit(titles[c], r.w - 6),
                                 fill: Theme.shade, enabled: state.gold >= crop.seedCost) {
                        let cropId: String = crop.id
                        change { (s: inout GameState, data: GameData) -> Bool in
                            Village.plant(cropId, plot: plotIndex, state: &s, book: data.village)
                        }
                    }
                    c += 1
                }
                cy += laid.row.h + 5
            }
            index += 1
        }
        if let cost: Int = Village.nextPlotCost(state, book: book) {
            let title: String = "Un'altra aiuola · \(cost) oro"
            if ui.button("paese.compra.aiuola", Rect(x, cy, min(w, buttonWidth(title) + 10), 20), title, fill: Theme.ochre, enabled: state.gold >= cost) {
                change { (s: inout GameState, data: GameData) -> Bool in Village.buyPlot(state: &s, book: data.village) }
            }
            cy += 25
        }
        return cy
    }

    // MARK: Vivaio

    private func drawPens(_ ui: UI, state: GameState, x: Int, y: Int, w: Int) -> Int {
        let g: Canvas = ui.g
        let data: GameData = GameData.shared
        var cy: Int = y
        if !Village.farmUnlocked(state) {
            return note(g, "Le vasche delle vecchie saline si riaprono dal secondo capitolo.", x: x, y: cy, w: w)
        }
        cy = note(g, "Metti in vasca due pesci vivi (tre stelle) della stessa specie, fino a quattro chili: ogni mattina ne troverai di nuovi in dispensa.", x: x, y: cy, w: w)
        let options: [FishSpecies] = Array(Village.stockable(state, fish: data.fish).prefix(5))
        var index: Int = 0
        while index < state.village.pens.count {
            let pen: PenState = state.village.pens[index]
            let penIndex: Int = index
            if let id: String = pen.species, let species: FishSpecies = data.fish.find(id) {
                let lines: [BoardKit.Line] = [
                    BoardKit.Line("Vasca \(index + 1): \(species.name.text()) × \(pen.count)", Theme.ink, wrap: true),
                    BoardKit.Line("Rende \(max(1, pen.count / 2)) al giorno, a due stelle.", Theme.ink.withAlpha(200), wrap: true)
                ]
                let laid: (row: Rect, textX: Int, flowY: Int) = row(g, lines, x: x, y: cy, w: w, iconW: 38, buttonsW: buttonWidth("Svuota"), minHeight: 34)
                drawFitted(g, "\(species.spriteId)_swim_0", in: Rect(laid.row.x + 3, laid.row.y + 3, 38, laid.row.h - 6))
                if rowButtons(ui, laid.row, ids: ["paese.svuota.\(index)"], titles: ["Svuota"], fills: [Theme.shade], enabled: [true]) != nil {
                    GameSession.shared.village { (s: inout GameState, _: GameData) -> Bool in
                        Village.emptyPen(penIndex, state: &s)
                        return true
                    }
                    Feedback.tap()
                }
                cy += laid.row.h + 5
            } else {
                var lines: [BoardKit.Line] = [BoardKit.Line("Vasca \(index + 1): vuota.", Theme.ink, wrap: true)]
                if options.isEmpty {
                    lines.append(BoardKit.Line("In dispensa non hai due pesci vivi della stessa specie. Prendili con la rete o con i dardi soporiferi.",
                                               Theme.ink.withAlpha(190), wrap: true))
                }
                var titles: [String] = []
                var o: Int = 0
                while o < options.count {
                    titles.append(options[o].name.text())
                    o += 1
                }
                let flow: (rects: [Rect], height: Int) = flowLayout(titles, w: w - 12)
                let laid: (row: Rect, textX: Int, flowY: Int) = row(g, lines, x: x, y: cy, w: w, flowH: flow.height)
                o = 0
                while o < options.count {
                    let r: Rect = flow.rects[o]
                    if ui.button("paese.vasca.\(index).\(options[o].id)", Rect(laid.row.x + 6 + r.x, laid.flowY + r.y, r.w, r.h), BoardKit.fit(titles[o], r.w - 6),
                                 fill: Theme.shade) {
                        let speciesId: String = options[o].id
                        change { (s: inout GameState, d: GameData) -> Bool in
                            Village.stock(pen: penIndex, species: speciesId, state: &s, fish: d.fish)
                        }
                    }
                    o += 1
                }
                cy += laid.row.h + 5
            }
            index += 1
        }
        if let cost: Int = Village.nextPenCost(state, book: data.village) {
            let title: String = "Riapri una vasca · \(cost) oro"
            if ui.button("paese.compra.vasca", Rect(x, cy, min(w, buttonWidth(title) + 10), 20), title, fill: Theme.ochre, enabled: state.gold >= cost) {
                change { (s: inout GameState, d: GameData) -> Bool in Village.buyPen(state: &s, book: d.village) }
            }
            cy += 25
        }
        return cy
    }

    // MARK: Nasse

    private func drawTraps(_ ui: UI, state: GameState, x: Int, y: Int, w: Int) -> Int {
        let g: Canvas = ui.g
        let data: GameData = GameData.shared
        var cy: Int = y
        if !Village.farmUnlocked(state) {
            return note(g, "Finché c'è la Baronessa, calare una nassa è regalarle il pranzo. Dal secondo capitolo.", x: x, y: cy, w: w)
        }
        cy = note(g, "Una nassa calata in una zona rende ogni mattina uno o due pesci piccoli di quella zona. Puoi calarla fin dove arriva la tua muta.", x: x, y: cy, w: w)
        let maxDepth: Double = GameSession.shared.maxDepth
        let zones: [Int] = Village.reachableZones(world: data.world, maxDepth: maxDepth)
        let titles: [String] = ["Più su", "Più giù"]
        let buttonsW: Int = rowButtonsWidth(titles)
        var index: Int = 0
        while index < state.village.traps.count {
            let zone: Int = state.village.traps[index].zone
            let trapIndex: Int = index
            var lines: [BoardKit.Line] = [BoardKit.Line("Nassa \(index + 1)", Theme.ink)]
            if zone >= 0 && zone < data.world.zones.count {
                let info: ZoneInfo = data.world.zones[zone]
                lines.append(BoardKit.Line("Calata in: \(info.name.text())", Theme.ink.withAlpha(200), wrap: true))
                let catches: [FishSpecies] = Village.trapCandidates(zone: info, fish: data.fish)
                var names: [String] = []
                var c: Int = 0
                while c < catches.count {
                    names.append(catches[c].name.text())
                    c += 1
                }
                lines.append(BoardKit.Line(names.isEmpty ? "Qui non entra niente." : "Ci finiscono: " + names.joined(separator: ", ") + ".",
                                           Theme.terracotta, wrap: true))
            }
            let position: Int = zones.firstIndex(of: zone) ?? 0
            let laid: (row: Rect, textX: Int, flowY: Int) = row(g, lines, x: x, y: cy, w: w, buttonsW: buttonsW, minHeight: 30)
            if let pressed: Int = rowButtons(ui, laid.row, ids: ["paese.nassa.su.\(index)", "paese.nassa.giu.\(index)"], titles: titles,
                                             fills: [Theme.shade, Theme.shade], enabled: [position > 0, position < zones.count - 1]) {
                if !zones.isEmpty {
                    let target: Int = pressed == 0 ? zones[max(position - 1, 0)] : zones[min(position + 1, zones.count - 1)]
                    change { (s: inout GameState, d: GameData) -> Bool in
                        Village.moveTrap(trapIndex, toZone: target, state: &s, world: d.world, maxDepth: maxDepth)
                    }
                }
            }
            cy += laid.row.h + 5
            index += 1
        }
        if let cost: Int = Village.nextTrapCost(state, book: data.village) {
            let title: String = "Una nassa da Zaira · \(cost) oro"
            if ui.button("paese.compra.nassa", Rect(x, cy, min(w, buttonWidth(title) + 10), 20), title, fill: Theme.ochre, enabled: state.gold >= cost) {
                change { (s: inout GameState, d: GameData) -> Bool in Village.buyTrap(state: &s, book: d.village) }
            }
            cy += 25
        }
        return cy
    }

    // MARK: Collezione

    private func drawCollection(_ ui: UI, state: GameState, x: Int, y: Int, w: Int) -> Int {
        let g: Canvas = ui.g
        let book: VillageBook = GameData.shared.village
        let tiles: [Collectible] = book.tiles
        let cards: [Collectible] = book.postcards
        var tilesOwned: Int = 0
        var index: Int = 0
        while index < tiles.count {
            if state.village.collection.contains(tiles[index].id) { tilesOwned += 1 }
            index += 1
        }
        var cardsOwned: Int = 0
        index = 0
        while index < cards.count {
            if state.village.collection.contains(cards[index].id) { cardsOwned += 1 }
            index += 1
        }
        var cy: Int = y
        g.text("Maioliche dei Nerei \(tilesOwned)/\(tiles.count)", x: x + 2, y: cy + 2, Theme.ink)
        cy = note(g, "Si trovano sul fondo, due per zona: brillano. La collezione completa vale cinque perle.", x: x, y: cy + 13, w: w)
        cy = grid(ui, tiles, state: state, x: x, y: cy, w: w, cellW: 46)
        g.text("Cartoline \(cardsOwned)/\(cards.count)", x: x + 2, y: cy + 4, Theme.ink)
        cy = note(g, "Arrivano da sole, quando raggiungi un traguardo.", x: x, y: cy + 15, w: w)
        cy = grid(ui, cards, state: state, x: x, y: cy, w: w, cellW: 60)
        if let id: String = selected, let item: Collectible = book.collectible(id) {
            let lines: [BoardKit.Line] = [
                BoardKit.Line(item.name.text(), Theme.ink, wrap: true),
                BoardKit.Line(item.note.text(), Theme.ink.withAlpha(200), wrap: true)
            ]
            let laid: (row: Rect, textX: Int, flowY: Int) = row(g, lines, x: x, y: cy, w: w, iconW: 34, minHeight: 32)
            drawFitted(g, item.id, in: Rect(laid.row.x + 3, laid.row.y + 3, 34, laid.row.h - 6))
            cy += laid.row.h + 5
        }
        return cy
    }

    /// Griglia di pezzi della collezione: quelli posseduti col disegno, gli altri con un punto di domanda.
    private func grid(_ ui: UI, _ items: [Collectible], state: GameState, x: Int, y: Int, w: Int, cellW: Int) -> Int {
        let g: Canvas = ui.g
        let gap: Int = 4
        let cellH: Int = 44
        let columns: Int = max(1, (w + gap) / (cellW + gap))
        var index: Int = 0
        while index < items.count {
            let item: Collectible = items[index]
            let owned: Bool = state.village.collection.contains(item.id)
            let r: Rect = Rect(x + (index % columns) * (cellW + gap), y + (index / columns) * (cellH + gap), cellW, cellH)
            let press: UI.Press = ui.press("paese.pezzo.\(item.id)", r)
            g.roundRect(r, radius: 4, Theme.ink.withAlpha(selected == item.id || press.down ? 50 : 18))
            if owned {
                drawFitted(g, item.id, in: r.inset(2), maxScale: 2)
            } else {
                g.text("?", x: r.midX, y: r.midY - 3, Theme.ink.withAlpha(80), align: TextAlign.center)
            }
            if press.focused { ui.focusRing(r) }
            if press.clicked {
                Feedback.tap()
                selected = owned ? item.id : nil
            }
            index += 1
        }
        let rows: Int = (items.count + columns - 1) / columns
        return y + rows * (cellH + gap) + 2
    }

    // MARK: Bar

    private func drawBar(_ ui: UI, state: GameState, x: Int, y: Int, w: Int) -> Int {
        let g: Canvas = ui.g
        let session: GameSession = GameSession.shared
        let records: [String: Int] = state.village.records
        var cy: Int = note(g, "Al bar del porto si gioca a bocce con Don Pinuccio e si butta un gettone nel vecchio cabinato.", x: x, y: y, w: w)
        let playW: Int = max(buttonWidth("Gioca"), buttonWidth("Sfida"))

        let bocce: [BoardKit.Line] = [
            BoardKit.Line("Bocce contro Don Pinuccio", Theme.ink, wrap: true),
            BoardKit.Line("Quattro bocce a testa, vince chi va più vicino al pallino. Levetta per mirare, tieni premuto per la forza.",
                          Theme.ink.withAlpha(200), wrap: true),
            BoardKit.Line("Scommessa \(BocceScreen.bet) oro · miglior mano \(records["bocce"] ?? 0) punti", Theme.terracotta, wrap: true)
        ]
        var laid: (row: Rect, textX: Int, flowY: Int) = row(g, bocce, x: x, y: cy, w: w, iconW: 30, buttonsW: playW, minHeight: 34)
        drawFitted(g, "boccia_0", in: Rect(laid.row.x + 3, laid.row.y + 3, 30, laid.row.h - 6), maxScale: 2)
        if rowButtons(ui, laid.row, ids: ["paese.bar.bocce"], titles: ["Gioca"], fills: [Theme.ochre], enabled: [state.gold >= BocceScreen.bet]) != nil {
            pending = { (app: App) -> Void in Flow.startBocce(app) }
        }
        cy += laid.row.h + 5

        let arcade: [BoardKit.Line] = [
            BoardKit.Line("Il cabinato: Acchiappasarde", Theme.ink, wrap: true),
            BoardKit.Line("Prendi le sarde con la cassetta, lascia cadere i ricci. Tre vite.", Theme.ink.withAlpha(200), wrap: true),
            BoardKit.Line("Gettone \(ArcadeScreen.coin) oro · primato \(records["cabinato"] ?? 0)", Theme.terracotta, wrap: true)
        ]
        laid = row(g, arcade, x: x, y: cy, w: w, iconW: 30, buttonsW: playW, minHeight: 34)
        drawFitted(g, "sardina_swim_0", in: Rect(laid.row.x + 3, laid.row.y + 3, 30, laid.row.h - 6))
        if rowButtons(ui, laid.row, ids: ["paese.bar.cabinato"], titles: ["Gioca"], fills: [Theme.ochre], enabled: [state.gold >= ArcadeScreen.coin]) != nil {
            pending = { (app: App) -> Void in Flow.startArcade(app) }
        }
        cy += laid.row.h + 5

        let available: Bool = session.duelAvailable
        let duel: [BoardKit.Line] = [
            BoardKit.Line("La sfida di Lustri", Theme.ink, wrap: true),
            BoardKit.Line(available ? "Lustri è al bancone con due coltelli. Gara a tempo di musica: chi vince prende 120 monete e 8 punti di fama."
                                    : "Lustri oggi non c'è. Torna nel giorno della sfida: lo leggi al porto.",
                          Theme.ink.withAlpha(200), wrap: true),
            BoardKit.Line("Miglior punteggio \(records["sfida"] ?? 0)", Theme.terracotta, wrap: true)
        ]
        laid = row(g, duel, x: x, y: cy, w: w, iconW: 30, buttonsW: playW, minHeight: 34)
        drawFitted(g, "note_0", in: Rect(laid.row.x + 3, laid.row.y + 3, 30, laid.row.h - 6), maxScale: 2)
        if rowButtons(ui, laid.row, ids: ["paese.bar.sfida"], titles: ["Sfida"], fills: [Theme.terracotta], enabled: [available]) != nil {
            pending = { (app: App) -> Void in Flow.startDuel(app) }
        }
        cy += laid.row.h + 5
        return cy
    }
}
