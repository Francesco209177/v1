import XCTest
@testable import MareaLogic

final class ProgressionTests: XCTestCase {

    private func load<T: Decodable>(_ type: T.Type, _ file: String) throws -> T {
        return try DataFiles.load(type, file: file, in: TestSupport.dataDirectory)
    }

    private func makeSim(seed: UInt64, night: Bool = false, maxDepth: Double = 110) throws -> DiveSim {
        let world: WorldData = try load(WorldData.self, "zones.json")
        let map: CaveMap = CaveGenerator.generate(seed: seed, world: world)
        return DiveSim(map: map, catalog: try load(FishCatalog.self, "fish.json"), seed: seed, night: night, startDepthMeters: 0, maxSafeDepth: maxDepth)
    }

    /// Mette un pesce di una specie a distanza fissa davanti a Tecla, in acqua libera.
    private func stage(_ sim: inout DiveSim, species id: String, distance: Double) throws -> Int {
        let species: FishSpecies = try XCTUnwrap(sim.catalog.find(id))
        let p: Vec2 = sim.map.nearestOpenPoint(to: sim.map.channelPoint(depthMeters: 30), clearance: 40)
        sim.diver.position = p
        sim.diver.velocity = Vec2.zero
        sim.diver.facingRight = true
        sim.fish.removeAll()
        sim.schools.removeAll()
        sim.schoolIds.removeAll()
        for i in 0..<sim.spawns.count { sim.spawns[i].remaining = 0 }
        return sim.addFishForTesting(species: species, at: Vec2(p.x + distance, p.y))
    }

    func testProgressionDataIsValid() throws {
        let fish: FishCatalog = try load(FishCatalog.self, "fish.json")
        let recipes: RecipeBook = try load(RecipeBook.self, "recipes.json")
        let upgrades: UpgradeBook = try load(UpgradeBook.self, "upgrades.json")
        let quests: QuestBook = try load(QuestBook.self, "quests.json")
        XCTAssertTrue(fish.problems().isEmpty, fish.problems().joined(separator: "\n"))
        XCTAssertTrue(upgrades.problems().isEmpty, upgrades.problems().joined(separator: "\n"))
        let problems: [String] = quests.problems(fish: fish, recipes: recipes, upgrades: upgrades)
        XCTAssertTrue(problems.isEmpty, problems.joined(separator: "\n"))
        XCTAssertEqual(upgrades.weapons.count, 5)
        // La muta al massimo deve permettere di arrivare in fondo alla mappa.
        let world: WorldData = try load(WorldData.self, "zones.json")
        let suit: UpgradeInfo = try XCTUnwrap(upgrades.upgrade("suit"))
        XCTAssertGreaterThanOrEqual(suit.value(level: suit.levels.count), Double(world.maxDepthMeters))
        let balance: Balance = try load(Balance.self, "balance.json")
        XCTAssertEqual(suit.base, balance.startSafeDepth)
        XCTAssertEqual(try XCTUnwrap(upgrades.upgrade("breath")).base, balance.startBreath)
        XCTAssertEqual(try XCTUnwrap(upgrades.upgrade("bag")).base, balance.startBagWeight)
    }

    func testShopSpendsGoldAndStopsAtTheLastLevel() throws {
        let book: UpgradeBook = try load(UpgradeBook.self, "upgrades.json")
        var state: GameState = GameState()
        state.gold = 50
        XCTAssertEqual(Shop.buyUpgrade("bag", state: &state, book: book), Shop.Outcome.notEnoughGold)
        state.gold = 100_000
        var bought: Int = 0
        while Shop.buyUpgrade("bag", state: &state, book: book) == Shop.Outcome.bought { bought += 1 }
        XCTAssertEqual(bought, book.upgrade("bag")?.levels.count)
        XCTAssertEqual(Shop.buyUpgrade("bag", state: &state, book: book), Shop.Outcome.maxed)
        XCTAssertEqual(book.value("bag", state: state, fallback: 0), 44)
        XCTAssertEqual(Shop.buyWeapon("rete", state: &state, book: book), Shop.Outcome.bought)
        XCTAssertEqual(Shop.buyWeapon("rete", state: &state, book: book), Shop.Outcome.alreadyOwned)
        XCTAssertEqual(state.equipped, "rete")
        XCTAssertEqual(Shop.buyUpgrade("nulla", state: &state, book: book), Shop.Outcome.unknown)
    }

    func testNetCatchesSmallFishAliveButNotBigOnes() throws {
        let book: UpgradeBook = try load(UpgradeBook.self, "upgrades.json")
        var sim: DiveSim = try makeSim(seed: 11)
        _ = try stage(&sim, species: "donzella", distance: 60)
        _ = sim.addFishForTesting(species: try XCTUnwrap(sim.catalog.find("cernia")), at: Vec2(sim.diver.position.x + 66, sim.diver.position.y + 6))
        sim.equip(book.weapon("rete"))
        var input: DiveInput = DiveInput()
        input.secondary = Vec2(1, 0)
        let events: [DiveEvent] = sim.step(input: input, dt: 1.0 / 60.0)
        XCTAssertEqual(sim.bag.fish, [CatchItem(speciesId: "donzella", stars: 3, weight: 0.4)])
        XCTAssertTrue(events.contains(where: { if case DiveEvent.secondaryUsed = $0 { return true } else { return false } }))
        XCTAssertEqual(sim.fish.count, 1)
        XCTAssertEqual(sim.ammo, 2)
        // Senza colpi non succede nulla.
        sim.ammo = 0
        for _ in 0..<90 { _ = sim.step(input: DiveInput(), dt: 1.0 / 60.0) }
        XCTAssertTrue(sim.step(input: input, dt: 1.0 / 60.0).contains(DiveEvent.outOfAmmo))
    }

    func testSleepDartThenHarpoonGivesThreeStars() throws {
        let book: UpgradeBook = try load(UpgradeBook.self, "upgrades.json")
        var sim: DiveSim = try makeSim(seed: 11)
        _ = try stage(&sim, species: "cernia", distance: 90)
        sim.equip(book.weapon("dardi"))
        var input: DiveInput = DiveInput()
        input.secondary = Vec2(1, 0)
        var asleep: Bool = false
        var events: [DiveEvent] = sim.step(input: input, dt: 1.0 / 60.0)
        for _ in 0..<60 {
            events.append(contentsOf: sim.step(input: DiveInput(), dt: 1.0 / 60.0))
        }
        for event in events { if case DiveEvent.asleep = event { asleep = true } }
        XCTAssertTrue(asleep)
        XCTAssertEqual(sim.fish.first?.state, FishState.asleep)
        var fire: DiveInput = DiveInput()
        fire.fire = Vec2(1, 0)
        _ = sim.step(input: fire, dt: 1.0 / 60.0)
        for _ in 0..<180 { _ = sim.step(input: DiveInput(), dt: 1.0 / 60.0) }
        XCTAssertEqual(sim.bag.fish, [CatchItem(speciesId: "cernia", stars: 3, weight: 8.0)])
    }

    func testSleepWearsOff() throws {
        let book: UpgradeBook = try load(UpgradeBook.self, "upgrades.json")
        var sim: DiveSim = try makeSim(seed: 11)
        _ = try stage(&sim, species: "sarago", distance: 80)
        sim.equip(book.weapon("bombe"))
        var input: DiveInput = DiveInput()
        input.secondary = Vec2(1, 0)
        _ = sim.step(input: input, dt: 1.0 / 60.0)
        var slept: Bool = false
        for _ in 0..<60 * 2 {
            _ = sim.step(input: DiveInput(), dt: 1.0 / 60.0)
            if sim.fish.first?.state == FishState.asleep { slept = true }
        }
        XCTAssertTrue(slept)
        for _ in 0..<60 * 6 { _ = sim.step(input: DiveInput(), dt: 1.0 / 60.0) }
        XCTAssertNotEqual(sim.fish.first?.state, FishState.asleep)
    }

    func testBoltAndKnife() throws {
        let book: UpgradeBook = try load(UpgradeBook.self, "upgrades.json")
        var sim: DiveSim = try makeSim(seed: 11)
        _ = try stage(&sim, species: "sarago", distance: 120)
        sim.equip(book.weapon("fucile"))
        var input: DiveInput = DiveInput()
        input.secondary = Vec2(1, 0)
        _ = sim.step(input: input, dt: 1.0 / 60.0)
        for _ in 0..<60 { _ = sim.step(input: DiveInput(), dt: 1.0 / 60.0) }
        XCTAssertEqual(sim.bag.fish.first?.speciesId, "sarago")
        XCTAssertEqual(sim.bag.fish.first?.stars, 2)

        var close: DiveSim = try makeSim(seed: 11)
        _ = try stage(&close, species: "donzella", distance: 18)
        close.equip(book.weapon("coltello"))
        _ = close.step(input: input, dt: 1.0 / 60.0)
        XCTAssertEqual(close.bag.fish, [CatchItem(speciesId: "donzella", stars: 1, weight: 0.4)])
        // Il coltello non consuma colpi.
        for _ in 0..<60 { _ = close.step(input: DiveInput(), dt: 1.0 / 60.0) }
        XCTAssertFalse(close.step(input: input, dt: 1.0 / 60.0).contains(DiveEvent.outOfAmmo))
    }

    func testProtectedSpeciesCanOnlyBePhotographed() throws {
        var sim: DiveSim = try makeSim(seed: 11)
        let id: Int = try stage(&sim, species: "tartaruga", distance: 40)
        XCTAssertNil(sim.bestTarget(direction: Vec2(1, 0)))
        var fire: DiveInput = DiveInput()
        fire.fire = Vec2(1, 0)
        _ = sim.step(input: fire, dt: 1.0 / 60.0)
        for _ in 0..<120 { _ = sim.step(input: DiveInput(), dt: 1.0 / 60.0) }
        XCTAssertTrue(sim.bag.fish.isEmpty)
        XCTAssertEqual(sim.fish.count, 1)
        sim.diver.position = sim.fish[0].position + Vec2(-30, 0)
        XCTAssertEqual(sim.interaction(), DiveInteraction.photo(fishId: id))
        var snap: DiveInput = DiveInput()
        snap.interact = true
        XCTAssertTrue(sim.step(input: snap, dt: 1.0 / 60.0).contains(DiveEvent.photographed(species: "tartaruga")))
        XCTAssertEqual(sim.bag.photos, ["tartaruga"])
        // La stessa specie non si fotografa due volte nella stessa immersione.
        XCTAssertNil(sim.interaction())
    }

    func testInedibleSpeciesGiveNoLootAndNightVariantsShareTheIngredient() throws {
        var sim: DiveSim = try makeSim(seed: 11)
        _ = try stage(&sim, species: "medusa", distance: 60)
        var fire: DiveInput = DiveInput()
        fire.fire = Vec2(1, 0)
        _ = sim.step(input: fire, dt: 1.0 / 60.0)
        for _ in 0..<120 { _ = sim.step(input: DiveInput(), dt: 1.0 / 60.0) }
        XCTAssertTrue(sim.fish.isEmpty)
        XCTAssertTrue(sim.bag.fish.isEmpty)

        var night: DiveSim = try makeSim(seed: 11, night: true)
        _ = try stage(&night, species: "seppia_notte", distance: 60)
        night.harpoonTuning.damage = 50
        _ = night.step(input: fire, dt: 1.0 / 60.0)
        for _ in 0..<120 { _ = night.step(input: DiveInput(), dt: 1.0 / 60.0) }
        XCTAssertEqual(night.bag.fish.first?.speciesId, "seppia")
    }

    func testNightDivesSpawnOnlyNightSpecies() throws {
        let night: DiveSim = try makeSim(seed: 5, night: true)
        XCTAssertGreaterThan(night.spawns.count, 15)
        for spawn in night.spawns {
            XCTAssertEqual(night.catalog.find(spawn.speciesId)?.night, true, spawn.speciesId)
        }
        let deep: DiveSim = try makeSim(seed: 5, maxDepth: 620)
        var deepest: Double = 0
        var ids: Set<String> = []
        for spawn in deep.spawns {
            deepest = max(deepest, spawn.position.y / 16)
            ids.insert(spawn.speciesId)
        }
        XCTAssertGreaterThan(deepest, 520)
        XCTAssertGreaterThan(ids.count, 18, "specie comparse: \(ids.sorted())")
    }

    func testQuestsAdvanceCompleteAndPayOnce() throws {
        let book: QuestBook = try load(QuestBook.self, "quests.json")
        var state: GameState = GameState()
        let gold: Int = state.gold
        XCTAssertTrue(QuestEngine.active(book, state: state).contains(where: { $0.id == "ines_ricci" }))
        XCTAssertFalse(QuestEngine.active(book, state: state).contains(where: { $0.id == "ines_incasso" }))
        XCTAssertTrue(QuestEngine.record(QuestEvent.collected(item: "riccio", count: 4), state: &state, quests: book.quests).isEmpty)
        XCTAssertEqual(state.quests.progress["ines_ricci"]?.count, 4)
        XCTAssertEqual(QuestEngine.record(QuestEvent.collected(item: "riccio", count: 5), state: &state, quests: book.quests), ["ines_ricci"])
        let quest: Quest = try XCTUnwrap(book.find("ines_ricci"))
        XCTAssertTrue(QuestEngine.claim(quest, state: &state))
        XCTAssertEqual(state.gold, gold + 45)
        XCTAssertFalse(QuestEngine.claim(quest, state: &state))
        XCTAssertTrue(QuestEngine.active(book, state: state).contains(where: { $0.id == "ines_incasso" }))

        // Le soglie (profondità) contano il massimo raggiunto, non la somma.
        _ = QuestEngine.record(QuestEvent.depth(30), state: &state, quests: book.quests)
        _ = QuestEngine.record(QuestEvent.depth(40), state: &state, quests: book.quests)
        XCTAssertEqual(state.quests.progress["zaira_metri"]?.count, 40)
        XCTAssertEqual(QuestEngine.record(QuestEvent.depth(75), state: &state, quests: book.quests), ["zaira_metri"])
        XCTAssertTrue(QuestEngine.claim(try XCTUnwrap(book.find("zaira_metri")), state: &state))
        XCTAssertEqual(state.weapons, ["coltello"])
        XCTAssertEqual(state.equipped, "coltello")
    }

    func testDailyCommissionsAreStableWithinADayAndChangeTheNext() throws {
        let fish: FishCatalog = try load(FishCatalog.self, "fish.json")
        let recipes: RecipeBook = try load(RecipeBook.self, "recipes.json")
        var state: GameState = GameState()
        state.seed = 99
        _ = state.bank(bag: DiveBag(), deepest: 0, recipes: recipes)
        let today: [Quest] = QuestEngine.daily(state: state, fish: fish, recipes: recipes, maxDepth: 110)
        XCTAssertEqual(today.count, 2)
        XCTAssertEqual(today, QuestEngine.daily(state: state, fish: fish, recipes: recipes, maxDepth: 110))
        for quest in today {
            if quest.goal.kind == "catch", let target: String = quest.goal.target {
                XCTAssertLessThan(try XCTUnwrap(fish.find(target)).depthMin, 110)
            }
        }
        _ = QuestEngine.record(QuestEvent.caught(item: today[0].goal.target ?? "", stars: 2), state: &state, quests: today)
        XCTAssertNotNil(state.quests.progress[today[0].id])
        state.day += 1
        QuestEngine.pruneDaily(state: &state)
        XCTAssertNil(state.quests.progress[today[0].id])
        XCTAssertNotEqual(QuestEngine.daily(state: state, fish: fish, recipes: recipes, maxDepth: 110).map { $0.id }, today.map { $0.id })
    }
}
