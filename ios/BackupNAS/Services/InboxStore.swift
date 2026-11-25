import Foundation

/// File ricevuto dal menu Condividi (es. "Esporta chat" di WhatsApp) in attesa di essere caricato.
struct InboxItem: Codable, Identifiable, Equatable {
    enum State: String, Codable {
        case pending, uploaded, failed
    }

    var id = UUID()
    var fileName: String
    var received: Date
    var size: Int64
    var state: State = .pending
    var uploadedAt: Date?
    var remotePath: String?
    var lastError: String?

    var isWhatsApp: Bool { PathUtils.isWhatsAppExport(fileName) }
}

@MainActor
final class InboxStore: ObservableObject {
    @Published private(set) var items: [InboxItem] = []

    private let indexURL = AppPaths.supportDirectory.appendingPathComponent("inbox.json")
    private let storage = AppPaths.subdirectory("Inbox")

    init() {
        if let data = try? Data(contentsOf: indexURL),
           let saved = try? JSONDecoder().decode([InboxItem].self, from: data) {
            items = saved
        }
    }

    var pendingItems: [InboxItem] { items.filter { $0.state != .uploaded } }

    /// Copia nell'app un file condiviso da un'altra app (o scelto con "Aggiungi file").
    @discardableResult
    func importFile(at url: URL) throws -> InboxItem {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }

        var item = InboxItem(fileName: url.lastPathComponent, received: Date(), size: 0)
        let folder = storage.appendingPathComponent(item.id.uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let destination = folder.appendingPathComponent(item.fileName)

        var coordinationError: NSError?
        var copyError: Error?
        NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: url, options: [], error: &coordinationError) { readURL in
            do {
                try FileManager.default.copyItem(at: readURL, to: destination)
            } catch {
                copyError = error
            }
        }
        if let error = coordinationError ?? copyError {
            try? FileManager.default.removeItem(at: folder)
            throw error
        }
        // I file arrivati con "Apri in" finiscono in Documents/Inbox: ora abbiamo la nostra copia.
        if url.path.contains("/Documents/Inbox/") {
            try? FileManager.default.removeItem(at: url)
        }
        item.size = Int64((try? destination.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        items.insert(item, at: 0)
        save()
        return item
    }

    func localURL(for item: InboxItem) -> URL {
        storage.appendingPathComponent(item.id.uuidString, isDirectory: true).appendingPathComponent(item.fileName)
    }

    func markUploaded(_ id: UUID, remotePath: String) {
        update(id) {
            $0.state = .uploaded
            $0.uploadedAt = Date()
            $0.remotePath = remotePath
            $0.lastError = nil
        }
        // Il file è al sicuro sul NAS: liberiamo spazio sull'iPhone.
        try? FileManager.default.removeItem(at: storage.appendingPathComponent(id.uuidString, isDirectory: true))
    }

    func markFailed(_ id: UUID, error: String) {
        update(id) {
            $0.state = .failed
            $0.lastError = error
        }
    }

    func remove(_ item: InboxItem) {
        try? FileManager.default.removeItem(at: storage.appendingPathComponent(item.id.uuidString, isDirectory: true))
        items.removeAll { $0.id == item.id }
        save()
    }

    func clearUploaded() {
        items.removeAll { $0.state == .uploaded }
        save()
    }

    private func update(_ id: UUID, _ change: (inout InboxItem) -> Void) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        change(&items[index])
        save()
    }

    private func save() {
        if let data = try? JSONEncoder().encode(items) {
            try? data.write(to: indexURL, options: .atomic)
        }
    }
}
