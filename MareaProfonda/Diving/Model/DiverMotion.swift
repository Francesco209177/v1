import Foundation

/// Parametri del nuoto di Tecla. Le velocità sono in pixel d'arte al secondo (16 pixel = 1 metro).
struct DiverTuning: Codable, Equatable {
    var maxSpeed: Double = 66
    /// Rapidità con cui raggiunge la velocità voluta (1/s).
    var acceleration: Double = 5.2
    /// Rapidità con cui rallenta quando non si tocca nulla: bassa = più inerzia.
    var glide: Double = 1.7
    var dashSpeed: Double = 172
    var dashDuration: Double = 0.26
    var dashCooldown: Double = 0.85
    var radius: Double = 6.5
}

struct DiverState: Equatable {
    /// Posizione in pixel di mappa (y verso il basso).
    var position: Vec2
    var velocity: Vec2 = Vec2.zero
    var facingRight: Bool = true
    /// Inclinazione rispetto all'orizzontale, positiva con il muso in su.
    var tilt: Double = 0
    var dashTime: Double = 0
    var dashCooldown: Double = 0
    var dashDirection: Vec2 = Vec2(1, 0)
    var atSurface: Bool = false
    /// Avanza più in fretta quando nuota veloce: guida l'animazione.
    var swimPhase: Double = 0

    init(position: Vec2) {
        self.position = position
    }

    var isDashing: Bool { return dashTime > 0 }
    var depthMeters: Double { return max(position.y, 0) / 16.0 }
}

struct DiverStepResult: Equatable {
    var startedDash: Bool = false
    var hitWall: Bool = false
    /// Velocità con cui ha urtato la roccia, in pixel al secondo.
    var impactSpeed: Double = 0
}

/// Movimento subacqueo: nuoto a 360 gradi con un po' d'inerzia, scatto breve, urti morbidi sulla roccia.
enum DiverMotion {
    /// Quota minima: Tecla galleggia appena sotto il pelo dell'acqua.
    static let surfaceY: Double = 3.0

    /// - Parameters:
    ///   - input: direzione voluta in coordinate di mappa (y verso il basso), lunghezza al più 1.
    ///   - speedFactor: 1 normale, meno di 1 se appesantita dal carico.
    static func step(_ s: inout DiverState, input: Vec2, wantsDash: Bool, speedFactor: Double,
                     map: CaveMap, tuning: DiverTuning, dt: Double) -> DiverStepResult {
        var result: DiverStepResult = DiverStepResult()
        if dt <= 0 { return result }
        let magnitude: Double = min(input.length, 1)
        let direction: Vec2 = magnitude > 0.01 ? input.normalized() : Vec2.zero
        let factor: Double = MathUtil.clamp(speedFactor, 0.2, 1.5)

        s.dashCooldown = max(0, s.dashCooldown - dt)
        if wantsDash && s.dashCooldown <= 0 && s.dashTime <= 0 {
            s.dashDirection = magnitude > 0.15 ? direction : Vec2(s.facingRight ? 1 : -1, 0)
            s.dashTime = tuning.dashDuration
            s.dashCooldown = tuning.dashCooldown
            result.startedDash = true
        }

        if s.dashTime > 0 {
            s.dashTime = max(0, s.dashTime - dt)
            let k: Double = tuning.dashDuration > 0 ? s.dashTime / tuning.dashDuration : 0
            let speed: Double = tuning.maxSpeed + (tuning.dashSpeed - tuning.maxSpeed) * k
            s.velocity = s.dashDirection * (speed * (0.5 + 0.5 * factor))
        } else if magnitude > 0.01 {
            let target: Vec2 = direction * (tuning.maxSpeed * factor * magnitude)
            let a: Double = 1 - exp(-tuning.acceleration * dt)
            s.velocity = s.velocity + (target - s.velocity) * a
        } else {
            s.velocity = s.velocity * exp(-tuning.glide * dt)
            if s.velocity.lengthSquared < 0.25 { s.velocity = Vec2.zero }
        }

        var next: Vec2 = s.position + s.velocity * dt
        if next.y < surfaceY {
            next.y = surfaceY
            if s.velocity.y < 0 { s.velocity.y = 0 }
        }
        let resolved: (position: Vec2, normal: Vec2?) = map.resolve(center: next, radius: tuning.radius)
        if let n: Vec2 = resolved.normal {
            let into: Double = s.velocity.dot(n)
            if into < 0 {
                result.hitWall = true
                result.impactSpeed = -into
                s.velocity = s.velocity - n * into
            }
        }
        s.position = resolved.position
        if s.position.y < surfaceY { s.position.y = surfaceY }
        s.atSurface = s.position.y < surfaceY + 5

        let speed: Double = s.velocity.length
        if abs(s.velocity.x) > 6 { s.facingRight = s.velocity.x > 0 }
        var targetTilt: Double = 0
        if speed > 5 {
            targetTilt = atan2(-s.velocity.y, max(abs(s.velocity.x), 1e-3))
            targetTilt = MathUtil.clamp(targetTilt, -1.3, 1.3)
        }
        s.tilt = MathUtil.damp(s.tilt, targetTilt, rate: 9, dt: dt)
        s.swimPhase += dt * (0.55 + speed / max(tuning.maxSpeed, 1))
        return result
    }
}
