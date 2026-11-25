import Foundation

struct LogEntry: Codable, Identifiable, Hashable {
    enum Level: String, Codable {
        case info, success, warning, error
    }

    var id = UUID()
    var date: Date
    var level: Level
    var message: String
}

/// Registro delle operazioni, conservato su disco (ultime 500 righe).
@MainActor
final class AppLog: ObservableObject {
    @Published private(set) var entries: [LogEntry] = []

    private let maxEntries = 500
    private let fileURL: URL

    init() {
        fileURL = AppPaths.supportDirectory.appendingPathComponent("log.json")
        if let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONDecoder().decode([LogEntry].self, from: data) {
            entries = saved
        }
    }

    func add(_ message: String, level: LogEntry.Level = .info) {
        entries.append(LogEntry(date: Date(), level: level, message: message))
        if entries.count > maxEntries {
            entries.removeFirst(entries.count - maxEntries)
        }
        save()
    }

    func info(_ message: String) { add(message, level: .info) }
    func success(_ message: String) { add(message, level: .success) }
    func warning(_ message: String) { add(message, level: .warning) }
    func error(_ message: String) { add(message, level: .error) }

    func clear() {
        entries.removeAll()
        save()
    }

    var asText: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return entries.map { "\(formatter.string(from: $0.date)) [\($0.level.rawValue)] \($0.message)" }
            .joined(separator: "\n")
    }

    private func save() {
        if let data = try? JSONEncoder().encode(entries) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }
}

/// Cartelle locali dell'app.
enum AppPaths {
    static var supportDirectory: URL {
        let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("BackupNAS", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static func subdirectory(_ name: String) -> URL {
        let url = supportDirectory.appendingPathComponent(name, isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    /// Cartella temporanea per un singolo backup (svuotata alla fine).
    static func makeTemporaryDirectory() -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("BackupNAS-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
}
