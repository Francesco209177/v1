import XCTest
@testable import MareaLogic

final class RestaurantTests: XCTestCase {

    private func fish() throws -> FishCatalog {
        return try DataFiles.load(FishCatalog.self, file: "fish.json", in: TestSupport.dataDirectory)
    }

    private func book() throws -> RecipeBook {
        return try DataFiles.load(RecipeBook.self, file: "recipes.json", in: TestSupport.dataDirectory)
    }

    private func balance() throws -> Balance {
        return try DataFiles.load(Balance.self, file: "balance.json", in: TestSupport.dataDirectory)
    }

    /// Un cameriere che fa sempre la cosa utile più vicina. `skill` da 0 a 1: quanto spesso sbaglia a versare.
    private func runService(_ sim: inout ServiceSim, lazy: Bool = false) -> [ServiceEvent] {
        var all: [ServiceEvent] = []
        var frame: Int = 0
        var wasPouring: Bool = false
        while !sim.finished && frame < 60 * 600 {
            var input: ServiceInput = ServiceInput()
            if sim.pouring {
                input.pourHeld = sim.pourLevel < ServiceSim.pourTarget
                wasPouring = true
            } else if !lazy {
                // Obiettivo: il più urgente tra servire, prendere ordini, ritirare, pulire.
                var targetX: Double? = nil
                var carryingDish: String? = nil
                var carryingWine: Bool = false
                for item in sim.carrying {
                    if case Carried.dish(let d) = item { carryingDish = d }
                    if case Carried.wine = item { carryingWine = true }
                }
                if let dish: String = carryingDish {
                    for c in sim.customers where c.phase == CustomerPhase.waitingFood && c.dishId == dish { targetX = sim.tables[c.table].x }
                    if targetX == nil { targetX = ServiceSim.passX }
                } else if carryingWine {
                    for c in sim.customers where c.wantsWine && !c.wineServed && (c.phase == CustomerPhase.waitingFood || c.phase == CustomerPhase.eating) {
                        targetX = sim.tables[c.table].x
                    }
                } else {
                    for c in sim.customers where c.phase == CustomerPhase.waitingToOrder { targetX = sim.tables[c.table].x }
                    if targetX == nil && !sim.pass.isEmpty { targetX = ServiceSim.passX }
                    if targetX == nil {
                        for table in sim.tables where table.dirty && table.customer == nil { targetX = table.x }
                    }
                    if targetX == nil && frame % 400 < 200 {
                        for c in sim.customers where c.wantsWine && !c.wineServed && c.phase == CustomerPhase.waitingFood { targetX = ServiceSim.barrelX }
                    }
                }
                if let x: Double = targetX {
                    if abs(x - sim.teclaX) > 6 {
                        input.moveX = x > sim.teclaX ? 1 : -1
                    } else if sim.availableAction() != nil {
                        input.interact = true
                    }
                }
                _ = wasPouring
            }
            all.append(contentsOf: sim.step(input: input, dt: 1.0 / 60.0))
            frame += 1
        }
        return all
    }

    private func setup(dishes: [PreparedDish], tables: Int = 3, vip: String? = nil) throws -> ServiceSetup {
        let b: Balance = try balance()
        var s: ServiceSetup = ServiceSetup(dishes: dishes, recipes: try book(), tuning: b.service, tables: tables, arrivalEvery: 6.0, seed: 3)
        s.vipDishId = vip
        return s
    }

    func testDataFilesAreValid() throws {
        let b: Balance = try balance()
        XCTAssertTrue(b.problems().isEmpty, b.problems().joined(separator: "\n"))
        let problems: [String] = try book().problems(fish: try fish())
        XCTAssertTrue(problems.isEmpty, problems.joined(separator: "\n"))
        XCTAssertEqual(b.rankIndex(fame: 0), 0)
        XCTAssertEqual(b.rankIndex(fame: 120), 2)
        XCTAssertEqual(b.fameToNextRank(fame: 30), 10)
        XCTAssertNil(b.fameToNextRank(fame: 99_999))
    }

    func testEveryCatchableSpeciesHasARecipe() throws {
        let recipes: RecipeBook = try book()
        var used: Set<String> = []
        for r in recipes.recipes { for i in r.ingredients { used.insert(i.item) } }
        for species in try fish().species {
            XCTAssertTrue(used.contains(species.id), "nessuna ricetta usa \(species.id)")
        }
        for material in DiveBag.materialWeights.keys {
            XCTAssertTrue(used.contains(material), "nessuna ricetta usa \(material)")
        }
    }

    func testPantryTakesTheBestFirst() {
        var pantry: Pantry = Pantry()
        pantry.add("orata", stars: 1, count: 2)
        pantry.add("orata", stars: 3, count: 1)
        XCTAssertEqual(pantry.total("orata"), 3)
        XCTAssertNil(pantry.take("orata", count: 4))
        let stars: Double? = pantry.take("orata", count: 2)
        XCTAssertEqual(stars ?? 0, 2.0, accuracy: 1e-9)
        XCTAssertEqual(pantry.count("orata", stars: 3), 0)
        XCTAssertEqual(pantry.count("orata", stars: 1), 1)
        XCTAssertEqual(pantry.entries().count, 1)
    }

    func testBankingACatchFillsPantryLogAndUnlocksRecipes() throws {
        var state: GameState = GameState()
        var bag: DiveBag = DiveBag()
        bag.fish = [CatchItem(speciesId: "orata", stars: 2, weight: 1.6), CatchItem(speciesId: "sardina", stars: 2, weight: 0.2)]
        bag.materials["riccio"] = 3
        let learned: [String] = state.bank(bag: bag, deepest: 42, recipes: try book())
        XCTAssertEqual(learned, ["orata_sale"])
        XCTAssertEqual(state.recipes["sarde_beccafico"], 1)
        XCTAssertEqual(state.recipes["orata_sale"], 1)
        XCTAssertNil(state.recipes["cernia_matalotta"])
        XCTAssertEqual(state.fishLog["orata"]?.caught, 1)
        XCTAssertEqual(state.pantry.total("riccio"), 3)
        XCTAssertEqual(state.deepestDive, 42)
        // Banca di nuovo: nessuna ricetta imparata due volte.
        XCTAssertTrue(state.bank(bag: DiveBag(), deepest: 0, recipes: try book()).isEmpty)
    }

    func testMenuPlannerConsumesIngredientsAndPricesByQuality() throws {
        let recipes: RecipeBook = try book()
        let b: Balance = try balance()
        let orata: Recipe = try XCTUnwrap(recipes.find("orata_sale"))
        var poor: GameState = GameState()
        poor.pantry.add("orata", stars: 1, count: 2)
        var fine: GameState = GameState()
        fine.pantry.add("orata", stars: 3, count: 2)
        XCTAssertEqual(MenuPlanner.maxBatches(orata, pantry: poor.pantry), 2)
        let cheap: PreparedDish = try XCTUnwrap(MenuPlanner.prepare(orata, batches: 2, state: &poor, balance: b))
        let dear: PreparedDish = try XCTUnwrap(MenuPlanner.prepare(orata, batches: 1, state: &fine, balance: b))
        XCTAssertEqual(cheap.portions, 4)
        XCTAssertEqual(dear.portions, 2)
        XCTAssertGreaterThan(dear.price, cheap.price)
        XCTAssertTrue(poor.pantry.isEmpty)
        XCTAssertEqual(fine.pantry.total("orata"), 1)
        XCTAssertNil(MenuPlanner.prepare(orata, batches: 5, state: &fine, balance: b))
    }

    func testAGoodWaiterSellsOutAndEarnsTips() throws {
        let dishes: [PreparedDish] = [PreparedDish(recipeId: "sarde_beccafico", portions: 6, price: 14),
                                      PreparedDish(recipeId: "orata_sale", portions: 4, price: 44)]
        var sim: ServiceSim = ServiceSim(setup: try setup(dishes: dishes))
        let events: [ServiceEvent] = runService(&sim)
        XCTAssertTrue(sim.finished)
        XCTAssertTrue(events.contains(ServiceEvent.closed))
        let r: ServiceResult = sim.result
        XCTAssertGreaterThanOrEqual(r.served, 7, "serviti \(r.served), persi \(r.lost)")
        XCTAssertLessThanOrEqual(r.lost, 3)
        XCTAssertGreaterThan(r.tips, 0)
        XCTAssertGreaterThanOrEqual(r.bestCombo, 2)
        XCTAssertGreaterThan(r.fame, 8)
        XCTAssertEqual(r.sold.values.reduce(0, +), r.served)
        // Nessuna porzione venduta due volte.
        XCTAssertLessThanOrEqual(r.sold["orata_sale"] ?? 0, 4)
        XCTAssertLessThanOrEqual(r.sold["sarde_beccafico"] ?? 0, 6)
    }

    func testAnIdleWaiterLosesEveryCustomer() throws {
        let dishes: [PreparedDish] = [PreparedDish(recipeId: "sarde_beccafico", portions: 6, price: 14)]
        var sim: ServiceSim = ServiceSim(setup: try setup(dishes: dishes))
        _ = runService(&sim, lazy: true)
        XCTAssertTrue(sim.finished)
        XCTAssertEqual(sim.result.served, 0)
        XCTAssertGreaterThan(sim.result.lost, 3)
        XCTAssertEqual(sim.result.fame, 0)
        XCTAssertEqual(sim.result.total, 0)
    }

    func testSpecialGuestGetsTheRequestedDish() throws {
        let dishes: [PreparedDish] = [PreparedDish(recipeId: "sarde_beccafico", portions: 8, price: 14),
                                      PreparedDish(recipeId: "orata_sale", portions: 2, price: 44)]
        var sim: ServiceSim = ServiceSim(setup: try setup(dishes: dishes, vip: "sarde_beccafico"))
        let events: [ServiceEvent] = runService(&sim)
        XCTAssertTrue(events.contains(ServiceEvent.vipDelighted))
        XCTAssertTrue(sim.result.vipDelighted)
        XCTAssertGreaterThanOrEqual(sim.result.fame, 15)
    }

    func testPouringWine() throws {
        var sim: ServiceSim = ServiceSim(setup: try setup(dishes: [PreparedDish(recipeId: "sarde_beccafico", portions: 3, price: 14)]))
        // Cammina fino alla botte.
        var frames: Int = 0
        while abs(sim.teclaX - ServiceSim.barrelX) > 4 && frames < 600 {
            var input: ServiceInput = ServiceInput()
            input.moveX = ServiceSim.barrelX > sim.teclaX ? 1 : -1
            _ = sim.step(input: input, dt: 1.0 / 60.0)
            frames += 1
        }
        XCTAssertEqual(sim.availableAction(), ServiceAction.pour)

        func pour(until level: Double) -> [ServiceEvent] {
            var events: [ServiceEvent] = []
            var input: ServiceInput = ServiceInput()
            input.interact = true
            events.append(contentsOf: sim.step(input: input, dt: 1.0 / 60.0))
            var guardFrames: Int = 0
            while sim.pouring && guardFrames < 600 {
                var hold: ServiceInput = ServiceInput()
                hold.pourHeld = sim.pourLevel < level
                events.append(contentsOf: sim.step(input: hold, dt: 1.0 / 60.0))
                guardFrames += 1
            }
            return events
        }

        XCTAssertTrue(pour(until: 0.2).contains(ServiceEvent.pourTooLittle))
        XCTAssertTrue(sim.carrying.isEmpty)
        XCTAssertTrue(pour(until: 2.0).contains(ServiceEvent.pourSpilled))
        XCTAssertTrue(sim.carrying.isEmpty)
        XCTAssertTrue(pour(until: ServiceSim.pourTarget).contains(ServiceEvent.pourDone(perfect: true)))
        XCTAssertEqual(sim.carrying, [Carried.wine(perfect: true)])
        // Con le mani piene non si versa altro.
        XCTAssertNil(sim.availableAction())
    }

    func testSaveStoreRoundTripBackupAndMigration() throws {
        let directory: URL = FileManager.default.temporaryDirectory.appendingPathComponent("marea-test-\(UInt64.random(in: 0..<UInt64.max))")
        defer { try? FileManager.default.removeItem(at: directory) }
        let store: SaveStore = SaveStore(directory: directory)
        XCTAssertFalse(store.exists(slot: 1))
        XCTAssertNil(store.load(slot: 1))

        var state: GameState = GameState()
        state.slot = 1
        state.day = 7
        state.gold = 321
        state.phase = DayPhase.evening
        state.pantry.add("orata", stars: 3, count: 2)
        state.recipes["orata_sale"] = 2
        state.tonight = [PreparedDish(recipeId: "orata_sale", portions: 2, price: 50)]
        XCTAssertTrue(store.save(state))
        XCTAssertEqual(store.load(slot: 1), state)

        // Secondo salvataggio: il primo resta come copia; un file rovinato ripiega sulla copia.
        var later: GameState = state
        later.gold = 999
        XCTAssertTrue(store.save(later))
        try Data("non è json".utf8).write(to: directory.appendingPathComponent("slot1.json"))
        XCTAssertEqual(store.load(slot: 1)?.gold, 321)

        // Un salvataggio di una versione precedente, con meno campi, si legge lo stesso.
        try Data("{\"day\":3,\"gold\":12}".utf8).write(to: directory.appendingPathComponent("slot2.json"))
        let old: GameState = try XCTUnwrap(store.load(slot: 2))
        XCTAssertEqual(old.day, 3)
        XCTAssertEqual(old.gold, 12)
        XCTAssertEqual(old.slot, 2)
        XCTAssertEqual(old.phase, DayPhase.morning)

        store.delete(slot: 1)
        XCTAssertFalse(store.exists(slot: 1))
    }

    func testDayCycleAndDiveSeeds() {
        var state: GameState = GameState()
        state.seed = 77
        let morning: UInt64 = state.diveSeed()
        state.advancePhase()
        XCTAssertEqual(state.phase, DayPhase.afternoon)
        XCTAssertNotEqual(state.diveSeed(), morning)
        state.advancePhase()
        state.tonight = [PreparedDish(recipeId: "x", portions: 1, price: 1)]
        state.advancePhase()
        XCTAssertEqual(state.phase, DayPhase.night)
        state.advancePhase()
        XCTAssertEqual(state.day, 2)
        XCTAssertEqual(state.phase, DayPhase.morning)
        XCTAssertTrue(state.tonight.isEmpty)
        XCTAssertNotEqual(state.diveSeed(), morning)
    }
}
