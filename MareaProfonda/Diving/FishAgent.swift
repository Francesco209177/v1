import GameplayKit
import SpriteKit

/// Stato di GameplayKit di un pesce. Ogni stato del pesce ha la sua classe; le regole
/// di passaggio e il comportamento vero stanno in `FishAI`, così restano collaudabili da soli.
class FishStateNode: GKState {
    class var kind: FishState { return FishState.wander }
    weak var agent: FishAgent?

    static func stateClass(for state: FishState) -> AnyClass {
        switch state {
        case .wander: return FishWanderState.self
        case .flee: return FishFleeState.self
        case .chase: return FishChaseState.self
        case .windup: return FishWindupState.self
        case .charge: return FishChargeState.self
        case .recover: return FishRecoverState.self
        case .returnHome: return FishReturnState.self
        case .stunned: return FishStunnedState.self
        case .hooked: return FishHookedState.self
        case .asleep: return FishAsleepState.self
        case .dead: return FishDeadState.self
        }
    }

    override func isValidNextState(_ stateClass: AnyClass) -> Bool {
        guard let next: FishStateNode.Type = stateClass as? FishStateNode.Type else { return false }
        return FishAI.isValid(from: type(of: self).kind, to: next.kind)
    }

    override func didEnter(from previousState: GKState?) {
        agent?.didEnter(type(of: self).kind)
    }
}

final class FishWanderState: FishStateNode { override class var kind: FishState { return FishState.wander } }
final class FishFleeState: FishStateNode { override class var kind: FishState { return FishState.flee } }
final class FishChaseState: FishStateNode { override class var kind: FishState { return FishState.chase } }
final class FishWindupState: FishStateNode { override class var kind: FishState { return FishState.windup } }
final class FishChargeState: FishStateNode { override class var kind: FishState { return FishState.charge } }
final class FishRecoverState: FishStateNode { override class var kind: FishState { return FishState.recover } }
final class FishReturnState: FishStateNode { override class var kind: FishState { return FishState.returnHome } }
final class FishStunnedState: FishStateNode { override class var kind: FishState { return FishState.stunned } }
final class FishHookedState: FishStateNode { override class var kind: FishState { return FishState.hooked } }
final class FishAsleepState: FishStateNode { override class var kind: FishState { return FishState.asleep } }
final class FishDeadState: FishStateNode { override class var kind: FishState { return FishState.dead } }

/// Aspetto e macchina a stati di un pesce singolo. La posizione arriva dalla simulazione.
final class FishAgent {
    let id: Int
    let node: SKNode = SKNode()
    private let sprite: SKSpriteNode
    private let alert: SKSpriteNode = SpriteForge.shared.node("alert")
    private let swimFrames: [SKTexture]
    private let hurtFrame: SKTexture
    private let deadFrame: SKTexture
    private let machine: GKStateMachine
    private var clock: Double = 0
    private var hurtTimer: Double = 0
    private var punch: Double = 0
    /// Chiamata quando la macchina a stati entra in uno stato scelto dal "pensiero" del pesce.
    var onEnter: ((Int, FishState) -> Void)?
    private var syncing: Bool = false
    private(set) var state: FishState = FishState.wander
    private let sleepMark: PixelLabel = PixelLabel(text: "ZZ", color: SKColor(hex: 0xBFE9F7), alignment: PixelLabel.Alignment.center)
    private var glow: SKSpriteNode?
    /// Quanto è buio intorno (0 giorno pieno, 1 abisso): regola il bagliore delle specie luminose.
    static var darkness: Double = 0

    static let glowTexture: SKTexture = {
        let size: Int = 48
        var image: PixelBuffer = PixelBuffer(width: size, height: size)
        let c: Double = Double(size) / 2
        var y: Int = 0
        while y < size {
            var x: Int = 0
            while x < size {
                let dx: Double = Double(x) + 0.5 - c
                let dy: Double = Double(y) + 0.5 - c
                let d: Double = (dx * dx + dy * dy).squareRoot() / c
                if d < 1 {
                    let a: Double = (1 - d) * (1 - d)
                    image.set(x, y, RGBA(r: 130, g: 240, b: 225, a: UInt8(max(0, min(255, a * 255)))))
                }
                x += 1
            }
            y += 1
        }
        return TextureFactory.texture(from: image, filtering: SKTextureFilteringMode.linear)
    }()

    init(id: Int, species: FishSpecies) {
        self.id = id
        let forge: SpriteForge = SpriteForge.shared
        let art: String = species.spriteId
        swimFrames = forge.frames("\(art)_swim")
        hurtFrame = forge.texture("\(art)_hurt_0")
        deadFrame = forge.texture("\(art)_dead_0")
        sprite = forge.node("\(art)_swim_0")
        let states: [FishStateNode] = [
            FishWanderState(), FishFleeState(), FishChaseState(), FishWindupState(), FishChargeState(), FishRecoverState(),
            FishReturnState(), FishStunnedState(), FishHookedState(), FishAsleepState(), FishDeadState()
        ]
        machine = GKStateMachine(states: states)
        node.addChild(sprite)
        alert.position = CGPoint(x: 0, y: CGFloat(species.radius) + 8)
        alert.isHidden = true
        alert.zPosition = 2
        node.addChild(alert)
        sleepMark.position = CGPoint(x: 2, y: CGFloat(species.radius) + 4)
        sleepMark.zPosition = 2
        sleepMark.isHidden = true
        sleepMark.shadowColor = SKColor(hex: 0x06142A)
        node.addChild(sleepMark)
        if species.isGlowing {
            // Bagliore proprio, disegnato sopra il velo del buio.
            let halo: SKSpriteNode = SKSpriteNode(texture: FishAgent.glowTexture)
            let side: CGFloat = CGFloat(species.radius) * 5 + 14
            halo.size = CGSize(width: side, height: side)
            halo.blendMode = SKBlendMode.add
            halo.zPosition = 500
            halo.alpha = 0
            node.addChild(halo)
            glow = halo
        }
        for s in states { s.agent = self }
        machine.enter(FishWanderState.self)
    }

    fileprivate func didEnter(_ kind: FishState) {
        state = kind
        alert.isHidden = kind != FishState.windup
        if !syncing { onEnter?(id, kind) }
    }

    /// Chiede un cambio di stato deciso dal comportamento. Ritorna true se la macchina lo accetta.
    @discardableResult
    func request(_ next: FishState) -> Bool {
        return machine.enter(FishStateNode.stateClass(for: next))
    }

    /// Allinea la macchina a uno stato imposto dalla simulazione (colpo, aggancio, lenza spezzata).
    func sync(to forced: FishState) {
        if forced == state { return }
        syncing = true
        if !machine.enter(FishStateNode.stateClass(for: forced)) {
            // Passaggio non previsto dalla tabella: lo stato della simulazione ha comunque la precedenza.
            state = forced
            alert.isHidden = forced != FishState.windup
        }
        syncing = false
    }

    /// Reazione visiva a un colpo: fotogramma chiaro e "pugno" di scala.
    func flashHurt() {
        hurtTimer = 0.12
        punch = 1
    }

    func update(body: FishBody, layout: PixelLayout, dt: Double) {
        node.position = CGPoint(x: layout.snap(body.position.x), y: layout.snap(-body.position.y))
        let speed: Double = body.velocity.length
        clock += dt * (4.0 + speed * 0.09)
        if hurtTimer > 0 { hurtTimer -= dt }
        if punch > 0 { punch = max(0, punch - dt * 7) }

        let texture: SKTexture
        if body.state == FishState.dead {
            texture = deadFrame
        } else if hurtTimer > 0 || body.state == FishState.stunned {
            texture = hurtFrame
        } else if swimFrames.isEmpty {
            texture = hurtFrame
        } else {
            texture = swimFrames[Int(clock) % swimFrames.count]
        }
        if sprite.texture !== texture { sprite.texture = texture }

        let facing: CGFloat = body.facingRight ? 1 : -1
        let squash: CGFloat = CGFloat(punch)
        sprite.xScale = facing * (1 + squash * 0.22)
        sprite.yScale = 1 - squash * 0.18
        var rotation: Double = 0
        var offsetX: Double = 0
        switch body.state {
        case .windup:
            // Trema prima di caricare.
            offsetX = sin(clock * 9) * 1.2
        case .hooked:
            rotation = sin(clock * 2.2) * 0.35
        case .charge, .flee, .chase:
            if speed > 8 {
                rotation = MathUtil.clamp(atan2(-body.velocity.y, abs(body.velocity.x)), -0.6, 0.6) * (body.facingRight ? 1 : -1)
            }
        case .dead:
            rotation = Double.pi
        case .asleep:
            rotation = 0.5
        default:
            break
        }
        sprite.zRotation = CGFloat(rotation)
        sprite.position = CGPoint(x: offsetX, y: 0)
        sleepMark.isHidden = body.state != FishState.asleep
        if let halo: SKSpriteNode = glow {
            halo.alpha = CGFloat(MathUtil.clamp(FishAgent.darkness, 0, 1) * (0.55 + 0.2 * sin(clock * 0.8)))
        }
    }
}
