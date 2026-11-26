// File provvisorio durante il porting: segnaposto per le schermate non ancora scritte.
final class CutsceneScreen: Screen {
    var onFinished: (() -> Void)?
    init(cutscene: Cutscene) {}
}
final class DiveScreen: Screen {
    var onFinished: ((DiveOutcome) -> Void)?
    init(config: DiveConfig) {}
}
final class RestaurantScreen: Screen {
    var onFinished: ((ServiceResult) -> Void)?
    init(setup: ServiceSetup, vipSprite: String?) {}
}
final class SummaryPanel: Panel {}
final class MenuPanel: Panel {}
final class LogbookPanel: Panel {}
final class VillagePanel: Panel {}
final class BocceScreen: Screen {
    static let bet: Int = 20
    init(seed: UInt64) {}
}
final class ArcadeScreen: Screen {
    static let coin: Int = 5
    init(seed: UInt64) {}
}
final class RhythmScreen: Screen {
    init(seed: UInt64) {}
}
extension SmokeRun {
    static func script() -> [Stage] {
        var out: [Stage] = []
        out.append(Stage(name: "titolo", seconds: 1.5, begin: { (app: App) -> Void in Flow.showTitle(app, animated: false) }))
        out.append(Stage(name: "partite", seconds: 1.0, begin: { (app: App) -> Void in app.go(TitleScreen(choosing: true), animated: false) }))
        for phase in [DayPhase.morning, DayPhase.evening, DayPhase.night] {
            out.append(Stage(name: "porto_\(phase.rawValue)", seconds: 1.0, begin: { (app: App) -> Void in
                var state: GameState = GameState()
                state.phase = phase
                state.gold = 345
                state.fame = 52
                state.day = 4
                GameSession.shared.startEphemeral(state)
                app.go(HubScreen(phase: phase, panel: HubPanel()), animated: false)
            }))
        }
        return out
    }
}
