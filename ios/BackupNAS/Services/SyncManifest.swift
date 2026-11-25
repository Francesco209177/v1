import Foundation

/// "Impronta" di un file locale: se cambia, il file va ricaricato.
struct FileFingerprint: Codable, Equatable {
    var size: Int64
    /// Data di modifica arrotondata al secondo.
    var modified: Int64

    init(size: Int64, modified: Date) {
        self.size = size
        self.modified = Int64(modified.timeIntervalSince1970.rounded(.down))
    }
}

/// File trovato durante la scansione di una cartella.
struct LocalFile {
    var relativePath: String
    var url: URL
    var fingerprint: FileFingerprint
    /// File iCloud non ancora scaricato (segnaposto): la data non è affidabile, si confronta solo la dimensione.
    var isPlaceholder: Bool = false
    /// File in iCloud Drive (o altro provider): va letto tramite NSFileCoordinator.
    var needsCoordination: Bool = false
}

/// Elenco dei file già caricati per una cartella sincronizzata.
struct SyncManifest: Codable, Equatable {
    var files: [String: FileFingerprint] = [:]

    func needsUpload(_ file: LocalFile) -> Bool {
        guard let saved = files[file.relativePath] else { return true }
        if file.isPlaceholder {
            return saved.size != file.fingerprint.size
        }
        return saved != file.fingerprint
    }

    /// File nuovi o modificati, in ordine di percorso.
    func pending(_ files: [LocalFile]) -> [LocalFile] {
        files.filter(needsUpload).sorted { $0.relativePath < $1.relativePath }
    }

    mutating func record(_ relativePath: String, _ fingerprint: FileFingerprint) {
        files[relativePath] = fingerprint
    }

    static func load(from url: URL) -> SyncManifest {
        guard let data = try? Data(contentsOf: url),
              let manifest = try? JSONDecoder().decode(SyncManifest.self, from: data)
        else { return SyncManifest() }
        return manifest
    }

    func save(to url: URL) {
        if let data = try? JSONEncoder().encode(self) {
            try? data.write(to: url, options: .atomic)
        }
    }
}
