/// Prova automatica: percorre le schermate una dopo l'altra, salva un'istantanea di ognuna
/// e lascia nel registro una riga per tappa. Gira sul telefono (avviata dal guscio) e su Linux.
final class SmokeRun {
    struct Stage {
        let name: String
        let seconds: Double
        let begin: (App) -> Void
    }

    private let directory: String
    private var stages: [Stage]
    private var index: Int = -1
    private var clock: Double = 0
    private(set) var finished: Bool = false
    private(set) var shots: Int = 0

    init(directory: String) {
        self.directory = directory
        stages = SmokeRun.script()
        try? FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
    }

    func step(_ app: App, _ dt: Double) {
        if finished { return }
        if index < 0 {
            advance(app)
            return
        }
        clock += dt
        if clock >= stages[index].seconds {
            let name: String = stages[index].name
            let ok: Bool = app.saveSnapshot(to: "\(directory)/\(index < 10 ? "0" : "")\(index)_\(name).png")
            if ok { shots += 1 }
            Log.note("SMOKE tappa \(name) \(ok ? "ok" : "SENZA ISTANTANEA")")
            advance(app)
        }
    }

    private func advance(_ app: App) {
        index += 1
        clock = 0
        if index >= stages.count {
            finished = true
            GameSession.shared.close()
            Log.note("SMOKE AUDIO \(Mixer.shared.status) campioni=\(Mixer.shared.delivered)")
            Log.note("SMOKE OK \(shots)/\(stages.count)")
            return
        }
        stages[index].begin(app)
    }
}
