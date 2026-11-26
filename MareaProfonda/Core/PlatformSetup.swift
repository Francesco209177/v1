import Foundation

/// Collega la logica condivisa all'iPhone: dati nel bundle, salvataggi in Application Support,
/// preferenze in `UserDefaults`. Va chiamata una volta, all'avvio, prima di ogni altra cosa.
enum PlatformSetup {
    private static let settingsKey: String = "marea.settings.v1"
    private static var installed: Bool = false

    static func install() {
        if installed { return }
        installed = true
        GameEnvironment.dataDirectory = Bundle.main.url(forResource: "Data", withExtension: nil)
        let base: URL = FileManager.default.urls(for: FileManager.SearchPathDirectory.applicationSupportDirectory,
                                                 in: FileManager.SearchPathDomainMask.userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        GameEnvironment.saveDirectory = base.appendingPathComponent("Salvataggi", isDirectory: true)
        GameEnvironment.readSettings = { () -> Data? in
            return UserDefaults.standard.data(forKey: PlatformSetup.settingsKey)
        }
        GameEnvironment.writeSettings = { (data: Data) -> Void in
            UserDefaults.standard.set(data, forKey: PlatformSetup.settingsKey)
        }
        GameEnvironment.phaseName = { (phase: DayPhase) -> String in
            return phaseName(phase)
        }
    }
}
