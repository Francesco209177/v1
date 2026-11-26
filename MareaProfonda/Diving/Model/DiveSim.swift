import Foundation

// MARK: - Bottino

/// Un pesce catturato. Le stelle dicono com'è stato preso: 3 vivo (rete, soporifero),
/// 2 colpo pulito d'arpione, 1 pesce rovinato da troppi colpi.
struct CatchItem: Codable, Equatable {
    let speciesId: String
    let stars: Int
    let weight: Double
}

/// La sacca dell'immersione: pesci e materiali raccolti, con un limite di peso.
/// Oltre il limite si può ancora caricare, ma si nuota sempre più lenti.
struct DiveBag: Codable, Equatable {
    var fish: [CatchItem] = []
    var materials: [String: Int] = [:]
    /// Specie protette fotografate in questa immersione.
    var photos: [String] = []
    var maxWeight: Double = 10

    static let materialWeights: [String: Double] = ["riccio": 0.3, "conchiglia": 0.2, "alga": 0.1]

    var totalWeight: Double {
        var w: Double = 0
        for item in fish { w += item.weight }
        for (kind, count) in materials { w += (DiveBag.materialWeights[kind] ?? 0.2) * Double(count) }
        return w
    }

    var loadRatio: Double { return maxWeight > 0 ? totalWeight / maxWeight : 0 }

    /// 1 finché si resta nel limite; cala fino a 0.4 con il sovraccarico.
    var speedFactor: Double {
        let ratio: Double = loadRatio
        if ratio <= 1 { return 1 }
        return max(0.4, 1 - (ratio - 1) * 1.5)
    }

    var isEmpty: Bool { return fish.isEmpty && materials.isEmpty && photos.isEmpty }
}

// MARK: - Punti di comparsa e oggetti da raccogliere

struct SpawnPoint: Equatable {
    let speciesId: String
    let position: Vec2
    let count: Int
    /// Quanti ne restano vivi: i pesci presi non ricompaiono nella stessa immersione.
    var remaining: Int
    var active: Bool = false
}

struct PickupPoint: Equatable {
    enum Kind: String {
        case riccio
        case conchiglia
        case alga
        /// Campana d'aria: riempie il Fiato una volta per immersione.
        case campana
    }

    let kind: Kind
    let position: Vec2
    var taken: Bool = false
}

/// Distribuisce pesci e oggetti nella mappa in modo deterministico dal seme.
enum SpawnPlanner {
    static func plan(map: CaveMap, catalog: FishCatalog, seed: UInt64, night: Bool, maxDepthMeters: Double) -> (spawns: [SpawnPoint], pickups: [PickupPoint]) {
        var rng: SeededRNG = SeededRNG(seed: seed &+ 9001)
        var spawns: [SpawnPoint] = []
        var pickups: [PickupPoint] = []
        let ts: Double = Double(map.tileSize)
        let limit: Double = min(maxDepthMeters, Double(map.rows) - 6)

        // Pesci: una griglia larga 9 metri e alta 8, con posizione sfalsata.
        var depth: Double = 6
        while depth < limit {
            var column: Double = 4
            while column < Double(map.cols) - 4 {
                let candidate: Vec2 = Vec2((column + rng.range(-3, 3)) * ts, (depth + rng.range(-3, 3)) * ts)
                let roll: Double = rng.unit()
                if roll < 0.58 && candidate.y > 40 && map.isOpen(candidate, clearance: 16) {
                    let options: [FishSpecies] = catalog.candidates(depthMeters: candidate.y / ts, night: night)
                    if let index: Int = rng.pickWeighted(options.map { $0.spawnWeight }) {
                        let species: FishSpecies = options[index]
                        var position: Vec2 = candidate
                        var valid: Bool = true
                        if species.livesOnFloor {
                            // Le specie di fondo stanno posate sulla roccia.
                            if let floor: Double = floorBelow(map, candidate, maxDrop: 110) {
                                position = Vec2(candidate.x, floor - species.radius * 0.7)
                            } else {
                                valid = false
                            }
                        }
                        if valid {
                            let count: Int = rng.int(species.schoolMin, species.schoolMax)
                            spawns.append(SpawnPoint(speciesId: species.id, position: position, count: count, remaining: count))
                        }
                    }
                }
                column += 9
            }
            depth += 8
        }

        // Oggetti sul fondo: ricci, conchiglie, alghe.
        depth = 5
        while depth < limit {
            var column: Double = 3
            while column < Double(map.cols) - 3 {
                let candidate: Vec2 = Vec2((column + rng.range(-2, 2)) * ts, (depth + rng.range(-2, 2)) * ts)
                if rng.chance(0.42) && map.isOpen(candidate, clearance: 6), let floor: Double = floorBelow(map, candidate, maxDrop: 150) {
                    let roll: Double = rng.unit()
                    let shallow: Bool = depth < 40
                    let kind: PickupPoint.Kind
                    if shallow {
                        kind = roll < 0.42 ? PickupPoint.Kind.alga : (roll < 0.78 ? PickupPoint.Kind.conchiglia : PickupPoint.Kind.riccio)
                    } else {
                        kind = roll < 0.50 ? PickupPoint.Kind.riccio : (roll < 0.82 ? PickupPoint.Kind.conchiglia : PickupPoint.Kind.alga)
                    }
                    pickups.append(PickupPoint(kind: kind, position: Vec2(candidate.x, floor - 3)))
                }
                column += 4
            }
            depth += 4
        }

        // Campane d'aria: una per ogni corda di risalita sotto la superficie.
        for prop in map.props where prop.kind == MapProp.Kind.rope && prop.variant != 0 && prop.y / ts < limit {
            pickups.append(PickupPoint(kind: PickupPoint.Kind.campana, position: Vec2(prop.x, prop.y)))
        }
        return (spawns: spawns, pickups: pickups)
    }

    /// Quota del fondo sotto un punto, se c'è roccia entro `maxDrop` pixel.
    static func floorBelow(_ map: CaveMap, _ p: Vec2, maxDrop: Double) -> Double? {
        var y: Double = p.y
        while y < p.y + maxDrop {
            if map.density(x: p.x, y: y) > 0.5 { return y }
            y += 2
        }
        return nil
    }
}

// MARK: - Arpione

struct HarpoonTuning: Codable, Equatable {
    /// Gittata in pixel.
    var range: Double = 150
    var speed: Double = 430
    var damage: Double = 10
    var retractSpeed: Double = 540
    var cooldown: Double = 0.28
    /// Avanzamento del recupero al secondo, per un pesce senza resistenza.
    var reelRate: Double = 0.44
}

/// Riferimento stabile a un bersaglio (gli indici cambierebbero quando i pesci escono di scena).
enum TargetRef: Equatable {
    case fish(id: Int)
    case member(school: Int, index: Int)
    /// Il punto debole del boss (o la sua esca).
    case boss
}

enum HarpoonPhase: Equatable {
    case ready
    case flying
    /// Pesce agganciato: è in corso il tiro alla lenza.
    case reeling
    case retracting
    case cooldown
}

struct HarpoonState: Equatable {
    var phase: HarpoonPhase = HarpoonPhase.ready
    var tip: Vec2 = Vec2.zero
    var direction: Vec2 = Vec2(1, 0)
    var traveled: Double = 0
    var timer: Double = 0
    var hooked: TargetRef? = nil
    var carried: CatchItem? = nil
    // Tiro alla lenza
    /// Da 0 a 1: a 1 il pesce è preso.
    var progress: Double = 0
    /// Da 0 a 1: a 1 la lenza si spezza.
    var tension: Double = 0
    var ropeLength: Double = 0
    var surgeIn: Double = 2
    var surgeLeft: Double = 0

    /// Il pesce sta dando uno strattone: tirare adesso fa salire la tensione molto in fretta.
    var isSurging: Bool { return surgeLeft > 0 }
    var isOut: Bool { return phase != HarpoonPhase.ready && phase != HarpoonPhase.cooldown }
}

// MARK: - Eventi e comandi

enum DiveEvent: Equatable {
    case harpoonFired
    case harpoonHitRock(at: Vec2)
    case fishHit(at: Vec2, damage: Double, killed: Bool)
    case hookStarted(at: Vec2)
    case surge
    case lineBroke
    case caught(item: CatchItem, at: Vec2)
    case diverHurt(damage: Double, at: Vec2)
    case telegraph(at: Vec2)
    case pickedUp(kind: PickupPoint.Kind, at: Vec2)
    case breathRefilled
    case breathLow
    case pressure
    case dashed
    case hitWall(speed: Double)
    case fainted
    /// Arma secondaria usata: tipo, punto d'effetto e raggio (0 se non ha area).
    case secondaryUsed(kind: WeaponKind, at: Vec2, radius: Double)
    case outOfAmmo
    case asleep(at: Vec2)
    case photographed(species: String)
    // Scontri con i boss
    case bossTelegraph(at: Vec2, attack: String)
    case bossAttack(String)
    case bossHit(at: Vec2, damage: Double)
    /// Colpo fermato dalla corazza.
    case bossBlocked(at: Vec2)
    case bossPhase(Int)
    case bossStunned(at: Vec2)
    case quake
    case blast(at: Vec2, radius: Double)
    case bossDying
    case bossDefeated
    case bellReady
}

/// Com'è finita un'immersione.
struct DiveOutcome: Equatable {
    var bag: DiveBag = DiveBag()
    var deepest: Double = 0
    var fainted: Bool = false
    /// Boss affrontato in questa immersione, e se è stato sconfitto.
    var boss: String? = nil
    var bossDefeated: Bool = false
}

struct DiveInput {
    /// Direzione di nuoto in coordinate di mappa (y verso il basso).
    var move: Vec2 = Vec2.zero
    var dash: Bool = false
    /// Direzione di tiro: valorizzata nel fotogramma in cui parte il colpo.
    var fire: Vec2? = nil
    /// Tasto dell'arpione tenuto premuto: recupera la lenza.
    var reelHeld: Bool = false
    var interact: Bool = false
    /// Direzione dell'arma secondaria, nel fotogramma in cui viene usata.
    var secondary: Vec2? = nil
}

/// Che cosa può fare Tecla qui col tasto azione.
enum DiveInteraction: Equatable {
    case pickup(index: Int)
    case bell(index: Int)
    case boat
    /// Specie protetta a tiro di macchina fotografica.
    case photo(fishId: Int)
}

/// Colpo in volo di un'arma secondaria (dardo, asta, bomba).
struct SecondaryShot: Equatable {
    let kind: WeaponKind
    var position: Vec2
    let direction: Vec2
    var traveled: Double = 0
}

// MARK: - Simulazione

/// Tutta la logica di un'immersione, senza grafica: Tecla, pesci, arpione, Fiato, sacca.
/// La scena la fa avanzare e ne disegna lo stato; i test la fanno girare da sola.
struct DiveSim {
    let map: CaveMap
    let catalog: FishCatalog
    let night: Bool
    var tuning: DiverTuning = DiverTuning()
    var harpoonTuning: HarpoonTuning = HarpoonTuning()

    var diver: DiverState
    var fish: [FishBody] = []
    var schools: [School] = []
    var schoolIds: [Int] = []
    var spawns: [SpawnPoint]
    var pickups: [PickupPoint]
    var harpoon: HarpoonState = HarpoonState()
    var bag: DiveBag = DiveBag()

    var breath: Double
    var breathMax: Double
    /// Profondità massima sopportata dalla muta, in metri.
    var maxSafeDepth: Double
    var invulnerable: Double = 0
    var elapsed: Double = 0
    var deepest: Double = 0
    var fainted: Bool = false
    /// Posizione della barca in superficie.
    let boat: Vec2
    /// true se le transizioni dei pesci sono decise fuori (dalle macchine a stati di GameplayKit).
    var usesExternalBrains: Bool = false
    /// Arma secondaria portata in immersione, colpi rimasti, colpi in volo.
    var secondary: WeaponInfo? = nil
    var ammo: Int = 0
    var shots: [SecondaryShot] = []
    private var secondaryCooldown: Double = 0
    /// Scontro con un boss: la sala, il boss, ciò che ha messo in acqua.
    private(set) var arena: Arena? = nil
    var boss: BossBody? = nil
    var hazards: [Hazard] = []
    /// Tecla è dentro una nuvola d'inchiostro: nuota piano e vede poco.
    private(set) var inked: Bool = false
    private(set) var bossDefeated: Bool = false
    private var nextHazardId: Int = 1
    private var bellClocks: [Double] = []
    static let bellRefill: Double = 20

    private var rng: SeededRNG
    private var nextId: Int = 1
    private var fishIds: [Int] = []
    private var lowBreathWarned: Bool = false
    private var pressureClock: Double = 0

    static let activationRadius: Double = 430
    static let deactivationRadius: Double = 720
    static let diverHitRadius: Double = 6.5

    init(map: CaveMap, catalog: FishCatalog, seed: UInt64, night: Bool, startDepthMeters: Double,
         breathMax: Double = 120, maxSafeDepth: Double = 110, bagWeight: Double = 10) {
        self.map = map
        self.catalog = catalog
        self.night = night
        let plan: (spawns: [SpawnPoint], pickups: [PickupPoint]) = SpawnPlanner.plan(map: map, catalog: catalog, seed: seed, night: night, maxDepthMeters: maxSafeDepth + 12)
        spawns = plan.spawns
        pickups = plan.pickups
        boat = map.channelPoint(depthMeters: 0)
        let start: Vec2 = map.channelPoint(depthMeters: max(startDepthMeters, 0.6))
        diver = DiverState(position: map.nearestOpenPoint(to: start, clearance: 10))
        breath = breathMax
        self.breathMax = breathMax
        self.maxSafeDepth = maxSafeDepth
        rng = SeededRNG(seed: seed &+ 31337)
        bag.maxWeight = bagWeight
    }

    /// Immersione in un'arena: niente pesci, il boss al centro, campane d'aria che si ricaricano.
    init(map: CaveMap, arena: Arena, boss info: BossInfo, catalog: FishCatalog, seed: UInt64,
         breathMax: Double = 120, bagWeight: Double = 10) {
        self.map = map
        self.catalog = catalog
        night = false
        spawns = []
        var bells: [PickupPoint] = []
        for p in arena.bells { bells.append(PickupPoint(kind: PickupPoint.Kind.campana, position: p)) }
        pickups = bells
        bellClocks = [Double](repeating: 0, count: bells.count)
        boat = map.channelPoint(depthMeters: 0)
        diver = DiverState(position: arena.diverStart)
        breath = breathMax
        self.breathMax = breathMax
        maxSafeDepth = Double(map.rows)
        rng = SeededRNG(seed: seed &+ 31337)
        bag.maxWeight = bagWeight
        self.arena = arena
        boss = BossBody(info: info, arena: arena, seed: seed)
        deepest = info.depth
    }

    /// Aggiunge un pesce in un punto preciso: serve ai test e alle scene preparate (boss, tutorial).
    @discardableResult
    mutating func addFishForTesting(species: FishSpecies, at position: Vec2) -> Int {
        fish.append(FishBody(species: species, spawnIndex: -1, position: position, seed: UInt64(nextId) &* 7919))
        fishIds.append(nextId)
        nextId += 1
        return nextId - 1
    }

    /// Equipaggia l'arma secondaria per questa immersione.
    mutating func equip(_ weapon: WeaponInfo?) {
        secondary = weapon
        ammo = weapon?.ammo ?? 0
    }

    // MARK: Accesso per identificativo

    func fishId(at index: Int) -> Int { return fishIds[index] }

    func fishIndex(id: Int) -> Int? { return fishIds.firstIndex(of: id) }

    func position(of ref: TargetRef) -> Vec2? {
        switch ref {
        case .fish(let id):
            guard let i: Int = fishIndex(id: id) else { return nil }
            return fish[i].position
        case .member(let school, let index):
            guard let s: Int = schoolIds.firstIndex(of: school), index < schools[s].members.count else { return nil }
            return schools[s].members[index].position
        case .boss:
            return boss?.weakPoint
        }
    }

    var breathRatio: Double { return breathMax > 0 ? MathUtil.clamp(breath / breathMax, 0, 1) : 0 }

    /// Cambia stato a un pesce (chiamata dalla macchina a stati esterna).
    mutating func enter(fishId id: Int, state: FishState) {
        guard let i: Int = fishIndex(id: id) else { return }
        FishAI.enter(&fish[i], state: state, diver: diver.position)
    }

    // MARK: Mira

    /// Bersaglio migliore entro un cono attorno alla direzione data.
    func bestTarget(direction: Vec2, cone: Double = 0.80) -> (ref: TargetRef, position: Vec2)? {
        let dir: Vec2 = direction.lengthSquared > 1e-6 ? direction.normalized() : Vec2(diver.facingRight ? 1 : -1, 0)
        let range: Double = harpoonTuning.range * 0.96
        var best: (ref: TargetRef, position: Vec2)? = nil
        var bestScore: Double = Double.greatestFiniteMagnitude

        func consider(_ ref: TargetRef, _ p: Vec2) {
            let d: Vec2 = p - diver.position
            let dist: Double = d.length
            if dist < 6 || dist > range { return }
            let alignment: Double = d.dot(dir) / dist
            if alignment < cone { return }
            // Preferisce ciò che è più in asse, poi ciò che è più vicino.
            let score: Double = (1 - alignment) * 220 + dist
            if score < bestScore {
                bestScore = score
                best = (ref: ref, position: p)
            }
        }

        var i: Int = 0
        while i < fish.count {
            if fish[i].isTargetable && !fish[i].species.isProtected { consider(TargetRef.fish(id: fishIds[i]), fish[i].position) }
            i += 1
        }
        var s: Int = 0
        while s < schools.count {
            var m: Int = 0
            while m < schools[s].members.count {
                if schools[s].members[m].alive { consider(TargetRef.member(school: schoolIds[s], index: m), schools[s].members[m].position) }
                m += 1
            }
            s += 1
        }
        if let b: BossBody = boss {
            // La mira cerca il punto debole quando è scoperto, altrimenti l'esca della lanterna.
            if b.isVulnerable {
                consider(TargetRef.boss, b.weakPoint)
            } else if let lure: Vec2 = b.lure, b.lureExposed {
                consider(TargetRef.boss, lure)
            }
        }
        return best
    }

    /// Direzione in cui partirà l'arpione: quella scelta a mano, oppure verso il bersaglio migliore.
    func aimDirection(manual: Vec2?, autoAim: Bool) -> Vec2 {
        let facing: Vec2 = Vec2(diver.facingRight ? 1 : -1, 0).rotated(by: diver.facingRight ? -diver.tilt : diver.tilt)
        if let m: Vec2 = manual, m.lengthSquared > 0.04 {
            let dir: Vec2 = m.normalized()
            if autoAim, let target: (ref: TargetRef, position: Vec2) = bestTarget(direction: dir, cone: 0.93) {
                return (target.position - diver.position).normalized()
            }
            return dir
        }
        if autoAim, let target: (ref: TargetRef, position: Vec2) = bestTarget(direction: facing, cone: 0.55) {
            return (target.position - diver.position).normalized()
        }
        return facing
    }

    /// Che cosa c'è a portata di mano.
    func interaction() -> DiveInteraction? {
        var best: Int? = nil
        var bestDistance: Double = 26
        var i: Int = 0
        while i < pickups.count {
            if !pickups[i].taken {
                let d: Double = pickups[i].position.distance(to: diver.position)
                if d < bestDistance {
                    bestDistance = d
                    best = i
                }
            }
            i += 1
        }
        if let index: Int = best {
            return pickups[index].kind == PickupPoint.Kind.campana ? DiveInteraction.bell(index: index) : DiveInteraction.pickup(index: index)
        }
        if arena == nil && diver.atSurface && abs(diver.position.x - boat.x) < 44 { return DiveInteraction.boat }
        var f: Int = 0
        while f < fish.count {
            let species: FishSpecies = fish[f].species
            if species.isProtected && fish[f].isAlive && !bag.photos.contains(species.itemId)
                && fish[f].position.distance(to: diver.position) < 52 {
                return DiveInteraction.photo(fishId: fishIds[f])
            }
            f += 1
        }
        return nil
    }

    // MARK: Passo

    mutating func step(input: DiveInput, dt: Double) -> [DiveEvent] {
        var events: [DiveEvent] = []
        if fainted || dt <= 0 { return events }
        elapsed += dt
        if invulnerable > 0 { invulnerable = max(0, invulnerable - dt) }

        // Tecla
        let reeling: Bool = harpoon.phase == HarpoonPhase.reeling
        let factor: Double = bag.speedFactor * (reeling ? 0.55 : 1.0) * (inked ? 0.6 : 1.0)
        let motion: DiverStepResult = DiverMotion.step(&diver, input: input.move, wantsDash: input.dash && breath > 6, speedFactor: factor, map: map, tuning: tuning, dt: dt)
        if motion.startedDash {
            breath -= 2.5
            events.append(DiveEvent.dashed)
        }
        if motion.hitWall && motion.impactSpeed > 70 { events.append(DiveEvent.hitWall(speed: motion.impactSpeed)) }
        let depth: Double = diver.depthMeters
        if depth > deepest { deepest = depth }

        // Fiato: in superficie si riprende, sott'acqua cala più in fretta scendendo.
        if arena != nil {
            // Nelle sale dei boss si resta in fondo: il Fiato cala piano e si riprende alle campane.
            breath -= 0.8 * dt
        } else if diver.atSurface {
            breath = min(breathMax, breath + 45 * dt)
            lowBreathWarned = false
        } else {
            var drain: Double = 0.62 + depth / 170
            if depth > maxSafeDepth {
                drain *= 1 + (depth - maxSafeDepth) * 0.45
                pressureClock -= dt
                if pressureClock <= 0 {
                    pressureClock = 2.5
                    events.append(DiveEvent.pressure)
                }
            }
            breath -= drain * dt
        }

        updateActivation()

        // Pesci singoli
        var i: Int = 0
        while i < fish.count {
            if !usesExternalBrains,
               let next: FishState = FishAI.think(fish[i], diver: diver.position, diverSpeed: diver.velocity.length),
               FishAI.isValid(from: fish[i].state, to: next) {
                FishAI.enter(&fish[i], state: next, diver: diver.position)
            }
            if let event: FishEvent = FishAI.act(&fish[i], diver: diver.position, diverRadius: DiveSim.diverHitRadius, map: map, dt: dt) {
                switch event {
                case .hitDiver(let damage, let at):
                    if invulnerable <= 0 {
                        breath -= damage
                        invulnerable = 0.9
                        // Rinculo lontano dal pesce.
                        let away: Vec2 = diver.position - at
                        if away.lengthSquared > 1e-6 { diver.velocity = away.normalized() * 110 }
                        events.append(DiveEvent.diverHurt(damage: damage, at: diver.position))
                    }
                case .telegraph(let at):
                    events.append(DiveEvent.telegraph(at: at))
                }
            }
            i += 1
        }

        // Banchi
        var s: Int = 0
        while s < schools.count {
            schools[s].step(diver: diver.position, diverSpeed: diver.velocity.length, map: map, dt: dt)
            s += 1
        }

        stepHarpoon(input: input, dt: dt, events: &events)

        if input.interact, let what: DiveInteraction = interaction() {
            switch what {
            case .pickup(let index):
                pickups[index].taken = true
                bag.materials[pickups[index].kind.rawValue, default: 0] += 1
                events.append(DiveEvent.pickedUp(kind: pickups[index].kind, at: pickups[index].position))
            case .bell(let index):
                pickups[index].taken = true
                if index < bellClocks.count { bellClocks[index] = DiveSim.bellRefill }
                breath = breathMax
                lowBreathWarned = false
                events.append(DiveEvent.breathRefilled)
            case .boat:
                break
            case .photo(let id):
                if let index: Int = fishIndex(id: id) {
                    let species: String = fish[index].species.itemId
                    if !bag.photos.contains(species) { bag.photos.append(species) }
                    events.append(DiveEvent.photographed(species: species))
                }
            }
        }

        stepSecondary(input: input, dt: dt, events: &events)
        stepBoss(dt: dt, events: &events)

        if breath <= 0 {
            breath = 0
            fainted = true
            events.append(DiveEvent.fainted)
        } else if breathRatio < 0.25 && !lowBreathWarned {
            lowBreathWarned = true
            events.append(DiveEvent.breathLow)
        }
        return events
    }

    // MARK: Comparsa dei pesci

    private mutating func updateActivation() {
        var i: Int = 0
        while i < spawns.count {
            let d: Double = spawns[i].position.distance(to: diver.position)
            if !spawns[i].active && spawns[i].remaining > 0 && d < DiveSim.activationRadius {
                activate(i)
            } else if spawns[i].active && d > DiveSim.deactivationRadius {
                deactivate(i)
            }
            i += 1
        }
    }

    private mutating func activate(_ index: Int) {
        guard let species: FishSpecies = catalog.find(spawns[index].speciesId) else {
            spawns[index].remaining = 0
            return
        }
        spawns[index].active = true
        let seed: UInt64 = SeededRNG.combine([UInt64(index), map.seed, 77])
        if species.behavior == FishBehavior.school {
            schools.append(School(species: species, spawnIndex: index, position: spawns[index].position, count: spawns[index].remaining, seed: seed))
            schoolIds.append(nextId)
            nextId += 1
        } else {
            var n: Int = 0
            while n < spawns[index].remaining {
                let offset: Vec2 = Vec2(rng.range(-18, 18), rng.range(-10, 10))
                var position: Vec2 = spawns[index].position + (n == 0 ? Vec2.zero : offset)
                if !map.isOpen(position, clearance: species.radius) { position = spawns[index].position }
                fish.append(FishBody(species: species, spawnIndex: index, position: position, seed: seed &+ UInt64(n) &* 13))
                fishIds.append(nextId)
                nextId += 1
                n += 1
            }
        }
    }

    private mutating func deactivate(_ index: Int) {
        // Non si toglie di scena ciò che è agganciato all'arpione.
        if let hooked: TargetRef = harpoon.hooked {
            switch hooked {
            case .fish(let id):
                if let i: Int = fishIndex(id: id), fish[i].spawnIndex == index { return }
            case .member(let school, _):
                if let s: Int = schoolIds.firstIndex(of: school), schools[s].spawnIndex == index { return }
            case .boss:
                break
            }
        }
        spawns[index].active = false
        var i: Int = fish.count - 1
        while i >= 0 {
            if fish[i].spawnIndex == index {
                fish.remove(at: i)
                fishIds.remove(at: i)
            }
            i -= 1
        }
        var s: Int = schools.count - 1
        while s >= 0 {
            if schools[s].spawnIndex == index {
                spawns[index].remaining = schools[s].aliveCount
                schools.remove(at: s)
                schoolIds.remove(at: s)
            }
            s -= 1
        }
    }

    private mutating func removeFish(at index: Int) {
        let spawn: Int = fish[index].spawnIndex
        if spawn >= 0 && spawn < spawns.count { spawns[spawn].remaining = max(0, spawns[spawn].remaining - 1) }
        fish.remove(at: index)
        fishIds.remove(at: index)
    }

    // MARK: Arpione

    private static func stars(hits: Int) -> Int {
        return hits <= 2 ? 2 : 1
    }

    private mutating func stepHarpoon(input: DiveInput, dt: Double, events: inout [DiveEvent]) {
        switch harpoon.phase {
        case .ready:
            if let dir: Vec2 = input.fire, dir.lengthSquared > 1e-6 {
                harpoon.direction = dir.normalized()
                harpoon.tip = diver.position + harpoon.direction * 10
                harpoon.traveled = 0
                harpoon.hooked = nil
                harpoon.carried = nil
                harpoon.phase = HarpoonPhase.flying
                events.append(DiveEvent.harpoonFired)
            }
        case .flying:
            var remaining: Double = harpoonTuning.speed * dt
            while remaining > 0 && harpoon.phase == HarpoonPhase.flying {
                let stepLength: Double = min(remaining, 5)
                remaining -= stepLength
                harpoon.tip += harpoon.direction * stepLength
                harpoon.traveled += stepLength
                if map.isSolid(x: harpoon.tip.x, y: harpoon.tip.y) || harpoon.tip.y < 0 {
                    events.append(DiveEvent.harpoonHitRock(at: harpoon.tip))
                    harpoon.phase = HarpoonPhase.retracting
                    break
                }
                if hitSomething(events: &events) { break }
                if harpoon.traveled >= harpoonTuning.range {
                    harpoon.phase = HarpoonPhase.retracting
                }
            }
        case .reeling:
            stepReel(input: input, dt: dt, events: &events)
        case .retracting:
            let toDiver: Vec2 = diver.position - harpoon.tip
            let dist: Double = toDiver.length
            let move: Double = harpoonTuning.retractSpeed * dt
            if dist <= max(move, 12) {
                if let item: CatchItem = harpoon.carried {
                    bag.fish.append(item)
                    events.append(DiveEvent.caught(item: item, at: diver.position))
                }
                harpoon.carried = nil
                harpoon.hooked = nil
                harpoon.phase = HarpoonPhase.cooldown
                harpoon.timer = harpoonTuning.cooldown
            } else {
                harpoon.tip += toDiver / dist * move
            }
        case .cooldown:
            harpoon.timer -= dt
            if harpoon.timer <= 0 { harpoon.phase = HarpoonPhase.ready }
        }
    }

    /// Controlla se la punta ha toccato un pesce. Ritorna true se il volo è finito.
    private mutating func hitSomething(events: inout [DiveEvent]) -> Bool {
        let tip: Vec2 = harpoon.tip
        if hitBoss(at: tip, reach: 3, damage: harpoonTuning.damage, events: &events) {
            harpoon.phase = HarpoonPhase.retracting
            return true
        }
        var i: Int = 0
        while i < fish.count {
            if fish[i].isTargetable && !fish[i].species.isProtected && fish[i].position.distance(to: tip) < fish[i].species.radius + 3 {
                let species: FishSpecies = fish[i].species
                // Un pesce addormentato o stordito si prende al primo colpo, senza rovinarlo.
                if fish[i].state == FishState.asleep {
                    events.append(DiveEvent.fishHit(at: fish[i].position, damage: 0, killed: true))
                    if species.isEdible {
                        harpoon.carried = CatchItem(speciesId: species.itemId, stars: fish[i].sleepAlive ? 3 : 2, weight: species.weight)
                    }
                    removeFish(at: i)
                    harpoon.phase = HarpoonPhase.retracting
                    return true
                }
                let killed: Bool = FishAI.damage(&fish[i], amount: harpoonTuning.damage, diver: diver.position)
                events.append(DiveEvent.fishHit(at: fish[i].position, damage: harpoonTuning.damage, killed: killed))
                if killed {
                    if species.isEdible {
                        harpoon.carried = CatchItem(speciesId: species.itemId, stars: DiveSim.stars(hits: fish[i].hits), weight: species.weight)
                    }
                    removeFish(at: i)
                    harpoon.phase = HarpoonPhase.retracting
                } else if species.pull > 0.01 {
                    FishAI.enter(&fish[i], state: FishState.hooked, diver: diver.position)
                    harpoon.hooked = TargetRef.fish(id: fishIds[i])
                    harpoon.phase = HarpoonPhase.reeling
                    harpoon.progress = 0
                    harpoon.tension = 0.12
                    harpoon.ropeLength = max(fish[i].position.distance(to: diver.position), 24)
                    harpoon.surgeIn = rng.range(1.2, 2.1)
                    harpoon.surgeLeft = 0
                    events.append(DiveEvent.hookStarted(at: fish[i].position))
                } else {
                    harpoon.phase = HarpoonPhase.retracting
                }
                return true
            }
            i += 1
        }
        var s: Int = 0
        while s < schools.count {
            let species: FishSpecies = schools[s].species
            var m: Int = 0
            while m < schools[s].members.count {
                if schools[s].members[m].alive && schools[s].members[m].position.distance(to: tip) < species.radius + 3 {
                    schools[s].members[m].hp -= harpoonTuning.damage
                    let killed: Bool = schools[s].members[m].hp <= 0
                    events.append(DiveEvent.fishHit(at: schools[s].members[m].position, damage: harpoonTuning.damage, killed: killed))
                    if killed {
                        schools[s].members[m].alive = false
                        if species.isEdible {
                            harpoon.carried = CatchItem(speciesId: species.itemId, stars: 2, weight: species.weight)
                        }
                        let spawn: Int = schools[s].spawnIndex
                        if spawn >= 0 && spawn < spawns.count { spawns[spawn].remaining = max(0, spawns[spawn].remaining - 1) }
                    }
                    schools[s].scatter()
                    harpoon.phase = HarpoonPhase.retracting
                    return true
                }
                m += 1
            }
            s += 1
        }
        return false
    }

    /// Tiro alla lenza: tenere premuto recupera ma fa salire la tensione; durante gli strattoni bisogna mollare.
    private mutating func stepReel(input: DiveInput, dt: Double, events: inout [DiveEvent]) {
        guard let hooked: TargetRef = harpoon.hooked, case TargetRef.fish(let id) = hooked, let i: Int = fishIndex(id: id), fish[i].isAlive else {
            harpoon.hooked = nil
            harpoon.phase = HarpoonPhase.retracting
            return
        }
        let pull: Double = fish[i].species.pull

        if harpoon.surgeLeft > 0 {
            harpoon.surgeLeft -= dt
            if harpoon.surgeLeft <= 0 {
                harpoon.surgeLeft = 0
                harpoon.surgeIn = rng.range(1.5, 2.7) - pull * 0.5
            }
        } else {
            harpoon.surgeIn -= dt
            if harpoon.surgeIn <= 0 {
                harpoon.surgeLeft = 0.6 + pull * 0.4
                events.append(DiveEvent.surge)
            }
        }

        if input.reelHeld {
            harpoon.progress += harpoonTuning.reelRate * (1.15 - pull * 0.7) * dt
            harpoon.tension += (0.48 + pull * 0.55) * (harpoon.isSurging ? 2.7 : 1.0) * dt
        } else {
            harpoon.tension -= 0.95 * dt
            harpoon.progress -= pull * 0.10 * dt
        }
        harpoon.tension = max(0, harpoon.tension)
        harpoon.progress = max(0, harpoon.progress)

        // Il pesce tira dalla parte opposta; la lenza si accorcia man mano che lo si recupera.
        let toFish: Vec2 = fish[i].position - diver.position
        let dist: Double = max(toFish.length, 1e-3)
        let away: Vec2 = toFish / dist
        let effort: Double = fish[i].species.fleeSpeed * (0.35 + pull * 0.5) * (harpoon.isSurging ? 1.7 : 1.0)
        let wobble: Vec2 = Vec2(-away.y, away.x) * sin(elapsed * 6) * 0.5
        var next: Vec2 = fish[i].position + (away + wobble).normalized() * effort * dt
        let maxLength: Double = MathUtil.lerp(harpoon.ropeLength, 16, MathUtil.clamp(harpoon.progress, 0, 1))
        let fromDiver: Vec2 = next - diver.position
        if fromDiver.length > maxLength { next = diver.position + fromDiver.normalized() * maxLength }
        let resolved: (position: Vec2, normal: Vec2?) = map.resolve(center: next, radius: fish[i].species.radius * 0.8)
        fish[i].velocity = (resolved.position - fish[i].position) / dt
        fish[i].position = resolved.position
        fish[i].facingRight = away.x >= 0
        fish[i].stateTime += dt
        harpoon.tip = fish[i].position

        if harpoon.tension >= 1 {
            FishAI.enter(&fish[i], state: FishState.flee, diver: diver.position)
            harpoon.hooked = nil
            harpoon.phase = HarpoonPhase.retracting
            events.append(DiveEvent.lineBroke)
        } else if harpoon.progress >= 1 {
            let species: FishSpecies = fish[i].species
            if species.isEdible {
                harpoon.carried = CatchItem(speciesId: species.itemId, stars: DiveSim.stars(hits: fish[i].hits), weight: species.weight)
            }
            removeFish(at: i)
            harpoon.hooked = nil
            harpoon.phase = HarpoonPhase.retracting
        }
    }

    // MARK: Boss

    /// true se in questo punto c'è il boss (punto debole, corazza o esca).
    private func bossTouches(_ point: Vec2, reach: Double) -> Bool {
        guard let b: BossBody = boss, b.isAlive, b.move != BossMove.hidden else { return false }
        if point.distance(to: b.weakPoint) < b.weakRadius + reach { return true }
        if let lure: Vec2 = b.lure, point.distance(to: lure) < 7 + reach { return true }
        return b.blocks(point)
    }

    /// Un colpo arrivato in un punto: ferisce il boss se tocca il punto debole scoperto,
    /// rimbalza sulla corazza altrimenti. Fa anche scoppiare le mine. Ritorna true se ha toccato qualcosa.
    private mutating func hitBoss(at point: Vec2, reach: Double, damage: Double, events: inout [DiveEvent]) -> Bool {
        guard var b: BossBody = boss, b.isAlive else { return false }
        // Mine: un colpo le fa brillare, e lo scoppio ferisce anche chi le ha posate.
        var h: Int = 0
        while h < hazards.count {
            if hazards[h].kind == Hazard.Kind.mine && hazards[h].position.distance(to: point) < hazards[h].radius + reach + 2 {
                let mine: Hazard = hazards[h]
                hazards.remove(at: h)
                events.append(DiveEvent.blast(at: mine.position, radius: mine.blast))
                if mine.position.distance(to: b.position) < mine.blast + b.info.radius {
                    let outcome: [BossEvent] = BossAI.damage(&b, amount: 30, hazards: &hazards)
                    apply(outcome, events: &events)
                    events.append(DiveEvent.bossHit(at: b.position, damage: 30))
                    if !b.isAlive { events.append(DiveEvent.bossDying) }
                }
                if mine.position.distance(to: diver.position) < mine.blast + DiveSim.diverHitRadius { hurtDiver(damage: mine.damage, from: mine.position, events: &events) }
                boss = b
                return true
            }
            h += 1
        }
        if b.move == BossMove.hidden { return false }
        // L'esca della lanterna: colpirla accende tutto e la stordisce.
        if let lure: Vec2 = b.lure, !b.isVulnerable, point.distance(to: lure) < 7 + reach {
            if b.lureExposed, BossAI.stun(&b, seconds: 2.6) {
                events.append(DiveEvent.bossStunned(at: b.position))
            } else {
                events.append(DiveEvent.bossBlocked(at: point))
            }
            boss = b
            return true
        }
        if point.distance(to: b.weakPoint) < b.weakRadius + reach {
            if b.isVulnerable {
                let dealt: Double = damage * b.damageFactor
                let outcome: [BossEvent] = BossAI.damage(&b, amount: damage, hazards: &hazards)
                apply(outcome, events: &events)
                events.append(DiveEvent.bossHit(at: point, damage: dealt))
                if !b.isAlive { events.append(DiveEvent.bossDying) }
            } else {
                events.append(DiveEvent.bossBlocked(at: point))
            }
            boss = b
            return true
        }
        if b.blocks(point) {
            events.append(DiveEvent.bossBlocked(at: point))
            return true
        }
        return false
    }

    private mutating func stunBoss(center: Vec2, radius: Double, seconds: Double, events: inout [DiveEvent]) {
        guard var b: BossBody = boss, b.isAlive, b.position.distance(to: center) < radius + b.info.radius else { return }
        if BossAI.stun(&b, seconds: seconds) { events.append(DiveEvent.bossStunned(at: b.position)) }
        boss = b
    }

    private mutating func hurtDiver(damage: Double, from point: Vec2, events: inout [DiveEvent]) {
        if invulnerable > 0 { return }
        breath -= damage
        invulnerable = 1.0
        let away: Vec2 = diver.position - point
        if away.lengthSquared > 1e-6 { diver.velocity = away.normalized() * 120 }
        events.append(DiveEvent.diverHurt(damage: damage, at: diver.position))
    }

    private mutating func apply(_ bossEvents: [BossEvent], events: inout [DiveEvent]) {
        for event in bossEvents {
            switch event {
            case .telegraph(let at, let attack): events.append(DiveEvent.bossTelegraph(at: at, attack: attack))
            case .attack(let name): events.append(DiveEvent.bossAttack(name))
            case .hitDiver(let damage, let at): hurtDiver(damage: damage, from: at, events: &events)
            case .phase(let phase): events.append(DiveEvent.bossPhase(phase))
            case .stunned(let at): events.append(DiveEvent.bossStunned(at: at))
            case .quake: events.append(DiveEvent.quake)
            case .blast(let at, let radius): events.append(DiveEvent.blast(at: at, radius: radius))
            case .defeated:
                bossDefeated = true
                events.append(DiveEvent.bossDefeated)
            }
        }
    }

    private mutating func stepBoss(dt: Double, events: inout [DiveEvent]) {
        guard let arena: Arena = arena, var b: BossBody = boss else { return }
        let wasAlive: Bool = b.isAlive
        let moves: [BossEvent] = BossAI.step(&b, diver: diver.position, diverRadius: DiveSim.diverHitRadius, arena: arena, map: map,
                                             hazards: &hazards, nextId: &nextHazardId, dt: dt)
        boss = b
        apply(moves, events: &events)
        var nowInked: Bool = false
        let flying: [BossEvent] = BossAI.stepHazards(&hazards, diver: diver.position, diverRadius: DiveSim.diverHitRadius,
                                                     canHurt: invulnerable <= 0 && wasAlive, map: map, dt: dt, inked: &nowInked)
        apply(flying, events: &events)
        inked = nowInked
        // Le campane d'aria dell'arena tornano piene dopo un po'.
        var i: Int = 0
        while i < bellClocks.count && i < pickups.count {
            if pickups[i].taken {
                bellClocks[i] -= dt
                if bellClocks[i] <= 0 {
                    pickups[i].taken = false
                    events.append(DiveEvent.bellReady)
                }
            }
            i += 1
        }
    }

    // MARK: Armi secondarie

    private mutating func stepSecondary(input: DiveInput, dt: Double, events: inout [DiveEvent]) {
        if secondaryCooldown > 0 { secondaryCooldown = max(0, secondaryCooldown - dt) }
        if let dir: Vec2 = input.secondary, let weapon: WeaponInfo = secondary, secondaryCooldown <= 0, dir.lengthSquared > 1e-6 {
            if weapon.ammo > 0 && ammo <= 0 {
                events.append(DiveEvent.outOfAmmo)
                secondaryCooldown = 0.4
            } else {
                if weapon.ammo > 0 { ammo -= 1 }
                secondaryCooldown = weapon.cooldown
                let d: Vec2 = dir.normalized()
                switch weapon.kind {
                case .melee:
                    let center: Vec2 = diver.position + d * (weapon.range * 0.6)
                    events.append(DiveEvent.secondaryUsed(kind: weapon.kind, at: center, radius: weapon.range * 0.6))
                    strike(center: center, radius: weapon.range * 0.7, damage: weapon.damage, events: &events)
                    _ = hitBoss(at: center, reach: weapon.range * 0.7, damage: weapon.damage, events: &events)
                case .net:
                    let center: Vec2 = diver.position + d * weapon.range
                    events.append(DiveEvent.secondaryUsed(kind: weapon.kind, at: center, radius: weapon.radius))
                    castNet(center: center, weapon: weapon, events: &events)
                case .sleep, .bolt, .stun:
                    shots.append(SecondaryShot(kind: weapon.kind, position: diver.position + d * 10, direction: d))
                    events.append(DiveEvent.secondaryUsed(kind: weapon.kind, at: diver.position, radius: 0))
                }
            }
        }
        guard let weapon: WeaponInfo = secondary, !shots.isEmpty else { return }
        var index: Int = shots.count - 1
        while index >= 0 {
            var shot: SecondaryShot = shots[index]
            var remaining: Double = weapon.speed * dt
            var done: Bool = false
            while remaining > 0 && !done {
                let stepLength: Double = min(remaining, 5)
                remaining -= stepLength
                shot.position += shot.direction * stepLength
                shot.traveled += stepLength
                let blocked: Bool = map.isSolid(x: shot.position.x, y: shot.position.y) || shot.position.y < 0
                let target: Int? = firstFish(near: shot.position, extra: 3)
                let onBoss: Bool = bossTouches(shot.position, reach: 3)
                if shot.kind == WeaponKind.stun {
                    if blocked || target != nil || onBoss || shot.traveled >= weapon.range {
                        events.append(DiveEvent.secondaryUsed(kind: WeaponKind.stun, at: shot.position, radius: weapon.radius))
                        putToSleep(center: shot.position, radius: weapon.radius, seconds: weapon.duration, alive: false, events: &events)
                        stunBoss(center: shot.position, radius: weapon.radius, seconds: min(weapon.duration, 1.8), events: &events)
                        done = true
                    }
                } else if onBoss {
                    // I dardi soporiferi non fanno nulla a bestie di questa taglia; l'asta sì.
                    if shot.kind == WeaponKind.bolt {
                        _ = hitBoss(at: shot.position, reach: 3, damage: weapon.damage, events: &events)
                    } else {
                        events.append(DiveEvent.bossBlocked(at: shot.position))
                    }
                    done = true
                } else if let i: Int = target {
                    if shot.kind == WeaponKind.sleep {
                        fish[i].sleepFor = weapon.duration
                        fish[i].sleepAlive = true
                        FishAI.enter(&fish[i], state: FishState.asleep, diver: diver.position)
                        events.append(DiveEvent.asleep(at: fish[i].position))
                    } else {
                        hitWithBolt(index: i, damage: weapon.damage, events: &events)
                    }
                    done = true
                } else if blocked || shot.traveled >= weapon.range {
                    done = true
                }
            }
            if done {
                shots.remove(at: index)
            } else {
                shots[index] = shot
            }
            index -= 1
        }
    }

    /// Primo pesce singolo colpibile vicino a un punto.
    private func firstFish(near point: Vec2, extra: Double) -> Int? {
        var i: Int = 0
        while i < fish.count {
            if fish[i].isTargetable && !fish[i].species.isProtected && fish[i].position.distance(to: point) < fish[i].species.radius + extra { return i }
            i += 1
        }
        return nil
    }

    /// Colpo ravvicinato: fa danno a tutto ciò che ha davanti; ciò che uccide finisce in sacca, rovinato.
    private mutating func strike(center: Vec2, radius: Double, damage: Double, events: inout [DiveEvent]) {
        var i: Int = fish.count - 1
        while i >= 0 {
            if fish[i].isTargetable && !fish[i].species.isProtected && fish[i].position.distance(to: center) < radius + fish[i].species.radius {
                let species: FishSpecies = fish[i].species
                let killed: Bool = FishAI.damage(&fish[i], amount: damage, diver: diver.position)
                events.append(DiveEvent.fishHit(at: fish[i].position, damage: damage, killed: killed))
                if killed {
                    if species.isEdible {
                        let item: CatchItem = CatchItem(speciesId: species.itemId, stars: 1, weight: species.weight)
                        bag.fish.append(item)
                        events.append(DiveEvent.caught(item: item, at: fish[i].position))
                    }
                    removeFish(at: i)
                }
            }
            i -= 1
        }
        var s: Int = 0
        while s < schools.count {
            var m: Int = 0
            while m < schools[s].members.count {
                if schools[s].members[m].alive && schools[s].members[m].position.distance(to: center) < radius + schools[s].species.radius {
                    let species: FishSpecies = schools[s].species
                    schools[s].members[m].alive = false
                    events.append(DiveEvent.fishHit(at: schools[s].members[m].position, damage: damage, killed: true))
                    if species.isEdible {
                        let item: CatchItem = CatchItem(speciesId: species.itemId, stars: 1, weight: species.weight)
                        bag.fish.append(item)
                        events.append(DiveEvent.caught(item: item, at: schools[s].members[m].position))
                    }
                    let spawn: Int = schools[s].spawnIndex
                    if spawn >= 0 && spawn < spawns.count { spawns[spawn].remaining = max(0, spawns[spawn].remaining - 1) }
                    schools[s].scatter()
                }
                m += 1
            }
            s += 1
        }
    }

    /// Rete: prende vivi (tre stelle) i pesci leggeri dentro il cerchio.
    private mutating func castNet(center: Vec2, weapon: WeaponInfo, events: inout [DiveEvent]) {
        var i: Int = fish.count - 1
        while i >= 0 {
            let species: FishSpecies = fish[i].species
            if fish[i].isTargetable && species.isEdible && species.weight <= weapon.maxWeight
                && fish[i].position.distance(to: center) < weapon.radius + species.radius {
                let item: CatchItem = CatchItem(speciesId: species.itemId, stars: 3, weight: species.weight)
                bag.fish.append(item)
                events.append(DiveEvent.caught(item: item, at: fish[i].position))
                removeFish(at: i)
            }
            i -= 1
        }
        var s: Int = 0
        while s < schools.count {
            let species: FishSpecies = schools[s].species
            if species.isEdible && species.weight <= weapon.maxWeight {
                var taken: Int = 0
                var m: Int = 0
                while m < schools[s].members.count {
                    if schools[s].members[m].alive && schools[s].members[m].position.distance(to: center) < weapon.radius + species.radius {
                        schools[s].members[m].alive = false
                        let item: CatchItem = CatchItem(speciesId: species.itemId, stars: 3, weight: species.weight)
                        bag.fish.append(item)
                        events.append(DiveEvent.caught(item: item, at: schools[s].members[m].position))
                        taken += 1
                    }
                    m += 1
                }
                if taken > 0 {
                    let spawn: Int = schools[s].spawnIndex
                    if spawn >= 0 && spawn < spawns.count { spawns[spawn].remaining = max(0, spawns[spawn].remaining - taken) }
                    schools[s].scatter()
                }
            }
            s += 1
        }
    }

    /// Addormenta o stordisce i pesci singoli in un'area.
    private mutating func putToSleep(center: Vec2, radius: Double, seconds: Double, alive: Bool, events: inout [DiveEvent]) {
        var i: Int = 0
        while i < fish.count {
            if fish[i].isTargetable && !fish[i].species.isProtected && fish[i].position.distance(to: center) < radius + fish[i].species.radius {
                fish[i].sleepFor = seconds
                fish[i].sleepAlive = alive
                FishAI.enter(&fish[i], state: FishState.asleep, diver: diver.position)
                events.append(DiveEvent.asleep(at: fish[i].position))
            }
            i += 1
        }
        var s: Int = 0
        while s < schools.count {
            if schools[s].center.distance(to: center) < radius + 30 { schools[s].scatter() }
            s += 1
        }
    }

    /// Asta del fucile: danno a distanza; il pesce ucciso sale da solo verso Tecla.
    private mutating func hitWithBolt(index i: Int, damage: Double, events: inout [DiveEvent]) {
        let species: FishSpecies = fish[i].species
        let killed: Bool = FishAI.damage(&fish[i], amount: damage, diver: diver.position)
        events.append(DiveEvent.fishHit(at: fish[i].position, damage: damage, killed: killed))
        if killed {
            if species.isEdible {
                let item: CatchItem = CatchItem(speciesId: species.itemId, stars: DiveSim.stars(hits: fish[i].hits), weight: species.weight)
                bag.fish.append(item)
                events.append(DiveEvent.caught(item: item, at: fish[i].position))
            }
            removeFish(at: i)
        }
    }
}
