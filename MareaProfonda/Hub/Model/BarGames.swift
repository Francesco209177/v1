import Foundation

// MARK: - Bocce

/// Una boccia sul campo. `owner`: 0 Tecla, 1 Don Pinuccio, 2 il pallino.
struct BocceBall: Equatable {
    var position: Vec2
    var velocity: Vec2 = Vec2.zero
    let owner: Int
    let radius: Double

    var isMoving: Bool { return velocity.lengthSquared > 1 }
}

enum BocceEvent: Equatable {
    case thrown(owner: Int)
    case clack(at: Vec2)
    /// Tutte le bocce sono ferme: tocca a `next`, o la mano è finita (nil).
    case settled(next: Int?)
}

/// Una mano di bocce contro Don Pinuccio, vista dall'alto: quattro bocce a testa,
/// vince chi ne ha di più vicine al pallino. Coordinate in unità di campo: x larghezza, y in avanti.
struct BocceSim {
    static let width: Double = 72
    static let length: Double = 250
    static let ballsEach: Int = 4
    static let friction: Double = 64
    static let minSpeed: Double = 96
    static let maxSpeed: Double = 196

    private(set) var balls: [BocceBall] = []
    /// Di chi è il turno: 0 Tecla, 1 Don Pinuccio.
    private(set) var turn: Int = 0
    private(set) var thrown: [Int] = [0, 0]
    private(set) var rolling: Bool = false
    private(set) var finished: Bool = false
    private var rng: SeededRNG

    init(seed: UInt64) {
        rng = SeededRNG(seed: seed &+ 2468)
        let pallino: Vec2 = Vec2(BocceSim.width / 2 + rng.range(-16, 16), rng.range(150, 205))
        balls.append(BocceBall(position: pallino, owner: 2, radius: 2.4))
    }

    var pallino: Vec2 { return balls[0].position }
    var startPoint: Vec2 { return Vec2(BocceSim.width / 2, 12) }

    static func speed(power: Double) -> Double {
        return minSpeed + (maxSpeed - minSpeed) * MathUtil.clamp(power, 0, 1)
    }

    /// Lancia la boccia di chi è di turno. `angle` in radianti da dritto (positivo = destra), `power` da 0 a 1.
    mutating func throwBall(angle: Double, power: Double) -> [BocceEvent] {
        if rolling || finished || thrown[turn] >= BocceSim.ballsEach { return [] }
        let a: Double = MathUtil.clamp(angle, -0.5, 0.5)
        let v: Vec2 = Vec2(sin(a), cos(a)) * BocceSim.speed(power: power)
        balls.append(BocceBall(position: startPoint, velocity: v, owner: turn, radius: 4.0))
        thrown[turn] += 1
        rolling = true
        return [BocceEvent.thrown(owner: turn)]
    }

    /// Distanza dal pallino della boccia migliore di un giocatore.
    func bestDistance(owner: Int) -> Double {
        var best: Double = Double.greatestFiniteMagnitude
        for ball in balls where ball.owner == owner { best = min(best, ball.position.distance(to: pallino)) }
        return best
    }

    /// Chi sta vincendo e con quanti punti: una per ogni boccia più vicina della migliore avversaria.
    func score() -> (winner: Int, points: Int) {
        let d0: Double = bestDistance(owner: 0)
        let d1: Double = bestDistance(owner: 1)
        if d0 == d1 { return (winner: 0, points: 0) }
        let winner: Int = d0 < d1 ? 0 : 1
        let rival: Double = winner == 0 ? d1 : d0
        var points: Int = 0
        for ball in balls where ball.owner == winner && ball.position.distance(to: pallino) < rival { points += 1 }
        return (winner: winner, points: points)
    }

    /// Il tiro di Don Pinuccio: mira al pallino, con la mano che trema un po'.
    mutating func rivalThrow(skill: Double) -> (angle: Double, power: Double) {
        let d: Vec2 = pallino - startPoint
        let wobble: Double = (1 - MathUtil.clamp(skill, 0, 1)) * 0.5 + 0.03
        let angle: Double = atan2(d.x, d.y) + rng.range(-wobble, wobble) * 0.22
        // Con attrito costante una boccia percorre v² / 2a.
        let need: Double = (2 * BocceSim.friction * max(d.length - 6, 10)).squareRoot() * (1 + rng.range(-wobble, wobble) * 0.20)
        let power: Double = (need - BocceSim.minSpeed) / (BocceSim.maxSpeed - BocceSim.minSpeed)
        return (angle: angle, power: MathUtil.clamp(power, 0, 1))
    }

    mutating func step(dt: Double) -> [BocceEvent] {
        var events: [BocceEvent] = []
        if !rolling || dt <= 0 { return events }
        var i: Int = 0
        while i < balls.count {
            var b: BocceBall = balls[i]
            let speed: Double = b.velocity.length
            if speed > 0 {
                let next: Double = max(0, speed - BocceSim.friction * dt)
                b.velocity = next < 1.5 ? Vec2.zero : b.velocity * (next / speed)
                b.position += b.velocity * dt
                // Sponde: ai lati e in fondo si rimbalza piano.
                if b.position.x < b.radius {
                    b.position.x = b.radius
                    b.velocity.x = abs(b.velocity.x) * 0.5
                }
                if b.position.x > BocceSim.width - b.radius {
                    b.position.x = BocceSim.width - b.radius
                    b.velocity.x = -abs(b.velocity.x) * 0.5
                }
                if b.position.y > BocceSim.length - b.radius {
                    b.position.y = BocceSim.length - b.radius
                    b.velocity.y = -abs(b.velocity.y) * 0.35
                }
                if b.position.y < b.radius {
                    b.position.y = b.radius
                    b.velocity.y = abs(b.velocity.y) * 0.35
                }
                balls[i] = b
            }
            i += 1
        }
        // Urti tra bocce: si scambiano la spinta lungo la linea dei centri; il pallino è più leggero.
        i = 0
        while i < balls.count {
            var j: Int = i + 1
            while j < balls.count {
                let d: Vec2 = balls[j].position - balls[i].position
                let dist: Double = d.length
                let touch: Double = balls[i].radius + balls[j].radius
                if dist < touch && dist > 1e-6 {
                    let n: Vec2 = d / dist
                    let mi: Double = balls[i].owner == 2 ? 0.45 : 1.0
                    let mj: Double = balls[j].owner == 2 ? 0.45 : 1.0
                    let relative: Double = (balls[i].velocity - balls[j].velocity).dot(n)
                    if relative > 0 {
                        let impulse: Double = 1.8 * relative / (1 / mi + 1 / mj)
                        balls[i].velocity -= n * (impulse / mi)
                        balls[j].velocity += n * (impulse / mj)
                        if relative > 12 { events.append(BocceEvent.clack(at: balls[i].position + n * balls[i].radius)) }
                    }
                    let overlap: Double = touch - dist
                    balls[i].position -= n * (overlap * 0.5)
                    balls[j].position += n * (overlap * 0.5)
                }
                j += 1
            }
            i += 1
        }
        if !balls.contains(where: { $0.isMoving }) {
            for k in balls.indices { balls[k].velocity = Vec2.zero }
            rolling = false
            // Tira chi è più lontano dal pallino, finché ha bocce; poi l'altro.
            let far: Int = bestDistance(owner: 0) > bestDistance(owner: 1) ? 0 : 1
            if thrown[far] < BocceSim.ballsEach {
                turn = far
            } else if thrown[1 - far] < BocceSim.ballsEach {
                turn = 1 - far
            } else {
                finished = true
            }
            events.append(BocceEvent.settled(next: finished ? nil : turn))
        }
        return events
    }
}

// MARK: - Il cabinato: «Acchiappasarde»

struct ArcadeItem: Equatable {
    enum Kind: Equatable {
        case sarda
        case orata
        case riccio
    }

    let id: Int
    let kind: Kind
    var x: Double
    var y: Double
    let speed: Double
}

enum ArcadeEvent: Equatable {
    case caught(kind: ArcadeItem.Kind, points: Int)
    case stung
    case gameOver(score: Int)
}

/// Il vecchio cabinato del bar: sarde che piovono, una cassetta per prenderle, ricci da evitare.
/// Si va avanti finché restano vite; il mare, col tempo, butta giù più in fretta.
struct ArcadeSim {
    static let width: Double = 120
    static let height: Double = 150
    static let basketY: Double = 136
    static let basketHalf: Double = 12

    private(set) var basketX: Double = ArcadeSim.width / 2
    private(set) var items: [ArcadeItem] = []
    private(set) var score: Int = 0
    private(set) var lives: Int = 3
    private(set) var time: Double = 0
    private(set) var finished: Bool = false
    private var nextDrop: Double = 0.8
    private var nextId: Int = 1
    private var rng: SeededRNG

    init(seed: UInt64) {
        rng = SeededRNG(seed: seed &+ 1357)
    }

    /// Da 0 a 1: quanto è salita la difficoltà.
    var heat: Double { return MathUtil.clamp(time / 80, 0, 1) }

    mutating func step(moveX: Double, dt: Double) -> [ArcadeEvent] {
        var events: [ArcadeEvent] = []
        if finished || dt <= 0 { return events }
        time += dt
        basketX = MathUtil.clamp(basketX + MathUtil.clamp(moveX, -1, 1) * 128 * dt, ArcadeSim.basketHalf, ArcadeSim.width - ArcadeSim.basketHalf)

        nextDrop -= dt
        if nextDrop <= 0 {
            nextDrop = MathUtil.lerp(0.95, 0.36, heat) * rng.range(0.8, 1.2)
            let roll: Double = rng.unit()
            let kind: ArcadeItem.Kind = roll < 0.20 + heat * 0.08 ? ArcadeItem.Kind.riccio : (roll > 0.93 ? ArcadeItem.Kind.orata : ArcadeItem.Kind.sarda)
            let speed: Double = MathUtil.lerp(44, 112, heat) * rng.range(0.85, 1.2) * (kind == ArcadeItem.Kind.orata ? 1.25 : 1)
            items.append(ArcadeItem(id: nextId, kind: kind, x: rng.range(8, ArcadeSim.width - 8), y: -6, speed: speed))
            nextId += 1
        }

        var i: Int = items.count - 1
        while i >= 0 {
            items[i].y += items[i].speed * dt
            let item: ArcadeItem = items[i]
            if item.y >= ArcadeSim.basketY - 5 && item.y <= ArcadeSim.basketY + 7 && abs(item.x - basketX) <= ArcadeSim.basketHalf + 3 {
                switch item.kind {
                case .sarda:
                    score += 1
                    events.append(ArcadeEvent.caught(kind: item.kind, points: 1))
                case .orata:
                    score += 5
                    events.append(ArcadeEvent.caught(kind: item.kind, points: 5))
                case .riccio:
                    lives -= 1
                    events.append(ArcadeEvent.stung)
                }
                items.remove(at: i)
            } else if item.y > ArcadeSim.height + 8 {
                items.remove(at: i)
            }
            i -= 1
        }
        if lives <= 0 {
            lives = 0
            finished = true
            events.append(ArcadeEvent.gameOver(score: score))
        }
        return events
    }
}

// MARK: - Sfida a ritmo contro Chef Lustri

enum RhythmJudgement: Equatable {
    case perfect
    case good
    case miss
}

struct RhythmNote: Equatable {
    /// Istante in cui va colpita, in secondi dall'inizio della musica.
    let time: Double
    /// 0 = coltello (tasto dell'arpione), 1 = padella (tasto azione).
    let lane: Int
    var judgement: RhythmJudgement? = nil
}

enum RhythmEvent: Equatable {
    case hit(lane: Int, judgement: RhythmJudgement)
    case missed(lane: Int)
    /// Tasto premuto a vuoto.
    case stray(lane: Int)
    case beat(Int)
    case finished
}

/// Gara di coltello a tempo: le note scorrono verso la linea, si preme il tasto della corsia giusta
/// quando ci arrivano. Vince chi fa più punti; Lustri ne fa una quota fissa del massimo.
struct RhythmSim {
    static let perfectWindow: Double = 0.075
    static let goodWindow: Double = 0.16
    static let leadIn: Double = 2.4

    let bpm: Double
    private(set) var notes: [RhythmNote]
    /// Parte negativo: qualche battuta a vuoto per prendere il tempo.
    private(set) var time: Double = -RhythmSim.leadIn
    private(set) var score: Int = 0
    private(set) var combo: Int = 0
    private(set) var bestCombo: Int = 0
    private(set) var perfects: Int = 0
    private(set) var goods: Int = 0
    private(set) var misses: Int = 0
    private(set) var finished: Bool = false
    private var lastBeat: Int = Int.min

    init(seed: UInt64, bars: Int = 14, bpm: Double = 100) {
        self.bpm = bpm
        notes = RhythmSim.chart(seed: seed, bars: bars, bpm: bpm)
    }

    var beatLength: Double { return 60 / bpm }
    var duration: Double { return (notes.last?.time ?? 0) + 1.6 }
    var maxScore: Int { return notes.count * 100 }

    /// Punteggio di Lustri: bravo, ma battibile.
    func rivalScore(skill: Double) -> Int {
        return Int((Double(maxScore) * MathUtil.clamp(skill, 0, 1) / 10).rounded()) * 10
    }

    /// Spartito generato dal seme: ogni battuta prende una figura da un piccolo repertorio, via via più fitto.
    static func chart(seed: UInt64, bars: Int, bpm: Double) -> [RhythmNote] {
        var rng: SeededRNG = SeededRNG(seed: seed &+ 8642)
        let beat: Double = 60 / bpm
        // Figure in ottavi (8 per battuta): 0 pausa, 1 coltello, 2 padella.
        let easy: [[Int]] = [[1, 0, 0, 0, 2, 0, 0, 0], [1, 0, 2, 0, 1, 0, 2, 0], [1, 0, 0, 0, 1, 0, 2, 0], [2, 0, 1, 0, 0, 0, 1, 0]]
        let hard: [[Int]] = [[1, 0, 1, 0, 2, 0, 2, 0], [1, 1, 0, 0, 2, 0, 1, 0], [2, 0, 1, 1, 0, 0, 2, 0], [1, 0, 2, 0, 1, 1, 2, 0], [1, 0, 0, 2, 0, 0, 1, 0]]
        var out: [RhythmNote] = []
        var bar: Int = 0
        while bar < bars {
            let pool: [[Int]] = bar < 3 ? easy : (bar < bars / 2 ? easy + hard : hard)
            let figure: [Int] = rng.pick(pool) ?? easy[0]
            var step: Int = 0
            while step < figure.count {
                if figure[step] != 0 {
                    out.append(RhythmNote(time: (Double(bar) * 4 + Double(step) * 0.5) * beat, lane: figure[step] - 1))
                }
                step += 1
            }
            bar += 1
        }
        return out
    }

    /// - Parameter pressed: per ogni corsia, true se il tasto è stato premuto in questo fotogramma.
    mutating func step(dt: Double, pressed: [Bool]) -> [RhythmEvent] {
        var events: [RhythmEvent] = []
        if finished || dt <= 0 { return events }
        time += dt
        let beat: Int = Int((time / beatLength).rounded(.down))
        if beat != lastBeat {
            lastBeat = beat
            events.append(RhythmEvent.beat(beat))
        }

        var lane: Int = 0
        while lane < 2 {
            if lane < pressed.count && pressed[lane] {
                // La nota non ancora giudicata più vicina in questa corsia.
                var best: Int? = nil
                var bestError: Double = RhythmSim.goodWindow
                var i: Int = 0
                while i < notes.count {
                    if notes[i].judgement == nil && notes[i].lane == lane {
                        let error: Double = abs(notes[i].time - time)
                        if error <= bestError {
                            bestError = error
                            best = i
                        }
                        if notes[i].time > time + RhythmSim.goodWindow { break }
                    }
                    i += 1
                }
                if let index: Int = best {
                    let judgement: RhythmJudgement = bestError <= RhythmSim.perfectWindow ? RhythmJudgement.perfect : RhythmJudgement.good
                    notes[index].judgement = judgement
                    combo += 1
                    bestCombo = max(bestCombo, combo)
                    if judgement == RhythmJudgement.perfect {
                        perfects += 1
                        score += 100
                    } else {
                        goods += 1
                        score += 50
                    }
                    events.append(RhythmEvent.hit(lane: lane, judgement: judgement))
                } else {
                    combo = 0
                    events.append(RhythmEvent.stray(lane: lane))
                }
            }
            lane += 1
        }

        var i: Int = 0
        while i < notes.count {
            if notes[i].judgement == nil && time > notes[i].time + RhythmSim.goodWindow {
                notes[i].judgement = RhythmJudgement.miss
                misses += 1
                combo = 0
                events.append(RhythmEvent.missed(lane: notes[i].lane))
            }
            if notes[i].time > time + 1 { break }
            i += 1
        }
        if time >= duration {
            finished = true
            events.append(RhythmEvent.finished)
        }
        return events
    }
}
