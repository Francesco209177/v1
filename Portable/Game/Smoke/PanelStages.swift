extension SmokeRun {
    /// Pannelli sopra il porto: menu della sera, riepilogo del servizio, Giornale di bordo scheda per scheda.
    static func panelStages() -> [Stage] {
        var stages: [Stage] = [
            hubStage("menu", state: { () -> GameState in SmokeRun.demo(DayPhase.evening) }, panel: { () -> Panel in MenuPanel() }),
            hubStage("menu_scelto", state: { () -> GameState in SmokeRun.demo(DayPhase.evening) }, panel: { () -> Panel in
                let panel: MenuPanel = MenuPanel()
                if let state: GameState = GameSession.shared.state {
                    let recipes: [Recipe] = GameData.shared.recipes.recipes
                    var index: Int = 0
                    while index < recipes.count && panel.batches.count < 2 {
                        if state.recipes[recipes[index].id] != nil { panel.batches[recipes[index].id] = 1 }
                        index += 1
                    }
                }
                return panel
            }),
            hubStage("riepilogo", state: { () -> GameState in SmokeRun.demo(DayPhase.evening) }, panel: { () -> Panel in
                SmokeRun.playDemoService()
                return SummaryPanel()
            })
        ]
        let names: [String] = ["missioni", "quaderno", "ricette", "cantiere", "conti", "carta", "opzioni"]
        var tab: Int = 0
        while tab < names.count {
            let index: Int = tab
            stages.append(hubStage("giornale_\(names[index])", state: { () -> GameState in SmokeRun.demo(DayPhase.morning) },
                                   panel: { () -> Panel in LogbookPanel(tab: index) }))
            tab += 1
        }
        return stages
    }

    /// Una serata vera all'osteria: menu dalla dispensa di prova, servizio giocato da `ServiceBot`, conti chiusi.
    static func playDemoService() {
        let session: GameSession = GameSession.shared
        guard let state: GameState = session.state else { return }
        let slots: Int = session.rank?.menuSlots ?? 2
        var pantry: Pantry = state.pantry
        var plan: [(recipeId: String, batches: Int)] = []
        let recipes: [Recipe] = GameData.shared.recipes.recipes
        var index: Int = 0
        while index < recipes.count && plan.count < slots {
            let recipe: Recipe = recipes[index]
            index += 1
            if state.recipes[recipe.id] == nil { continue }
            let n: Int = min(2, MenuPlanner.maxBatches(recipe, pantry: pantry))
            if n <= 0 { continue }
            for ingredient in recipe.ingredients { _ = pantry.take(ingredient.item, count: ingredient.count * n) }
            plan.append((recipeId: recipe.id, batches: n))
        }
        guard session.prepareMenu(plan), let setup: ServiceSetup = session.serviceSetup() else {
            Log.note("SMOKE riepilogo: menu di prova non preparato")
            return
        }
        var sim: ServiceSim = ServiceSim(setup: setup)
        var bot: ServiceBot = ServiceBot(pourSkill: 0.95)
        let dt: Double = 1.0 / 60.0
        var frames: Int = 0
        while !sim.finished && frames < 60 * 900 {
            let input: ServiceInput = bot.decide(sim, dt: dt)
            _ = sim.step(input: input, dt: dt)
            frames += 1
        }
        session.finishService(sim.result)
    }
}
