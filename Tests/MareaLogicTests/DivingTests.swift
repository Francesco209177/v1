import XCTest
@testable import MareaLogic

final class DivingTests: XCTestCase {

    private func loadWorld() throws -> WorldData {
        return try DataFiles.load(WorldData.self, file: "zones.json", in: TestSupport.dataDirectory)
    }

    func testZonesFileIsValid() throws {
        let world: WorldData = try loadWorld()
        XCTAssertTrue(world.problems().isEmpty, world.problems().joined(separator: "\n"))
        XCTAssertEqual(world.zones.count, 6)
        XCTAssertEqual(world.zone(atDepth: 0)?.id, "posidonia")
        XCTAssertEqual(world.zone(atDepth: 300)?.id, "citta")
        XCTAssertEqual(world.zone(atDepth: 99_999)?.id, "santuario")
    }

    func testWaterColorIsContinuousAcrossZones() throws {
        let world: WorldData = try loadWorld()
        for zone in world.zones.dropLast() {
            let above: RGBA = world.waterColor(atDepth: Double(zone.depthTo) - 0.01)
            let below: RGBA = world.waterColor(atDepth: Double(zone.depthTo) + 0.01)
            XCTAssertLessThanOrEqual(abs(Int(above.r) - Int(below.r)), 3, zone.id)
            XCTAssertLessThanOrEqual(abs(Int(above.g) - Int(below.g)), 3, zone.id)
            XCTAssertLessThanOrEqual(abs(Int(above.b) - Int(below.b)), 3, zone.id)
        }
        XCTAssertEqual(world.light(atDepth: 0), 1.0, accuracy: 1e-9)
        XCTAssertLessThan(world.light(atDepth: 450), 0.2)
    }

    func testMapGenerationIsDeterministic() throws {
        let world: WorldData = try loadWorld()
        let a: CaveMap = CaveGenerator.generate(seed: 12345, world: world)
        let b: CaveMap = CaveGenerator.generate(seed: 12345, world: world)
        let c: CaveMap = CaveGenerator.generate(seed: 54321, world: world)
        XCTAssertEqual(a.solid, b.solid)
        XCTAssertEqual(a.props, b.props)
        XCTAssertNotEqual(a.solid, c.solid)
        XCTAssertEqual(a.cols, world.mapWidthMeters)
        XCTAssertEqual(a.rows, world.maxDepthMeters)
    }

    func testMainChannelIsAlwaysOpen() throws {
        let world: WorldData = try loadWorld()
        for seed in [UInt64(1), 7, 99, 2026, 31_337] {
            let map: CaveMap = CaveGenerator.generate(seed: seed, world: world)
            var depth: Double = 2
            while depth < Double(map.rows) - 6 {
                let p: Vec2 = map.channelPoint(depthMeters: depth)
                XCTAssertLessThan(map.density(x: p.x, y: p.y), 0.5, "seme \(seed): canale chiuso a \(depth) m")
                depth += 1
            }
        }
    }

    func testNoUnreachableWater() throws {
        let world: WorldData = try loadWorld()
        let map: CaveMap = CaveGenerator.generate(seed: 3, world: world)
        var reached: [Bool] = [Bool](repeating: false, count: map.cols * map.rows)
        var stack: [Int] = []
        for c in 0..<map.cols where !map.isSolidCell(c, 0) {
            reached[c] = true
            stack.append(c)
        }
        while let index: Int = stack.popLast() {
            let c: Int = index % map.cols
            let r: Int = index / map.cols
            for (nc, nr) in [(c + 1, r), (c - 1, r), (c, r + 1), (c, r - 1)] {
                if nc < 0 || nc >= map.cols || nr < 0 || nr >= map.rows { continue }
                let ni: Int = nr * map.cols + nc
                if reached[ni] || map.isSolidCell(nc, nr) { continue }
                reached[ni] = true
                stack.append(ni)
            }
        }
        var water: Int = 0
        var isolated: Int = 0
        for i in 0..<reached.count where map.solid[i] == 0 {
            water += 1
            if !reached[i] { isolated += 1 }
        }
        XCTAssertEqual(isolated, 0)
        // La mappa non deve essere né un blocco pieno né una vasca vuota.
        let ratio: Double = Double(water) / Double(reached.count)
        XCTAssertTrue(ratio > 0.25 && ratio < 0.75, "frazione d'acqua \(ratio)")
        XCTAssertGreaterThan(map.props.count, 150)
    }

    func testDiverSwimsGlidesAndStopsAtRock() throws {
        let world: WorldData = try loadWorld()
        let map: CaveMap = CaveGenerator.generate(seed: 5, world: world)
        let tuning: DiverTuning = DiverTuning()
        let start: Vec2 = map.nearestOpenPoint(to: map.channelPoint(depthMeters: 20), clearance: 12)
        var diver: DiverState = DiverState(position: start)
        let dt: Double = 1.0 / 60.0

        // Nuota a destra per mezzo secondo: accelera senza superare la velocità massima.
        for _ in 0..<30 {
            _ = DiverMotion.step(&diver, input: Vec2(1, 0), wantsDash: false, speedFactor: 1, map: map, tuning: tuning, dt: dt)
        }
        XCTAssertGreaterThan(diver.position.x, start.x + 10)
        XCTAssertLessThanOrEqual(diver.velocity.length, tuning.maxSpeed + 0.5)
        XCTAssertTrue(diver.facingRight)

        // Lascia i comandi: scivola ancora un po', poi si ferma.
        let xBefore: Double = diver.position.x
        for _ in 0..<600 {
            _ = DiverMotion.step(&diver, input: Vec2.zero, wantsDash: false, speedFactor: 1, map: map, tuning: tuning, dt: dt)
        }
        XCTAssertGreaterThan(diver.position.x, xBefore)
        XCTAssertEqual(diver.velocity.length, 0, accuracy: 1e-9)

        // Spinge a lungo contro la parete: non entra mai nella roccia.
        for _ in 0..<1800 {
            _ = DiverMotion.step(&diver, input: Vec2(1, 0.2), wantsDash: false, speedFactor: 1, map: map, tuning: tuning, dt: dt)
            XCTAssertLessThan(map.density(x: diver.position.x, y: diver.position.y), 0.5)
        }

        // Risale fino in superficie e lì si ferma.
        for _ in 0..<3600 {
            _ = DiverMotion.step(&diver, input: Vec2(0, -1), wantsDash: false, speedFactor: 1, map: map, tuning: tuning, dt: dt)
        }
        XCTAssertGreaterThanOrEqual(diver.position.y, DiverMotion.surfaceY)
    }

    func testDashHasCooldown() throws {
        let world: WorldData = try loadWorld()
        let map: CaveMap = CaveGenerator.generate(seed: 5, world: world)
        let tuning: DiverTuning = DiverTuning()
        var diver: DiverState = DiverState(position: map.nearestOpenPoint(to: map.channelPoint(depthMeters: 20), clearance: 12))
        let first: DiverStepResult = DiverMotion.step(&diver, input: Vec2(1, 0), wantsDash: true, speedFactor: 1, map: map, tuning: tuning, dt: 1.0 / 60.0)
        XCTAssertTrue(first.startedDash)
        XCTAssertGreaterThan(diver.velocity.length, tuning.maxSpeed)
        let second: DiverStepResult = DiverMotion.step(&diver, input: Vec2(1, 0), wantsDash: true, speedFactor: 1, map: map, tuning: tuning, dt: 1.0 / 60.0)
        XCTAssertFalse(second.startedDash)
        for _ in 0..<70 {
            _ = DiverMotion.step(&diver, input: Vec2(1, 0), wantsDash: false, speedFactor: 1, map: map, tuning: tuning, dt: 1.0 / 60.0)
        }
        let third: DiverStepResult = DiverMotion.step(&diver, input: Vec2(1, 0), wantsDash: true, speedFactor: 1, map: map, tuning: tuning, dt: 1.0 / 60.0)
        XCTAssertTrue(third.startedDash)
    }

    func testTerrainPainterDrawsRockOnlyWhereTheMapIsSolid() throws {
        let world: WorldData = try loadWorld()
        let map: CaveMap = CaveGenerator.generate(seed: 9, world: world)
        let styles: [TerrainStyle] = TerrainPainter.styles(for: world)
        let result: TerrainPainter.Result = TerrainPainter.paint(map: map, world: world, styles: styles, originX: 0, originY: 256, width: 128, height: 128)
        XCTAssertTrue(result.hasRock)
        var mismatches: Int = 0
        for y in 0..<128 {
            for x in 0..<128 {
                let solid: Bool = map.density(x: Double(x) + 0.5, y: Double(256 + y) + 0.5) > 0.5
                if solid != (result.image.get(x, y).a != 0) { mismatches += 1 }
            }
        }
        XCTAssertEqual(mismatches, 0)
    }

    func testSettingsDecodeToleratesMissingFields() throws {
        let partial: Data = Data("{\"musicVolume\":0.2}".utf8)
        let settings: GameSettings = try JSONDecoder().decode(GameSettings.self, from: partial)
        XCTAssertEqual(settings.musicVolume, 0.2, accuracy: 1e-9)
        XCTAssertTrue(settings.haptics)
        var mapping: ControllerMapping = ControllerMapping.standard
        mapping.assign(PadButton.a, to: GameButtons.dash)
        XCTAssertEqual(mapping.button(for: GameButtons.dash), PadButton.a)
        // Il tasto che era dell'azione "interagisci" si scambia con quello vecchio dello scatto.
        XCTAssertEqual(mapping.button(for: GameButtons.interact), PadButton.b)
    }
}
