import Foundation

/// Funzioni pure per costruire i percorsi sul NAS (testate in BackupNASTests).
enum PathUtils {
    /// Caratteri non ammessi nei nomi di file/cartelle su una condivisione SMB.
    private static let invalidCharacters = CharacterSet(charactersIn: "\\/:*?\"<>|")
        .union(.controlCharacters)

    /// Rende un singolo componente di percorso sicuro per SMB.
    static func sanitize(_ component: String) -> String {
        var result = ""
        for scalar in component.unicodeScalars {
            result.unicodeScalars.append(invalidCharacters.contains(scalar) ? "_" : scalar)
        }
        // Windows/SMB non accetta nomi che finiscono con punto o spazio.
        while let last = result.last, last == "." || last == " " {
            result.removeLast()
        }
        result = result.trimmingCharacters(in: .whitespaces)
        return result.isEmpty ? "_" : result
    }

    /// Rende sicuro un percorso relativo, componente per componente ("a/b:c" -> "a/b_c").
    static func sanitizePath(_ path: String) -> String {
        path.split(separator: "/", omittingEmptySubsequences: true)
            .map { sanitize(String($0)) }
            .joined(separator: "/")
    }

    /// Unisce parti di percorso con "/" ignorando parti vuote e barre superflue.
    static func join(_ parts: String...) -> String {
        join(parts)
    }

    static func join(_ parts: [String]) -> String {
        parts
            .flatMap { $0.split(whereSeparator: { $0 == "/" || $0 == "\\" }) }
            .map(String.init)
            .filter { !$0.isEmpty }
            .joined(separator: "/")
    }

    static func parent(of path: String) -> String {
        var components = join(path).split(separator: "/").map(String.init)
        guard !components.isEmpty else { return "" }
        components.removeLast()
        return components.joined(separator: "/")
    }

    static func lastComponent(of path: String) -> String {
        join(path).split(separator: "/").last.map(String.init) ?? ""
    }

    /// Tutti i prefissi di un percorso: "a/b/c" -> ["a", "a/b", "a/b/c"].
    static func cumulativePrefixes(of path: String) -> [String] {
        let components = join(path).split(separator: "/").map(String.init)
        var result: [String] = []
        var current = ""
        for component in components {
            current = current.isEmpty ? component : current + "/" + component
            result.append(current)
        }
        return result
    }

    private static func formatter(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = format
        return formatter
    }

    /// "2026-11-25_1030": ordinabile alfabeticamente come la data.
    static func timestamp(_ date: Date) -> String {
        formatter("yyyy-MM-dd_HHmm").string(from: date)
    }

    static func day(_ date: Date) -> String {
        formatter("yyyy-MM-dd").string(from: date)
    }

    static func isWhatsAppExport(_ fileName: String) -> Bool {
        fileName.lowercased().contains("whatsapp")
    }

    /// Percorso (relativo alla cartella del dispositivo) dove finisce un file ricevuto dal menu Condividi.
    static func inboxRemotePath(fileName: String, received: Date) -> String {
        let safeName = sanitize(fileName)
        if isWhatsAppExport(fileName) {
            return join("WhatsApp", "\(timestamp(received)) \(safeName)")
        }
        return join("Ricevuti", day(received), safeName)
    }

    /// Per i segnaposto iCloud non scaricati (".Nome.pdf.icloud") restituisce il nome reale ("Nome.pdf").
    static func iCloudPlaceholderRealName(_ fileName: String) -> String? {
        guard fileName.hasPrefix("."), fileName.hasSuffix(".icloud"), fileName.count > ".x.icloud".count - 1 else {
            return nil
        }
        let inner = fileName.dropFirst().dropLast(".icloud".count)
        return inner.isEmpty ? nil : String(inner)
    }

    /// Nome con cui viene caricato temporaneamente un file prima di essere rinominato.
    static func partialPath(for remotePath: String) -> String {
        let dir = parent(of: remotePath)
        let name = lastComponent(of: remotePath)
        return join(dir, ".\(name).partial")
    }

    /// Dato un elenco di nomi con data ordinabile, restituisce quelli da eliminare per tenerne solo `keep`.
    static func namesToPrune(_ names: [String], prefix: String, keep: Int) -> [String] {
        let matching = names.filter { $0.hasPrefix(prefix) && !$0.hasPrefix(".") }.sorted(by: >)
        guard keep > 0, matching.count > keep else { return [] }
        return Array(matching[keep...])
    }

    static func formatBytes(_ bytes: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }
}
