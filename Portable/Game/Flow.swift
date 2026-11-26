/// Passaggi da una parte all'altra del gioco: l'equivalente portabile di `SceneRouter`.
enum Flow {
    static func showTitle(_ app: App, animated: Bool = true) {
        app.go(TitleScreen(), animated: animated)
    }

    /// Il porto, con il pannello dato (di solito le azioni della giornata).
    /// Prima del porto passano le scene della storia che aspettano di essere viste.
    static func showHub(_ app: App, panel: Panel? = nil) {
        guard let state: GameState = GameSession.shared.state else {
            showTitle(app)
            return
        }
        if let pending: Cutscene = GameSession.shared.pendingScene() {
            let scene: CutsceneScreen = CutsceneScreen(cutscene: pending)
            scene.onFinished = { () -> Void in
                GameSession.shared.sceneShown()
                Flow.showHub(app, panel: panel)
            }
            app.go(scene)
            return
        }
        app.go(HubScreen(phase: state.phase, panel: panel ?? HubPanel()))
    }

    /// Cambia il pannello sopra il porto senza rifare la schermata.
    static func showPanel(_ app: App, _ panel: Panel) {
        if let hub: HubScreen = app.screen as? HubScreen {
            hub.show(panel, app)
        } else {
            showHub(app, panel: panel)
        }
    }

    /// Chiude un menu aperto sopra il porto. Se nel frattempo la storia è andata avanti
    /// (un acquisto, una ricompensa), prima si mostra la scena che aspetta.
    static func backToHub(_ app: App) {
        if GameSession.shared.pendingScene() != nil {
            showHub(app)
        } else {
            showPanel(app, HubPanel())
        }
    }

    static func startDive(_ app: App) {
        let scene: DiveScreen = DiveScreen(config: GameSession.shared.diveConfig())
        scene.onFinished = { (outcome: DiveOutcome) -> Void in
            GameSession.shared.finishDive(outcome)
            Flow.showHub(app)
        }
        app.go(scene)
    }

    /// Lo scontro con il boss che la storia propone adesso.
    static func startBoss(_ app: App) {
        guard let boss: BossInfo = GameSession.shared.availableBoss else {
            showHub(app)
            return
        }
        let scene: DiveScreen = DiveScreen(config: GameSession.shared.bossConfig(boss))
        scene.onFinished = { (outcome: DiveOutcome) -> Void in
            GameSession.shared.finishDive(outcome)
            Flow.showHub(app)
        }
        app.go(scene)
    }

    static func startService(_ app: App) {
        guard let setup: ServiceSetup = GameSession.shared.serviceSetup() else {
            showHub(app)
            return
        }
        // Alla sera del critico l'ospite speciale è l'ispettore della Guida.
        let vip: String? = GameSession.shared.todayEvent?.kind == DayEventKind.critico ? "critico" : nil
        let scene: RestaurantScreen = RestaurantScreen(setup: setup, vipSprite: vip)
        scene.onFinished = { (result: ServiceResult) -> Void in
            GameSession.shared.finishService(result)
            Flow.showHub(app, panel: SummaryPanel())
        }
        app.go(scene)
    }

    // MARK: Giochi del bar

    /// Una mano di bocce: la scommessa si paga all'inizio.
    static func startBocce(_ app: App) {
        if !GameSession.shared.pay(BocceScreen.bet) { return }
        app.go(BocceScreen(seed: UInt64(Date().timeIntervalSince1970)))
    }

    static func startArcade(_ app: App) {
        if !GameSession.shared.pay(ArcadeScreen.coin) { return }
        app.go(ArcadeScreen(seed: UInt64(Date().timeIntervalSince1970)))
    }

    static func startDuel(_ app: App) {
        guard GameSession.shared.duelAvailable, let state: GameState = GameSession.shared.state else { return }
        app.go(RhythmScreen(seed: SeededRNG.combine([state.seed, UInt64(max(state.day, 0))])))
    }
}

func pickupName(_ kind: PickupPoint.Kind) -> String {
    switch kind {
    case .riccio: return "Riccio di mare"
    case .conchiglia: return "Conchiglia"
    case .alga: return "Lattuga di mare"
    case .campana: return "Campana d'aria"
    case .maiolica: return "Maiolica dei Nerei"
    }
}

/// Notizie del giorno al porto: evento, rese di nasse e vivaio, nuovi pezzi da collezione.
enum NewsBanner {
    /// Disegna il riquadro con il bordo inferiore in `bottom`. Ritorna il nuovo bordo libero.
    static func draw(_ ui: UI, state: GameState, left: Int, width: Int, bottom: Int) -> Int {
        let session: GameSession = GameSession.shared
        var texts: [String] = []
        if let event: DayEvent = session.todayEvent { texts.append("\(event.title). \(event.text)") }
        texts.append(contentsOf: state.village.news)
        for id in session.newCollectibles {
            if let item: Collectible = GameData.shared.village.collectible(id) {
                texts.append(item.kind == "maiolica" ? "Nuova maiolica: \(item.name.text())." : "Nuova cartolina: \(item.name.text()).")
            }
        }
        if texts.isEmpty { return bottom }
        var lines: [String] = []
        for text in texts { lines.append(contentsOf: PixelFont.shared.wrap(text, maxWidth: width - 12)) }
        if lines.count > 4 { lines = Array(lines.prefix(4)) }
        let h: Int = 8 + lines.count * PixelFont.lineHeight
        let box: Rect = Rect(left, bottom - h, width, h)
        ui.g.roundRect(box, radius: 4, Theme.lime.withAlpha(235))
        var row: Int = 0
        while row < lines.count {
            ui.g.text(lines[row], x: box.x + 6, y: box.y + 5 + row * PixelFont.lineHeight, Theme.ink)
            row += 1
        }
        return bottom - h - 4
    }
}
