import Contacts
import Foundation

/// Esporta tutta la rubrica in un unico file vCard (.vcf), foto comprese.
enum ContactsExporter {
    struct Result {
        var data: Data
        var count: Int
        var isLimited: Bool
    }

    static func requestAccess() async throws {
        let status = CNContactStore.authorizationStatus(for: .contacts)
        switch status {
        case .notDetermined:
            let granted = try await CNContactStore().requestAccess(for: .contacts)
            if !granted { throw BackupError.permissionDenied("i Contatti") }
        case .denied, .restricted:
            throw BackupError.permissionDenied("i Contatti")
        default:
            break
        }
    }

    static var isLimitedAccess: Bool {
        if #available(iOS 18.0, *) {
            return CNContactStore.authorizationStatus(for: .contacts) == .limited
        }
        return false
    }

    /// Lavoro pesante: chiamare fuori dal main thread.
    static func export() throws -> Result {
        let store = CNContactStore()
        let keys: [CNKeyDescriptor] = [
            CNContactVCardSerialization.descriptorForRequiredKeys(),
            CNContactImageDataKey as CNKeyDescriptor,
            CNContactImageDataAvailableKey as CNKeyDescriptor,
        ]
        let request = CNContactFetchRequest(keysToFetch: keys)
        request.sortOrder = .userDefault
        var cards: [String] = []
        try store.enumerateContacts(with: request) { contact, _ in
            guard let data = try? CNContactVCardSerialization.data(with: [contact]),
                  var card = String(data: data, encoding: .utf8)
            else { return }
            if contact.imageDataAvailable, let image = contact.imageData {
                card = VCardPhoto.inject(into: card, imageData: image)
            }
            cards.append(card.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        let text = cards.joined(separator: "\r\n") + "\r\n"
        return Result(data: Data(text.utf8), count: cards.count, isLimited: isLimitedAccess)
    }
}

/// Aggiunge la foto a una vCard se il serializzatore di sistema non l'ha inclusa.
enum VCardPhoto {
    static func inject(into card: String, imageData: Data) -> String {
        guard !card.uppercased().contains("\nPHOTO"), let endRange = card.range(of: "END:VCARD", options: .backwards) else {
            return card
        }
        let type = imageData.starts(with: [0x89, 0x50, 0x4E, 0x47]) ? "PNG" : "JPEG"
        let line = ICSWriter.fold("PHOTO;ENCODING=b;TYPE=\(type):\(imageData.base64EncodedString())")
        var result = card
        var prefix = String(result[..<endRange.lowerBound])
        if !prefix.hasSuffix("\n") { prefix += "\r\n" }
        result = prefix + line + "\r\n" + String(result[endRange.lowerBound...])
        return result
    }
}
