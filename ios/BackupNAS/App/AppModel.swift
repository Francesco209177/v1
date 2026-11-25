import Foundation
import SwiftUI

/// Impostazioni salvate (la password è nel Portachiavi, non qui).
struct BackupSettings: Codable, Equatable {
    var host = ""
    var share = ""
    var username = ""
    var basePath = "Backup iPhone"
    var deviceName = "iPhone"
    var keepCopies = 30
    var backupInbox = true
    var backupContacts = true
    var backupCalendars = true
    var backupReminders = true
    var backupFolders = true
    var autoUploadShared = true
    var backgroundEnabled = true
    var backgroundRequiresPower = true

    init() {}

    // Decodifica tollerante: le chiavi mancanti (versioni future/precedenti) prendono il valore predefinito.
    init(from decoder: Decoder) throws {
        let defaults = BackupSettings()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        host = try c.decodeIfPresent(String.self, forKey: .host) ?? defaults.host
        share = try c.decodeIfPresent(String.self, forKey: .share) ?? defaults.share
        username = try c.decodeIfPresent(String.self, forKey: .username) ?? defaults.username
        basePath = try c.decodeIfPresent(String.self, forKey: .basePath) ?? defaults.basePath
        deviceName = try c.decodeIfPresent(String.self, forKey: .deviceName) ?? defaults.deviceName
        keepCopies = try c.decodeIfPresent(Int.self, forKey: .keepCopies) ?? defaults.keepCopies
        backupInbox = try c.decodeIfPresent(Bool.self, forKey: .backupInbox) ?? defaults.backupInbox
        backupContacts = try c.decodeIfPresent(Bool.self, forKey: .backupContacts) ?? defaults.backupContacts
        backupCalendars = try c.decodeIfPresent(Bool.self, forKey: .backupCalendars) ?? defaults.backupCalendars
        backupReminders = try c.decodeIfPresent(Bool.self, forKey: .backupReminders) ?? defaults.backupReminders
        backupFolders = try c.decodeIfPresent(Bool.self, forKey: .backupFolders) ?? defaults.backupFolders
        autoUploadShared = try c.decodeIfPresent(Bool.self, forKey: .autoUploadShared) ?? defaults.autoUploadShared
        backgroundEnabled = try c.decodeIfPresent(Bool.self, forKey: .backgroundEnabled) ?? defaults.backgroundEnabled
        backgroundRequiresPower = try c.decodeIfPresent(Bool.self, forKey: .backgroundRequiresPower) ?? defaults.backgroundRequiresPower
    }

    var isConfigured: Bool {
        !SMBService.normalizedHost(host).isEmpty && !share.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// Cartella del dispositivo sulla condivisione, es. "Backup iPhone/iPhone di Mario".
    var deviceRoot: String {
        PathUtils.join(PathUtils.sanitizePath(basePath), PathUtils.sanitize(deviceName.isEmpty ? "iPhone" : deviceName))
    }

    func isEnabled(_ category: BackupCategory) -> Bool {
        switch category {
        case .inbox: return backupInbox
        case .contacts: return backupContacts
        case .calendars: return backupCalendars
        case .reminders: return backupReminders
        case .folders: return backupFolders
        }
    }

    mutating func setEnabled(_ category: BackupCategory, _ value: Bool) {
        switch category {
        case .inbox: backupInbox = value
        case .contacts: backupContacts = value
        case .calendars: backupCalendars = value
        case .reminders: backupReminders = value
        case .folders: backupFolders = value
        }
    }
}

enum BackupCategory: String, Codable, CaseIterable, Identifiable {
    case inbox, contacts, calendars, reminders, folders

    var id: String { rawValue }

    var title: String {
        switch self {
        case .inbox: return "File ricevuti (WhatsApp…)"
        case .contacts: return "Contatti"
        case .calendars: return "Calendari"
        case .reminders: return "Promemoria"
        case .folders: return "Cartelle da File"
        }
    }

    var icon: String {
        switch self {
        case .inbox: return "tray.and.arrow.down"
        case .contacts: return "person.crop.circle"
        case .calendars: return "calendar"
        case .reminders: return "checklist"
        case .folders: return "folder"
        }
    }
}

enum BackupTrigger: String {
    case manual = "manuale"
    case background = "in background"
    case shortcut = "da Comandi rapidi"
    case shared = "file condiviso"
}

enum AppTab: Hashable {
    case backup, folders, inbox, settings
}

@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()

    @Published var settings: BackupSettings {
        didSet { saveSettings() }
    }
    @Published var selectedTab: AppTab = .backup

    let log = AppLog()
    let folders = FolderStore()
    let inbox = InboxStore()
    private(set) lazy var engine = BackupEngine(model: self)

    private static let settingsKey = "settings.v1"
    private static let passwordAccount = "smb-password"

    private init() {
        if let data = UserDefaults.standard.data(forKey: Self.settingsKey),
           let saved = try? JSONDecoder().decode(BackupSettings.self, from: data) {
            settings = saved
        } else {
            settings = BackupSettings()
        }
    }

    var password: String {
        get { Keychain.get(account: Self.passwordAccount) }
        set {
            objectWillChange.send()
            Keychain.set(newValue, account: Self.passwordAccount)
        }
    }

    var smbConfig: SMBConfig {
        SMBConfig(host: settings.host, share: settings.share, username: settings.username, password: password)
    }

    func binding(for category: BackupCategory) -> Binding<Bool> {
        Binding(
            get: { self.settings.isEnabled(category) },
            set: { self.settings.setEnabled(category, $0) }
        )
    }

    func startBackup(trigger: BackupTrigger, only: Set<BackupCategory>? = nil) {
        Task { await engine.run(trigger: trigger, only: only) }
    }

    /// Chiamato quando un'altra app condivide un file con Backup NAS.
    func handleIncomingFile(_ url: URL) {
        guard url.isFileURL else { return }
        do {
            let item = try inbox.importFile(at: url)
            log.info("Ricevuto \"\(item.fileName)\" (\(PathUtils.formatBytes(item.size)))")
            selectedTab = .inbox
            if settings.autoUploadShared, settings.isConfigured {
                startBackup(trigger: .shared, only: [.inbox])
            }
        } catch {
            log.error("Impossibile ricevere \"\(url.lastPathComponent)\": \(error.localizedDescription)")
        }
    }

    private func saveSettings() {
        if let data = try? JSONEncoder().encode(settings) {
            UserDefaults.standard.set(data, forKey: Self.settingsKey)
        }
    }
}
