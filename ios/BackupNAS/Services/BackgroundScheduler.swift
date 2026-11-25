import BackgroundTasks
import Foundation

/// Backup automatico in background. iOS decide quando eseguirlo (di solito di notte, in carica e su Wi-Fi).
enum BackgroundScheduler {
    /// Deve coincidere con BGTaskSchedulerPermittedIdentifiers in project.yml.
    static let identifier = "it.backupnas.app.backup"

    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
            guard let task = task as? BGProcessingTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(task)
        }
    }

    private static func handle(_ task: BGProcessingTask) {
        let work = Task { @MainActor in
            let model = AppModel.shared
            schedule(settings: model.settings)
            let success = await model.engine.run(trigger: .background)
            task.setTaskCompleted(success: success)
        }
        task.expirationHandler = {
            Task { @MainActor in AppModel.shared.engine.cancel() }
            work.cancel()
        }
    }

    @MainActor
    static func schedule(settings: BackupSettings) {
        guard settings.backgroundEnabled, settings.isConfigured else {
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: identifier)
            return
        }
        let request = BGProcessingTaskRequest(identifier: identifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = settings.backgroundRequiresPower
        request.earliestBeginDate = Date(timeIntervalSinceNow: 6 * 60 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }
}
