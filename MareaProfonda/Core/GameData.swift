import Foundation

/// Dati di gioco letti dai JSON del bundle (cartella `Data`). Se un file manca o è rotto
/// il gioco parte comunque con valori di riserva e annota il problema.
final class GameData {
    static let shared: GameData = GameData()

    let world: WorldData
    private(set) var problems: [String] = []

    private init() {
        var loadedWorld: WorldData? = nil
        var notes: [String] = []
        if let directory: URL = Bundle.main.url(forResource: "Data", withExtension: nil) {
            do {
                let value: WorldData = try DataFiles.load(WorldData.self, file: "zones.json", in: directory)
                notes.append(contentsOf: value.problems())
                loadedWorld = value
            } catch {
                notes.append("\(error)")
            }
        } else {
            notes.append("cartella Data assente dal bundle")
        }
        world = loadedWorld ?? GameData.fallbackWorld
        problems = notes
    }

    /// Mondo minimo usato solo se `zones.json` non è leggibile.
    private static let fallbackWorld: WorldData = WorldData(pixelsPerMeter: 16, mapWidthMeters: 96, zones: [
        ZoneInfo(id: "posidonia", name: ["it": "Prateria di Posidonia"], depthFrom: 0, depthTo: 60,
                 waterTop: "58d6d0", waterBottom: "1f8fb0", light: 1.0, needsTorch: false,
                 rock: ["3b3a55", "5c5770", "8a7f8c", "b9a99b", "e3d3b0"], cap: ["d9c58f", "f4e7b6"], outline: "2a2940",
                 shape: "bowl", wallMin: 4, wallMax: 30, islands: 0.61, stretch: 3.2)
    ])
}

/// Preferenze salvate in `UserDefaults`.
final class SettingsStore {
    static let shared: SettingsStore = SettingsStore()
    private static let key: String = "marea.settings.v1"

    var settings: GameSettings {
        didSet { if settings != oldValue { save() } }
    }

    private init() {
        if let data: Data = UserDefaults.standard.data(forKey: SettingsStore.key),
           let decoded: GameSettings = try? JSONDecoder().decode(GameSettings.self, from: data) {
            settings = decoded
        } else {
            settings = GameSettings()
        }
    }

    private func save() {
        if let data: Data = try? JSONEncoder().encode(settings) {
            UserDefaults.standard.set(data, forKey: SettingsStore.key)
        }
    }
}
