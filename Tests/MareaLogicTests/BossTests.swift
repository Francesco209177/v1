import XCTest
@testable import MareaLogic

/// Giocatore automatico per gli scontri: schiva gli avvisi, evita i pericoli, respira alle campane
/// e tira quando il punto debole è scoperto. Serve a dimostrare che ogni boss si può battere.
enum BossBot {
    static func input(_ sim: DiveSim) -> DiveInput {
        var input: DiveInput = DiveInput()
        guard let boss: BossBody = sim.boss, let arena: Arena = sim.arena else { return input }
        let me: Vec2 = sim.diver.position
        let weak: Vec2 = boss.weakPoint
        var steer: Vec2 = Vec2.zero

        // 1. Posizione: a tiro del punto debole, dal lato da cui è scoperto.
        var outward: Vec2 = weak - boss.position
        if outward.lengthSquared < 4 { outward = me - weak }
        if outward.lengthSquared < 4 { outward = Vec2(-1, 0) }
        var spot: Vec2 = weak + outward.normalized() * 95
        if boss.info.kind == BossKind.granseola { spot = Vec2(MathUtil.clamp(boss.position.x + (me.x < boss.position.x ? -75 : 75), arena.minX + 30, arena.maxX - 30), arena.maxY - 95) }
        if boss.info.kind == BossKind.polpo { spot = Vec2(boss.position.x + (me.x < boss.position.x ? -80 : 80), boss.position.y - 95) }
        if boss.info.kind == BossKind.murena && !boss.isVulnerable { spot = arena.center }
        spot = arena.clamp(spot, margin: 26)
        let toSpot: Vec2 = spot - me
        if toSpot.length > 10 { steer += toSpot.normalized() * 0.8 }

        // 2. Schivata: via dalla linea d'attacco durante l'avviso e l'attacco.
        if boss.move == BossMove.telegraph || boss.move == BossMove.attack {
            let origin: Vec2 = boss.info.kind == BossKind.murena && !arena.holes.isEmpty ? arena.holes[min(boss.hole, arena.holes.count - 1)].position : boss.position
            let rel: Vec2 = me - origin
            let along: Double = rel.dot(boss.aim)
            let side: Double = boss.aim.x * rel.y - boss.aim.y * rel.x
            let dangerous: Bool = boss.attack == "lunge" || boss.attack == "bite" || boss.attack == "charge" || boss.attack == "drill"
            if dangerous && along > -20 && abs(side) < 60 {
                var perp: Vec2 = Vec2(-boss.aim.y, boss.aim.x) * (side >= 0 ? 1 : -1)
                // Per le cariche sul fondo o in orizzontale la via di fuga è cambiare quota.
                if boss.attack == "charge" { perp = Vec2(0, -1) }
                if boss.attack == "drill" { perp = Vec2(0, me.y < arena.center.y ? -1 : 1) }
                let escape: Vec2 = arena.clamp(me + perp * 50, margin: 14)
                if escape.distance(to: me) < 20 { perp = perp * -1 }
                steer = perp * 2.4
            }
            if boss.attack == "slam" && boss.info.kind == BossKind.granseola { steer += Vec2(0, -1.5) }
        }

        // 3. Pericoli vicini: mi allontano.
        for h in sim.hazards {
            var d: Vec2
            if let end: Vec2 = h.end {
                let ab: Vec2 = end - h.position
                let t: Double = MathUtil.clamp((me - h.position).dot(ab) / max(ab.lengthSquared, 1e-6), 0, 1)
                d = me - (h.position + ab * t)
            } else if h.kind == Hazard.Kind.rock {
                d = Vec2(me.x - h.position.x, 0)
                if h.position.y > me.y + 10 { continue }
            } else {
                d = me - h.position
            }
            let reach: Double = h.radius + (h.kind == Hazard.Kind.mine ? 58 : 34)
            if d.length < reach {
                let push: Vec2 = d.lengthSquared > 1e-6 ? d.normalized() : Vec2(0, -1)
                steer += push * (2.2 * (1 - d.length / reach) + 0.6)
            }
        }

        // 4. Fiato: alla campana più vicina.
        if sim.breathRatio < 0.45 {
            var best: Int? = nil
            var i: Int = 0
            while i < sim.pickups.count {
                if !sim.pickups[i].taken && (best == nil || sim.pickups[i].position.distance(to: me) < sim.pickups[best ?? 0].position.distance(to: me)) { best = i }
                i += 1
            }
            if let index: Int = best {
                let d: Vec2 = sim.pickups[index].position - me
                steer = d.normalized() * 1.5 + steer * 0.4
                if d.length < 22 { input.interact = true }
            }
        }

        if steer.length > 1 { steer = steer.normalized() }
        input.move = steer
        input.reelHeld = false

        // 5. Tiro: al punto debole scoperto, o all'esca della lanterna.
        if sim.harpoon.phase == HarpoonPhase.ready {
            var target: Vec2? = nil
            if boss.isVulnerable {
                target = weak + boss.velocity * 0.18
            } else if let lure: Vec2 = boss.lure, boss.lureExposed {
                target = lure
            }
            if let t: Vec2 = target, t.distance(to: me) < sim.harpoonTuning.range * 0.92 { input.fire = (t - me).normalized() }
        }
        return input
    }
}

final class BossTests: XCTestCase {

    private func load<T: Decodable>(_ type: T.Type, _ file: String) throws -> T {
        return try DataFiles.load(type, file: file, in: TestSupport.dataDirectory)
    }

    private func makeFight(_ id: String, seed: UInt64 = 21, breath: Double = 320, damage: Double = 20) throws -> DiveSim {
        let world: WorldData = try load(WorldData.self, "zones.json")
        let book: BossBook = try load(BossBook.self, "bosses.json")
        let info: BossInfo = try XCTUnwrap(book.find(id))
        let built: (map: CaveMap, arena: Arena) = CaveGenerator.arena(seed: seed, world: world, boss: info)
        var sim: DiveSim = DiveSim(map: built.map, arena: built.arena, boss: info, catalog: try load(FishCatalog.self, "fish.json"), seed: seed, breathMax: breath)
        sim.harpoonTuning.damage = damage
        return sim
    }

    func testBossDataIsValid() throws {
        let world: WorldData = try load(WorldData.self, "zones.json")
        let book: BossBook = try load(BossBook.self, "bosses.json")
        XCTAssertTrue(book.problems(world: world).isEmpty, book.problems(world: world).joined(separator: "\n"))
        XCTAssertEqual(book.bosses.count, 6)
        XCTAssertEqual(Set(book.bosses.map { $0.kind }).count, BossKind.allCases.count, "un boss per tipo")
        // Scendendo, i boss sono via via più coriacei.
        var last: Double = 0
        var lastDepth: Double = 0
        for boss in book.bosses {
            XCTAssertGreaterThan(boss.hp, last)
            XCTAssertGreaterThan(boss.depth, lastDepth)
            last = boss.hp
            lastDepth = boss.depth
        }
    }

    func testArenasAreClosedRooms() throws {
        let world: WorldData = try load(WorldData.self, "zones.json")
        let book: BossBook = try load(BossBook.self, "bosses.json")
        for info in book.bosses {
            let built: (map: CaveMap, arena: Arena) = CaveGenerator.arena(seed: 5, world: world, boss: info)
            let map: CaveMap = built.map
            let arena: Arena = built.arena
            XCTAssertTrue(map.isOpen(arena.diverStart, clearance: 8), "\(info.id): Tecla parte nella roccia")
            XCTAssertGreaterThan(arena.width, 500)
            XCTAssertGreaterThan(arena.height, 200)
            XCTAssertEqual(arena.bells.count, 2)
            for bell in arena.bells { XCTAssertFalse(map.isSolid(x: bell.x, y: bell.y), "\(info.id): campana nella roccia") }
            // Dalla sala non si esce: tutta l'acqua raggiungibile sta dentro i suoi confini.
            var reached: Set<Int> = []
            var stack: [(Int, Int)] = [(Int(arena.diverStart.x) / map.tileSize, Int(arena.diverStart.y) / map.tileSize)]
            while let (c, r) = stack.popLast() {
                if c < 0 || r < 0 || c >= map.cols || r >= map.rows || map.isSolidCell(c, r) { continue }
                let key: Int = r * map.cols + c
                if reached.contains(key) { continue }
                reached.insert(key)
                stack.append((c + 1, r))
                stack.append((c - 1, r))
                stack.append((c, r + 1))
                stack.append((c, r - 1))
            }
            XCTAssertGreaterThan(reached.count, 400, "\(info.id): sala troppo piccola")
            for key in reached {
                let y: Double = (Double(key / map.cols) + 0.5) * Double(map.tileSize)
                XCTAssertTrue(y > arena.minY - 24 && y < arena.maxY + 24, "\(info.id): la sala ha una via d'uscita")
            }
            if info.kind == BossKind.murena {
                XCTAssertEqual(arena.holes.count, 5)
                for hole in arena.holes {
                    XCTAssertFalse(map.isSolid(x: hole.position.x + hole.normal.x * 6, y: hole.position.y + hole.normal.y * 6), "tana murata")
                    XCTAssertTrue(map.isSolid(x: hole.position.x - hole.normal.x * 10, y: hole.position.y - hole.normal.y * 10), "tana sospesa nell'acqua")
                }
            } else {
                XCTAssertTrue(map.isOpen(arena.bossStart, clearance: info.radius * 0.6), "\(info.id): il boss parte nella roccia")
            }
        }
    }

    func testEveryAttackIsAnnounced() throws {
        let book: BossBook = try load(BossBook.self, "bosses.json")
        for info in book.bosses {
            var sim: DiveSim = try makeFight(info.id, breath: 100_000)
            var announced: String? = nil
            var attacks: Int = 0
            var step: Int = 0
            while step < 60 * 70 {
                // Tecla nuota in tondo senza mai tirare: così il boss mostra tutto il repertorio della prima fase.
                var input: DiveInput = DiveInput()
                let t: Double = Double(step) / 60
                input.move = Vec2(cos(t * 0.7), sin(t * 0.9) * 0.6)
                for event in sim.step(input: input, dt: 1.0 / 60.0) {
                    switch event {
                    case .bossTelegraph(_, let attack):
                        announced = attack
                    case .bossAttack(let attack):
                        if attack != "blackout" {
                            XCTAssertEqual(announced, attack, "\(info.id): attacco '\(attack)' senza avviso")
                            announced = nil
                        }
                        attacks += 1
                    default:
                        break
                    }
                }
                if let b: BossBody = sim.boss, let arena: Arena = sim.arena {
                    XCTAssertTrue(arena.contains(b.position, margin: 30), "\(info.id): il boss è uscito dalla sala")
                }
                XCTAssertLessThan(sim.hazards.count, 40, "\(info.id): troppi pericoli in acqua")
                step += 1
            }
            XCTAssertGreaterThan(attacks, 8, "\(info.id): attacca troppo di rado")
        }
    }

    func testArmourBlocksAndWeakPointHurts() throws {
        var sim: DiveSim = try makeFight("granseola")
        let boss: BossBody = try XCTUnwrap(sim.boss)
        XCTAssertFalse(boss.isVulnerable)
        sim.diver.position = boss.position + Vec2(-90, -40)
        var input: DiveInput = DiveInput()
        input.fire = (boss.position - sim.diver.position).normalized()
        var blocked: Bool = false
        var events: [DiveEvent] = sim.step(input: input, dt: 1.0 / 60.0)
        var step: Int = 0
        while step < 60 {
            for event in events { if case DiveEvent.bossBlocked = event { blocked = true } }
            events = sim.step(input: DiveInput(), dt: 1.0 / 60.0)
            step += 1
        }
        XCTAssertTrue(blocked, "la corazza deve fermare l'arpione")
        XCTAssertEqual(sim.boss?.hp, boss.info.hp)

        // Ribaltata: adesso il colpo entra.
        sim.boss?.move = BossMove.stunned
        sim.boss?.moveTime = 0
        sim.boss?.moveFor = 10
        sim.harpoon = HarpoonState()
        sim.diver.position = (sim.boss?.position ?? Vec2.zero) + Vec2(-90, -40)
        sim.diver.velocity = Vec2.zero
        input.fire = ((sim.boss?.position ?? Vec2.zero) - sim.diver.position).normalized()
        var hit: Bool = false
        events = sim.step(input: input, dt: 1.0 / 60.0)
        step = 0
        while step < 60 {
            for event in events { if case DiveEvent.bossHit = event { hit = true } }
            events = sim.step(input: DiveInput(), dt: 1.0 / 60.0)
            step += 1
        }
        XCTAssertTrue(hit)
        XCTAssertLessThan(sim.boss?.hp ?? 0, boss.info.hp)
    }

    func testPhasesAndDefeat() throws {
        let book: BossBook = try load(BossBook.self, "bosses.json")
        for info in book.bosses {
            var sim: DiveSim = try makeFight(info.id)
            var boss: BossBody = try XCTUnwrap(sim.boss)
            var hazards: [Hazard] = []
            var phases: [Int] = []
            var guardCount: Int = 0
            while boss.isAlive && guardCount < 1000 {
                for event in BossAI.damage(&boss, amount: info.hp / 20, hazards: &hazards) {
                    if case BossEvent.phase(let p) = event { phases.append(p) }
                }
                guardCount += 1
            }
            XCTAssertEqual(phases, [2, 3], "\(info.id): le fasi scattano a due terzi e a un terzo della vita")
            XCTAssertEqual(boss.move, BossMove.dying)
            sim.boss = boss
            var defeated: Bool = false
            var step: Int = 0
            while step < 60 * 4 {
                for event in sim.step(input: DiveInput(), dt: 1.0 / 60.0) where event == DiveEvent.bossDefeated { defeated = true }
                step += 1
            }
            XCTAssertTrue(defeated, "\(info.id): manca l'evento di vittoria")
            XCTAssertTrue(sim.bossDefeated)
            XCTAssertTrue(sim.hazards.isEmpty)
        }
    }

    func testBellsRefillInTheArena() throws {
        var sim: DiveSim = try makeFight("polpo", breath: 200)
        let bell: Vec2 = try XCTUnwrap(sim.arena?.bells.first)
        sim.breath = 50
        sim.diver.position = bell + Vec2(0, 6)
        var input: DiveInput = DiveInput()
        input.interact = true
        _ = sim.step(input: input, dt: 1.0 / 60.0)
        XCTAssertEqual(sim.breath, 200, accuracy: 1)
        XCTAssertTrue(sim.pickups[0].taken)
        var ready: Bool = false
        var step: Int = 0
        while step < Int(DiveSim.bellRefill * 60) + 30 {
            sim.breath = 200
            for event in sim.step(input: DiveInput(), dt: 1.0 / 60.0) where event == DiveEvent.bellReady { ready = true }
            step += 1
        }
        XCTAssertTrue(ready)
        XCTAssertFalse(sim.pickups[0].taken)
    }

    func testFightsAreDeterministic() throws {
        func run() throws -> (Double, Double, Int) {
            var sim: DiveSim = try makeFight("spada", seed: 9)
            var step: Int = 0
            while step < 60 * 40 && !sim.fainted {
                _ = sim.step(input: BossBot.input(sim), dt: 1.0 / 60.0)
                step += 1
            }
            return (sim.boss?.hp ?? -1, sim.breath, sim.hazards.count)
        }
        let a: (Double, Double, Int) = try run()
        let b: (Double, Double, Int) = try run()
        XCTAssertEqual(a.0, b.0)
        XCTAssertEqual(a.1, b.1)
        XCTAssertEqual(a.2, b.2)
    }

    /// Ogni boss si può battere: il giocatore automatico ci riesce con l'arpione che ci si aspetta a quel punto della storia.
    func testEveryBossCanBeBeaten() throws {
        let harpoon: [String: Double] = ["murena": 14, "granseola": 19, "spada": 25, "polpo": 25, "lanterna": 33, "talpa": 42]
        let book: BossBook = try load(BossBook.self, "bosses.json")
        for info in book.bosses {
            var wins: Int = 0
            var report: [String] = []
            for seed in [3, 8, 14] as [UInt64] {
                var sim: DiveSim = try makeFight(info.id, seed: seed, breath: 270, damage: harpoon[info.id] ?? 20)
                var hurt: Int = 0
                var step: Int = 0
                while step < 60 * 360 && !sim.fainted && !sim.bossDefeated {
                    for event in sim.step(input: BossBot.input(sim), dt: 1.0 / 60.0) {
                        if case DiveEvent.diverHurt = event { hurt += 1 }
                    }
                    step += 1
                }
                if sim.bossDefeated { wins += 1 }
                report.append("seme \(seed): \(sim.bossDefeated ? "vinto" : "perso") in \(step / 60) s, colpi subiti \(hurt), vita boss \(Int(sim.boss?.hp ?? 0))")
            }
            print("BOSS \(info.id): " + report.joined(separator: " | "))
            XCTAssertGreaterThanOrEqual(wins, 2, "\(info.id): " + report.joined(separator: " | "))
        }
    }
}
