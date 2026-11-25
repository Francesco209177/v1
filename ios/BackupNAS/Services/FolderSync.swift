import Foundation

/// Cartella scelta dall'app File da copiare sul NAS a ogni backup.
struct SyncedFolder: Codable, Identifiable, Equatable {
    var id = UUID()
    var name: String
    var bookmark: Data
    var lastSync: Date?
    var lastFileCount: Int?
    var lastError: String?
}

@MainActor
final class FolderStore: ObservableObject {
    @Published private(set) var folders: [SyncedFolder] = []

    private let fileURL = AppPaths.supportDirectory.appendingPathComponent("folders.json")

    init() {
        if let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONDecoder().decode([SyncedFolder].self, from: data) {
            folders = saved
        }
    }

    /// Aggiunge una cartella scelta con `.fileImporter`, salvando un bookmark per riaprirla in futuro.
    func add(url: URL) throws {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        let bookmark = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
        var name = PathUtils.sanitize(url.lastPathComponent)
        let existing = Set(folders.map { $0.name.lowercased() })
        var counter = 2
        let baseName = name
        while existing.contains(name.lowercased()) {
            name = "\(baseName) \(counter)"
            counter += 1
        }
        folders.append(SyncedFolder(name: name, bookmark: bookmark))
        save()
    }

    func remove(_ folder: SyncedFolder) {
        folders.removeAll { $0.id == folder.id }
        try? FileManager.default.removeItem(at: manifestURL(for: folder))
        save()
    }

    func remove(atOffsets offsets: IndexSet) {
        for index in offsets.sorted(by: >) {
            remove(folders[index])
        }
    }

    /// Dimentica cosa è già stato caricato: al prossimo backup la cartella viene ricopiata tutta.
    func resetManifest(for folder: SyncedFolder) {
        try? FileManager.default.removeItem(at: manifestURL(for: folder))
        update(folder.id) { $0.lastSync = nil; $0.lastFileCount = nil }
    }

    func update(_ id: UUID, _ change: (inout SyncedFolder) -> Void) {
        guard let index = folders.firstIndex(where: { $0.id == id }) else { return }
        change(&folders[index])
        save()
    }

    func manifestURL(for folder: SyncedFolder) -> URL {
        AppPaths.subdirectory("manifests").appendingPathComponent("\(folder.id.uuidString).json")
    }

    /// Risolve il bookmark (e lo rinnova se iOS lo segnala come vecchio).
    func resolve(_ folder: SyncedFolder) throws -> URL {
        var stale = false
        let url = try URL(resolvingBookmarkData: folder.bookmark, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
        if stale {
            let accessing = url.startAccessingSecurityScopedResource()
            defer { if accessing { url.stopAccessingSecurityScopedResource() } }
            if let fresh = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
                update(folder.id) { $0.bookmark = fresh }
            }
        }
        return url
    }

    private func save() {
        if let data = try? JSONEncoder().encode(folders) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }
}

/// Scansione delle cartelle e preparazione dei file (lavoro su disco, fuori dal main thread).
enum FolderScanner {
    private static let keys: [URLResourceKey] = [
        .isDirectoryKey, .isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey,
        .contentModificationDateKey, .isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey,
    ]

    private static let ignoredNames: Set<String> = [".DS_Store", ".Trash", ".Trashes", ".localized"]

    static func scan(root: URL) -> [LocalFile] {
        guard let enumerator = FileManager.default.enumerator(
            at: root, includingPropertiesForKeys: keys, options: [], errorHandler: { _, _ in true }
        ) else { return [] }
        let rootComponents = root.standardizedFileURL.resolvingSymlinksInPath().pathComponents
        var files: [LocalFile] = []

        for case let url as URL in enumerator {
            let name = url.lastPathComponent
            if ignoredNames.contains(name) {
                enumerator.skipDescendants()
                continue
            }
            guard let values = try? url.resourceValues(forKeys: Set(keys)) else { continue }
            if values.isSymbolicLink == true { continue }

            // Segnaposto iCloud non scaricato: ".Nome.pdf.icloud" -> "Nome.pdf".
            if let realName = PathUtils.iCloudPlaceholderRealName(name) {
                let realURL = url.deletingLastPathComponent().appendingPathComponent(realName)
                // Il file reale non esiste ancora: si calcola il percorso dal segnaposto.
                guard let placeholderRelative = relativePath(of: url, rootComponents: rootComponents) else { continue }
                let relative = PathUtils.join(PathUtils.parent(of: placeholderRelative), realName)
                let size = placeholderSize(url) ?? Int64(values.fileSize ?? 0)
                files.append(LocalFile(
                    relativePath: relative,
                    url: realURL,
                    fingerprint: FileFingerprint(size: size, modified: values.contentModificationDate ?? Date(timeIntervalSince1970: 0)),
                    isPlaceholder: true,
                    needsCoordination: true
                ))
                continue
            }
            if name.hasPrefix(".") {
                if values.isDirectory == true { enumerator.skipDescendants() }
                continue
            }
            guard values.isRegularFile == true,
                  let relative = relativePath(of: url, rootComponents: rootComponents)
            else { continue }

            let isUbiquitous = values.isUbiquitousItem == true
            let notDownloaded = isUbiquitous && values.ubiquitousItemDownloadingStatus != .current
            files.append(LocalFile(
                relativePath: relative,
                url: url,
                fingerprint: FileFingerprint(
                    size: Int64(values.fileSize ?? 0),
                    modified: values.contentModificationDate ?? Date(timeIntervalSince1970: 0)
                ),
                isPlaceholder: notDownloaded,
                needsCoordination: isUbiquitous
            ))
        }
        return files
    }

    private static func relativePath(of url: URL, rootComponents: [String]) -> String? {
        let components = url.standardizedFileURL.resolvingSymlinksInPath().pathComponents
        guard components.count > rootComponents.count,
              Array(components.prefix(rootComponents.count)) == rootComponents
        else { return nil }
        return components.dropFirst(rootComponents.count).joined(separator: "/")
    }

    /// I segnaposto ".icloud" sono plist che contengono la dimensione del file reale.
    private static func placeholderSize(_ url: URL) -> Int64? {
        guard let data = try? Data(contentsOf: url),
              let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              let size = plist["NSURLFileSizeKey"] as? NSNumber
        else { return nil }
        return size.int64Value
    }

    /// Restituisce un file locale pronto per l'upload. Per i file iCloud lo scarica (NSFileCoordinator)
    /// e ne fa una copia temporanea in `tempDirectory`.
    static func prepare(_ file: LocalFile, tempDirectory: URL) throws -> PreparedFile {
        guard file.needsCoordination else {
            return PreparedFile(url: file.url, fingerprint: file.fingerprint, isTemporary: false)
        }
        try? FileManager.default.startDownloadingUbiquitousItem(at: file.url)
        let destination = tempDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
        let target = destination.appendingPathComponent(file.url.lastPathComponent)

        var coordinationError: NSError?
        var copyError: Error?
        NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: file.url, options: [], error: &coordinationError) { readURL in
            do {
                try FileManager.default.copyItem(at: readURL, to: target)
            } catch {
                copyError = error
            }
        }
        if let error = coordinationError ?? copyError { throw error }

        let values = try? file.url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
        let copiedSize = (try? target.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init)
        let fingerprint = FileFingerprint(
            size: Int64(values?.fileSize ?? 0) > 0 ? Int64(values?.fileSize ?? 0) : (copiedSize ?? file.fingerprint.size),
            modified: values?.contentModificationDate ?? Date(timeIntervalSince1970: TimeInterval(file.fingerprint.modified))
        )
        return PreparedFile(url: target, fingerprint: fingerprint, isTemporary: true)
    }
}

/// File pronto per l'upload (eventualmente una copia temporanea di un file iCloud).
struct PreparedFile {
    var url: URL
    var fingerprint: FileFingerprint
    var isTemporary: Bool
}
