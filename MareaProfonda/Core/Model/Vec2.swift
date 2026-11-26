/// Vettore 2D a doppia precisione usato da tutta la logica di gioco.
/// Non dipende da CoreGraphics, così la logica si compila ovunque.
struct Vec2: Equatable, Hashable, Codable {
    var x: Double
    var y: Double

    static let zero: Vec2 = Vec2(0, 0)

    init(_ x: Double, _ y: Double) {
        self.x = x
        self.y = y
    }

    var lengthSquared: Double { return x * x + y * y }
    var length: Double { return lengthSquared.squareRoot() }
    var angle: Double { return atan2(y, x) }

    func normalized() -> Vec2 {
        let l: Double = length
        if l < 1e-9 { return Vec2.zero }
        return Vec2(x / l, y / l)
    }

    func clamped(maxLength: Double) -> Vec2 {
        let l: Double = length
        if l <= maxLength || l < 1e-9 { return self }
        let k: Double = maxLength / l
        return Vec2(x * k, y * k)
    }

    func dot(_ other: Vec2) -> Double { return x * other.x + y * other.y }

    func distance(to other: Vec2) -> Double {
        let dx: Double = other.x - x
        let dy: Double = other.y - y
        return (dx * dx + dy * dy).squareRoot()
    }

    func rotated(by angle: Double) -> Vec2 {
        let c: Double = cos(angle)
        let s: Double = sin(angle)
        return Vec2(x * c - y * s, x * s + y * c)
    }

    func lerp(to other: Vec2, t: Double) -> Vec2 {
        return Vec2(x + (other.x - x) * t, y + (other.y - y) * t)
    }

    static func fromAngle(_ angle: Double, length: Double = 1.0) -> Vec2 {
        return Vec2(cos(angle) * length, sin(angle) * length)
    }

    static func + (a: Vec2, b: Vec2) -> Vec2 { return Vec2(a.x + b.x, a.y + b.y) }
    static func - (a: Vec2, b: Vec2) -> Vec2 { return Vec2(a.x - b.x, a.y - b.y) }
    static func * (a: Vec2, k: Double) -> Vec2 { return Vec2(a.x * k, a.y * k) }
    static func / (a: Vec2, k: Double) -> Vec2 { return Vec2(a.x / k, a.y / k) }
    static prefix func - (a: Vec2) -> Vec2 { return Vec2(-a.x, -a.y) }
    static func += (a: inout Vec2, b: Vec2) { a = a + b }
    static func -= (a: inout Vec2, b: Vec2) { a = a - b }
    static func *= (a: inout Vec2, k: Double) { a = a * k }
}

/// Piccole funzioni numeriche condivise.
enum MathUtil {
    static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
        return v < lo ? lo : (v > hi ? hi : v)
    }

    static func clampInt(_ v: Int, _ lo: Int, _ hi: Int) -> Int {
        return v < lo ? lo : (v > hi ? hi : v)
    }

    static func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double {
        return a + (b - a) * t
    }

    static func smoothstep(_ e0: Double, _ e1: Double, _ x: Double) -> Double {
        if e0 == e1 { return x < e0 ? 0 : 1 }
        let t: Double = clamp((x - e0) / (e1 - e0), 0, 1)
        return t * t * (3 - 2 * t)
    }

    /// Avvicina `value` a `target` di al più `step`.
    static func approach(_ value: Double, _ target: Double, _ step: Double) -> Double {
        if value < target { return min(value + step, target) }
        return max(value - step, target)
    }

    /// Differenza angolare più breve, in radianti, nell'intervallo (-π, π].
    static func angleDelta(from a: Double, to b: Double) -> Double {
        var d: Double = (b - a).truncatingRemainder(dividingBy: 2 * Double.pi)
        if d > Double.pi { d -= 2 * Double.pi }
        if d <= -Double.pi { d += 2 * Double.pi }
        return d
    }

    /// Smorzamento esponenziale indipendente dal frame rate.
    static func damp(_ current: Double, _ target: Double, rate: Double, dt: Double) -> Double {
        return target + (current - target) * exp(-rate * dt)
    }
}
