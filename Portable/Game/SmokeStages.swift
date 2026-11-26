extension SmokeRun {
    /// Elenco delle schermate percorse dalla prova. Ogni nuova schermata del gioco va aggiunta
    /// nel file della sua area, dentro la cartella `Smoke`.
    static func script() -> [Stage] {
        return baseStages() + diveStages() + panelStages() + restaurantStages() + cutsceneStages() + bossStages() + villageStages() + barStages()
    }

    /// Partita di prova, mai salvata: una dispensa fornita per mostrare menu e servizio.
    static func demo(_ phase: DayPhase) -> GameState {
        var state: GameState = GameState()
        state.seed = 7
        state.day = 3
        state.phase = phase
        state.gold = 135
        state.fame = 46
        state.pantry.add("sardina", stars: 2, count: 9)
        state.pantry.add("castagnola", stars: 2, count: 6)
        state.pantry.add("triglia", stars: 2, count: 4)
        state.pantry.add("orata", stars: 3, count: 2)
        state.pantry.add("riccio", stars: 0, count: 6)
        state.pantry.add("alga", stars: 0, count: 4)
        state.fishLog["orata"] = FishRecord(caught: 2, bestStars: 3)
        state.fishLog["triglia"] = FishRecord(caught: 4, bestStars: 2)
        state.fishLog["sardina"] = FishRecord(caught: 9, bestStars: 2)
        state.quests.progress["ines_ricci"] = QuestProgress(count: 6, done: true)
        state.quests.progress["bianca_saraghi"] = QuestProgress(count: 1, done: false)
        return state
    }

    /// Il porto con un pannello sopra, su una partita di prova.
    static func hubStage(_ name: String, state: @escaping () -> GameState, panel: @escaping () -> Panel) -> Stage {
        return Stage(name: name, seconds: 1.2, begin: { (app: App) -> Void in
            let s: GameState = state()
            GameSession.shared.startEphemeral(s)
            app.go(HubScreen(phase: s.phase, panel: panel()), animated: false)
        })
    }
}
