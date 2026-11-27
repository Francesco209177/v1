/// Il Giornale di bordo di Tecla: missioni, specie, ricette, cantiere, conti, carta, impostazioni.
/// Le schede stanno qui e in `LogbookTabs.swift`.
final class LogbookPanel: Panel {
    static let titles: [String] = ["Missioni", "Quaderno", "Ricette", "Cantiere", "Conti", "Carta", "Opzioni"]
    static let scrollId: String = "giornale.lista"

    private(set) var tab: Int
    /// Azione del controller in attesa del nuovo tasto (scheda Opzioni).
    var listening: GameButtons? = nil
    /// true quando il tasto usato per confermare "Cambia" è stato rilasciato.
    var armed: Bool = false
    /// false nel fotogramma in cui i comandi non devono reagire (si sta ascoltando un tasto).
    var live: Bool = true

    init(tab: Int = 0) {
        self.tab = max(0, min(tab, LogbookPanel.titles.count - 1))
    }

    override func enter(_ app: App) {
        app.ui.resetScroll(LogbookPanel.scrollId)
    }

    override func back(_ app: App) -> Bool {
        // Mentre si aspetta un tasto anche "indietro" (B) è un tasto da assegnare.
        if listening != nil { return true }
        Flow.backToHub(app)
        return true
    }

    override func draw(_ app: App, _ ui: UI) {
        listen(app)
        let g: Canvas = ui.g
        BoardKit.dim(ui)
        let card: Rect = BoardKit.frame(app, maxWidth: 580)
        ui.card(card)
        let left: Int = card.x + 7
        let width: Int = card.w - 14

        // Linguette: su una riga se ci stanno, altrimenti su due.
        let closeW: Int = PixelFont.shared.width("Chiudi") + 16
        let tabsW: Int = width - closeW - 6
        var widest: Int = 0
        var index: Int = 0
        while index < LogbookPanel.titles.count {
            widest = max(widest, PixelFont.shared.width(LogbookPanel.titles[index]))
            index += 1
        }
        let tabH: Int = 15
        var picked: Int = tab
        var top: Int = card.y + 7
        if (widest + 8) * LogbookPanel.titles.count + 2 * (LogbookPanel.titles.count - 1) <= tabsW {
            picked = ui.tabs("giornale.schede", Rect(left, top, tabsW, tabH), LogbookPanel.titles, selected: tab)
            top += tabH
        } else {
            let first: [String] = Array(LogbookPanel.titles.prefix(4))
            let second: [String] = Array(LogbookPanel.titles.suffix(LogbookPanel.titles.count - 4))
            let a: Int = ui.tabs("giornale.schede.a", Rect(left, top, tabsW, tabH), first, selected: tab < 4 ? tab : -1)
            let rowW: Int = (tabsW + 2) * second.count / first.count - 2
            let b: Int = ui.tabs("giornale.schede.b", Rect(left, top + tabH + 3, rowW, tabH), second, selected: tab >= 4 ? tab - 4 : -1)
            if a != (tab < 4 ? tab : -1) { picked = a }
            if b != (tab >= 4 ? tab - 4 : -1) { picked = b + 4 }
            top += tabH * 2 + 3
        }
        if picked != tab && live {
            tab = picked
            listening = nil
            ui.resetScroll(LogbookPanel.scrollId)
        }
        if ui.button("giornale.chiudi", Rect(card.maxX - 7 - closeW, card.y + 7, closeW, tabH), "Chiudi", fill: Theme.shade) && live {
            listening = nil
            Flow.backToHub(app)
            return
        }
        g.fill(x: left, y: top + 4, w: width, h: 1, Theme.ink.withAlpha(50))

        let list: Rect = Rect(left, top + 8, width, card.maxY - 6 - (top + 8))
        ui.beginScroll(LogbookPanel.scrollId, list)
        let x: Int = list.x
        let w: Int = list.w - 6
        var y: Int = list.y
        switch tab {
        case 0: y = drawQuests(app, ui, x: x, y: y, w: w)
        case 1: y = drawFish(app, ui, x: x, y: y, w: w)
        case 2: y = drawRecipes(app, ui, x: x, y: y, w: w)
        case 3: y = drawYard(app, ui, x: x, y: y, w: w)
        case 4: y = drawLedger(app, ui, x: x, y: y, w: w)
        case 5: y = drawChart(app, ui, x: x, y: y, w: w)
        default: y = drawSettings(app, ui, x: x, y: y, w: w)
        }
        ui.endScroll(contentHeight: y - list.y)
    }

    // MARK: Righe

    /// Riga con testo a sinistra e, se `buttonW > 0`, uno spazio a destra per un pulsante.
    /// Ritorna il rettangolo della riga e quello del pulsante.
    func textRow(_ g: Canvas, _ lines: [BoardKit.Line], x: Int, y: Int, w: Int, buttonW: Int = 0, minHeight: Int = 0,
                 iconW: Int = 0) -> (row: Rect, button: Rect, textX: Int) {
        let textX: Int = x + 6 + iconW
        let textW: Int = w - 12 - iconW - (buttonW > 0 ? buttonW + 6 : 0)
        let shown: [BoardKit.Line] = BoardKit.layout(lines, width: max(20, textW))
        let h: Int = max(minHeight, 9 + shown.count * PixelFont.lineHeight)
        let row: Rect = Rect(x, y, w, h)
        BoardKit.rowBack(g, row)
        BoardKit.draw(g, shown, x: textX, y: y + 5)
        let button: Rect = Rect(row.maxX - 6 - buttonW, row.midY - 9, buttonW, 18)
        return (row: row, button: button, textX: textX)
    }

    /// Larghezza di un pulsante di riga per il suo titolo.
    func rowButtonWidth(_ title: String) -> Int {
        return PixelFont.shared.width(title) + 14
    }

    // MARK: Missioni

    static func characterName(_ id: String) -> String {
        switch id {
        case "ines": return "Nonna Ines"
        case "zaira": return "Zaira"
        case "pinuccio": return "Don Pinuccio"
        case "bianca": return "Bianca"
        case "saverio": return "Saverio"
        case "lustri": return "Chef Lustri"
        default:
            guard let first: Character = id.first else { return id }
            return first.uppercased() + String(id.dropFirst())
        }
    }

    static func rewardText(_ reward: QuestReward) -> String {
        var parts: [String] = []
        if let gold: Int = reward.gold, gold > 0 { parts.append("\(gold) oro") }
        if let pearls: Int = reward.pearls, pearls > 0 { parts.append(pearls == 1 ? "1 perla" : "\(pearls) perle") }
        if let fame: Int = reward.fame, fame > 0 { parts.append("\(fame) fama") }
        if let recipe: String = reward.recipe { parts.append(GameData.shared.recipes.find(recipe)?.name.text() ?? recipe) }
        if let weapon: String = reward.weapon { parts.append(GameData.shared.upgrades.weapon(weapon)?.name.text() ?? weapon) }
        return parts.joined(separator: " · ")
    }

    private func drawQuests(_ app: App, _ ui: UI, x: Int, y: Int, w: Int) -> Int {
        let g: Canvas = ui.g
        let session: GameSession = GameSession.shared
        guard let state: GameState = session.state else { return y }
        var cy: Int = y

        // La storia in corso.
        var story: [BoardKit.Line] = []
        if let chapter: ChapterInfo = session.chapter {
            story.append(BoardKit.Line("Capitolo \(chapter.id) — \(chapter.title.text())", Theme.cobalt))
        }
        if let beat: StoryBeat = session.storyBeat {
            story.append(BoardKit.Line(beat.title.text(), Theme.ink))
            story.append(BoardKit.Line(beat.objective.text(), Theme.ink.withAlpha(200), wrap: true))
            if let progress: (count: Int, goal: Int) = session.storyProgress {
                let reward: String = beat.reward.map { (r: QuestReward) -> String in LogbookPanel.rewardText(r) } ?? ""
                story.append(BoardKit.Line(reward.isEmpty ? "\(progress.count)/\(progress.goal)" : "\(progress.count)/\(progress.goal) · Ricompensa: \(reward)",
                                           Theme.terracotta, wrap: true))
            }
        } else {
            story.append(BoardKit.Line("La storia è conclusa. Il mare, però, continua.", Theme.ink, wrap: true))
        }
        cy += textRow(g, story, x: x, y: cy, w: w).row.h + 5

        var quests: [Quest] = []
        let today: [Quest] = session.questsToday()
        var index: Int = 0
        while index < today.count {
            if QuestEngine.isActive(today[index], state: state) { quests.append(today[index]) }
            index += 1
        }
        if quests.isEmpty {
            g.text("Nessuna missione in corso.", x: x + 2, y: cy + 2, Theme.ink.withAlpha(170))
            return cy + 14
        }
        let claimTitle: String = "Ritira"
        index = 0
        while index < quests.count {
            let quest: Quest = quests[index]
            let progress: QuestProgress = state.quests.progress[quest.id] ?? QuestProgress()
            let lines: [BoardKit.Line] = [
                BoardKit.Line("\(quest.title.text()) — \(LogbookPanel.characterName(quest.giver))", Theme.ink, wrap: true),
                BoardKit.Line(quest.text.text(), Theme.ink.withAlpha(200), wrap: true),
                BoardKit.Line("\(min(progress.count, quest.goal.count))/\(quest.goal.count) · Ricompensa: \(LogbookPanel.rewardText(quest.reward))",
                              Theme.terracotta, wrap: true)
            ]
            let buttonW: Int = progress.done ? rowButtonWidth(claimTitle) + 6 : 0
            let laid: (row: Rect, button: Rect, textX: Int) = textRow(g, lines, x: x, y: cy, w: w, buttonW: buttonW)
            if progress.done {
                if ui.button("giornale.ritira.\(quest.id)", laid.button, claimTitle, fill: Theme.ochre) && live {
                    if session.claim(quest) { Feedback.success() }
                }
            }
            cy += laid.row.h + 5
            index += 1
        }
        return cy
    }

    // MARK: Quaderno del Mare

    private func drawFish(_ app: App, _ ui: UI, x: Int, y: Int, w: Int) -> Int {
        let g: Canvas = ui.g
        guard let state: GameState = GameSession.shared.state else { return y }
        // Una scheda per ingrediente: le varianti notturne stanno nella scheda della specie di giorno.
        var species: [FishSpecies] = []
        var known: Int = 0
        let all: [FishSpecies] = GameData.shared.fish.species
        var index: Int = 0
        while index < all.count {
            let s: FishSpecies = all[index]
            if s.item == nil && s.sprite == nil {
                species.append(s)
                if state.fishLog[s.id] != nil || state.photos.contains(s.id) { known += 1 }
            }
            index += 1
        }
        g.text("Specie conosciute: \(known) su \(species.count)", x: x + 2, y: y + 2, Theme.ink)
        var cy: Int = y + 15
        let gap: Int = 5
        let columns: Int = max(1, (w + gap) / 140)
        let cardW: Int = (w - gap * (columns - 1)) / columns
        let iconW: Int = 40
        index = 0
        while index < species.count {
            // Una fila di schede: l'altezza è quella della più alta.
            var rowItems: [(species: FishSpecies, lines: [BoardKit.Line], seen: Bool)] = []
            var rowH: Int = 34
            var column: Int = 0
            while column < columns && index + column < species.count {
                let s: FishSpecies = species[index + column]
                let record: FishRecord? = state.fishLog[s.id]
                let photographed: Bool = state.photos.contains(s.id)
                let seen: Bool = record != nil || photographed
                var lines: [BoardKit.Line] = [
                    BoardKit.Line(seen ? s.name.text() : "???", Theme.ink),
                    BoardKit.Line("\(Int(s.depthMin))–\(Int(s.depthMax)) m", Theme.ink.withAlpha(170))
                ]
                if seen {
                    let stars: String = String(repeating: "★", count: record?.bestStars ?? 0)
                    lines.append(BoardKit.Line(s.isProtected ? "Fotografata" : "\(stars)  ×\(record?.caught ?? 0)", Theme.terracotta))
                    lines.append(BoardKit.Line(s.note.text(), Theme.ink.withAlpha(190), wrap: true))
                }
                let laid: [BoardKit.Line] = BoardKit.layout(lines, width: cardW - iconW - 12)
                rowH = max(rowH, 9 + laid.count * PixelFont.lineHeight)
                rowItems.append((species: s, lines: laid, seen: seen))
                column += 1
            }
            column = 0
            while column < rowItems.count {
                let item: (species: FishSpecies, lines: [BoardKit.Line], seen: Bool) = rowItems[column]
                let r: Rect = Rect(x + column * (cardW + gap), cy, cardW, rowH)
                BoardKit.rowBack(g, r)
                drawFitted(g, Sprites.shared.get("\(item.species.id)_swim_0"), in: Rect(r.x + 3, r.y + 3, iconW - 2, min(30, r.h - 6)),
                           ink: item.seen ? Ink.normal : Ink.alpha(46))
                BoardKit.draw(g, item.lines, x: r.x + iconW + 6, y: r.y + 5)
                column += 1
            }
            cy += rowH + gap
            index += rowItems.count
        }
        return cy
    }

    /// Disegna uno sprite centrato in un riquadro, rimpicciolito se non ci sta.
    func drawFitted(_ g: Canvas, _ image: Image, in box: Rect, ink: Ink = Ink.normal) {
        if image.isEmpty { return }
        if image.width <= box.w && image.height <= box.h {
            g.draw(image, x: box.midX - image.width / 2, y: box.midY - image.height / 2, ink: ink)
            return
        }
        let s: Double = min(Double(box.w) / Double(image.width), Double(box.h) / Double(image.height))
        let ax: Double = Double(box.midX) + (Double(image.anchorX) - Double(image.width) / 2) * s
        let ay: Double = Double(box.midY) + (Double(image.anchorY) - Double(image.height) / 2) * s
        g.sprite(image, x: ax, y: ay, rotation: 0, scaleX: s, scaleY: s, ink: ink)
    }

    // MARK: Ricettario

    private func drawRecipes(_ app: App, _ ui: UI, x: Int, y: Int, w: Int) -> Int {
        let g: Canvas = ui.g
        let session: GameSession = GameSession.shared
        guard let state: GameState = session.state else { return y }
        let recipes: [Recipe] = GameData.shared.recipes.recipes
        var cy: Int = y
        var index: Int = 0
        while index < recipes.count {
            let recipe: Recipe = recipes[index]
            let level: Int? = state.recipes[recipe.id]
            var cost: Int? = nil
            if let level: Int = level { cost = RecipeLevels.cost(recipe, level: level) }
            var lines: [BoardKit.Line] = []
            if let level: Int = level {
                lines.append(BoardKit.Line(recipe.name.text(), Theme.ink))
                lines.append(BoardKit.Line(recipe.note.text(), Theme.ink.withAlpha(190), wrap: true))
                lines.append(BoardKit.Line(BoardKit.ingredients(recipe) + " · \(recipe.portions) porzioni · \(recipe.price) oro · livello \(level)",
                                           Theme.terracotta, wrap: true))
            } else {
                lines.append(BoardKit.Line("???", Theme.ink))
                lines.append(BoardKit.Line(unlockHint(recipe), Theme.ink.withAlpha(160), wrap: true))
            }
            var title: String = ""
            if let cost: Int = cost { title = "Affina · \(cost)" }
            let buttonW: Int = cost == nil ? 0 : rowButtonWidth(title)
            let laid: (row: Rect, button: Rect, textX: Int) = textRow(g, lines, x: x, y: cy, w: w, buttonW: buttonW, minHeight: 30, iconW: 34)
            let plate: Image = Sprites.shared.get("plate_\(recipe.plate)")
            let plateScale: Int = plate.width * 2 <= 32 ? 2 : 1
            g.draw(plate, x: laid.row.x + 20 - plate.width * plateScale / 2, y: laid.row.midY - plate.height * plateScale / 2,
                   scale: plateScale, ink: level == nil ? Ink.alpha(50) : Ink.normal)
            // Affinare una ricetta: Nonna Ines la prova e riprova, e il piatto si paga di più.
            if let cost: Int = cost {
                if ui.button("giornale.affina.\(recipe.id)", laid.button, title, fill: Theme.ochre, enabled: state.gold >= cost) && live {
                    if session.upgradeRecipe(recipe.id) { Feedback.success() }
                }
            }
            cy += laid.row.h + 5
            index += 1
        }
        return cy
    }

    private func unlockHint(_ recipe: Recipe) -> String {
        if recipe.unlock.hasPrefix("catch:") { return "Nonna Ines te la insegna quando le porti l'ingrediente giusto." }
        if recipe.unlock.hasPrefix("crop:") { return "Serve qualcosa dell'orto di Saverio." }
        return "Da scoprire."
    }
}
