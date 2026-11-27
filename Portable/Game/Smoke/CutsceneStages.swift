extension SmokeRun {
    /// Scene della storia, ognuna in un luogo diverso, con l'avanzamento automatico.
    static func cutsceneStages() -> [Stage] {
        return [
            cutsceneStage("scena_porto", id: "s_ritorno", seconds: 7),
            cutsceneStage("scena_osteria", id: "s_prima_sera", seconds: 5),
            cutsceneStage("scena_citta", id: "s_citta", seconds: 6),
            cutsceneStage("scena_sagra", id: "s_sagra", seconds: 5)
        ]
    }

    private static func cutsceneStage(_ name: String, id: String, seconds: Double) -> Stage {
        return Stage(name: name, seconds: seconds, begin: { (app: App) -> Void in
            guard let found: Cutscene = GameData.shared.cutscenes.find(id) else {
                Log.note("SMOKE scena assente: \(id)")
                Flow.showTitle(app, animated: false)
                return
            }
            let screen: CutsceneScreen = CutsceneScreen(cutscene: found)
            screen.autoAdvance = 0.9
            app.go(screen, animated: false)
        })
    }
}
