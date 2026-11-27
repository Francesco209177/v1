extension SmokeRun {
    /// Il servizio della sera con il cameriere automatico, sulla partita di prova con il menu preparato.
    static func restaurantStages() -> [Stage] {
        return [
            Stage(name: "osteria", seconds: 24, begin: { (app: App) -> Void in
                GameSession.shared.startEphemeral(SmokeRun.demo(DayPhase.evening))
                _ = GameSession.shared.prepareMenu([(recipeId: "sarde_beccafico", batches: 2), (recipeId: "orata_sale", batches: 1),
                                                    (recipeId: "spaghetti_ricci", batches: 1)])
                guard let setup: ServiceSetup = GameSession.shared.serviceSetup() else {
                    Log.note("SMOKE FAIL osteria: menu non preparato")
                    return
                }
                let screen: RestaurantScreen = RestaurantScreen(setup: setup, vipSprite: nil)
                screen.autopilot = true
                screen.onFinished = { (result: ServiceResult) -> Void in
                    Log.note("SMOKE osteria finita: serviti=\(result.served) persi=\(result.lost) incasso=\(result.total) combo=\(result.bestCombo)")
                }
                app.go(screen, animated: false)
            })
        ]
    }
}
