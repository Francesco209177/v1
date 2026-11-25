import EventKit
import Foundation
import UIKit

/// Esegue il backup: si collega al NAS e lancia in sequenza le categorie attive.
@MainActor
final class BackupEngine: ObservableObject {
    @Published private(set) var isRunning = false
    @Published private(set) var phase = ""
    @Published private(set) var detail = ""
    @Published private(set) var fraction: Double?
    @Published private(set) var lastSummary: String?
    @Published private(set) var lastRuns: [String: Date] = [:]
    @Published private(set) var lastFailures: [String: String] = [:]
    @Published private(set) var isTesting = false
    @Published private(set) var testResult: String?

    private unowned let model: AppModel
    private var cancelToken: CancelToken?

    private static let lastRunsKey = "lastRuns.v1"
    private static let lastFailuresKey = "lastFailures.v1"
    private static let lastSummaryKey = "lastSummary.v1"

    init(model: AppModel) {
        self.model = model
        let defaults = UserDefaults.standard
        if let data = defaults.data(forKey: Self.lastRunsKey),
           let saved = try? JSONDecoder().decode([String: Date].self, from: data) {
            lastRuns = saved
        }
        if let data = defaults.data(forKey: Self.lastFailuresKey),
           let saved = try? JSONDecoder().decode([String: String].self, from: data) {
            lastFailures = saved
        }
        lastSummary = defaults.string(forKey: Self.lastSummaryKey)
    }

    private var log: AppLog { model.log }

    func lastRun(_ category: BackupCategory) -> Date? { lastRuns[category.rawValue] }
    func lastFailure(_ category: BackupCategory) -> String? { lastFailures[category.rawValue] }

    func cancel() {
        cancelToken?.cancel()
        phase = "Annullamento…"
    }

    // MARK: - Backup

    @discardableResult
    func run(trigger: BackupTrigger, only: Set<BackupCategory>? = nil) async -> Bool {
        guard !isRunning else { return false }
        let settings = model.settings
        guard settings.isConfigured else {
            log.warning("Backup non avviato: configura il NAS in Impostazioni.")
            lastSummary = "Configura il NAS in Impostazioni"
            return false
        }
        let categories = BackupCategory.allCases.filter { category in
            settings.isEnabled(category) && (only?.contains(category) ?? true)
        }
        guard !categories.isEmpty else { return true }

        isRunning = true
        fraction = nil
        detail = ""
        let token = CancelToken()
        cancelToken = token
        let backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "BackupNAS") { token.cancel() }
        if trigger != .background { UIApplication.shared.isIdleTimerDisabled = true }
        let tempDirectory = AppPaths.makeTemporaryDirectory()
        let started = Date()
        var success = true
        var completed: [String] = []
        log.info("Backup avviato (\(trigger.rawValue)): \(categories.map(\.title).joined(separator: ", "))")

        do {
            phase = "Connessione al NAS…"
            let smb = try SMBService(config: model.smbConfig)
            try await smb.connect()
            let root = settings.deviceRoot
            try await smb.ensureDirectory(root)

            for category in categories {
                try token.check()
                phase = category.title
                detail = ""
                fraction = nil
                do {
                    let summary = try await run(category, smb: smb, root: root, token: token, temp: tempDirectory)
                    setLastRun(category, failure: nil)
                    completed.append(category.title)
                    log.success("\(category.title): \(summary)")
                } catch BackupError.cancelled {
                    throw BackupError.cancelled
                } catch {
                    success = false
                    setLastRun(category, failure: error.backupDescription)
                    log.error("\(category.title): \(error.backupDescription)")
                    // Se è caduta la connessione inutile continuare con le altre categorie.
                    if error.isNetworkError { throw error }
                }
            }
            await smb.disconnect()
        } catch BackupError.cancelled {
            success = false
            log.warning("Backup annullato.")
        } catch {
            success = false
            log.error("Backup interrotto: \(error.backupDescription)")
        }

        try? FileManager.default.removeItem(at: tempDirectory)
        let elapsed = Int(Date().timeIntervalSince(started))
        let summary = success
            ? "Completato in \(elapsed / 60) min \(elapsed % 60) s"
            : (completed.isEmpty ? "Non riuscito" : "Parziale: \(completed.joined(separator: ", "))")
        lastSummary = "\(summary) — \(Date().formatted(date: .abbreviated, time: .shortened))"
        UserDefaults.standard.set(lastSummary, forKey: Self.lastSummaryKey)
        phase = ""
        detail = ""
        fraction = nil
        isRunning = false
        cancelToken = nil
        UIApplication.shared.isIdleTimerDisabled = false
        if backgroundTask != .invalid { UIApplication.shared.endBackgroundTask(backgroundTask) }
        return success
    }

    private func run(_ category: BackupCategory, smb: SMBService, root: String, token: CancelToken, temp: URL) async throws -> String {
        switch category {
        case .inbox: return try await backupInbox(smb: smb, root: root, token: token)
        case .contacts: return try await backupContacts(smb: smb, root: root, token: token)
        case .calendars: return try await backupCalendars(smb: smb, root: root, token: token)
        case .reminders: return try await backupReminders(smb: smb, root: root, token: token)
        case .folders: return try await backupFolders(smb: smb, root: root, token: token, temp: temp)
        }
    }

    private func setLastRun(_ category: BackupCategory, failure: String?) {
        if let failure {
            lastFailures[category.rawValue] = failure
        } else {
            lastRuns[category.rawValue] = Date()
            lastFailures[category.rawValue] = nil
        }
        let defaults = UserDefaults.standard
        defaults.set(try? JSONEncoder().encode(lastRuns), forKey: Self.lastRunsKey)
        defaults.set(try? JSONEncoder().encode(lastFailures), forKey: Self.lastFailuresKey)
    }

    /// Callback di avanzamento per AMSMB2 (chiamata da un altro thread).
    private func progressHandler(index: Int, count: Int, size: Int64) -> @Sendable (Int64) -> Void {
        let total = Double(max(size, 1))
        // L'engine vive quanto l'app (AppModel.shared), quindi la cattura forte non crea problemi.
        return { bytes in
            let fileFraction = min(Double(bytes) / total, 1)
            Task { @MainActor in
                self.fraction = (Double(index) + fileFraction) / Double(max(count, 1))
            }
        }
    }

    // MARK: Categorie

    private func backupInbox(smb: SMBService, root: String, token: CancelToken) async throws -> String {
        let items = model.inbox.pendingItems
        guard !items.isEmpty else { return "nessun file in attesa" }
        var uploaded = 0
        for (index, item) in items.enumerated() {
            try token.check()
            detail = "\(index + 1)/\(items.count) · \(item.fileName)"
            let local = model.inbox.localURL(for: item)
            guard FileManager.default.fileExists(atPath: local.path) else {
                model.inbox.markFailed(item.id, error: "File locale non trovato")
                continue
            }
            let remote = PathUtils.join(root, PathUtils.inboxRemotePath(fileName: item.fileName, received: item.received))
            do {
                try await smb.upload(local: local, to: remote, cancel: token,
                                     progress: progressHandler(index: index, count: items.count, size: item.size))
                model.inbox.markUploaded(item.id, remotePath: remote)
                uploaded += 1
            } catch BackupError.cancelled {
                throw BackupError.cancelled
            } catch {
                model.inbox.markFailed(item.id, error: error.backupDescription)
                if error.isNetworkError { throw error }
            }
        }
        return "\(uploaded) di \(items.count) file caricati"
    }

    private func backupContacts(smb: SMBService, root: String, token: CancelToken) async throws -> String {
        try await ContactsExporter.requestAccess()
        detail = "Lettura della rubrica…"
        let result = try await Task.detached(priority: .userInitiated) { try ContactsExporter.export() }.value
        try token.check()
        let directory = PathUtils.join(root, "Contatti")
        let remote = PathUtils.join(directory, "Contatti_\(PathUtils.timestamp(Date())).vcf")
        detail = "Caricamento di \(result.count) contatti…"
        try await smb.upload(data: result.data, to: remote, cancel: token)
        let removed = (try? await smb.prune(directory: directory, prefix: "Contatti_", keep: model.settings.keepCopies)) ?? []
        if result.isLimited {
            log.warning("Contatti: l'accesso è \"limitato\", quindi sono stati salvati solo i contatti consentiti. Per salvarli tutti: Impostazioni iOS > Backup NAS > Contatti > Accesso completo.")
        }
        return "\(result.count) contatti salvati" + (removed.isEmpty ? "" : ", \(removed.count) copie vecchie eliminate")
    }

    private func backupCalendars(smb: SMBService, root: String, token: CancelToken) async throws -> String {
        let store = EKEventStore()
        try await CalendarExporter.requestEventAccess(store)
        detail = "Lettura dei calendari…"
        let files = await Task.detached(priority: .userInitiated) { CalendarExporter.exportEvents(store: store) }.value
        return try await uploadSnapshot(files, folder: "Calendari", what: "eventi", smb: smb, root: root, token: token)
    }

    private func backupReminders(smb: SMBService, root: String, token: CancelToken) async throws -> String {
        let store = EKEventStore()
        try await CalendarExporter.requestReminderAccess(store)
        detail = "Lettura dei promemoria…"
        let files = await CalendarExporter.exportReminders(store: store)
        return try await uploadSnapshot(files, folder: "Promemoria", what: "promemoria", smb: smb, root: root, token: token)
    }

    /// Carica i file .ics in una cartella datata (es. Calendari/2026-11-25_1030/) e tiene le ultime N.
    private func uploadSnapshot(_ files: [CalendarExporter.ExportedFile], folder: String, what: String,
                                smb: SMBService, root: String, token: CancelToken) async throws -> String {
        guard !files.isEmpty else { return "niente da salvare" }
        let parent = PathUtils.join(root, folder)
        let snapshot = PathUtils.join(parent, PathUtils.timestamp(Date()))
        for (index, file) in files.enumerated() {
            try token.check()
            detail = "\(index + 1)/\(files.count) · \(file.fileName)"
            fraction = Double(index) / Double(files.count)
            try await smb.upload(data: file.data, to: PathUtils.join(snapshot, file.fileName), cancel: token)
        }
        let removed = (try? await smb.prune(directory: parent, prefix: "20", keep: model.settings.keepCopies)) ?? []
        let total = files.reduce(0) { $0 + $1.itemCount }
        return "\(total) \(what) in \(files.count) file" + (removed.isEmpty ? "" : ", \(removed.count) copie vecchie eliminate")
    }

    private func backupFolders(smb: SMBService, root: String, token: CancelToken, temp: URL) async throws -> String {
        let folders = model.folders.folders
        guard !folders.isEmpty else { return "nessuna cartella scelta" }
        var totalUploaded = 0
        var totalFailed = 0
        for folder in folders {
            try token.check()
            do {
                let (uploaded, failed) = try await sync(folder, smb: smb, root: root, token: token, temp: temp)
                totalUploaded += uploaded
                totalFailed += failed
            } catch BackupError.cancelled {
                throw BackupError.cancelled
            } catch {
                model.folders.update(folder.id) { $0.lastError = error.backupDescription }
                log.error("Cartella \(folder.name): \(error.backupDescription)")
                if error.isNetworkError { throw error }
                totalFailed += 1
            }
        }
        return "\(totalUploaded) file nuovi o modificati" + (totalFailed > 0 ? ", \(totalFailed) errori (vedi Registro)" : "")
    }

    private func sync(_ folder: SyncedFolder, smb: SMBService, root: String, token: CancelToken, temp: URL) async throws -> (Int, Int) {
        let url = try model.folders.resolve(folder)
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }

        detail = "\(folder.name): scansione…"
        let files = await Task.detached(priority: .userInitiated) { FolderScanner.scan(root: url) }.value
        let manifestURL = model.folders.manifestURL(for: folder)
        var manifest = SyncManifest.load(from: manifestURL)
        let pending = manifest.pending(files)
        let remoteBase = PathUtils.join(root, "File", folder.name)
        var uploaded = 0
        var failed = 0

        for (index, file) in pending.enumerated() {
            if token.isCancelled {
                manifest.save(to: manifestURL)
                throw BackupError.cancelled
            }
            detail = "\(folder.name): \(index + 1)/\(pending.count) · \(file.relativePath)"
            do {
                let prepared = try await Task.detached(priority: .userInitiated) {
                    try FolderScanner.prepare(file, tempDirectory: temp)
                }.value
                defer { if prepared.isTemporary { try? FileManager.default.removeItem(at: prepared.url.deletingLastPathComponent()) } }
                let remote = PathUtils.join(remoteBase, PathUtils.sanitizePath(file.relativePath))
                let modified = prepared.fingerprint.modified > 0 ? Date(timeIntervalSince1970: TimeInterval(prepared.fingerprint.modified)) : nil
                try await smb.upload(local: prepared.url, to: remote, modificationDate: modified, cancel: token,
                                     progress: progressHandler(index: index, count: pending.count, size: prepared.fingerprint.size))
                manifest.record(file.relativePath, prepared.fingerprint)
                uploaded += 1
                if uploaded % 20 == 0 { manifest.save(to: manifestURL) }
            } catch BackupError.cancelled {
                manifest.save(to: manifestURL)
                throw BackupError.cancelled
            } catch {
                if error.isNetworkError {
                    manifest.save(to: manifestURL)
                    throw error
                }
                failed += 1
                log.warning("\(folder.name)/\(file.relativePath): \(error.backupDescription)")
            }
        }
        manifest.save(to: manifestURL)
        model.folders.update(folder.id) {
            $0.lastSync = Date()
            $0.lastFileCount = files.count
            $0.lastError = failed > 0 ? "\(failed) file non caricati (vedi Registro)" : nil
        }
        log.info("Cartella \(folder.name): \(uploaded) caricati, \(files.count - pending.count) già presenti, \(failed) errori")
        return (uploaded, failed)
    }

    // MARK: - Test connessione

    func testConnection() async {
        guard !isTesting else { return }
        isTesting = true
        testResult = nil
        var lines: [String] = []
        do {
            let settings = model.settings
            let smb = try SMBService(config: model.smbConfig)
            if let shares = try? await smb.listShares(), !shares.isEmpty {
                lines.append("Condivisioni trovate: \(shares.joined(separator: ", "))")
                if !shares.contains(where: { $0.caseInsensitiveCompare(smb.share) == .orderedSame }) {
                    lines.append("⚠️ \"\(smb.share)\" non è nell'elenco: controlla il nome.")
                }
            }
            try await smb.connect()
            lines.append("✅ Connesso a \"\(smb.share)\"")
            try await smb.testWrite(in: settings.deviceRoot)
            lines.append("✅ Scrittura riuscita in \(settings.deviceRoot)")
            if let free = await smb.freeSpace() {
                lines.append("Spazio libero: \(PathUtils.formatBytes(free))")
            }
            await smb.disconnect()
            log.success("Test connessione riuscito")
        } catch {
            lines.append("❌ \(error.backupDescription)")
            log.error("Test connessione: \(error.backupDescription)")
        }
        testResult = lines.joined(separator: "\n")
        isTesting = false
    }
}

extension Error {
    /// Errori che indicano che il NAS non è raggiungibile (inutile proseguire).
    var isNetworkError: Bool {
        let nsError = self as NSError
        guard nsError.domain == NSPOSIXErrorDomain else { return false }
        let codes: [POSIXErrorCode] = [.ETIMEDOUT, .ECONNREFUSED, .EHOSTUNREACH, .ENETUNREACH, .EHOSTDOWN, .ENOTCONN, .ECONNRESET, .EPIPE, .ENETDOWN]
        return codes.map { Int($0.rawValue) }.contains(nsError.code)
    }
}
