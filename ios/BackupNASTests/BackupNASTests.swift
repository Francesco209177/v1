import XCTest
@testable import BackupNAS

final class PathUtilsTests: XCTestCase {
    func testSanitizeReplacesInvalidCharacters() {
        XCTAssertEqual(PathUtils.sanitize("a/b:c*d?\"e<f>g|h\\i"), "a_b_c_d__e_f_g_h_i")
        XCTAssertEqual(PathUtils.sanitize("Documento. "), "Documento")
        XCTAssertEqual(PathUtils.sanitize(""), "_")
        XCTAssertEqual(PathUtils.sanitize("Città è bella"), "Città è bella")
    }

    func testJoinAndParent() {
        XCTAssertEqual(PathUtils.join("/Backup iPhone/", "iPhone", "", "Contatti/"), "Backup iPhone/iPhone/Contatti")
        XCTAssertEqual(PathUtils.join("a\\b", "c"), "a/b/c")
        XCTAssertEqual(PathUtils.parent(of: "a/b/c.txt"), "a/b")
        XCTAssertEqual(PathUtils.parent(of: "c.txt"), "")
        XCTAssertEqual(PathUtils.lastComponent(of: "a/b/c.txt"), "c.txt")
        XCTAssertEqual(PathUtils.cumulativePrefixes(of: "a/b/c"), ["a", "a/b", "a/b/c"])
        XCTAssertEqual(PathUtils.partialPath(for: "a/b/c.txt"), "a/b/.c.txt.partial")
        XCTAssertEqual(PathUtils.sanitizePath("x/y:z/w"), "x/y_z/w")
    }

    func testInboxDestinations() {
        let date = Date(timeIntervalSince1970: 1_700_000_000)
        let whatsapp = PathUtils.inboxRemotePath(fileName: "WhatsApp Chat - Mario.zip", received: date)
        XCTAssertTrue(whatsapp.hasPrefix("WhatsApp/"))
        XCTAssertTrue(whatsapp.hasSuffix(" WhatsApp Chat - Mario.zip"))
        let other = PathUtils.inboxRemotePath(fileName: "export.zip", received: date)
        XCTAssertEqual(other, "Ricevuti/\(PathUtils.day(date))/export.zip")
    }

    func testICloudPlaceholderName() {
        XCTAssertEqual(PathUtils.iCloudPlaceholderRealName(".Fattura.pdf.icloud"), "Fattura.pdf")
        XCTAssertNil(PathUtils.iCloudPlaceholderRealName("Fattura.pdf"))
        XCTAssertNil(PathUtils.iCloudPlaceholderRealName(".icloud"))
        XCTAssertNil(PathUtils.iCloudPlaceholderRealName(".DS_Store"))
    }

    func testPruneKeepsNewest() {
        let names = ["Contatti_2026-01-01_1000.vcf", "Contatti_2026-03-01_1000.vcf", "Contatti_2026-02-01_1000.vcf", "altro.txt", ".Contatti_x.partial"]
        XCTAssertEqual(PathUtils.namesToPrune(names, prefix: "Contatti_", keep: 2), ["Contatti_2026-01-01_1000.vcf"])
        XCTAssertEqual(PathUtils.namesToPrune(names, prefix: "Contatti_", keep: 5), [])
    }

    func testNormalizedHost() {
        XCTAssertEqual(SMBService.normalizedHost(" smb://nas.tail1234.ts.net/backup "), "nas.tail1234.ts.net")
        XCTAssertEqual(SMBService.normalizedHost("\\\\100.64.0.1\\share"), "100.64.0.1")
        XCTAssertEqual(SMBService.normalizedHost("100.64.0.1"), "100.64.0.1")
    }
}

final class SyncManifestTests: XCTestCase {
    private func file(_ path: String, size: Int64, modified: TimeInterval, placeholder: Bool = false) -> LocalFile {
        LocalFile(relativePath: path, url: URL(fileURLWithPath: "/tmp/\(path)"),
                  fingerprint: FileFingerprint(size: size, modified: Date(timeIntervalSince1970: modified)),
                  isPlaceholder: placeholder)
    }

    func testPendingDetectsNewAndChangedFiles() {
        var manifest = SyncManifest()
        manifest.record("a.txt", FileFingerprint(size: 10, modified: Date(timeIntervalSince1970: 100)))
        manifest.record("b.txt", FileFingerprint(size: 20, modified: Date(timeIntervalSince1970: 200)))
        let files = [
            file("a.txt", size: 10, modified: 100.4), // invariato (stesso secondo)
            file("b.txt", size: 20, modified: 250), // modificato
            file("c.txt", size: 5, modified: 300), // nuovo
        ]
        XCTAssertEqual(manifest.pending(files).map(\.relativePath), ["b.txt", "c.txt"])
    }

    func testPlaceholderComparesOnlySize() {
        var manifest = SyncManifest()
        manifest.record("doc.pdf", FileFingerprint(size: 1000, modified: Date(timeIntervalSince1970: 100)))
        XCTAssertFalse(manifest.needsUpload(file("doc.pdf", size: 1000, modified: 999, placeholder: true)))
        XCTAssertTrue(manifest.needsUpload(file("doc.pdf", size: 2000, modified: 999, placeholder: true)))
    }

    func testSaveAndLoad() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("manifest-\(UUID().uuidString).json")
        var manifest = SyncManifest()
        manifest.record("x/y.txt", FileFingerprint(size: 1, modified: Date(timeIntervalSince1970: 1)))
        manifest.save(to: url)
        XCTAssertEqual(SyncManifest.load(from: url), manifest)
        try? FileManager.default.removeItem(at: url)
    }
}

final class ICSWriterTests: XCTestCase {
    private var utcCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    func testEscape() {
        XCTAssertEqual(ICSWriter.escape("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne")
    }

    func testFoldLongLinesAt75Octets() {
        let line = "DESCRIPTION:" + String(repeating: "è", count: 100)
        let folded = ICSWriter.fold(line)
        for part in folded.components(separatedBy: "\r\n") {
            XCTAssertLessThanOrEqual(part.utf8.count, 75)
        }
        let unfolded = folded.replacingOccurrences(of: "\r\n ", with: "")
        XCTAssertEqual(unfolded, line)
        XCTAssertEqual(ICSWriter.fold("SHORT:ok"), "SHORT:ok")
    }

    func testDuration() {
        XCTAssertEqual(ICSWriter.duration(-900), "-PT15M")
        XCTAssertEqual(ICSWriter.duration(0), "PT0S")
        XCTAssertEqual(ICSWriter.duration(86_400), "P1D")
        XCTAssertEqual(ICSWriter.duration(-90_061), "-P1DT1H1M1S")
        XCTAssertEqual(ICSWriter.duration(3_600), "PT1H")
    }

    func testRRule() {
        var rule = ICSRecurrence(frequency: "WEEKLY", interval: 2)
        rule.byDay = ["MO", "WE"]
        rule.count = 10
        XCTAssertEqual(ICSWriter.rrule(rule), "FREQ=WEEKLY;INTERVAL=2;COUNT=10;BYDAY=MO,WE")
        var monthly = ICSRecurrence(frequency: "MONTHLY")
        monthly.byDay = ["-1FR"]
        monthly.until = Date(timeIntervalSince1970: 1_700_000_000)
        XCTAssertEqual(ICSWriter.rrule(monthly), "FREQ=MONTHLY;UNTIL=20231114T221320Z;BYDAY=-1FR")
    }

    func testAllDayEventUsesExclusiveEndDate() {
        let calendar = utcCalendar
        let start = calendar.date(from: DateComponents(year: 2026, month: 5, day: 1))!
        let end = calendar.date(from: DateComponents(year: 2026, month: 5, day: 2, hour: 23, minute: 59, second: 59))!
        let event = ICSEvent(uid: "abc", summary: "Ponte", start: start, end: end, isAllDay: true)
        let lines = ICSWriter.eventLines(event, stamp: "20260101T000000Z", calendar: calendar)
        XCTAssertTrue(lines.contains("DTSTART;VALUE=DATE:20260501"))
        XCTAssertTrue(lines.contains("DTEND;VALUE=DATE:20260503"))
    }

    func testCalendarStructure() {
        let event = ICSEvent(uid: "1", summary: "Riunione, importante", location: "Ufficio",
                             start: Date(timeIntervalSince1970: 1_700_000_000), end: Date(timeIntervalSince1970: 1_700_003_600),
                             isAllDay: false, alarms: [ICSAlarm(relativeOffset: -600)])
        let todo = ICSTodo(uid: "2", summary: "Comprare latte", isCompleted: true, completed: Date(timeIntervalSince1970: 1_700_000_000), priority: 1)
        let text = ICSWriter.calendar(name: "Casa", events: [event], todos: [todo], calendar: utcCalendar)
        XCTAssertTrue(text.hasPrefix("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"))
        XCTAssertTrue(text.hasSuffix("END:VCALENDAR\r\n"))
        XCTAssertTrue(text.contains("SUMMARY:Riunione\\, importante\r\n"))
        XCTAssertTrue(text.contains("DTSTART:20231114T221320Z\r\n"))
        XCTAssertTrue(text.contains("TRIGGER:-PT10M\r\n"))
        XCTAssertTrue(text.contains("STATUS:COMPLETED\r\n"))
        XCTAssertTrue(text.contains("PRIORITY:1\r\n"))
        XCTAssertEqual(text.components(separatedBy: "BEGIN:VEVENT").count - 1, 1)
        XCTAssertEqual(text.components(separatedBy: "BEGIN:VTODO").count - 1, 1)
    }
}

final class VCardPhotoTests: XCTestCase {
    func testInjectsPhotoBeforeEnd() {
        let card = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Mario Rossi\r\nEND:VCARD\r\n"
        let jpeg = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
        let result = VCardPhoto.inject(into: card, imageData: jpeg)
        XCTAssertTrue(result.contains("PHOTO;ENCODING=b;TYPE=JPEG:\(jpeg.base64EncodedString())\r\nEND:VCARD"))
        XCTAssertTrue(result.contains("FN:Mario Rossi\r\nPHOTO"), "nessuna riga vuota prima della foto")
    }

    func testInjectsPhotoWithLFLineEndings() {
        let card = "BEGIN:VCARD\nVERSION:3.0\nFN:Anna\nEND:VCARD\n"
        let png = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A])
        let result = VCardPhoto.inject(into: card, imageData: png)
        XCTAssertTrue(result.contains("FN:Anna\nPHOTO;ENCODING=b;TYPE=PNG:"))
    }

    func testDoesNotDuplicateExistingPhoto() {
        let card = "BEGIN:VCARD\r\nVERSION:3.0\r\nPHOTO;ENCODING=b;TYPE=JPEG:AAAA\r\nEND:VCARD\r\n"
        XCTAssertEqual(VCardPhoto.inject(into: card, imageData: Data([0x89, 0x50, 0x4E, 0x47])), card)
    }
}
