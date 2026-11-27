extension SmokeRun {
    /// I tre giochi del bar, giocati da soli sulla partita di prova.
    static func barStages() -> [Stage] {
        return [
            Stage(name: "bar_bocce", seconds: 9, begin: { (app: App) -> Void in
                GameSession.shared.startEphemeral(SmokeRun.demo(DayPhase.morning))
                let screen: BocceScreen = BocceScreen(seed: 7)
                screen.autoplay = true
                app.go(screen, animated: false)
            }),
            Stage(name: "bar_cabinato", seconds: 7, begin: { (app: App) -> Void in
                GameSession.shared.startEphemeral(SmokeRun.demo(DayPhase.morning))
                let screen: ArcadeScreen = ArcadeScreen(seed: 7)
                screen.autoplay = true
                app.go(screen, animated: false)
            }),
            Stage(name: "bar_sfida", seconds: 8, begin: { (app: App) -> Void in
                GameSession.shared.startEphemeral(SmokeRun.demo(DayPhase.morning))
                let screen: RhythmScreen = RhythmScreen(seed: 7)
                screen.autoplay = true
                app.go(screen, animated: false)
            })
        ]
    }
}
