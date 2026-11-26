import SpriteKit

/// Tecla in immersione: sceglie l'animazione dalla velocità, si specchia e si inclina
/// nella direzione di nuoto, lascia bolle dalla bocca.
final class DiverNode: SKNode {
    private enum Pose {
        case idle
        case swim
        case dash
    }

    private let sprite: SKSpriteNode
    private let idleFrames: [SKTexture]
    private let swimFrames: [SKTexture]
    private let dashFrames: [SKTexture]
    private var pose: Pose = Pose.idle
    private var frameClock: Double = 0
    /// Luce dinamica della torcia: attiva solo nelle zone buie.
    let torch: SKLightNode = SKLightNode()

    override init() {
        let forge: SpriteForge = SpriteForge.shared
        idleFrames = forge.frames("tecla_idle")
        swimFrames = forge.frames("tecla_swim")
        dashFrames = forge.frames("tecla_dash")
        sprite = forge.node("tecla_idle_0")
        super.init()
        addChild(sprite)
        torch.categoryBitMask = 1
        torch.falloff = 1.6
        torch.ambientColor = SKColor.white
        torch.lightColor = SKColor(red: 1.0, green: 0.86, blue: 0.62, alpha: 1)
        torch.shadowColor = SKColor.clear
        torch.isEnabled = false
        torch.position = CGPoint(x: 14, y: 0)
        addChild(torch)
    }

    required init?(coder aDecoder: NSCoder) {
        return nil
    }

    /// Punto del mondo, relativo al nodo, da cui escono le bolle.
    var mouthOffset: CGPoint {
        let local: CGPoint = CGPoint(x: 15 * sprite.xScale, y: -2)
        let c: CGFloat = cos(sprite.zRotation)
        let s: CGFloat = sin(sprite.zRotation)
        return CGPoint(x: local.x * c - local.y * s, y: local.x * s + local.y * c)
    }

    func apply(state: DiverState, tuning: DiverTuning, dt: Double) {
        let speed: Double = state.velocity.length
        let newPose: Pose = state.isDashing ? Pose.dash : (speed > 9 ? Pose.swim : Pose.idle)
        if newPose != pose {
            pose = newPose
            frameClock = 0
        }
        // L'animazione va al ritmo del nuoto: più veloce, più pinneggiate.
        let frames: [SKTexture]
        let rate: Double
        switch pose {
        case .idle:
            frames = idleFrames
            rate = 3.2
        case .swim:
            frames = swimFrames
            rate = 5.5 + 6.0 * min(speed / max(tuning.maxSpeed, 1), 1.2)
        case .dash:
            frames = dashFrames
            rate = 16
        }
        frameClock += dt * rate
        if !frames.isEmpty {
            let index: Int = Int(frameClock) % frames.count
            let texture: SKTexture = frames[index]
            if sprite.texture !== texture { sprite.texture = texture }
        }
        sprite.xScale = state.facingRight ? 1 : -1
        sprite.zRotation = CGFloat(state.facingRight ? state.tilt : -state.tilt)
        // Allungamento nello scatto, per dare slancio.
        let stretch: CGFloat = state.isDashing ? 1.12 : 1.0
        sprite.yScale = state.isDashing ? 0.92 : 1.0
        sprite.xScale *= stretch
        torch.position = CGPoint(x: state.facingRight ? 14 : -14, y: 0)
    }
}
