/// Schede del Giornale di bordo: cantiere di Zaira, conti, carta del Calderone, opzioni.
extension LogbookPanel {
    // MARK: Cantiere di Zaira

    func drawYard(_ app: App, _ ui: UI, x: Int, y: Int, w: Int) -> Int {
        let g: Canvas = ui.g
        let session: GameSession = GameSession.shared
        guard let state: GameState = session.state else { return y }
        let book: UpgradeBook = GameData.shared.upgrades
        var cy: Int = y + 2
        cy += g.paragraph("«Qui non si vende elettronica. Si vende roba che funziona.» — Zaira   ·   Hai \(state.gold) oro",
                          x: x + 2, y: cy, width: w - 4, Theme.ink.withAlpha(200)) + 4
        var index: Int = 0
        while index < book.upgrades.count {
            let info: UpgradeInfo = book.upgrades[index]
            let level: Int = state.upgrades[info.id] ?? 0
            let cost: Int? = info.nextCost(level: level)
            let lines: [BoardKit.Line] = [
                BoardKit.Line("\(info.name.text())  ·  livello \(level)/\(info.levels.count)", Theme.ink),
                BoardKit.Line(info.note.text(), Theme.ink.withAlpha(190), wrap: true),
                BoardKit.Line(valueLine(info, level: level), Theme.terracotta)
            ]
            let title: String = cost.map { (c: Int) -> String in "\(c) oro" } ?? "Al massimo"
            let laid: (row: Rect, button: Rect, textX: Int) = textRow(g, lines, x: x, y: cy, w: w, buttonW: max(rowButtonWidth(title), 50))
            if let cost: Int = cost {
                if ui.button("giornale.potenzia.\(info.id)", laid.button, title, fill: Theme.ochre, enabled: state.gold >= cost) && live {
                    if session.buyUpgrade(info.id) == Shop.Outcome.bought { Feedback.success() }
                }
            } else {
                g.text(title, x: laid.button.midX, y: laid.button.midY - 3, Theme.turquoise.scaled(0.8), align: TextAlign.center)
            }
            cy += laid.row.h + 5
            index += 1
        }
        g.text("Armi secondarie", x: x + 2, y: cy + 4, Theme.ink)
        cy += 17
        index = 0
        while index < book.weapons.count {
            let weapon: WeaponInfo = book.weapons[index]
            let owned: Bool = state.weapons.contains(weapon.id)
            let equipped: Bool = state.equipped == weapon.id
            let lines: [BoardKit.Line] = [
                BoardKit.Line(weapon.ammo > 0 ? "\(weapon.name.text())  ·  \(weapon.ammo) colpi" : weapon.name.text(), Theme.ink),
                BoardKit.Line(weapon.note.text(), Theme.ink.withAlpha(190), wrap: true)
            ]
            let title: String = owned ? (equipped ? "In uso" : "Usa") : "\(weapon.price) oro"
            let laid: (row: Rect, button: Rect, textX: Int) = textRow(g, lines, x: x, y: cy, w: w, buttonW: max(rowButtonWidth(title), 50))
            if !owned {
                if ui.button("giornale.arma.\(weapon.id)", laid.button, title, fill: Theme.ochre, enabled: state.gold >= weapon.price) && live {
                    if session.buyWeapon(weapon.id) == Shop.Outcome.bought { Feedback.success() }
                }
            } else {
                if ui.button("giornale.arma.\(weapon.id)", laid.button, title, fill: Theme.turquoise, enabled: !equipped) && live {
                    session.equip(weapon.id)
                }
            }
            cy += laid.row.h + 5
            index += 1
        }
        return cy
    }

    /// Valore attuale del potenziamento e, se c'è, quello del livello dopo.
    private func valueLine(_ info: UpgradeInfo, level: Int) -> String {
        let now: String = LogbookPanel.number(info.value(level: level))
        if level >= info.levels.count { return "\(now) \(info.unit.text())" }
        return "\(now) » \(LogbookPanel.number(info.value(level: level + 1))) \(info.unit.text())"
    }

    /// Numero intero se lo è, altrimenti con due decimali ("1,25").
    static func number(_ v: Double) -> String {
        if v == v.rounded() { return "\(Int(v))" }
        let scaled: Int = Int((abs(v) * 100).rounded())
        let cents: Int = scaled % 100
        return (v < 0 ? "-" : "") + "\(scaled / 100)," + (cents < 10 ? "0\(cents)" : "\(cents)")
    }

    // MARK: Conti

    func drawLedger(_ app: App, _ ui: UI, x: Int, y: Int, w: Int) -> Int {
        let g: Canvas = ui.g
        guard let state: GameState = GameSession.shared.state else { return y }
        let data: GameData = GameData.shared
        let rank: String = data.balance.rank(fame: state.fame)?.name.text() ?? ""
        var species: Int = 0
        var index: Int = 0
        while index < data.fish.species.count {
            if data.fish.species[index].item == nil && data.fish.species[index].sprite == nil { species += 1 }
            index += 1
        }
        let hours: Int = Int(state.playSeconds) / 3600
        let minutes: Int = (Int(state.playSeconds) % 3600) / 60
        let lines: [(label: String, value: String)] = [
            (label: "Giorno", value: "\(state.day)"),
            (label: "Oro in cassa", value: "\(state.gold)"),
            (label: "Incasso totale", value: "\(state.totalEarned)"),
            (label: "Perle", value: "\(state.pearls)"),
            (label: "Rango dell'osteria", value: "\(rank) (\(state.fame) fama)"),
            (label: "Immersione più profonda", value: "\(Int(state.deepestDive)) m"),
            (label: "Specie nel Quaderno", value: "\(state.fishLog.count + state.photos.count) su \(species)"),
            (label: "Ricette conosciute", value: "\(state.recipes.count) su \(data.recipes.recipes.count)"),
            (label: "Tempo di gioco", value: "\(hours) h \(minutes) min")
        ]
        var cy: Int = y
        index = 0
        while index < lines.count {
            if index % 2 == 0 { BoardKit.rowBack(g, Rect(x, cy, w, 15)) }
            BoardKit.summaryLine(g, lines[index].label, lines[index].value, x: x + 6, y: cy + 4, w: w - 12)
            cy += 15
            index += 1
        }
        return cy + 4
    }

    // MARK: Carta del Calderone

    func drawChart(_ app: App, _ ui: UI, x: Int, y: Int, w: Int) -> Int {
        let g: Canvas = ui.g
        let session: GameSession = GameSession.shared
        let limit: Double = session.maxDepth
        let data: GameData = GameData.shared
        g.text("La tua muta regge fino a \(Int(limit)) metri.", x: x + 2, y: y + 2, Theme.ink)
        var cy: Int = y + 15
        var index: Int = 0
        while index < data.world.zones.count {
            let zone: ZoneInfo = data.world.zones[index]
            let open: Bool = Double(zone.depthFrom) < limit
            let mid: Double = Double(zone.depthFrom + zone.depthTo) / 2
            var names: [String] = []
            let found: [FishSpecies] = data.fish.candidates(depthMeters: mid, night: false)
            var f: Int = 0
            while f < found.count && f < 6 {
                names.append(found[f].name.text())
                f += 1
            }
            let alpha: UInt8 = open ? 255 : 140
            var lines: [BoardKit.Line] = [
                BoardKit.Line("\(zone.name.text())  ·  \(zone.depthFrom)–\(zone.depthTo) m", Theme.ink.withAlpha(alpha)),
                BoardKit.Line(open ? names.joined(separator: ", ") : "Troppo profonda per la muta che hai.", Theme.ink.withAlpha(open ? 190 : 110), wrap: true)
            ]
            if zone.needsTorch { lines.append(BoardKit.Line("Serve la torcia.", Theme.terracotta.withAlpha(alpha))) }
            let laid: (row: Rect, button: Rect, textX: Int) = textRow(g, lines, x: x, y: cy, w: w, minHeight: 34, iconW: 30)
            let swatch: Rect = Rect(laid.row.x + 5, laid.row.midY - 13, 26, 26)
            var top: RGBA = RGBA(hexString: zone.waterTop) ?? Theme.deep
            var bottom: RGBA = RGBA(hexString: zone.waterBottom) ?? Theme.ink
            if !open {
                top = top.mixed(with: Theme.lime, 0.5)
                bottom = bottom.mixed(with: Theme.lime, 0.5)
            }
            g.gradient(swatch, top: top, bottom: bottom, band: 2)
            g.roundOutline(swatch, radius: 3, Theme.ink.withAlpha(80))
            cy += laid.row.h + 5
            index += 1
        }
        return cy
    }

    // MARK: Opzioni

    private static func actionName(_ action: GameButtons) -> String {
        switch action {
        case .primary: return "Arpione"
        case .interact: return "Azione"
        case .secondary: return "Arma secondaria"
        case .inventory: return "Giornale"
        case .dash: return "Scatto"
        default: return "Pausa"
        }
    }

    private func store(_ settings: GameSettings, _ app: App) {
        SettingsStore.shared.settings = settings
        app.applySettings()
    }

    /// Rimappatura: dopo "Cambia" si aspetta che il tasto di conferma sia rilasciato,
    /// poi il primo tasto premuto sul controller va all'azione. Da chiamare all'inizio di ogni fotogramma.
    func listen(_ app: App) {
        live = true
        guard let action: GameButtons = listening else { return }
        live = false
        let pad: PadState = app.input.pad
        if !pad.connected {
            listening = nil
            return
        }
        if !armed {
            if pad.buttons.isEmpty { armed = true }
            return
        }
        var index: Int = 0
        let all: [PadButton] = PadButton.allCases
        while index < all.count {
            if app.input.padPressed.contains(all[index]) {
                var settings: GameSettings = SettingsStore.shared.settings
                settings.mapping.assign(all[index], to: action)
                store(settings, app)
                listening = nil
                Feedback.success()
                return
            }
            index += 1
        }
    }

    func drawSettings(_ app: App, _ ui: UI, x: Int, y: Int, w: Int) -> Int {
        let g: Canvas = ui.g
        var settings: GameSettings = SettingsStore.shared.settings
        let before: GameSettings = settings
        var cy: Int = y + 2
        let rowH: Int = 18
        let toggleW: Int = min(w - 4, 300)

        let haptics: Bool = ui.toggle("giornale.vibrazione", Rect(x + 4, cy, toggleW, 16), "Vibrazione", value: settings.haptics)
        cy += rowH
        let autoAim: Bool = ui.toggle("giornale.mira", Rect(x + 4, cy, toggleW, 16), "Mira automatica dell'arpione", value: settings.autoAim)
        cy += rowH
        let lights: Bool = ui.toggle("giornale.luce", Rect(x + 4, cy, toggleW, 16), "Luce dinamica della torcia", value: settings.dynamicLights)
        cy += rowH
        let performance: Bool = ui.toggle("giornale.prestazioni", Rect(x + 4, cy, toggleW, 16), "Mostra fotogrammi al secondo", value: settings.showPerformance)
        cy += rowH
        let music: Double = ui.stepper("giornale.musica", Rect(x + 4, cy, toggleW, 18), "Musica", value: settings.musicVolume)
        cy += rowH + 2
        let effects: Double = ui.stepper("giornale.effetti", Rect(x + 4, cy, toggleW, 18), "Effetti", value: settings.effectsVolume)
        cy += rowH + 4
        if live {
            settings.haptics = haptics
            settings.autoAim = autoAim
            settings.dynamicLights = lights
            settings.showPerformance = performance
            settings.musicVolume = music
            settings.effectsVolume = effects
            if settings != before { store(settings, app) }
        }

        g.text("Tasti del controller", x: x + 2, y: cy + 3, Theme.ink)
        cy += 15
        let connected: Bool = app.input.pad.connected
        if !connected {
            g.text("Collega un controller per cambiare i tasti.", x: x + 2, y: cy + 1, Theme.ink.withAlpha(160))
            cy += 13
        }
        let change: String = "Cambia"
        let changeW: Int = rowButtonWidth(change) + 6
        var index: Int = 0
        while index < GameButtons.all.count {
            let action: GameButtons = GameButtons.all[index]
            let row: Rect = Rect(x, cy, w, 20)
            if index % 2 == 0 { BoardKit.rowBack(g, row) }
            g.text(LogbookPanel.actionName(action), x: row.x + 6, y: row.midY - 3, Theme.ink)
            let waiting: Bool = listening?.key == action.key
            let button: String = settings.mapping.button(for: action)?.rawValue.uppercased() ?? "—"
            g.text(waiting ? "Premi un tasto…" : button, x: row.maxX - 6 - changeW - 8, y: row.midY - 3,
                   waiting ? Theme.terracotta : Theme.cobalt, align: TextAlign.right)
            if ui.button("giornale.tasto.\(action.key)", Rect(row.maxX - 4 - changeW, row.y + 1, changeW, 18), change, enabled: connected) && live {
                listening = action
                armed = false
            }
            cy += 21
            index += 1
        }
        return cy + 4
    }
}
