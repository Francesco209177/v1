extension SmokeRun {
    static func baseStages() -> [Stage] {
        return [
            Stage(name: "titolo", seconds: 1.5, begin: { (app: App) -> Void in Flow.showTitle(app, animated: false) }),
            Stage(name: "partite", seconds: 1.0, begin: { (app: App) -> Void in app.go(TitleScreen(choosing: true), animated: false) }),
            hubStage("porto_mattina", state: { () -> GameState in SmokeRun.demo(DayPhase.morning) }, panel: { () -> Panel in HubPanel() }),
            hubStage("porto_sera", state: { () -> GameState in SmokeRun.demo(DayPhase.evening) }, panel: { () -> Panel in HubPanel() }),
            hubStage("porto_storia", state: { () -> GameState in
                var state: GameState = GameState()
                state.seed = 7
                state.gold = 220
                state.fame = 60
                state.story.beat = 4
                state.story.introSeen = true
                return state
            }, panel: { () -> Panel in HubPanel() })
        ]
    }
}
