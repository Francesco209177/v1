import XCTest
@testable import MareaLogic

final class FishingTests: XCTestCase {

    private func world() throws -> WorldData {
        return try DataFiles.load(WorldData.self, file: "zones.json", in: TestSupport.dataDirectory)
    }

    private func catalog() throws -> FishCatalog {
        return try DataFiles.load(FishCatalog.self, file: "fish.json", in: TestSupport.dataDirectory)
    }

    private func makeSim(seed: UInt64 = 11) throws -> DiveSim {
        let map: CaveMap = CaveGenerator.generate(seed: seed, world: try world())
        return DiveSim(map: map, catalog: try catalog(), seed: seed, night: false, startDepthMeters: 0)
    }

    /// Porta Tecla in acqua libera accanto al primo punto di comparsa della specie, guardando verso il pesce.
    private func place(_ sim: inout DiveSim, near speciesId: String, distance: Double) -> Vec2? {
        for spawn in sim.spawns where spawn.speciesId == speciesId {
            for side in [-1.0, 1.0] {
                let p: Vec2 = Vec2(spawn.position.x + side * distance, spawn.position.y)
                var clear: Bool = sim.map.isOpen(p, clearance: 10)
                var t: Double = 0
                while clear && t <= 1 {
                    let q: Vec2 = p.lerp(to: spawn.position, t: t)
                    if sim.map.density(x: q.x, y: q.y) > 0.4 { clear = false }
                    t += 0.05
                }
                if clear {
                    sim.diver.position = p
                    sim.diver.velocity = Vec2.zero
                    sim.diver.facingRight = side < 0
                    return spawn.position
                }
            }
        }
        return nil
    }

    func testFishCatalogIsValidAndCoversTheFirstTwoZones() throws {
        let c: FishCatalog = try catalog()
        XCTAssertTrue(c.problems().isEmpty, c.problems().joined(separator: "\n"))
        XCTAssertGreaterThanOrEqual(c.species.count, 12)
        var depth: Double = 3
        while depth < 110 {
            XCTAssertGreaterThanOrEqual(c.candidates(depthMeters: depth, night: false).count, 3, "poche specie a \(depth) m")
            depth += 5
        }
    }

    func testEverySpeciesHasItsSprites() throws {
        let library: SpriteLibrary = try TestSupport.loadSpriteLibrary()
        let names: Set<String> = Set(library.expandedSprites().map { $0.name })
        for species in try catalog().species {
            for suffix in ["_swim_0", "_swim_3", "_hurt_0", "_dead_0"] {
                XCTAssertTrue(names.contains(species.id + suffix), "manca lo sprite \(species.id)\(suffix)")
            }
        }
    }

    func testSpawnPlanIsDeterministicAndInWater() throws {
        let a: DiveSim = try makeSim(seed: 21)
        let b: DiveSim = try makeSim(seed: 21)
        XCTAssertEqual(a.spawns, b.spawns)
        XCTAssertEqual(a.pickups, b.pickups)
        XCTAssertGreaterThan(a.spawns.count, 25)
        XCTAssertGreaterThan(a.pickups.count, 15)
        print("PIANO: \(a.spawns.count) punti di comparsa, \(a.pickups.count) oggetti")
        XCTAssertTrue(a.pickups.contains(where: { $0.kind == PickupPoint.Kind.campana }))
        for spawn in a.spawns {
            XCTAssertLessThan(a.map.density(x: spawn.position.x, y: spawn.position.y), 0.5, spawn.speciesId)
            XCTAssertLessThanOrEqual(spawn.position.y / 16, 125)
        }
    }

    func testHarpoonCatchesASmallFishInOneShot() throws {
        var sim: DiveSim = try makeSim()
        guard let target: Vec2 = place(&sim, near: "donzella", distance: 70) ?? place(&sim, near: "triglia", distance: 70) else {
            XCTFail("nessun pesce piccolo raggiungibile nella mappa di prova")
            return
        }
        _ = sim.step(input: DiveInput(), dt: 1.0 / 60.0)
        XCTAssertFalse(sim.fish.isEmpty)
        var input: DiveInput = DiveInput()
        input.fire = sim.aimDirection(manual: target - sim.diver.position, autoAim: true)
        var caught: [CatchItem] = []
        var events: [DiveEvent] = sim.step(input: input, dt: 1.0 / 60.0)
        XCTAssertTrue(events.contains(DiveEvent.harpoonFired))
        for _ in 0..<240 {
            events = sim.step(input: DiveInput(), dt: 1.0 / 60.0)
            for event in events {
                if case DiveEvent.caught(let item, _) = event { caught.append(item) }
            }
        }
        XCTAssertEqual(caught.count, 1)
        XCTAssertEqual(caught.first?.stars, 2)
        XCTAssertEqual(sim.bag.fish.count, 1)
        XCTAssertEqual(sim.harpoon.phase, HarpoonPhase.ready)
    }

    /// Recupera tenendo premuto ma mollando durante gli strattoni, come farebbe un giocatore attento.
    func testReelingWithCareLandsTheFishAndGreedSnapsTheLine() throws {
        for careful in [true, false] {
            var sim: DiveSim = try makeSim()
            guard let target: Vec2 = place(&sim, near: "cernia", distance: 80) ?? place(&sim, near: "dentice", distance: 80) else {
                XCTFail("nessun pesce grosso raggiungibile nella mappa di prova")
                return
            }
            _ = sim.step(input: DiveInput(), dt: 1.0 / 60.0)
            var outcome: String = "nessuno"
            var frame: Int = 0
            while frame < 60 * 90 && outcome == "nessuno" {
                var input: DiveInput = DiveInput()
                if sim.harpoon.phase == HarpoonPhase.ready && !sim.fish.isEmpty {
                    input.fire = sim.aimDirection(manual: target - sim.diver.position, autoAim: true)
                }
                if sim.harpoon.phase == HarpoonPhase.reeling {
                    input.reelHeld = careful ? (!sim.harpoon.isSurging && sim.harpoon.tension < 0.7) : true
                }
                for event in sim.step(input: input, dt: 1.0 / 60.0) {
                    if case DiveEvent.caught = event { outcome = "preso" }
                    if event == DiveEvent.lineBroke { outcome = "spezzata" }
                }
                // Un pesce grosso richiede più colpi: se scappa lo si lascia perdere.
                if sim.fish.isEmpty && sim.harpoon.phase == HarpoonPhase.ready { break }
                frame += 1
            }
            if careful {
                XCTAssertEqual(outcome, "preso")
            } else {
                XCTAssertEqual(outcome, "spezzata")
            }
        }
    }

    func testBreathDrainsFaintsAndRefillsAtTheSurface() throws {
        var sim: DiveSim = try makeSim()
        sim.diver.position = sim.map.nearestOpenPoint(to: sim.map.channelPoint(depthMeters: 30), clearance: 12)
        let before: Double = sim.breath
        var sawLow: Bool = false
        var sawFaint: Bool = false
        var frames: Int = 0
        while !sim.fainted && frames < 60 * 600 {
            for event in sim.step(input: DiveInput(), dt: 1.0 / 30.0) {
                if event == DiveEvent.breathLow { sawLow = true }
                if event == DiveEvent.fainted { sawFaint = true }
            }
            frames += 1
        }
        XCTAssertTrue(sawLow && sawFaint)
        XCTAssertEqual(sim.breath, 0)
        // Con 120 di Fiato a 30 metri si resiste tra uno e quattro minuti.
        let seconds: Double = Double(frames) / 30.0
        XCTAssertTrue(seconds > 60 && seconds < 240, "durata \(seconds) s")
        XCTAssertEqual(before, 120)

        var top: DiveSim = try makeSim()
        XCTAssertTrue(top.step(input: DiveInput(), dt: 1.0 / 30.0).isEmpty)
        XCTAssertTrue(top.diver.atSurface, "la partenza dalla barca deve contare come superficie")
        top.breath = 20
        for _ in 0..<120 { _ = top.step(input: DiveInput(), dt: 1.0 / 30.0) }
        XCTAssertGreaterThan(top.breath, 100)
    }

    func testPressureBeyondTheSuitLimitDrainsBreathFast() throws {
        var sim: DiveSim = try makeSim()
        sim.maxSafeDepth = 20
        sim.diver.position = sim.map.nearestOpenPoint(to: sim.map.channelPoint(depthMeters: 40), clearance: 12)
        var warned: Bool = false
        for _ in 0..<300 {
            if sim.step(input: DiveInput(), dt: 1.0 / 30.0).contains(DiveEvent.pressure) { warned = true }
        }
        XCTAssertTrue(warned)
        XCTAssertLessThan(sim.breath, 60)
    }

    func testOverloadedBagSlowsTheDiver() {
        var bag: DiveBag = DiveBag()
        XCTAssertEqual(bag.speedFactor, 1)
        bag.fish.append(CatchItem(speciesId: "cernia", stars: 2, weight: 8))
        XCTAssertEqual(bag.speedFactor, 1)
        bag.fish.append(CatchItem(speciesId: "ricciola", stars: 2, weight: 7))
        XCTAssertLessThan(bag.speedFactor, 0.5)
        XCTAssertGreaterThanOrEqual(bag.speedFactor, 0.4)
        bag.materials["riccio"] = 10
        XCTAssertEqual(bag.totalWeight, 18, accuracy: 1e-9)
    }

    func testShyFishToleratesASlowApproachButFleesAFastOne() throws {
        let species: FishSpecies = try XCTUnwrap(try catalog().find("orata"))
        let fish: FishBody = FishBody(species: species, spawnIndex: 0, position: Vec2(500, 500), seed: 4)
        let near: Vec2 = Vec2(500 - species.sight * 0.7, 500)
        XCTAssertNil(FishAI.think(fish, diver: near, diverSpeed: 10))
        XCTAssertEqual(FishAI.think(fish, diver: near, diverSpeed: 60), FishState.flee)
        XCTAssertEqual(FishAI.think(fish, diver: Vec2(500 - species.sight * 0.3, 500), diverSpeed: 0), FishState.flee)
    }

    func testTerritorialFishTelegraphsChargesAndHurts() throws {
        var found: DiveSim? = nil
        for seed in UInt64(11)...UInt64(40) {
            var candidate: DiveSim = try makeSim(seed: seed)
            if place(&candidate, near: "cernia", distance: 40) != nil {
                found = candidate
                break
            }
        }
        var sim: DiveSim = try XCTUnwrap(found, "nessuna cernia raggiungibile in trenta mappe")
        var telegraphed: Bool = false
        var hurt: Bool = false
        var seen: Set<FishState> = []
        for _ in 0..<60 * 20 {
            for event in sim.step(input: DiveInput(), dt: 1.0 / 60.0) {
                if case DiveEvent.telegraph = event { telegraphed = true }
                if case DiveEvent.diverHurt = event { hurt = true }
            }
            for f in sim.fish where f.species.id == "cernia" { seen.insert(f.state) }
            if hurt { break }
        }
        XCTAssertTrue(telegraphed, "stati visti: \(seen)")
        XCTAssertTrue(hurt, "stati visti: \(seen)")
        XCTAssertLessThan(sim.breath, 120)
    }

    func testStateTransitionTableIsSane() {
        for from in FishState.allCases {
            XCTAssertFalse(FishAI.isValid(from: from, to: from))
            XCTAssertFalse(FishAI.isValid(from: FishState.dead, to: from))
            if from != FishState.dead { XCTAssertTrue(FishAI.isValid(from: from, to: FishState.dead)) }
        }
        XCTAssertTrue(FishAI.isValid(from: FishState.chase, to: FishState.windup))
        XCTAssertFalse(FishAI.isValid(from: FishState.wander, to: FishState.charge))
    }

    func testLongDiveKeepsEveryFishInWaterAndBoundsTheActiveSet() throws {
        var sim: DiveSim = try makeSim(seed: 5)
        var maxActive: Int = 0
        var input: DiveInput = DiveInput()
        for frame in 0..<60 * 60 {
            // Scende a zig-zag lungo il canale principale, risalendo ogni tanto a respirare.
            let phase: Int = (frame / 600) % 4
            input.move = phase == 3 ? Vec2(0, -1) : Vec2(sin(Double(frame) * 0.01) * 0.6, 0.8)
            _ = sim.step(input: input, dt: 1.0 / 60.0)
            var members: Int = 0
            for school in sim.schools { members += school.aliveCount }
            maxActive = max(maxActive, sim.fish.count + members)
            if frame % 30 == 0 {
                for f in sim.fish {
                    XCTAssertLessThan(sim.map.density(x: f.position.x, y: f.position.y), 0.62, "\(f.species.id) dentro la roccia")
                    XCTAssertGreaterThanOrEqual(f.position.y, 0)
                }
            }
            if sim.fainted { break }
        }
        XCTAssertGreaterThan(maxActive, 5)
        XCTAssertLessThan(maxActive, 160)
    }

    func testPickupsAndAirBells() throws {
        var sim: DiveSim = try makeSim()
        let index: Int = try XCTUnwrap(sim.pickups.firstIndex(where: { $0.kind != PickupPoint.Kind.campana }))
        sim.diver.position = Vec2(sim.pickups[index].position.x, sim.pickups[index].position.y - 10)
        XCTAssertEqual(sim.interaction(), DiveInteraction.pickup(index: index))
        var input: DiveInput = DiveInput()
        input.interact = true
        let events: [DiveEvent] = sim.step(input: input, dt: 1.0 / 60.0)
        XCTAssertTrue(events.contains(where: { if case DiveEvent.pickedUp = $0 { return true } else { return false } }))
        XCTAssertEqual(sim.bag.materials[sim.pickups[index].kind.rawValue], 1)
        XCTAssertTrue(sim.pickups[index].taken)

        let bell: Int = try XCTUnwrap(sim.pickups.firstIndex(where: { $0.kind == PickupPoint.Kind.campana }))
        sim.diver.position = sim.pickups[bell].position
        sim.breath = 30
        XCTAssertTrue(sim.step(input: input, dt: 1.0 / 60.0).contains(DiveEvent.breathRefilled))
        XCTAssertEqual(sim.breath, sim.breathMax, accuracy: 1.0)
        // Una campana serve una volta sola.
        sim.breath = 30
        XCTAssertFalse(sim.step(input: input, dt: 1.0 / 60.0).contains(DiveEvent.breathRefilled))
    }
}
