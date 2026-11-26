/// Stati di un pesce. Nel gioco le transizioni sono guidate da una `GKStateMachine`
/// (vedi `FishAgent`); le regole e i movimenti di ogni stato stanno qui, in codice puro.
enum FishState: String, CaseIterable {
    /// Gironzola attorno alla sua zona.
    case wander
    /// Scappa da Tecla.
    case flee
    /// Si avvicina a Tecla per attaccare.
    case chase
    /// Si ferma un attimo prima dello scatto: è il segnale per schivare.
    case windup
    /// Scatto d'attacco in linea retta.
    case charge
    /// Riprende fiato dopo l'attacco.
    case recover
    /// Torna alla tana.
    case returnHome
    /// Appena colpito: fermo per un istante.
    case stunned
    /// Agganciato alla lenza dell'arpione.
    case hooked
    /// Addormentato dal dardo soporifero.
    case asleep
    case dead
}

/// Un pesce nella simulazione. Coordinate di mappa (y verso il basso).
struct FishBody {
    let species: FishSpecies
    /// Indice del punto di comparsa da cui proviene.
    let spawnIndex: Int
    var position: Vec2
    var velocity: Vec2 = Vec2.zero
    var home: Vec2
    var hp: Double
    var state: FishState = FishState.wander
    var stateTime: Double = 0
    var target: Vec2
    var facingRight: Bool = true
    var attackCooldown: Double = 0
    /// Quante volte è stato colpito: conta per la qualità della cattura.
    var hits: Int = 0
    /// Direzione fissata al momento dello scatto.
    var chargeDirection: Vec2 = Vec2(1, 0)
    /// Durata del sonno (o dello stordimento) in corso.
    var sleepFor: Double = 0
    /// true se addormentato da un dardo: catturato così vale tre stelle.
    var sleepAlive: Bool = false
    var rng: SeededRNG

    init(species: FishSpecies, spawnIndex: Int, position: Vec2, seed: UInt64) {
        self.species = species
        self.spawnIndex = spawnIndex
        self.position = position
        self.home = position
        self.hp = species.hp
        self.target = position
        self.rng = SeededRNG(seed: seed)
        self.facingRight = (seed & 1) == 0
    }

    var isAlive: Bool { return state != FishState.dead }
    /// Può essere colpito o agganciato.
    var isTargetable: Bool { return state != FishState.dead && state != FishState.hooked }
}

/// Ciò che un pesce può provocare in un passo di simulazione.
enum FishEvent: Equatable {
    /// Ha colpito Tecla: fiato da togliere e punto d'impatto.
    case hitDiver(damage: Double, at: Vec2)
    /// Ha cominciato a caricare (per l'avviso a schermo).
    case telegraph(at: Vec2)
}

enum FishAI {
    static let windupTime: Double = 0.48
    static let chargeTime: Double = 0.52
    static let recoverTime: Double = 0.95
    static let stunTime: Double = 0.22

    /// Transizioni ammesse (le stesse dichiarate agli stati di GameplayKit).
    static func isValid(from: FishState, to: FishState) -> Bool {
        if from == to { return false }
        if from == FishState.dead { return false }
        switch to {
        case .dead, .stunned, .hooked, .asleep: return true
        case .wander: return from != FishState.charge && from != FishState.windup || from == FishState.asleep
        case .flee: return from != FishState.charge
        case .chase: return from == FishState.wander || from == FishState.recover || from == FishState.stunned || from == FishState.returnHome || from == FishState.flee
        case .windup: return from == FishState.chase
        case .charge: return from == FishState.windup
        case .recover: return from == FishState.charge
        case .returnHome: return from == FishState.recover || from == FishState.chase || from == FishState.flee
        }
    }

    /// Decide se lo stato deve cambiare. Non modifica nulla.
    static func think(_ f: FishBody, diver: Vec2, diverSpeed: Double) -> FishState? {
        let s: FishSpecies = f.species
        let dist: Double = f.position.distance(to: diver)
        switch f.state {
        case .wander:
            switch s.behavior {
            case .shy:
                // Chi si avvicina piano arriva più vicino: premia l'approccio lento.
                let alarm: Double = diverSpeed > 30 ? s.sight : s.sight * 0.48
                if dist < alarm { return FishState.flee }
            case .territorial:
                if f.home.distance(to: diver) < s.sight { return FishState.chase }
            case .aggressive:
                if dist < s.sight { return FishState.chase }
            case .passive, .school, .ambush:
                break
            }
            return nil
        case .flee:
            if f.stateTime > 1.6 && dist > max(s.sight, 60) * 1.7 {
                return (s.behavior == FishBehavior.territorial) ? FishState.returnHome : FishState.wander
            }
            if f.stateTime > 6 { return FishState.wander }
            return nil
        case .chase:
            if dist < 50 && f.attackCooldown <= 0 { return FishState.windup }
            if s.behavior == FishBehavior.territorial && f.home.distance(to: diver) > s.sight * 1.6 { return FishState.returnHome }
            if s.behavior == FishBehavior.aggressive && dist > s.sight * 1.7 { return FishState.wander }
            if f.stateTime > 9 { return s.behavior == FishBehavior.territorial ? FishState.returnHome : FishState.wander }
            return nil
        case .windup:
            return f.stateTime >= windupTime ? FishState.charge : nil
        case .charge:
            return f.stateTime >= chargeTime ? FishState.recover : nil
        case .recover:
            if f.stateTime < recoverTime { return nil }
            if s.behavior == FishBehavior.territorial {
                return f.home.distance(to: diver) < s.sight * 1.2 ? FishState.chase : FishState.returnHome
            }
            return dist < s.sight * 1.3 ? FishState.chase : FishState.wander
        case .returnHome:
            if f.position.distance(to: f.home) < 14 { return FishState.wander }
            if s.behavior == FishBehavior.territorial && f.home.distance(to: diver) < s.sight * 0.8 && f.stateTime > 1.0 { return FishState.chase }
            if f.stateTime > 12 { return FishState.wander }
            return nil
        case .stunned:
            if f.stateTime < stunTime { return nil }
            switch s.behavior {
            case .territorial, .aggressive: return FishState.chase
            case .ambush: return FishState.wander
            case .passive, .shy, .school: return FishState.flee
            }
        case .asleep:
            return f.stateTime >= f.sleepFor ? FishState.wander : nil
        case .hooked, .dead:
            return nil
        }
    }

    /// Da chiamare a ogni cambio di stato.
    static func enter(_ f: inout FishBody, state: FishState, diver: Vec2) {
        f.state = state
        f.stateTime = 0
        switch state {
        case .windup:
            f.velocity = Vec2.zero
            let d: Vec2 = diver - f.position
            f.chargeDirection = d.lengthSquared > 1e-6 ? d.normalized() : Vec2(f.facingRight ? 1 : -1, 0)
            f.facingRight = f.chargeDirection.x >= 0
        case .recover:
            f.attackCooldown = 1.1
        case .wander:
            f.target = f.position
        case .flee:
            // I pesci timidi si stabiliscono dove finiscono di scappare.
            break
        case .dead:
            f.velocity = Vec2.zero
        default:
            break
        }
    }

    /// Muove il pesce secondo lo stato corrente. Ritorna l'eventuale evento.
    static func act(_ f: inout FishBody, diver: Vec2, diverRadius: Double, map: CaveMap, dt: Double) -> FishEvent? {
        f.stateTime += dt
        if f.attackCooldown > 0 { f.attackCooldown = max(0, f.attackCooldown - dt) }
        let s: FishSpecies = f.species
        var desired: Vec2 = Vec2.zero
        var rate: Double = 3.0
        var event: FishEvent? = nil
        let toDiver: Vec2 = diver - f.position
        let dist: Double = toDiver.length

        switch f.state {
        case .wander:
            if s.behavior == FishBehavior.ambush {
                desired = Vec2.zero
            } else {
                if f.position.distance(to: f.target) < 8 || f.stateTime > 5 {
                    f.stateTime = 0
                    let range: Double = s.behavior == FishBehavior.territorial ? 34 : 70
                    let candidate: Vec2 = Vec2(f.home.x + f.rng.range(-range, range), f.home.y + f.rng.range(-range * 0.5, range * 0.5))
                    f.target = map.isOpen(candidate, clearance: s.radius + 3) ? candidate : f.home
                }
                let d: Vec2 = f.target - f.position
                desired = d.lengthSquared > 1 ? d.normalized() * (s.speed * 0.62) : Vec2.zero
                rate = 2.2
            }
        case .flee:
            var away: Vec2 = dist > 1e-3 ? (-toDiver).normalized() : Vec2(f.facingRight ? 1 : -1, 0)
            // Fuga preferibilmente in orizzontale, con un po' di sbandata.
            away = Vec2(away.x * 1.25, away.y * 0.75 + sin(f.stateTime * 7 + Double(f.spawnIndex)) * 0.25).normalized()
            desired = away * s.fleeSpeed
            rate = 6.0
            if f.stateTime > 1.2 { f.home = f.position }
        case .chase:
            desired = dist > 1e-3 ? toDiver.normalized() * (s.speed * 1.5) : Vec2.zero
            rate = 4.0
        case .windup:
            // Arretra appena, tremando: l'avviso prima dello scatto.
            desired = f.chargeDirection * -14
            rate = 10
            if f.stateTime <= dt * 1.5 { event = FishEvent.telegraph(at: f.position) }
        case .charge:
            desired = f.chargeDirection * (s.fleeSpeed * 1.35)
            rate = 18
        case .recover:
            desired = f.chargeDirection * (s.speed * 0.25)
            rate = 3
        case .returnHome:
            let d: Vec2 = f.home - f.position
            desired = d.lengthSquared > 1 ? d.normalized() * s.speed : Vec2.zero
        case .stunned, .hooked, .asleep, .dead:
            desired = Vec2.zero
            rate = 8
        }

        if f.state != FishState.hooked {
            let a: Double = 1 - exp(-rate * dt)
            f.velocity = f.velocity + (desired - f.velocity) * a
            if f.state == FishState.dead {
                // Affonda piano.
                f.velocity = Vec2(f.velocity.x * 0.9, 9)
            } else if f.state == FishState.asleep {
                // Addormentato: resta sospeso, appena alla deriva.
                f.velocity = Vec2(f.velocity.x * 0.9, 2)
            }
            let next: Vec2 = f.position + f.velocity * dt
            let resolved: (position: Vec2, normal: Vec2?) = map.resolve(center: next, radius: s.radius * 0.8)
            if let n: Vec2 = resolved.normal {
                let into: Double = f.velocity.dot(n)
                if into < 0 { f.velocity = f.velocity - n * into }
                if f.state == FishState.wander || f.state == FishState.returnHome { f.target = f.position }
                if f.state == FishState.charge { f.stateTime = max(f.stateTime, chargeTime) }
            }
            f.position = resolved.position
            // I pesci non escono dall'acqua.
            if f.position.y < 8 {
                f.position.y = 8
                if f.velocity.y < 0 { f.velocity.y = 0 }
            }
        }
        if abs(f.velocity.x) > 4 { f.facingRight = f.velocity.x > 0 }

        // Contatto con Tecla.
        if s.damage > 0 && f.attackCooldown <= 0 && dist < s.radius + diverRadius {
            let dangerous: Bool = f.state == FishState.charge || (s.behavior == FishBehavior.ambush && f.isAlive && f.state != FishState.asleep && f.state != FishState.hooked)
            if dangerous {
                f.attackCooldown = 1.2
                event = FishEvent.hitDiver(damage: s.damage, at: f.position)
            }
        }
        return event
    }

    /// Pensiero e azione insieme: usato dai test e quando non c'è una macchina a stati esterna.
    static func step(_ f: inout FishBody, diver: Vec2, diverSpeed: Double, diverRadius: Double, map: CaveMap, dt: Double) -> FishEvent? {
        if let next: FishState = think(f, diver: diver, diverSpeed: diverSpeed), isValid(from: f.state, to: next) {
            enter(&f, state: next, diver: diver)
        }
        return act(&f, diver: diver, diverRadius: diverRadius, map: map, dt: dt)
    }

    /// Applica un colpo. Ritorna true se il pesce muore.
    static func damage(_ f: inout FishBody, amount: Double, diver: Vec2) -> Bool {
        if !f.isAlive { return false }
        f.hp -= amount
        f.hits += 1
        if f.hp <= 0 {
            f.hp = 0
            enter(&f, state: FishState.dead, diver: diver)
            return true
        }
        if f.state != FishState.hooked {
            enter(&f, state: FishState.stunned, diver: diver)
        }
        return false
    }
}

// MARK: - Banchi

/// Membro di un banco: leggero, senza macchina a stati propria.
struct SchoolMember {
    var position: Vec2
    var velocity: Vec2 = Vec2.zero
    var offset: Vec2
    var hp: Double
    var alive: Bool = true
    var hooked: Bool = false
    var facingRight: Bool = true
    var phase: Double
}

/// Un banco è una sola entità: decide il centro, e i membri lo seguono in formazione.
struct School {
    enum Mode {
        case cruise
        case scatter
    }

    let species: FishSpecies
    let spawnIndex: Int
    var center: Vec2
    var velocity: Vec2 = Vec2.zero
    var home: Vec2
    var target: Vec2
    var mode: Mode = Mode.cruise
    var modeTime: Double = 0
    var members: [SchoolMember] = []
    var rng: SeededRNG

    init(species: FishSpecies, spawnIndex: Int, position: Vec2, count: Int, seed: UInt64) {
        self.species = species
        self.spawnIndex = spawnIndex
        self.center = position
        self.home = position
        self.target = position
        self.rng = SeededRNG(seed: seed)
        var i: Int = 0
        while i < count {
            let angle: Double = rng.range(0, 2 * Double.pi)
            let radius: Double = rng.range(4, 9 + Double(count) * 1.6)
            let offset: Vec2 = Vec2(cos(angle) * radius * 1.5, sin(angle) * radius * 0.7)
            members.append(SchoolMember(position: position + offset, offset: offset, hp: species.hp, phase: rng.range(0, 6.28)))
            i += 1
        }
    }

    var aliveCount: Int {
        var n: Int = 0
        for m in members where m.alive { n += 1 }
        return n
    }

    mutating func scatter() {
        mode = Mode.scatter
        modeTime = 0
    }

    mutating func step(diver: Vec2, diverSpeed: Double, map: CaveMap, dt: Double) {
        modeTime += dt
        let toDiver: Vec2 = diver - center
        let dist: Double = toDiver.length
        var desired: Vec2 = Vec2.zero
        switch mode {
        case .cruise:
            let alarm: Double = diverSpeed > 30 ? species.sight : species.sight * 0.5
            if dist < alarm {
                scatter()
            } else {
                if center.distance(to: target) < 10 || modeTime > 6 {
                    modeTime = 0
                    let candidate: Vec2 = Vec2(home.x + rng.range(-110, 110), home.y + rng.range(-36, 36))
                    target = map.isOpen(candidate, clearance: 16) ? candidate : home
                }
                let d: Vec2 = target - center
                desired = d.lengthSquared > 1 ? d.normalized() * species.speed : Vec2.zero
            }
        case .scatter:
            let away: Vec2 = dist > 1e-3 ? (-toDiver).normalized() : Vec2(1, 0)
            desired = Vec2(away.x * 1.3, away.y * 0.7).normalized() * species.fleeSpeed
            if modeTime > 2.4 && dist > species.sight * 1.6 {
                mode = Mode.cruise
                modeTime = 0
                home = center
                target = center
            }
        }
        let a: Double = 1 - exp(-(mode == Mode.scatter ? 5.0 : 2.0) * dt)
        velocity = velocity + (desired - velocity) * a
        let resolved: (position: Vec2, normal: Vec2?) = map.resolve(center: center + velocity * dt, radius: 12)
        if let n: Vec2 = resolved.normal {
            let into: Double = velocity.dot(n)
            if into < 0 { velocity = velocity - n * into }
            if mode == Mode.cruise { target = center }
        }
        center = resolved.position
        if center.y < 14 { center.y = 14 }

        // I membri inseguono il proprio posto in formazione; in fuga la formazione si allarga e trema.
        let spread: Double = mode == Mode.scatter ? 1.7 : 1.0
        var i: Int = 0
        while i < members.count {
            if members[i].alive && !members[i].hooked {
                var m: SchoolMember = members[i]
                m.phase += dt * (mode == Mode.scatter ? 9 : 2.2)
                let wobble: Vec2 = Vec2(cos(m.phase) * 2.5, sin(m.phase * 1.3) * 2.0)
                let goal: Vec2 = center + m.offset * spread + wobble
                let k: Double = 1 - exp(-(mode == Mode.scatter ? 7.0 : 3.5) * dt)
                let before: Vec2 = m.position
                m.position = m.position + (goal - m.position) * k
                m.velocity = dt > 0 ? (m.position - before) / dt : Vec2.zero
                if m.position.y < 8 { m.position.y = 8 }
                if abs(m.velocity.x) > 3 { m.facingRight = m.velocity.x > 0 }
                members[i] = m
            }
            i += 1
        }
    }
}
