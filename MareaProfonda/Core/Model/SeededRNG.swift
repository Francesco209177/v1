import Foundation

/// Generatore deterministico (SplitMix64): stesso seme, stessa sequenza su ogni piattaforma.
/// La mappa di ogni immersione nasce da qui.
struct SeededRNG {
    private(set) var state: UInt64

    init(seed: UInt64) {
        state = seed &+ 0x9E37_79B9_7F4A_7C15
    }

    mutating func next() -> UInt64 {
        state = state &+ 0x9E37_79B9_7F4A_7C15
        var z: UInt64 = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    /// Numero in [0, 1).
    mutating func unit() -> Double {
        return Double(next() >> 11) * (1.0 / 9_007_199_254_740_992.0)
    }

    mutating func range(_ lo: Double, _ hi: Double) -> Double {
        return lo + (hi - lo) * unit()
    }

    /// Intero in [lo, hi], estremi inclusi.
    mutating func int(_ lo: Int, _ hi: Int) -> Int {
        if hi <= lo { return lo }
        let span: UInt64 = UInt64(hi - lo) + 1
        return lo + Int(next() % span)
    }

    mutating func chance(_ probability: Double) -> Bool {
        return unit() < probability
    }

    mutating func pick<T>(_ items: [T]) -> T? {
        if items.isEmpty { return nil }
        return items[int(0, items.count - 1)]
    }

    /// Scelta pesata: ritorna l'indice estratto, o nil se i pesi sono tutti nulli.
    mutating func pickWeighted(_ weights: [Double]) -> Int? {
        var total: Double = 0
        for w in weights where w > 0 { total += w }
        if total <= 0 { return nil }
        var r: Double = unit() * total
        for (i, w) in weights.enumerated() where w > 0 {
            r -= w
            if r < 0 { return i }
        }
        return weights.lastIndex(where: { $0 > 0 })
    }

    mutating func shuffle<T>(_ items: inout [T]) {
        if items.count < 2 { return }
        var i: Int = items.count - 1
        while i > 0 {
            let j: Int = int(0, i)
            items.swapAt(i, j)
            i -= 1
        }
    }

    /// Combina più valori in un seme solo (per esempio slot, giorno, fascia oraria).
    static func combine(_ parts: [UInt64]) -> UInt64 {
        var h: UInt64 = 0xCBF2_9CE4_8422_2325
        for p in parts {
            h ^= p &+ 0x9E37_79B9_7F4A_7C15 &+ (h << 6) &+ (h >> 2)
            h = h &* 0x1000_0000_01B3
        }
        return h
    }

    /// Seme stabile ricavato da un testo.
    static func seed(from text: String) -> UInt64 {
        var h: UInt64 = 0xCBF2_9CE4_8422_2325
        for b in text.utf8 {
            h ^= UInt64(b)
            h = h &* 0x1000_0000_01B3
        }
        return h
    }
}

/// Rumore a valori con interpolazione morbida, deterministico e senza stato.
enum Noise {
    @inline(__always)
    static func hash(_ x: Int, _ y: Int, _ seed: UInt64) -> UInt64 {
        var h: UInt64 = seed
        h ^= UInt64(bitPattern: Int64(x)) &* 0x9E37_79B9_7F4A_7C15
        h ^= UInt64(bitPattern: Int64(y)) &* 0xC2B2_AE3D_27D4_EB4F
        h = (h ^ (h >> 33)) &* 0xFF51_AFD7_ED55_8CCD
        h = (h ^ (h >> 33)) &* 0xC4CE_B9FE_1A85_EC53
        return h ^ (h >> 33)
    }

    /// Valore in [0, 1) associato a una cella intera.
    @inline(__always)
    static func cell(_ x: Int, _ y: Int, _ seed: UInt64) -> Double {
        return Double(hash(x, y, seed) >> 11) * (1.0 / 9_007_199_254_740_992.0)
    }

    static func value(_ x: Double, _ y: Double, seed: UInt64) -> Double {
        let x0: Double = x.rounded(.down)
        let y0: Double = y.rounded(.down)
        let ix: Int = Int(x0)
        let iy: Int = Int(y0)
        let fx: Double = x - x0
        let fy: Double = y - y0
        let sx: Double = fx * fx * (3 - 2 * fx)
        let sy: Double = fy * fy * (3 - 2 * fy)
        let a: Double = cell(ix, iy, seed)
        let b: Double = cell(ix + 1, iy, seed)
        let c: Double = cell(ix, iy + 1, seed)
        let d: Double = cell(ix + 1, iy + 1, seed)
        let top: Double = a + (b - a) * sx
        let bottom: Double = c + (d - c) * sx
        return top + (bottom - top) * sy
    }

    /// Somma di ottave; risultato in [0, 1).
    static func fbm(_ x: Double, _ y: Double, seed: UInt64, octaves: Int = 4, lacunarity: Double = 2.0, gain: Double = 0.5) -> Double {
        var amp: Double = 1
        var freq: Double = 1
        var sum: Double = 0
        var norm: Double = 0
        var i: Int = 0
        while i < octaves {
            sum += value(x * freq, y * freq, seed: seed &+ UInt64(i) &* 1013) * amp
            norm += amp
            amp *= gain
            freq *= lacunarity
            i += 1
        }
        return norm > 0 ? sum / norm : 0
    }
}
