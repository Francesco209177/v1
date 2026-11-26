import XCTest
@testable import MareaLogic

final class AudioTests: XCTestCase {

    private func level(_ buffer: [Float]) -> (peak: Float, rms: Float) {
        var peak: Float = 0
        var sum: Float = 0
        for s in buffer {
            XCTAssertTrue(s.isFinite)
            peak = max(peak, abs(s))
            sum += s * s
        }
        return (peak: peak, rms: buffer.isEmpty ? 0 : (sum / Float(buffer.count)).squareRoot())
    }

    func testNoteNamesAndFrequencies() {
        XCTAssertEqual(Synth.midi("A4"), 69)
        XCTAssertEqual(Synth.midi("C4"), 60)
        XCTAssertEqual(Synth.midi("C#4"), 61)
        XCTAssertEqual(Synth.midi("Bb3"), 58)
        XCTAssertNil(Synth.midi("H2"))
        XCTAssertNil(Synth.midi("C"))
        XCTAssertEqual(Synth.frequency(note: "A4") ?? 0, 440, accuracy: 0.001)
        XCTAssertEqual(Synth.frequency(note: "A5") ?? 0, 880, accuracy: 0.001)
    }

    func testEnvelopeShape() {
        let e: Envelope = Envelope(attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.2)
        XCTAssertEqual(e.level(at: 0, held: 1), 0)
        XCTAssertEqual(e.level(at: 0.1, held: 1), 1, accuracy: 0.001)
        XCTAssertEqual(e.level(at: 0.5, held: 1), 0.5, accuracy: 0.001)
        XCTAssertEqual(e.level(at: 1.1, held: 1), 0.25, accuracy: 0.001)
        XCTAssertEqual(e.level(at: 1.3, held: 1), 0, accuracy: 0.001)
    }

    /// Ogni effetto è breve, si sente e non esce mai da ±1.
    func testEverySoundEffectIsAudibleAndShort() {
        for kind in SFXKind.allCases {
            let buffer: [Float] = SFX.render(kind)
            XCTAssertGreaterThan(buffer.count, 200, "\(kind.rawValue): troppo corto")
            XCTAssertLessThan(Double(buffer.count) / Synth.sampleRate, 1.5, "\(kind.rawValue): troppo lungo")
            let l: (peak: Float, rms: Float) = level(buffer)
            XCTAssertLessThanOrEqual(l.peak, 1.0)
            XCTAssertGreaterThan(l.peak, 0.3, "\(kind.rawValue): quasi muto")
            // Niente scatto alla fine: l'ultimo campione è vicino a zero.
            XCTAssertLessThan(abs(buffer[buffer.count - 1]), 0.12, "\(kind.rawValue): finisce di colpo")
            XCTAssertEqual(buffer, SFX.render(kind), "\(kind.rawValue): deve essere identico a ogni resa")
        }
    }

    func testSongsAreValidAndLoopCleanly() throws {
        let book: SongBook = try DataFiles.load(SongBook.self, file: "music.json", in: TestSupport.dataDirectory)
        XCTAssertTrue(book.problems().isEmpty, book.problems().joined(separator: "\n"))
        for id in ["porto", "immersione", "abisso", "osteria", "boss", "scena", "notte"] { XCTAssertNotNil(book.find(id), "manca il brano \(id)") }
        for song in book.songs {
            let buffer: [Float] = MusicRenderer.render(song)
            XCTAssertEqual(buffer.count, Synth.samples(song.duration))
            XCTAssertGreaterThan(song.duration, 8, "\(song.id): troppo corto per non stancare")
            XCTAssertLessThan(song.duration, 45, "\(song.id): troppo lungo da tenere in memoria")
            let l: (peak: Float, rms: Float) = level(buffer)
            XCTAssertLessThanOrEqual(l.peak, 1.0)
            XCTAssertGreaterThan(l.rms, 0.03, "\(song.id): quasi muto")
            // La giunzione tra fine e inizio non deve fare uno scatto.
            let jump: Float = abs(buffer[0] - buffer[buffer.count - 1])
            XCTAssertLessThan(jump, 0.25, "\(song.id): scatto alla ripetizione")
        }
    }

    func testLowpassDarkensTheSound() {
        var bright: [Float] = [Float](repeating: 0, count: Synth.samples(0.3))
        Synth.add(to: &bright, at: 0, frequency: 4000, held: 0.25, wave: Wave.square, volume: 0.8, envelope: Envelope(attack: 0.01, decay: 0, sustain: 1, release: 0.02))
        var dark: [Float] = bright
        Synth.lowpass(&dark, cutoff: 500)
        XCTAssertLessThan(level(dark).rms, level(bright).rms * 0.5, "sott'acqua gli acuti si spengono")
    }
}
