/// Un pannello di menu disegnato sopra il porto (azioni della giornata, menu della sera, Giornale, Paese...).
class Panel {
    func enter(_ app: App) {}
    func draw(_ app: App, _ ui: UI) {}
    /// Tasto "indietro". Ritorna true se il pannello lo ha gestito.
    func back(_ app: App) -> Bool { return false }
}

/// Il porto di Pietrasale: lo sfondo delle scelte della giornata, con il pannello di turno sopra.
final class HubScreen: Screen {
    let phase: DayPhase
    private let port: PortPaint
    private(set) var panel: Panel

    init(phase: DayPhase, panel: Panel) {
        self.phase = phase
        port = PortPaint(phase: phase)
        self.panel = panel
    }

    /// Cambia pannello senza cambiare schermata (dal porto al Giornale e ritorno).
    func show(_ next: Panel, _ app: App) {
        panel = next
        app.ui.setFocus(nil)
        next.enter(app)
    }

    override func enter(_ app: App) {
        Mixer.shared.music(phase == DayPhase.night ? "notte" : "porto")
        Mixer.shared.setUnderwater(0, immediately: true)
        panel.enter(app)
    }

    override func update(_ app: App, _ dt: Double) {
        GameSession.shared.addPlayTime(dt)
    }

    override func drawWorld(_ app: App, _ g: Canvas) {
        let view: View2D = View2D(centerX: 0, centerY: 14, width: g.width, height: g.height)
        port.drawBack(g, view: view, time: app.time)
        let sprites: Sprites = Sprites.shared
        let teclaFrames: Int = max(1, sprites.frameCount("tecla_stand"))
        g.sprite(sprites.get("tecla_stand_\(Int(app.time / 0.45) % teclaFrames)"), x: view.sx(-64), y: view.sy(PortPaint.groundY))
        // La sera Nonna Ines aspetta sulla porta.
        if phase == DayPhase.evening {
            let inesFrames: Int = max(1, sprites.frameCount("ines_stand"))
            g.sprite(sprites.get("ines_stand_\(Int(app.time / 0.5) % inesFrames)"), x: view.sx(96), y: view.sy(PortPaint.groundY + 2), flipX: true)
        }
        port.drawFront(g, view: view)
    }

    override func drawUI(_ app: App, _ ui: UI) {
        panel.draw(app, ui)
    }

    override func back(_ app: App) -> Bool {
        if panel.back(app) { return true }
        // Dal porto, "indietro" chiude la partita (che è salvata) e torna al titolo.
        GameSession.shared.close()
        Flow.showTitle(app)
        return true
    }
}

/// Pastiglia scura con testo (ed eventuale icona) per le barre di stato. Ritorna la larghezza.
@discardableResult
func drawChip(_ g: Canvas, _ text: String, x: Int, y: Int, icon: String? = nil, color: RGBA = Theme.lime) -> Int {
    var w: Int = PixelFont.shared.width(text) + 10
    var iconImage: Image? = nil
    if let icon: String = icon, let image: Image = Sprites.shared.find(icon) {
        iconImage = image
        w += image.width + 3
    }
    g.roundRect(Rect(x, y, w, 13), radius: 6, Theme.ink.withAlpha(184))
    var cx: Int = x + 5
    if let image: Image = iconImage {
        g.draw(image, x: cx, y: y + 6 - image.height / 2)
        cx += image.width + 3
    }
    g.text(text, x: cx, y: y + 3, color)
    return w
}

/// Nome mostrato di un ingrediente: specie, materiale raccolto o prodotto dell'orto.
func itemName(_ id: String) -> String {
    if let species: FishSpecies = GameData.shared.fish.find(id) { return species.name.text() }
    if let kind: PickupPoint.Kind = PickupPoint.Kind(rawValue: id) { return pickupName(kind) }
    if let crop: CropInfo = GameData.shared.village.crop(id) { return crop.name.text() }
    return id
}

/// Azioni della giornata: stato della partita in alto, avvisi e obiettivo, pulsanti in basso.
final class HubPanel: Panel {
    override func draw(_ app: App, _ ui: UI) {
        let g: Canvas = ui.g
        let safe: Rect = app.safe
        let session: GameSession = GameSession.shared
        guard let state: GameState = session.state else { return }
        let balance: Balance = GameData.shared.balance

        // Barra di stato.
        let rank: String = balance.rank(fame: state.fame)?.name.text() ?? ""
        let fameText: String = balance.fameToNextRank(fame: state.fame) == nil ? rank : "\(rank) · \(state.fame) fama"
        var stock: Int = 0
        for entry in state.pantry.entries() { stock += entry.count }
        var x: Int = safe.x + 6
        let top: Int = safe.y + 5
        x += drawChip(g, "Giorno \(state.day) · \(GameEnvironment.phaseName(state.phase))", x: x, y: top) + 4
        x += drawChip(g, "\(state.gold)", x: x, y: top, icon: "icon_coin", color: Theme.ochre) + 4
        x += drawChip(g, fameText, x: x, y: top, icon: "icon_heart") + 4
        if x + 70 < safe.maxX { drawChip(g, "Dispensa: \(stock)", x: x, y: top) }

        // Dal basso verso l'alto: pulsanti, poi gli avvisi impilati.
        var bottom: Int = safe.maxY - 6
        let buttonH: Int = 28
        drawActions(app, ui, state: state, row: Rect(safe.x + 6, bottom - buttonH, safe.w - 12, buttonH))
        bottom -= buttonH + 5

        let width: Int = safe.w - 12
        let left: Int = safe.x + 6
        let learned: [String] = session.newlyLearned
        if !learned.isEmpty {
            var names: [String] = []
            for id in learned {
                if let recipe: Recipe = GameData.shared.recipes.find(id) { names.append(recipe.name.text()) }
            }
            let lines: [String] = PixelFont.shared.wrap(names.joined(separator: ", "), maxWidth: width - 44)
            let h: Int = 20 + min(lines.count, 2) * PixelFont.lineHeight
            let box: Rect = Rect(left, bottom - h, width, h)
            g.roundRect(box, radius: 4, Theme.ochre)
            g.sprite(Sprites.shared.get("ines_shout_0"), x: box.x + 16, y: box.maxY - 2)
            g.text("Nonna Ines ti insegna una ricetta!", x: box.x + 34, y: box.y + 5, Theme.ink)
            var row: Int = 0
            while row < min(lines.count, 2) {
                g.text(lines[row], x: box.x + 34, y: box.y + 17 + row * PixelFont.lineHeight, Theme.ink.withAlpha(200))
                row += 1
            }
            bottom -= h + 4
        }
        if !session.justCompleted.isEmpty {
            var names: [String] = []
            for quest in session.questsToday() where session.justCompleted.contains(quest.id) { names.append(quest.title.text()) }
            let text: String = "Missione compiuta: \(names.joined(separator: ", ")). Ritira la ricompensa nel Giornale di bordo."
            let lines: [String] = PixelFont.shared.wrap(text, maxWidth: width - 12)
            let h: Int = 8 + min(lines.count, 2) * PixelFont.lineHeight
            let box: Rect = Rect(left, bottom - h, width, h)
            g.roundRect(box, radius: 4, Theme.turquoise)
            var row: Int = 0
            while row < min(lines.count, 2) {
                g.text(lines[row], x: box.x + 6, y: box.y + 5 + row * PixelFont.lineHeight, Theme.ink)
                row += 1
            }
            bottom -= h + 4
        }
        bottom = drawObjective(app, ui, state: state, left: left, width: width, bottom: bottom)
        _ = NewsBanner.draw(ui, state: state, left: left, width: width, bottom: bottom)
    }

    /// Riquadro dell'obiettivo della storia; quando c'è un boss da affrontare porta anche il suo pulsante.
    private func drawObjective(_ app: App, _ ui: UI, state: GameState, left: Int, width: Int, bottom: Int) -> Int {
        let g: Canvas = ui.g
        let session: GameSession = GameSession.shared
        guard let beat: StoryBeat = session.storyBeat else { return bottom }
        let boss: BossInfo? = session.availableBoss
        let canFight: Bool = state.phase == DayPhase.morning || state.phase == DayPhase.afternoon
        let bossW: Int = boss == nil ? 0 : 124
        var progressText: String = ""
        if let progress: (count: Int, goal: Int) = session.storyProgress, progress.goal > 1 {
            progressText = "\(progress.count)/\(progress.goal)"
        }
        let progressW: Int = progressText.isEmpty ? 0 : PixelFont.shared.width(progressText) + 8
        let textW: Int = width - 14 - bossW - progressW
        let lines: [String] = PixelFont.shared.wrap(beat.objective.text(), maxWidth: textW)
        let shown: Int = min(lines.count, 2)
        let h: Int = max(boss == nil ? 0 : 34, 19 + shown * PixelFont.lineHeight)
        let box: Rect = Rect(left, bottom - h, width, h)
        g.roundRect(box, radius: 4, Theme.ink.withAlpha(200))
        g.text("Capitolo \(beat.chapter) · \(beat.title.text())", x: box.x + 7, y: box.y + 5, Theme.ochre)
        var row: Int = 0
        while row < shown {
            g.text(lines[row], x: box.x + 7, y: box.y + 17 + row * PixelFont.lineHeight, Theme.lime)
            row += 1
        }
        if !progressText.isEmpty {
            g.text(progressText, x: box.maxX - bossW - 7, y: box.midY - 3, Theme.ochre, align: TextAlign.right)
        }
        if let boss: BossInfo = boss {
            let r: Rect = Rect(box.maxX - bossW - 2, box.y + 4, bossW - 4, box.h - 8)
            if ui.button("hub.boss", r, "Affronta il boss", sub: canFight ? boss.name.text() : "Di mattina o di pomeriggio",
                         fill: Theme.terracotta, text: Theme.lime, enabled: canFight) {
                Flow.startBoss(app)
            }
        }
        return bottom - h - 4
    }

    private func drawActions(_ app: App, _ ui: UI, state: GameState, row: Rect) {
        let session: GameSession = GameSession.shared
        var area: Rect = row
        let gap: Int = 4
        // Da destra: Esci, Paese, Giornale; lo spazio che resta va alle azioni della fase.
        let narrow: Bool = row.w < 430
        let exitR: Rect = area.cutRight(narrow ? 42 : 66)
        area.w -= gap
        let villageR: Rect = area.cutRight(narrow ? 52 : 78)
        area.w -= gap
        let logR: Rect = area.cutRight(narrow ? 58 : 84)
        area.w -= gap
        if ui.button("hub.esci", exitR, "Esci", sub: narrow ? nil : "È salvata", fill: Theme.ink.mixed(with: Theme.cobalt, 0.25), text: Theme.lime) {
            session.close()
            Flow.showTitle(app)
        }
        if ui.button("hub.paese", villageR, "Paese", sub: narrow ? nil : "Orto, nasse, bar", fill: Theme.ochre) {
            session.clearAnnouncements()
            Flow.showPanel(app, VillagePanel())
        }
        if ui.button("hub.giornale", logR, "Giornale", sub: narrow ? nil : "Missioni, cantiere") {
            session.clearAnnouncements()
            Flow.showPanel(app, LogbookPanel())
        }
        let half: Int = (area.w - gap) / 2
        let first: Rect = Rect(area.x, area.y, half, area.h)
        let second: Rect = Rect(area.x + half + gap, area.y, area.w - half - gap, area.h)
        switch state.phase {
        case .morning, .afternoon:
            if ui.button("hub.a", first, "Immergiti", sub: "Scendi nel Calderone") { Flow.startDive(app) }
            if ui.button("hub.b", second, state.phase == DayPhase.morning ? "Aspetta il pomeriggio" : "Vai all'osteria",
                         sub: "Salta l'immersione", fill: Theme.lime) {
                session.skipPhase()
                Flow.showHub(app)
            }
        case .evening:
            if state.tonight.isEmpty {
                if ui.button("hub.a", first, "Prepara il menu", sub: "Scegli i piatti di stasera", fill: Theme.ochre) {
                    session.clearAnnouncements()
                    Flow.showPanel(app, MenuPanel())
                }
            } else {
                if ui.button("hub.a", first, "Apri l'osteria", sub: "Il menu è pronto", fill: Theme.ochre) { Flow.startService(app) }
            }
            if ui.button("hub.b", second, "Chiudi per stasera", sub: "Niente servizio", fill: Theme.lime) {
                session.skipPhase()
                Flow.showHub(app)
            }
        case .night:
            if session.canDiveAtNight {
                if ui.button("hub.a", first, "Immersione notturna", sub: "Altre specie, più pericoli") { Flow.startDive(app) }
                if ui.button("hub.b", second, "Vai a dormire", sub: "Comincia un nuovo giorno", fill: Theme.cobalt, text: Theme.lime) {
                    session.skipPhase()
                    Flow.showHub(app)
                }
            } else {
                if ui.button("hub.b", area, "Vai a dormire", sub: "Comincia un nuovo giorno", fill: Theme.cobalt, text: Theme.lime) {
                    session.skipPhase()
                    Flow.showHub(app)
                }
            }
        }
    }
}
