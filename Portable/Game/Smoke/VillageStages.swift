extension SmokeRun {
    /// Il pannello del paese, scheda per scheda, con lo stesso stato di prova della tappa `paese` di iOS.
    static func villageStages() -> [Stage] {
        let names: [String] = ["personale", "orto", "vivaio", "nasse", "collezione", "bar"]
        var stages: [Stage] = []
        var tab: Int = 0
        while tab < names.count {
            let index: Int = tab
            // Al bar serve il giorno della sfida di Lustri (giorno % 7 == 5).
            let day: Int = index == names.count - 1 ? 12 : 9
            stages.append(hubStage("paese_\(names[index])", state: { () -> GameState in SmokeRun.villageDemo(day: day) },
                                   panel: { () -> Panel in VillagePanel(tab: index) }))
            tab += 1
        }
        return stages
    }

    /// Partita di prova del paese: personale, due aiuole, una nassa e qualche pezzo della collezione.
    static func villageDemo(day: Int) -> GameState {
        var state: GameState = GameState()
        state.seed = 7
        state.day = day
        state.gold = 900
        state.fame = 150
        state.flags["beat_c1_baronessa"] = true
        state.village.staff = ["nunzia"]
        state.village.plots = [PlotState(crop: "pomodoro", plantedDay: 5), PlotState()]
        state.village.traps = [TrapState(zone: 0)]
        state.village.collection = ["tile_1", "tile_4", "card_1"]
        return state
    }
}
