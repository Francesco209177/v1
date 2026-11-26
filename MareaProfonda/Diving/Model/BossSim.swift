import Foundation

// MARK: - Dati

enum BossKind: String, Codable, CaseIterable {
    case murena
    case granseola
    case spada
    case polpo
    case lanterna
    case talpa
}

/// Scheda di un boss, letta da `Data/bosses.json`.
struct BossInfo: Codable, Equatable {
    let id: String
    let kind: BossKind
    let name: LocalizedText
    let epithet: LocalizedText
    /// Consiglio mostrato all'inizio dello scontro.
    let hint: LocalizedText
    /// Profondità dell'arena in metri.
    let depth: Double
    let hp: Double
    /// Raggio del corpo in pixel.
    let radius: Double
    /// Fiato tolto a Tecla da un attacco pieno.
    let damage: Double
    let speed: Double
}

struct BossBook: Codable, Equatable {
    let bosses: [BossInfo]

    func find(_ id: String) -> BossInfo? {
        return bosses.first(where: { $0.id == id })
    }

    func problems(world: WorldData) -> [String] {
        var out: [String] = []
        var seen: Set<String> = []
        for b in bosses {
            if seen.contains(b.id) { out.append("boss duplicato: \(b.id)") }
            seen.insert(b.id)
            if b.name.text().isEmpty || b.hint.text().isEmpty { out.append("\(b.id): testo mancante") }
            if b.hp <= 0 || b.radius <= 0 || b.damage <= 0 || b.speed <= 0 { out.append("\(b.id): valori non positivi") }
            if b.depth < 14 || b.depth > Double(world.maxDepthMeters) - 16 { out.append("\(b.id): profondità fuori dalla mappa") }
        }
        return out
    }
}

// MARK: - Arena

struct ArenaHole: Equatable {
    let position: Vec2
    /// Direzione che esce dalla roccia.
    let normal: Vec2
}

/// La sala chiusa dove si combatte un boss, in pixel di mappa.
struct Arena: Equatable {
    let minX: Double
    let maxX: Double
    let minY: Double
    let maxY: Double
    /// Tane da cui esce la murena.
    var holes: [ArenaHole] = []
    /// Campane d'aria: nell'arena si ricaricano da sole.
    var bells: [Vec2] = []
    var diverStart: Vec2 = Vec2.zero
    var bossStart: Vec2 = Vec2.zero

    var center: Vec2 { return Vec2((minX + maxX) / 2, (minY + maxY) / 2) }
    var width: Double { return maxX - minX }
    var height: Double { return maxY - minY }

    func clamp(_ p: Vec2, margin: Double) -> Vec2 {
        return Vec2(MathUtil.clamp(p.x, minX + margin, maxX - margin), MathUtil.clamp(p.y, minY + margin, maxY - margin))
    }

    func contains(_ p: Vec2, margin: Double = 0) -> Bool {
        return p.x >= minX - margin && p.x <= maxX + margin && p.y >= minY - margin && p.y <= maxY + margin
    }
}

// MARK: - Pericoli

/// Qualcosa che il boss mette in acqua: proiettili, nuvole d'inchiostro, mine, getti.
struct Hazard: Equatable {
    enum Kind: String, CaseIterable {
        case rock
        case shard
        case amphora
        case bubble
        case ink
        case spore
        case mine
        case torpedo
        /// Colpo di tentacolo lungo un segmento.
        case beam
        /// Getto bollente dal fondo al soffitto.
        case jet
        case wave
    }

    let id: Int
    let kind: Kind
    var position: Vec2
    var velocity: Vec2 = Vec2.zero
    /// Estremo opposto, per i pericoli a segmento.
    var end: Vec2? = nil
    var radius: Double
    var damage: Double
    /// Secondi di vita rimasti.
    var life: Double
    /// Secondi prima che diventi pericoloso: nel frattempo se ne vede solo l'avviso.
    var armIn: Double = 0
    var gravity: Double = 0
    /// Velocità di virata verso Tecla, in radianti al secondo.
    var homing: Double = 0
    var breaksOnRock: Bool = true
    /// Raggio dello scoppio (mine e siluri).
    var blast: Double = 0
    var age: Double = 0
    /// Mina con la miccia accesa.
    var fused: Bool = false

    var isArmed: Bool { return armIn <= 0 }
    var isSegment: Bool { return kind == Kind.beam || kind == Kind.jet }
}

// MARK: - Corpo del boss

enum BossMove: String {
    /// Si muove e sceglie la prossima mossa.
    case idle
    /// Avviso prima dell'attacco: è il momento di spostarsi.
    case telegraph
    case attack
    /// Dopo l'attacco: fermo ed esposto.
    case recover
    /// Si ritira (la murena rientra nella tana).
    case retreat
    /// Stordito: incastrato, ribaltato o colpito da una bomba a bolle.
    case stunned
    /// Nascosto: non si può colpire.
    case hidden
    case dying
    case dead
}

struct BossBody {
    let info: BossInfo
    var position: Vec2
    var velocity: Vec2 = Vec2.zero
    var hp: Double
    var move: BossMove = BossMove.idle
    var moveTime: Double = 0
    /// Durata prevista della mossa in corso.
    var moveFor: Double = 1.6
    /// Nome dell'attacco annunciato o in corso.
    var attack: String = ""
    var lastAttack: String = ""
    var aim: Vec2 = Vec2(-1, 0)
    var facingRight: Bool = false
    var anchor: Vec2
    /// Attacchi rimasti nella sequenza in corso.
    var chain: Int = 0
    /// Murena: tana attuale, lunghezza del corpo fuori dalla tana, allungo massimo dell'attacco.
    var hole: Int = 0
    var extend: Double = 0
    var reach: Double = 0
    /// Lanterna: secondi in cui il corpo resta illuminato.
    var lit: Double = 0
    var touchCooldown: Double = 0
    /// L'attacco in corso ha già colpito Tecla.
    var struck: Bool = false
    var traveled: Double = 0
    var phase: Int = 1
    var clock: Double = 0
    var orbit: Double = 0
    /// Secondi in cui il boss non si lascia stordire di nuovo.
    var stunGuard: Double = 0
    var rng: SeededRNG

    init(info: BossInfo, arena: Arena, seed: UInt64) {
        self.info = info
        position = arena.bossStart
        anchor = arena.bossStart
        hp = info.hp
        rng = SeededRNG(seed: seed &+ 5150)
        if info.kind == BossKind.murena {
            move = BossMove.hidden
            moveFor = 1.4
            if !arena.holes.isEmpty { position = arena.holes[0].position }
        }
    }

    var hpRatio: Double { return info.hp > 0 ? MathUtil.clamp(hp / info.hp, 0, 1) : 0 }
    var isAlive: Bool { return move != BossMove.dying && move != BossMove.dead }

    /// Il punto debole si può ferire adesso?
    var isVulnerable: Bool {
        if !isAlive { return false }
        switch info.kind {
        case .murena:
            return extend > 20 && (move == BossMove.attack || move == BossMove.recover || move == BossMove.retreat || move == BossMove.stunned)
        case .granseola:
            return move == BossMove.stunned || (attack == "slam" && (move == BossMove.telegraph || move == BossMove.recover))
        case .spada:
            // In guardia para tutto: si scopre solo dopo l'affondo.
            return move == BossMove.recover || move == BossMove.stunned
        case .polpo:
            return move == BossMove.attack || move == BossMove.recover || move == BossMove.stunned
        case .lanterna:
            return move == BossMove.recover || move == BossMove.stunned
        case .talpa:
            return move != BossMove.hidden
        }
    }

    /// Moltiplicatore del danno: un boss incastrato o ribaltato prende di più.
    var damageFactor: Double {
        if info.kind == BossKind.spada && move == BossMove.stunned { return 2.0 }
        if info.kind == BossKind.talpa && move == BossMove.recover { return 1.5 }
        return 1.0
    }

    /// Centro del punto debole.
    var weakPoint: Vec2 {
        switch info.kind {
        case .polpo:
            return position + Vec2(0, -info.radius * 0.45)
        case .talpa:
            let r: Double = info.radius
            if phase == 1 { return position + Vec2(0, -r * 0.92) }
            if phase == 2 { return position + Vec2(0, r * 0.92) }
            return position + Vec2(facingRight ? -r * 1.2 : r * 1.2, 0)
        default:
            return position
        }
    }

    var weakRadius: Double {
        switch info.kind {
        case .murena: return 10
        case .granseola: return info.radius * 0.85
        case .spada: return info.radius * 0.9
        case .polpo: return info.radius * 0.7
        case .lanterna: return info.radius * 0.9
        case .talpa: return 9
        }
    }

    /// L'esca luminosa della lanterna: colpirla la stordisce e la illumina.
    var lure: Vec2? {
        if info.kind != BossKind.lanterna || move == BossMove.hidden || !isAlive { return nil }
        return position + Vec2(facingRight ? info.radius * 1.15 : -info.radius * 1.15, -info.radius * 1.25)
    }

    /// L'esca si può colpire: dopo ogni stordimento la lanterna la tiene spenta per un po'.
    var lureExposed: Bool {
        return lure != nil && stunGuard <= 0 && !isVulnerable
    }

    /// true se il corpo ferma l'arpione in questo punto (corazza, scafo).
    func blocks(_ point: Vec2) -> Bool {
        if !isAlive || move == BossMove.hidden { return false }
        switch info.kind {
        case .murena:
            return false
        case .talpa:
            let d: Vec2 = point - position
            return (d.x * d.x) / (info.radius * info.radius * 1.9) + (d.y * d.y) / (info.radius * info.radius * 0.8) < 1
        default:
            return point.distance(to: position) < info.radius
        }
    }
}

enum BossEvent: Equatable {
    case telegraph(at: Vec2, attack: String)
    case attack(String)
    case hitDiver(damage: Double, at: Vec2)
    case phase(Int)
    case stunned(at: Vec2)
    case quake
    case blast(at: Vec2, radius: Double)
    case defeated
}

// MARK: - Cervello

/// Comportamento dei boss, in codice puro: ogni attacco è annunciato da un avviso,
/// ogni boss ha tre fasi che si attivano a due terzi e a un terzo della vita.
enum BossAI {
    static let dyingTime: Double = 2.2

    private static func tier(_ b: BossBody, _ a: Double, _ m: Double, _ c: Double) -> Double {
        return b.phase <= 1 ? a : (b.phase == 2 ? m : c)
    }

    private static func tierInt(_ b: BossBody, _ a: Int, _ m: Int, _ c: Int) -> Int {
        return b.phase <= 1 ? a : (b.phase == 2 ? m : c)
    }

    private static func enter(_ b: inout BossBody, _ move: BossMove, for duration: Double, attack: String? = nil) {
        b.move = move
        b.moveTime = 0
        b.moveFor = duration
        if let name: String = attack { b.attack = name }
        if move == BossMove.attack {
            b.struck = false
            b.traveled = 0
        }
    }

    private static func toward(_ from: Vec2, _ to: Vec2, fallback: Vec2) -> Vec2 {
        let d: Vec2 = to - from
        return d.lengthSquared > 1e-6 ? d.normalized() : fallback
    }

    /// Quanto si può avanzare lungo una direzione prima di toccare la roccia.
    static func reach(from origin: Vec2, direction: Vec2, limit: Double, map: CaveMap) -> Double {
        var d: Double = 12
        while d < limit {
            let p: Vec2 = origin + direction * d
            if map.isSolid(x: p.x, y: p.y) { return max(d - 6, 0) }
            d += 6
        }
        return limit
    }

    static func distanceToSegment(_ p: Vec2, _ a: Vec2, _ b: Vec2) -> Double {
        let ab: Vec2 = b - a
        let l2: Double = ab.lengthSquared
        if l2 < 1e-9 { return p.distance(to: a) }
        let t: Double = MathUtil.clamp((p - a).dot(ab) / l2, 0, 1)
        return p.distance(to: a + ab * t)
    }

    private static func spawn(_ hazards: inout [Hazard], _ nextId: inout Int, kind: Hazard.Kind, at position: Vec2, velocity: Vec2 = Vec2.zero,
                              radius: Double, damage: Double, life: Double) -> Int {
        hazards.append(Hazard(id: nextId, kind: kind, position: position, velocity: velocity, radius: radius, damage: damage, life: life))
        nextId += 1
        return hazards.count - 1
    }

    // MARK: Danni e stordimento

    /// Applica un colpo al punto debole. Ritorna gli eventi (cambio di fase, sconfitta).
    static func damage(_ b: inout BossBody, amount: Double, hazards: inout [Hazard]) -> [BossEvent] {
        var events: [BossEvent] = []
        if !b.isAlive { return events }
        b.hp = max(0, b.hp - amount * b.damageFactor)
        if b.hp <= 0 {
            enter(&b, BossMove.dying, for: dyingTime)
            b.velocity = Vec2.zero
            hazards.removeAll()
            return events
        }
        let phase: Int = b.hpRatio > 0.66 ? 1 : (b.hpRatio > 0.33 ? 2 : 3)
        if phase != b.phase {
            b.phase = phase
            events.append(BossEvent.phase(phase))
        }
        return events
    }

    /// Stordisce il boss (bomba a bolle, esca colpita). Ritorna false se in questo momento non si può.
    static func stun(_ b: inout BossBody, seconds: Double) -> Bool {
        if !b.isAlive || b.move == BossMove.hidden || b.move == BossMove.stunned || b.stunGuard > 0 { return false }
        if b.info.kind == BossKind.murena && b.extend < 20 { return false }
        if b.info.kind == BossKind.talpa { return false }
        enter(&b, BossMove.stunned, for: seconds)
        b.stunGuard = seconds + 7
        b.velocity = Vec2.zero
        if b.info.kind == BossKind.lanterna { b.lit = seconds }
        return true
    }

    // MARK: Passo

    static func step(_ b: inout BossBody, diver: Vec2, diverRadius: Double, arena: Arena, map: CaveMap,
                     hazards: inout [Hazard], nextId: inout Int, dt: Double) -> [BossEvent] {
        var events: [BossEvent] = []
        b.moveTime += dt
        b.clock += dt
        if b.touchCooldown > 0 { b.touchCooldown = max(0, b.touchCooldown - dt) }
        if b.lit > 0 { b.lit = max(0, b.lit - dt) }
        if b.stunGuard > 0 { b.stunGuard = max(0, b.stunGuard - dt) }

        if b.move == BossMove.dead { return events }
        if b.move == BossMove.dying {
            // Affonda piano mentre si spegne.
            b.position = arena.clamp(b.position + Vec2(0, 10 * dt), margin: 4)
            if b.moveTime >= b.moveFor {
                b.move = BossMove.dead
                events.append(BossEvent.defeated)
            }
            return events
        }

        switch b.info.kind {
        case .murena: stepMurena(&b, diver: diver, diverRadius: diverRadius, arena: arena, map: map, hazards: &hazards, nextId: &nextId, dt: dt, events: &events)
        case .granseola: stepGranseola(&b, diver: diver, diverRadius: diverRadius, arena: arena, hazards: &hazards, nextId: &nextId, dt: dt, events: &events)
        case .spada: stepSpada(&b, diver: diver, diverRadius: diverRadius, arena: arena, map: map, hazards: &hazards, nextId: &nextId, dt: dt, events: &events)
        case .polpo: stepPolpo(&b, diver: diver, diverRadius: diverRadius, arena: arena, map: map, hazards: &hazards, nextId: &nextId, dt: dt, events: &events)
        case .lanterna: stepLanterna(&b, diver: diver, diverRadius: diverRadius, arena: arena, map: map, hazards: &hazards, nextId: &nextId, dt: dt, events: &events)
        case .talpa: stepTalpa(&b, diver: diver, diverRadius: diverRadius, arena: arena, hazards: &hazards, nextId: &nextId, dt: dt, events: &events)
        }
        return events
    }

    /// Contatto col corpo durante un attacco: un colpo solo per attacco.
    private static func strike(_ b: inout BossBody, diver: Vec2, diverRadius: Double, reach: Double, factor: Double, events: inout [BossEvent]) {
        if b.struck { return }
        if b.position.distance(to: diver) < reach + diverRadius {
            b.struck = true
            events.append(BossEvent.hitDiver(damage: b.info.damage * factor, at: b.position))
        }
    }

    /// Sfiorare il corpo fuori dagli attacchi fa poco male, e non più di una volta al secondo.
    private static func graze(_ b: inout BossBody, diver: Vec2, diverRadius: Double, events: inout [BossEvent]) {
        if b.touchCooldown > 0 { return }
        if b.position.distance(to: diver) < b.info.radius * 0.8 + diverRadius {
            b.touchCooldown = 1.2
            events.append(BossEvent.hitDiver(damage: b.info.damage * 0.4, at: b.position))
        }
    }

    // MARK: Murena Baronessa

    private static func stepMurena(_ b: inout BossBody, diver: Vec2, diverRadius: Double, arena: Arena, map: CaveMap,
                                   hazards: inout [Hazard], nextId: inout Int, dt: Double, events: inout [BossEvent]) {
        if arena.holes.isEmpty { return }
        let hole: ArenaHole = arena.holes[min(b.hole, arena.holes.count - 1)]

        /// Direzione verso Tecla, senza mai puntare dentro la roccia della tana.
        func aimFromHole() -> Vec2 {
            var dir: Vec2 = toward(hole.position, diver, fallback: hole.normal)
            if dir.dot(hole.normal) < 0.3 { dir = (dir + hole.normal * 0.9).normalized() }
            return dir
        }

        switch b.move {
        case .hidden:
            b.extend = 0
            if b.moveTime >= b.moveFor {
                // Sceglie una tana diversa dall'ultima, tra le due più vicine a Tecla.
                var order: [Int] = []
                var i: Int = 0
                while i < arena.holes.count {
                    if i != b.hole || arena.holes.count == 1 { order.append(i) }
                    i += 1
                }
                order.sort { (x: Int, y: Int) -> Bool in
                    arena.holes[x].position.distance(to: diver) < arena.holes[y].position.distance(to: diver)
                }
                let pickFrom: Int = min(order.count, 2)
                b.hole = order[b.rng.int(0, max(pickFrom - 1, 0))]
                let chosen: ArenaHole = arena.holes[b.hole]
                b.position = chosen.position
                b.aim = toward(chosen.position, diver, fallback: chosen.normal)
                if b.aim.dot(chosen.normal) < 0.3 { b.aim = (b.aim + chosen.normal * 0.9).normalized() }
                let warn: Double = tier(b, 0.80, 0.64, 0.50) * (b.chain > 0 ? 0.7 : 1.0)
                enter(&b, BossMove.telegraph, for: warn, attack: "lunge")
                events.append(BossEvent.telegraph(at: chosen.position, attack: "lunge"))
            }
        case .telegraph:
            b.extend = MathUtil.approach(b.extend, 12, 60 * dt)
            if b.moveTime < b.moveFor - 0.18 { b.aim = aimFromHole() }
            if b.moveTime >= b.moveFor {
                b.reach = reach(from: hole.position, direction: b.aim, limit: 215, map: map)
                enter(&b, BossMove.attack, for: 2.0)
                events.append(BossEvent.attack("lunge"))
            }
        case .attack:
            b.extend = min(b.reach, b.extend + 560 * dt)
            if b.extend >= b.reach {
                enter(&b, BossMove.recover, for: tier(b, 1.65, 1.35, 1.10))
                if b.phase >= 3 {
                    // Sputa schegge d'anfora a ventaglio.
                    let head: Vec2 = hole.position + b.aim * b.extend
                    let base: Vec2 = toward(head, diver, fallback: b.aim)
                    for offset in [-0.32, 0.0, 0.32] {
                        _ = spawn(&hazards, &nextId, kind: Hazard.Kind.shard, at: head, velocity: base.rotated(by: offset) * 150,
                                  radius: 5, damage: b.info.damage * 0.5, life: 2.4)
                    }
                }
            }
        case .recover:
            if b.moveTime >= b.moveFor { enter(&b, BossMove.retreat, for: 3.0) }
        case .stunned:
            if b.moveTime >= b.moveFor { enter(&b, BossMove.retreat, for: 3.0) }
        case .retreat:
            b.extend = max(0, b.extend - 300 * dt)
            if b.extend <= 0 {
                if b.chain > 0 {
                    b.chain -= 1
                    enter(&b, BossMove.hidden, for: 0.28)
                } else {
                    b.chain = tierInt(b, 0, 1, 2)
                    enter(&b, BossMove.hidden, for: tier(b, 1.35, 1.05, 0.80))
                }
            }
        default:
            enter(&b, BossMove.hidden, for: 1.0)
        }

        b.position = hole.position + b.aim * b.extend
        b.facingRight = b.aim.x >= 0
        // Il morso: la testa e il corpo teso feriscono durante l'allungo.
        if b.move == BossMove.attack && !b.struck {
            if distanceToSegment(diver, hole.position, b.position) < 8 + diverRadius {
                b.struck = true
                events.append(BossEvent.hitDiver(damage: b.info.damage, at: b.position))
            }
        }
    }

    // MARK: Granseola Corazzata

    private static func stepGranseola(_ b: inout BossBody, diver: Vec2, diverRadius: Double, arena: Arena,
                                      hazards: inout [Hazard], nextId: inout Int, dt: Double, events: inout [BossEvent]) {
        let floorY: Double = arena.maxY - b.info.radius * 0.72
        let dx: Double = diver.x - b.position.x
        var vx: Double = 0

        switch b.move {
        case .idle:
            if abs(dx) > 26 { vx = (dx > 0 ? 1 : -1) * b.info.speed * tier(b, 1.0, 1.25, 1.5) }
            b.facingRight = dx >= 0
            if b.moveTime >= b.moveFor {
                var options: [String] = ["slam"]
                if abs(dx) > 70 { options.append("charge") }
                if b.phase >= 2 { options.append("bubbles") }
                let fresh: [String] = options.filter { $0 != b.lastAttack }
                let choice: String = b.rng.pick(fresh.isEmpty ? options : fresh) ?? "slam"
                b.lastAttack = choice
                b.aim = Vec2(dx >= 0 ? 1 : -1, 0)
                let warn: Double = choice == "charge" ? tier(b, 0.85, 0.72, 0.60) : (choice == "slam" ? tier(b, 0.95, 0.82, 0.70) : 0.6)
                enter(&b, BossMove.telegraph, for: warn, attack: choice)
                events.append(BossEvent.telegraph(at: b.position, attack: choice))
            }
        case .telegraph:
            if b.moveTime >= b.moveFor {
                events.append(BossEvent.attack(b.attack))
                if b.attack == "charge" {
                    enter(&b, BossMove.attack, for: 3.2)
                } else if b.attack == "slam" {
                    events.append(BossEvent.quake)
                    // L'onda d'urto corre sul fondo: chi sta giù la prende.
                    if diver.y > arena.maxY - 30 && abs(dx) < 170 {
                        events.append(BossEvent.hitDiver(damage: b.info.damage * 0.7, at: Vec2(diver.x, arena.maxY)))
                    }
                    let count: Int = tierInt(b, 4, 5, 7)
                    var i: Int = 0
                    while i < count {
                        let spread: Double = (Double(i) - Double(count - 1) / 2) * 46 + b.rng.range(-14, 14)
                        let x: Double = MathUtil.clamp(diver.x + spread, arena.minX + 12, arena.maxX - 12)
                        let index: Int = spawn(&hazards, &nextId, kind: Hazard.Kind.rock, at: Vec2(x, arena.minY + 8),
                                               radius: 7, damage: b.info.damage * 0.75, life: 3.4)
                        hazards[index].armIn = 0.55 + Double(i % 3) * 0.12
                        hazards[index].gravity = 330
                        i += 1
                    }
                    enter(&b, BossMove.recover, for: 1.05)
                } else {
                    let count: Int = tierInt(b, 5, 7, 9)
                    var i: Int = 0
                    while i < count {
                        let t: Double = count > 1 ? Double(i) / Double(count - 1) : 0.5
                        let angle: Double = -Double.pi * (0.14 + 0.72 * t)
                        _ = spawn(&hazards, &nextId, kind: Hazard.Kind.bubble, at: b.position + Vec2(0, -b.info.radius * 0.6),
                                  velocity: Vec2.fromAngle(angle, length: 118), radius: 6, damage: b.info.damage * 0.55, life: 3.0)
                        i += 1
                    }
                    enter(&b, BossMove.recover, for: 0.8)
                }
            }
        case .attack:
            vx = b.aim.x * tier(b, 215, 245, 275)
            b.traveled += abs(vx) * dt
            strike(&b, diver: diver, diverRadius: diverRadius, reach: b.info.radius * 0.9, factor: 1.0, events: &events)
            let wall: Bool = (b.aim.x < 0 && b.position.x <= arena.minX + b.info.radius + 2) || (b.aim.x > 0 && b.position.x >= arena.maxX - b.info.radius - 2)
            if wall {
                // Si schianta e resta a pancia in su.
                events.append(BossEvent.quake)
                events.append(BossEvent.stunned(at: b.position))
                enter(&b, BossMove.stunned, for: tier(b, 2.9, 2.5, 2.1))
                if b.phase >= 3 {
                    var i: Int = 0
                    while i < 3 {
                        let index: Int = spawn(&hazards, &nextId, kind: Hazard.Kind.rock, at: Vec2(b.rng.range(arena.minX + 20, arena.maxX - 20), arena.minY + 8),
                                               radius: 7, damage: b.info.damage * 0.75, life: 3.4)
                        hazards[index].armIn = 0.5
                        hazards[index].gravity = 330
                        i += 1
                    }
                }
            } else if b.moveTime >= b.moveFor {
                enter(&b, BossMove.recover, for: 0.6)
            }
        case .recover, .stunned:
            if b.moveTime >= b.moveFor { enter(&b, BossMove.idle, for: b.rng.range(1.3, 2.1) * tier(b, 1.0, 0.85, 0.7)) }
        default:
            enter(&b, BossMove.idle, for: 1.5)
        }

        b.velocity = Vec2(vx, 0)
        b.position = Vec2(MathUtil.clamp(b.position.x + vx * dt, arena.minX + b.info.radius, arena.maxX - b.info.radius), floorY)
        if b.move == BossMove.idle { graze(&b, diver: diver, diverRadius: diverRadius, events: &events) }
    }

    // MARK: Lo Spadaccino

    private static func stepSpada(_ b: inout BossBody, diver: Vec2, diverRadius: Double, arena: Arena, map: CaveMap,
                                  hazards: inout [Hazard], nextId: inout Int, dt: Double, events: inout [BossEvent]) {
        var desired: Vec2 = Vec2.zero
        var rate: Double = 3.0
        switch b.move {
        case .idle:
            // Gira attorno a Tecla tenendo la distanza, come uno schermidore.
            b.orbit += dt * 0.85
            let point: Vec2 = arena.clamp(diver + Vec2(cos(b.orbit) * 150, sin(b.orbit) * 80), margin: 34)
            let d: Vec2 = point - b.position
            desired = d.length > 6 ? d.normalized() * b.info.speed * tier(b, 1.0, 1.15, 1.3) : Vec2.zero
            if b.moveTime >= b.moveFor {
                b.chain = tierInt(b, 0, 1, 2)
                b.aim = toward(b.position, diver, fallback: b.aim)
                enter(&b, BossMove.telegraph, for: tier(b, 0.68, 0.54, 0.44), attack: "lunge")
                events.append(BossEvent.telegraph(at: b.position, attack: "lunge"))
            }
        case .telegraph:
            // Arretra appena, la spada puntata: la linea di tiro si fissa un attimo prima dello scatto.
            if b.moveTime < b.moveFor - 0.15 { b.aim = toward(b.position, diver, fallback: b.aim) }
            desired = b.aim * -20
            rate = 8
            if b.moveTime >= b.moveFor {
                enter(&b, BossMove.attack, for: 0.95)
                b.velocity = b.aim * tier(b, 400, 440, 480)
                events.append(BossEvent.attack("lunge"))
            }
        case .attack:
            desired = b.velocity
            rate = 0
            strike(&b, diver: diver, diverRadius: diverRadius, reach: b.info.radius * 0.8, factor: 1.0, events: &events)
        case .recover:
            desired = Vec2.zero
            rate = 4
            if b.moveTime >= b.moveFor { enter(&b, BossMove.idle, for: b.rng.range(1.1, 1.8)) }
        case .stunned:
            desired = Vec2.zero
            rate = 20
            if b.moveTime >= b.moveFor { enter(&b, BossMove.idle, for: b.rng.range(0.9, 1.4)) }
        default:
            enter(&b, BossMove.idle, for: 1.2)
        }

        if rate > 0 {
            let a: Double = 1 - exp(-rate * dt)
            b.velocity = b.velocity + (desired - b.velocity) * a
        }
        let before: Vec2 = b.position
        let resolved: (position: Vec2, normal: Vec2?) = map.resolve(center: b.position + b.velocity * dt, radius: b.info.radius * 0.6)
        b.position = resolved.position
        b.traveled += b.position.distance(to: before)
        if b.move != BossMove.telegraph && abs(b.velocity.x) > 6 { b.facingRight = b.velocity.x > 0 }
        if b.move == BossMove.telegraph { b.facingRight = b.aim.x >= 0 }

        if b.move == BossMove.attack {
            if resolved.normal != nil && b.traveled > 40 {
                // La spada si pianta nella roccia.
                b.velocity = Vec2.zero
                b.chain = 0
                events.append(BossEvent.quake)
                events.append(BossEvent.stunned(at: b.position))
                enter(&b, BossMove.stunned, for: tier(b, 2.5, 2.1, 1.8))
            } else if b.moveTime >= b.moveFor {
                if b.chain > 0 {
                    b.chain -= 1
                    b.velocity = b.velocity * 0.2
                    b.aim = toward(b.position, diver, fallback: b.aim)
                    enter(&b, BossMove.telegraph, for: tier(b, 0.5, 0.40, 0.34), attack: "lunge")
                    events.append(BossEvent.telegraph(at: b.position, attack: "lunge"))
                } else {
                    if b.phase >= 3 {
                        let base: Vec2 = toward(b.position, diver, fallback: b.aim)
                        for offset in [-0.34, 0.0, 0.34] {
                            _ = spawn(&hazards, &nextId, kind: Hazard.Kind.wave, at: b.position, velocity: base.rotated(by: offset) * 170,
                                      radius: 7, damage: b.info.damage * 0.55, life: 2.2)
                        }
                    }
                    enter(&b, BossMove.recover, for: 0.95)
                }
            }
        }
    }

    // MARK: Sua Eccellenza il Polpo

    private static func stepPolpo(_ b: inout BossBody, diver: Vec2, diverRadius: Double, arena: Arena, map: CaveMap,
                                  hazards: inout [Hazard], nextId: inout Int, dt: Double, events: inout [BossEvent]) {
        b.position = b.anchor + Vec2(sin(b.clock * 1.3) * 7, sin(b.clock * 0.9) * 4)
        b.facingRight = diver.x >= b.position.x
        let head: Vec2 = b.weakPoint

        switch b.move {
        case .idle:
            if b.moveTime >= b.moveFor {
                var inks: Int = 0
                for h in hazards where h.kind == Hazard.Kind.ink { inks += 1 }
                var options: [String] = ["slam", "volley"]
                if inks < 2 { options.append("ink") }
                let fresh: [String] = options.filter { $0 != b.lastAttack }
                let choice: String = b.rng.pick(fresh.isEmpty ? options : fresh) ?? "slam"
                b.lastAttack = choice
                b.aim = toward(head, diver, fallback: Vec2(0, -1))
                if choice == "slam" {
                    let warn: Double = tier(b, 0.90, 0.74, 0.60)
                    // I tentacoli si tendono: la linea che si vede è dove colpiranno.
                    let count: Int = tierInt(b, 1, 2, 3)
                    let offsets: [Double] = count == 1 ? [0] : (count == 2 ? [0, b.rng.chance(0.5) ? 0.45 : -0.45] : [-0.42, 0, 0.42])
                    for offset in offsets {
                        let dir: Vec2 = b.aim.rotated(by: offset)
                        let length: Double = reach(from: head, direction: dir, limit: 330, map: map)
                        let index: Int = spawn(&hazards, &nextId, kind: Hazard.Kind.beam, at: head, radius: 8, damage: b.info.damage, life: warn + 0.42)
                        hazards[index].end = head + dir * max(length, 30)
                        hazards[index].armIn = warn
                        hazards[index].breaksOnRock = false
                    }
                    enter(&b, BossMove.telegraph, for: warn, attack: "slam")
                } else {
                    enter(&b, BossMove.telegraph, for: choice == "volley" ? 0.55 : 0.45, attack: choice)
                }
                events.append(BossEvent.telegraph(at: head, attack: choice))
            }
        case .telegraph:
            if b.moveTime >= b.moveFor {
                events.append(BossEvent.attack(b.attack))
                if b.attack == "slam" {
                    events.append(BossEvent.quake)
                    enter(&b, BossMove.attack, for: 0.42)
                } else if b.attack == "volley" {
                    // Anfore lanciate a parabola verso dove si trova Tecla.
                    let count: Int = tierInt(b, 3, 4, 5)
                    let flight: Double = 1.15
                    let gravity: Double = 170
                    var i: Int = 0
                    while i < count {
                        let spread: Double = (Double(i) - Double(count - 1) / 2) * 40
                        let target: Vec2 = arena.clamp(diver + Vec2(spread, 0), margin: 10)
                        let v: Vec2 = Vec2((target.x - head.x) / flight, (target.y - head.y) / flight - 0.5 * gravity * flight)
                        let index: Int = spawn(&hazards, &nextId, kind: Hazard.Kind.amphora, at: head, velocity: v, radius: 7, damage: b.info.damage * 0.7, life: 4.0)
                        hazards[index].gravity = gravity
                        i += 1
                    }
                    enter(&b, BossMove.attack, for: 0.5)
                } else {
                    // Inchiostro: nuvole che rallentano e accecano.
                    let count: Int = tierInt(b, 2, 3, 3)
                    var i: Int = 0
                    while i < count {
                        let at: Vec2 = arena.clamp(diver + Vec2(b.rng.range(-60, 60), b.rng.range(-40, 40)), margin: 30)
                        let index: Int = spawn(&hazards, &nextId, kind: Hazard.Kind.ink, at: i == 0 ? head : at,
                                               velocity: Vec2(b.rng.range(-9, 9), b.rng.range(-7, 5)), radius: 36, damage: 0, life: 7.0)
                        hazards[index].breaksOnRock = false
                        i += 1
                    }
                    enter(&b, BossMove.attack, for: 0.35)
                }
            }
        case .attack:
            if b.moveTime >= b.moveFor { enter(&b, BossMove.recover, for: b.attack == "slam" ? tier(b, 1.55, 1.30, 1.10) : 0.95) }
        case .recover, .stunned:
            if b.moveTime >= b.moveFor { enter(&b, BossMove.idle, for: b.rng.range(1.0, 1.6) * tier(b, 1.0, 0.85, 0.7)) }
        default:
            enter(&b, BossMove.idle, for: 1.4)
        }
        graze(&b, diver: diver, diverRadius: diverRadius, events: &events)
    }

    // MARK: La Lanterna

    private static func stepLanterna(_ b: inout BossBody, diver: Vec2, diverRadius: Double, arena: Arena, map: CaveMap,
                                     hazards: inout [Hazard], nextId: inout Int, dt: Double, events: inout [BossEvent]) {
        var desired: Vec2 = Vec2.zero
        var rate: Double = 3.0
        switch b.move {
        case .idle:
            // Si aggira nel buio a distanza: di lei si vede solo l'esca.
            let away: Vec2 = toward(diver, b.position, fallback: Vec2(1, 0))
            let point: Vec2 = arena.clamp(diver + away * 118, margin: 30)
            let d: Vec2 = point - b.position
            desired = d.length > 8 ? d.normalized() * b.info.speed * tier(b, 1.0, 1.18, 1.36) : Vec2.zero
            b.facingRight = diver.x >= b.position.x
            if b.moveTime >= b.moveFor {
                var options: [String] = ["bite"]
                if b.phase >= 2 && b.lastAttack != "spores" { options.append("spores") }
                if b.phase >= 3 && b.lastAttack != "blackout" { options.append("blackout") }
                let choice: String = b.rng.pick(options) ?? "bite"
                b.lastAttack = choice
                b.aim = toward(b.position, diver, fallback: b.aim)
                if choice == "blackout" {
                    enter(&b, BossMove.hidden, for: 1.4, attack: "blackout")
                    events.append(BossEvent.attack("blackout"))
                } else {
                    enter(&b, BossMove.telegraph, for: choice == "bite" ? tier(b, 0.88, 0.72, 0.58) : 0.5, attack: choice)
                    events.append(BossEvent.telegraph(at: b.position, attack: choice))
                }
            }
        case .hidden:
            desired = Vec2.zero
            rate = 6
            if b.moveTime >= b.moveFor {
                // Ricompare dall'altra parte di Tecla, già pronta a mordere.
                let side: Double = diver.x >= b.position.x ? 1 : -1
                let candidate: Vec2 = arena.clamp(diver + Vec2(side * 125, b.rng.range(-30, 30)), margin: 30)
                b.position = map.nearestOpenPoint(to: candidate, clearance: b.info.radius * 0.7)
                b.velocity = Vec2.zero
                b.aim = toward(b.position, diver, fallback: b.aim)
                b.facingRight = b.aim.x >= 0
                enter(&b, BossMove.telegraph, for: 0.55, attack: "bite")
                events.append(BossEvent.telegraph(at: b.position, attack: "bite"))
            }
        case .telegraph:
            desired = Vec2.zero
            rate = 6
            if b.moveTime < b.moveFor - 0.15 { b.aim = toward(b.position, diver, fallback: b.aim) }
            b.facingRight = b.aim.x >= 0
            if b.moveTime >= b.moveFor {
                events.append(BossEvent.attack(b.attack))
                if b.attack == "bite" {
                    enter(&b, BossMove.attack, for: 0.55)
                    b.velocity = b.aim * tier(b, 300, 330, 360)
                } else {
                    // Spore luminose che inseguono piano.
                    let count: Int = tierInt(b, 3, 3, 5)
                    let origin: Vec2 = b.lure ?? b.position
                    var i: Int = 0
                    while i < count {
                        let angle: Double = 2 * Double.pi * Double(i) / Double(count) + b.rng.range(0, 0.5)
                        let index: Int = spawn(&hazards, &nextId, kind: Hazard.Kind.spore, at: origin, velocity: Vec2.fromAngle(angle, length: 58),
                                               radius: 5, damage: b.info.damage * 0.45, life: 5.5)
                        hazards[index].homing = 2.2
                        i += 1
                    }
                    enter(&b, BossMove.idle, for: 1.1)
                }
            }
        case .attack:
            desired = b.velocity
            rate = 0
            strike(&b, diver: diver, diverRadius: diverRadius, reach: b.info.radius * 0.85, factor: 1.0, events: &events)
            if b.moveTime >= b.moveFor {
                let rest: Double = tier(b, 1.55, 1.30, 1.10)
                b.lit = rest
                enter(&b, BossMove.recover, for: rest)
            }
        case .recover, .stunned:
            desired = Vec2.zero
            rate = 5
            if b.moveTime >= b.moveFor { enter(&b, BossMove.idle, for: b.rng.range(1.4, 2.2) * tier(b, 1.0, 0.85, 0.7)) }
        default:
            enter(&b, BossMove.idle, for: 1.6)
        }

        if rate > 0 {
            let a: Double = 1 - exp(-rate * dt)
            b.velocity = b.velocity + (desired - b.velocity) * a
        }
        if b.move != BossMove.hidden || b.moveTime > 0 {
            let resolved: (position: Vec2, normal: Vec2?) = map.resolve(center: b.position + b.velocity * dt, radius: b.info.radius * 0.7)
            if resolved.normal != nil && b.move == BossMove.attack { b.velocity = b.velocity * 0.3 }
            b.position = resolved.position
        }
    }

    // MARK: La Talpa d'Acciaio

    private static func stepTalpa(_ b: inout BossBody, diver: Vec2, diverRadius: Double, arena: Arena,
                                  hazards: inout [Hazard], nextId: inout Int, dt: Double, events: inout [BossEvent]) {
        var desired: Vec2 = Vec2.zero
        var rate: Double = 2.5
        let marginX: Double = b.info.radius * 1.4 + 4
        let marginY: Double = b.info.radius + 6

        func rocks(_ count: Int) {
            var i: Int = 0
            while i < count {
                let x: Double = i == 0 ? MathUtil.clamp(diver.x, arena.minX + 14, arena.maxX - 14) : b.rng.range(arena.minX + 20, arena.maxX - 20)
                let index: Int = spawn(&hazards, &nextId, kind: Hazard.Kind.rock, at: Vec2(x, arena.minY + 8), radius: 7, damage: b.info.damage * 0.7, life: 3.4)
                hazards[index].armIn = 0.5 + Double(i) * 0.1
                hazards[index].gravity = 330
                i += 1
            }
        }

        switch b.move {
        case .idle:
            // Si porta alla quota di Tecla restando dal suo lato, per allineare la trivella.
            let side: Double = b.position.x >= diver.x ? 1 : -1
            let point: Vec2 = Vec2(MathUtil.clamp(diver.x + side * 150, arena.minX + marginX, arena.maxX - marginX),
                                   MathUtil.clamp(diver.y, arena.minY + marginY, arena.maxY - marginY))
            let d: Vec2 = point - b.position
            desired = d.length > 6 ? d.normalized() * b.info.speed * tier(b, 1.0, 1.2, 1.4) : Vec2.zero
            b.facingRight = diver.x >= b.position.x
            if b.moveTime >= b.moveFor {
                var options: [String] = ["drill", "mines"]
                if b.phase >= 2 { options.append("jets") }
                if b.phase >= 3 { options.append("torpedo") }
                let fresh: [String] = options.filter { $0 != b.lastAttack }
                let choice: String = b.rng.pick(fresh.isEmpty ? options : fresh) ?? "drill"
                b.lastAttack = choice
                b.aim = Vec2(b.facingRight ? 1 : -1, 0)
                let warn: Double = choice == "drill" ? tier(b, 0.98, 0.82, 0.68) : (choice == "jets" ? 0.35 : 0.55)
                enter(&b, BossMove.telegraph, for: warn, attack: choice)
                events.append(BossEvent.telegraph(at: b.position, attack: choice))
            }
        case .telegraph:
            if b.attack == "drill" {
                // Arretra e prende la mira in verticale.
                desired = Vec2(-b.aim.x * 22, MathUtil.clamp(diver.y - b.position.y, -34, 34))
                rate = 6
            }
            if b.moveTime >= b.moveFor {
                events.append(BossEvent.attack(b.attack))
                if b.attack == "drill" {
                    enter(&b, BossMove.attack, for: 4.0)
                    b.velocity = b.aim * tier(b, 250, 285, 320)
                } else if b.attack == "mines" {
                    let count: Int = tierInt(b, 2, 3, 4)
                    var i: Int = 0
                    while i < count {
                        let drift: Vec2 = Vec2(b.rng.range(-18, 18), b.rng.range(-16, 16))
                        let at: Vec2 = arena.clamp(b.position + Vec2(b.rng.range(-30, 30), b.rng.range(-26, 26)), margin: 14)
                        let index: Int = spawn(&hazards, &nextId, kind: Hazard.Kind.mine, at: at, velocity: drift, radius: 7, damage: b.info.damage * 0.9, life: 8.0)
                        hazards[index].armIn = 0.8
                        hazards[index].blast = 42
                        hazards[index].breaksOnRock = false
                        i += 1
                    }
                    enter(&b, BossMove.idle, for: 1.3)
                } else if b.attack == "jets" {
                    let count: Int = tierInt(b, 3, 3, 4)
                    var i: Int = 0
                    while i < count {
                        let x: Double = MathUtil.clamp(diver.x + (Double(i) - Double(count - 1) / 2) * 72, arena.minX + 14, arena.maxX - 14)
                        let index: Int = spawn(&hazards, &nextId, kind: Hazard.Kind.jet, at: Vec2(x, arena.maxY), radius: 12, damage: b.info.damage * 0.8, life: 2.05)
                        hazards[index].end = Vec2(x, arena.minY)
                        hazards[index].armIn = 0.95
                        hazards[index].breaksOnRock = false
                        i += 1
                    }
                    enter(&b, BossMove.idle, for: 1.6)
                } else {
                    let base: Vec2 = toward(b.position, diver, fallback: b.aim)
                    for offset in [-0.5, 0.5] {
                        let index: Int = spawn(&hazards, &nextId, kind: Hazard.Kind.torpedo, at: b.position + Vec2(0, b.info.radius * 0.5),
                                               velocity: base.rotated(by: offset) * 115, radius: 6, damage: b.info.damage * 0.9, life: 4.5)
                        hazards[index].homing = 1.6
                        hazards[index].blast = 34
                    }
                    enter(&b, BossMove.idle, for: 1.5)
                }
            }
        case .attack:
            desired = b.velocity
            rate = 0
            strike(&b, diver: diver, diverRadius: diverRadius, reach: b.info.radius * 1.15, factor: 1.0, events: &events)
        case .recover:
            desired = Vec2.zero
            rate = 20
            if b.moveTime >= b.moveFor { enter(&b, BossMove.idle, for: b.rng.range(1.3, 2.0) * tier(b, 1.0, 0.85, 0.7)) }
        default:
            enter(&b, BossMove.idle, for: 1.6)
        }

        if rate > 0 {
            let a: Double = 1 - exp(-rate * dt)
            b.velocity = b.velocity + (desired - b.velocity) * a
        }
        let next: Vec2 = b.position + b.velocity * dt
        let clamped: Vec2 = Vec2(MathUtil.clamp(next.x, arena.minX + marginX, arena.maxX - marginX),
                                 MathUtil.clamp(next.y, arena.minY + marginY, arena.maxY - marginY))
        b.traveled += clamped.distance(to: b.position)
        b.position = clamped
        if b.move == BossMove.attack {
            let wall: Bool = abs(clamped.x - next.x) > 0.01
            if wall {
                // La trivella morde la parete e resta incastrata: il soffitto frana.
                b.velocity = Vec2.zero
                events.append(BossEvent.quake)
                events.append(BossEvent.stunned(at: b.position))
                rocks(tierInt(b, 3, 4, 5))
                enter(&b, BossMove.recover, for: tier(b, 1.9, 1.65, 1.45))
            } else if b.moveTime >= b.moveFor {
                enter(&b, BossMove.recover, for: 0.8)
            }
        }
        if b.move == BossMove.idle || b.move == BossMove.recover { graze(&b, diver: diver, diverRadius: diverRadius, events: &events) }
    }

    // MARK: Pericoli

    /// Fa avanzare proiettili, nuvole e mine. Ritorna gli eventi; `inked` dice se Tecla è dentro l'inchiostro.
    static func stepHazards(_ hazards: inout [Hazard], diver: Vec2, diverRadius: Double, canHurt: Bool, map: CaveMap, dt: Double,
                            inked: inout Bool) -> [BossEvent] {
        var events: [BossEvent] = []
        inked = false
        var hurt: Bool = !canHurt
        var i: Int = hazards.count - 1
        while i >= 0 {
            var h: Hazard = hazards[i]
            var remove: Bool = false
            var explode: Bool = false
            h.age += dt
            h.life -= dt
            if h.armIn > 0 {
                h.armIn -= dt
            } else if !h.isSegment {
                if h.homing > 0 && h.velocity.lengthSquared > 1 {
                    let want: Double = (diver - h.position).angle
                    let have: Double = h.velocity.angle
                    let turn: Double = MathUtil.clamp(MathUtil.angleDelta(from: have, to: want), -h.homing * dt, h.homing * dt)
                    h.velocity = Vec2.fromAngle(have + turn, length: h.velocity.length)
                }
                h.velocity.y += h.gravity * dt
                if h.kind == Hazard.Kind.ink || h.kind == Hazard.Kind.mine { h.velocity = h.velocity * exp(-0.6 * dt) }
                h.position += h.velocity * dt
                if h.age > 0.12 && map.isSolid(x: h.position.x, y: h.position.y) {
                    if h.breaksOnRock {
                        remove = true
                        if h.blast > 0 { explode = true }
                    } else {
                        // Rimbalza piano contro le pareti.
                        h.position -= h.velocity * dt
                        h.velocity = h.velocity * -0.5
                    }
                }
            }

            if !remove && h.isArmed {
                let touching: Bool
                if let end: Vec2 = h.end {
                    touching = distanceToSegment(diver, h.position, end) < h.radius + diverRadius
                } else {
                    touching = h.position.distance(to: diver) < h.radius + diverRadius
                }
                switch h.kind {
                case .ink:
                    if touching { inked = true }
                case .mine:
                    if !h.fused && h.position.distance(to: diver) < 30 {
                        h.fused = true
                        h.life = min(h.life, 0.6)
                    }
                case .beam, .jet:
                    if touching && !hurt {
                        hurt = true
                        events.append(BossEvent.hitDiver(damage: h.damage, at: diver))
                    }
                case .torpedo:
                    if touching {
                        remove = true
                        explode = true
                    }
                default:
                    if touching && !hurt {
                        hurt = true
                        remove = true
                        events.append(BossEvent.hitDiver(damage: h.damage, at: h.position))
                    }
                }
            }
            if h.life <= 0 {
                remove = true
                if h.blast > 0 { explode = true }
            }
            if explode {
                events.append(BossEvent.blast(at: h.position, radius: h.blast))
                if !hurt && h.position.distance(to: diver) < h.blast + diverRadius {
                    hurt = true
                    events.append(BossEvent.hitDiver(damage: h.damage, at: h.position))
                }
            }
            if remove {
                hazards.remove(at: i)
            } else {
                hazards[i] = h
            }
            i -= 1
        }
        return events
    }
}
