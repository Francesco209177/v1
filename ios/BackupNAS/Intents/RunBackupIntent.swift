import AppIntents

/// Azione per l'app Comandi rapidi: crea un'automazione (es. "Quando l'iPhone è collegato
/// all'alimentazione" o "Quando arrivo a casa") con l'azione "Esegui backup NAS".
struct RunBackupIntent: AppIntent {
    static var title: LocalizedStringResource = "Esegui backup NAS"
    static var description = IntentDescription("Apre Backup NAS e avvia il backup sul NAS.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        AppModel.shared.selectedTab = .backup
        AppModel.shared.startBackup(trigger: .shortcut)
        return .result()
    }
}
