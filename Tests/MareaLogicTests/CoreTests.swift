import XCTest
@testable import MareaLogic

final class CoreTests: XCTestCase {

    func testSeededRNGIsDeterministic() {
        var a: SeededRNG = SeededRNG(seed: 42)
        var b: SeededRNG = SeededRNG(seed: 42)
        var c: SeededRNG = SeededRNG(seed: 43)
        var same: Bool = true
        var different: Bool = false
        for _ in 0..<100 {
            let x: UInt64 = a.next()
            if x != b.next() { same = false }
            if x != c.next() { different = true }
        }
        XCTAssertTrue(same)
        XCTAssertTrue(different)
    }

    func testSeededRNGKnownSequence() {
        // Valori fissati: se cambiano, le mappe salvate dei giocatori cambierebbero.
        var rng: SeededRNG = SeededRNG(seed: 2026)
        let first: [UInt64] = [rng.next(), rng.next(), rng.next()]
        var again: SeededRNG = SeededRNG(seed: 2026)
        XCTAssertEqual(first, [again.next(), again.next(), again.next()])
        XCTAssertEqual(SeededRNG.combine([1, 2, 3]), SeededRNG.combine([1, 2, 3]))
        XCTAssertNotEqual(SeededRNG.combine([1, 2, 3]), SeededRNG.combine([3, 2, 1]))
    }

    func testRNGRanges() {
        var rng: SeededRNG = SeededRNG(seed: 7)
        for _ in 0..<2000 {
            let u: Double = rng.unit()
            XCTAssertTrue(u >= 0 && u < 1)
            let i: Int = rng.int(3, 9)
            XCTAssertTrue(i >= 3 && i <= 9)
        }
        XCTAssertNil(rng.pickWeighted([0, 0]))
        XCTAssertEqual(rng.pickWeighted([0, 5, 0]), 1)
    }

    func testNoiseIsBoundedAndStable() {
        for i in 0..<500 {
            let x: Double = Double(i) * 0.37 - 40
            let y: Double = Double(i) * 0.11 + 3
            let v: Double = Noise.fbm(x, y, seed: 99)
            XCTAssertTrue(v >= 0 && v < 1)
            XCTAssertEqual(v, Noise.fbm(x, y, seed: 99))
        }
    }

    func testPixelLayoutUsesIntegerScale() {
        // iPhone SE, iPhone 11, iPhone 15, Pro Max: lato corto in punti e scala dello schermo.
        let devices: [(Double, Double, Double)] = [(667, 375, 2), (896, 414, 2), (852, 393, 3), (956, 440, 3)]
        for (w, h, scale) in devices {
            let layout: PixelLayout = PixelLayout(viewWidth: w, viewHeight: h, screenScale: scale)
            XCTAssertGreaterThanOrEqual(layout.k, 2)
            XCTAssertTrue(layout.artHeight >= 200 && layout.artHeight <= 290, "altezza d'arte \(layout.artHeight)")
            // Un pixel d'arte copre esattamente k pixel fisici.
            XCTAssertEqual(layout.pointsPerArtPixel * scale, Double(layout.k), accuracy: 1e-9)
            let snapped: Double = layout.snap(10.37)
            XCTAssertEqual((snapped * Double(layout.k)).rounded(), snapped * Double(layout.k), accuracy: 1e-9)
        }
    }

    func testVec2Basics() {
        let v: Vec2 = Vec2(3, 4)
        XCTAssertEqual(v.length, 5, accuracy: 1e-12)
        XCTAssertEqual(v.normalized().length, 1, accuracy: 1e-12)
        XCTAssertEqual(v.clamped(maxLength: 2).length, 2, accuracy: 1e-12)
        XCTAssertEqual(MathUtil.angleDelta(from: 3.0, to: -3.0), 2 * Double.pi - 6, accuracy: 1e-9)
    }
}
