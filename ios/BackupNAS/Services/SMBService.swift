import AMSMB2
import Foundation

struct SMBConfig {
    var host: String
    var share: String
    var username: String
    var password: String
}

enum BackupError: LocalizedError {
    case notConfigured(String)
    case invalidHost(String)
    case sizeMismatch(String)
    case permissionDenied(String)
    case cancelled

    var errorDescription: String? {
        switch self {
        case .notConfigured(let detail): return "Configurazione incompleta: \(detail)"
        case .invalidHost(let host): return "Indirizzo del NAS non valido: \"\(host)\""
        case .sizeMismatch(let path): return "Il file caricato non ha la dimensione attesa: \(path)"
        case .permissionDenied(let what): return "Permesso negato per \(what). Abilitalo in Impostazioni iOS > Backup NAS."
        case .cancelled: return "Backup annullato"
        }
    }
}

/// Flag di annullamento condiviso tra il motore di backup e le callback di AMSMB2.
final class CancelToken: @unchecked Sendable {
    private let lock = NSLock()
    private var cancelled = false

    var isCancelled: Bool {
        lock.lock(); defer { lock.unlock() }
        return cancelled
    }

    func cancel() {
        lock.lock(); cancelled = true; lock.unlock()
    }

    func check() throws {
        if isCancelled { throw BackupError.cancelled }
    }
}

/// Wrapper su AMSMB2 con le operazioni che servono al backup.
/// I percorsi sono relativi alla radice della condivisione, con "/" come separatore.
final class SMBService {
    let share: String
    private let manager: SMB2Manager
    private var knownDirectories = Set<String>()

    init(config: SMBConfig) throws {
        let host = SMBService.normalizedHost(config.host)
        guard !host.isEmpty else { throw BackupError.notConfigured("manca l'indirizzo del NAS") }
        guard !config.share.trimmingCharacters(in: .whitespaces).isEmpty else {
            throw BackupError.notConfigured("manca il nome della cartella condivisa")
        }
        guard let url = URL(string: "smb://\(host)"), url.host != nil else {
            throw BackupError.invalidHost(config.host)
        }
        let credential = URLCredential(
            user: config.username.isEmpty ? "guest" : config.username,
            password: config.password,
            persistence: .forSession
        )
        guard let manager = SMB2Manager(url: url, credential: credential) else {
            throw BackupError.invalidHost(config.host)
        }
        manager.timeout = 30
        self.manager = manager
        self.share = PathUtils.join(config.share)
    }

    /// Accetta "100.1.2.3", "nas.tail1234.ts.net", "smb://nas/" o "\\nas".
    static func normalizedHost(_ raw: String) -> String {
        var host = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if host.lowercased().hasPrefix("smb://") { host = String(host.dropFirst(6)) }
        host = host.trimmingCharacters(in: CharacterSet(charactersIn: "/\\"))
        if let slash = host.firstIndex(where: { $0 == "/" || $0 == "\\" }) {
            host = String(host[..<slash])
        }
        return host
    }

    func listShares() async throws -> [String] {
        try await manager.listShares().map { $0.name }
    }

    func connect() async throws {
        try await manager.connectShare(name: share)
    }

    func disconnect() async {
        try? await manager.disconnectShare(gracefully: true)
    }

    func exists(_ path: String) async -> Bool {
        (try? await manager.attributesOfItem(atPath: path)) != nil
    }

    func size(of path: String) async -> Int64? {
        guard let attributes = try? await manager.attributesOfItem(atPath: path) else { return nil }
        if let number = attributes[.fileSizeKey] as? NSNumber { return number.int64Value }
        return attributes[.fileSizeKey] as? Int64
    }

    /// Crea la cartella e tutte le cartelle intermedie (ignora quelle già esistenti).
    func ensureDirectory(_ path: String) async throws {
        for prefix in PathUtils.cumulativePrefixes(of: path) where !knownDirectories.contains(prefix) {
            do {
                try await manager.createDirectory(atPath: prefix)
            } catch {
                // Se esiste già va bene; altrimenti propaga l'errore.
                guard await exists(prefix) else { throw error }
            }
            knownDirectories.insert(prefix)
        }
    }

    /// Carica un file locale su `remotePath`, sostituendo l'eventuale versione precedente.
    /// Scrive prima su ".nome.partial" e rinomina solo a upload completato e verificato.
    func upload(
        local: URL,
        to remotePath: String,
        modificationDate: Date? = nil,
        cancel: CancelToken,
        progress: (@Sendable (Int64) -> Void)? = nil
    ) async throws {
        try cancel.check()
        try await ensureDirectory(PathUtils.parent(of: remotePath))
        let partial = PathUtils.partialPath(for: remotePath)
        try? await manager.removeFile(atPath: partial)

        let expectedSize = (try? local.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init)
        try await manager.uploadItem(at: local, toPath: partial, progress: { bytes in
            progress?(bytes)
            return !cancel.isCancelled
        })
        if cancel.isCancelled {
            try? await manager.removeFile(atPath: partial)
            throw BackupError.cancelled
        }
        if let expectedSize, let uploaded = await size(of: partial), uploaded != expectedSize {
            try? await manager.removeFile(atPath: partial)
            throw BackupError.sizeMismatch(remotePath)
        }
        if await exists(remotePath) {
            try await manager.removeFile(atPath: remotePath)
        }
        try await manager.moveItem(atPath: partial, toPath: remotePath)
        if let modificationDate {
            try? await manager.setAttributes(
                attributes: [.contentModificationDateKey: modificationDate],
                ofItemAtPath: remotePath
            )
        }
    }

    /// Carica dati in memoria (es. un file .vcf) passando da un file temporaneo.
    func upload(data: Data, to remotePath: String, cancel: CancelToken) async throws {
        let temp = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(URL(fileURLWithPath: remotePath).pathExtension)
        try data.write(to: temp, options: .atomic)
        defer { try? FileManager.default.removeItem(at: temp) }
        try await upload(local: temp, to: remotePath, cancel: cancel)
    }

    /// Nomi degli elementi contenuti in una cartella remota.
    func listNames(in directory: String) async throws -> [String] {
        try await manager.contentsOfDirectory(atPath: directory)
            .compactMap { $0[.nameKey] as? String }
            .filter { $0 != "." && $0 != ".." }
    }

    /// Tiene solo le ultime `keep` copie (file o cartelle) che iniziano con `prefix`.
    func prune(directory: String, prefix: String, keep: Int) async throws -> [String] {
        let names = try await listNames(in: directory)
        let toDelete = PathUtils.namesToPrune(names, prefix: prefix, keep: keep)
        for name in toDelete {
            try await manager.removeItem(atPath: PathUtils.join(directory, name))
        }
        return toDelete
    }

    /// Verifica che si possa scrivere nella cartella base: crea e cancella un file di prova.
    func testWrite(in directory: String) async throws {
        try await ensureDirectory(directory)
        let testPath = PathUtils.join(directory, ".backupnas-test-\(UUID().uuidString.prefix(8))")
        try await manager.write(data: Data("ok".utf8), toPath: testPath, progress: nil)
        try await manager.removeFile(atPath: testPath)
    }

    /// Spazio libero sulla condivisione, se il NAS lo comunica.
    func freeSpace() async -> Int64? {
        guard let attributes = try? await manager.attributesOfFileSystem(forPath: "/") else { return nil }
        return (attributes[.systemFreeSize] as? NSNumber)?.int64Value
    }
}

extension Error {
    /// Messaggio leggibile, con un suggerimento per gli errori di rete tipici di Tailscale spento.
    var backupDescription: String {
        if let backupError = self as? BackupError {
            return backupError.localizedDescription
        }
        let nsError = self as NSError
        let networkCodes: Set<Int> = [
            Int(POSIXErrorCode.ETIMEDOUT.rawValue), Int(POSIXErrorCode.ECONNREFUSED.rawValue),
            Int(POSIXErrorCode.EHOSTUNREACH.rawValue), Int(POSIXErrorCode.ENETUNREACH.rawValue),
            Int(POSIXErrorCode.EHOSTDOWN.rawValue), Int(POSIXErrorCode.ENOTCONN.rawValue),
            Int(POSIXErrorCode.ECONNRESET.rawValue),
        ]
        var message = localizedDescription
        if nsError.domain == NSPOSIXErrorDomain, networkCodes.contains(nsError.code) {
            message += " — Il NAS non risponde: Tailscale è attivo sull'iPhone? L'indirizzo è quello Tailscale del NAS (100.x.y.z o nome MagicDNS)?"
        } else if nsError.domain == NSPOSIXErrorDomain,
                  nsError.code == Int(POSIXErrorCode.EACCES.rawValue) || nsError.code == Int(POSIXErrorCode.EPERM.rawValue) {
            message += " — Controlla utente, password e permessi di scrittura sulla cartella condivisa."
        }
        return message
    }
}
