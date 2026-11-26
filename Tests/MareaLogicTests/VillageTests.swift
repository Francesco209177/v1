import XCTest
@testable import MareaLogic

final class VillageTests: XCTestCase {

    private func load<T: Decodable>(_ type: T.Type, _ file: String) throws -> T {
        return try DataFiles.load(type, file: file, in: TestSupport.dataDirectory)
    }

    private func unlocked() -> GameState {
        var state: GameState = GameState()
        state.gold = 5000
        state.fame = 200
        state.flags["beat_c1_baronessa"] = true
        return state
    }

    func testVillageDataIsValid() throws {
        let book: VillageBook = try load(VillageBook.self, "village.json")
        let fish: FishCatalog = try load(FishCatalog.self, "fish.json")
        let world: WorldData = try load(WorldData.self, "zones.json")
        XCTAssertTrue(book.problems(fish: fish, world: world).isEmpty, book.problems(fish: fish, world: world).joined(separator: "\n"))
        XCTAssertEqual(book.staff.count, 4)
        XCTAssertEqual(Set(book.staff.map { $0.effect }), StaffInfo.effects, "un aiuto per ogni compito")
        XCTAssertEqual(book.tiles.count, 12)
        XCTAssertEqual(book.postcards.count, 10)
        // Due maioliche per zona.
        for zone in 0..<world.zones.count { XCTAssertEqual(book.tiles.filter { $0.zone == zone }.count, 2) }
        // Le ricette con gli ortaggi sono valide e ogni ortaggio serve a qualcosa.
        let recipes: RecipeBook = try load(RecipeBook.self, "recipes.json")
        XCTAssertTrue(recipes.problems(fish: fish, crops: book.cropIds).isEmpty, recipes.problems(fish: fish, crops: book.cropIds).joined(separator: "\n"))
        for crop in book.crops {
            XCTAssertTrue(recipes.recipes.contains(where: { r in r.ingredients.contains(where: { $0.item == crop.id }) }), "\(crop.id) non è usato da nessuna ricetta")
        }
    }

    func testStaffIsHiredPaidAndHelps() throws {
        let book: VillageBook = try load(VillageBook.self, "village.json")
        var state: GameState = GameState()
        state.gold = 100
        XCTAssertEqual(Village.hire("nunzia", state: &state, book: book), Village.HireOutcome.notEnoughFame)
        state.fame = 60
        XCTAssertEqual(Village.hire("nunzia", state: &state, book: book), Village.HireOutcome.notEnoughGold)
        state.gold = 1000
        XCTAssertEqual(Village.hire("nunzia", state: &state, book: book), Village.HireOutcome.hired)
        XCTAssertEqual(Village.hire("nunzia", state: &state, book: book), Village.HireOutcome.alreadyHired)
        XCTAssertEqual(Village.hire("tano", state: &state, book: book), Village.HireOutcome.hired)
        XCTAssertEqual(state.gold, 1000 - 180 - 120)
        XCTAssertEqual(Village.wages(state: state, book: book), 16 + 12)

        // In sala: nessuno tocca niente, eppure le ordinazioni partono e i tavoli tornano puliti.
        let recipes: RecipeBook = try load(RecipeBook.self, "recipes.json")
        let balance: Balance = try load(Balance.self, "balance.json")
        var setup: ServiceSetup = ServiceSetup(dishes: [PreparedDish(recipeId: "sarde_beccafico", portions: 12, price: 10)], recipes: recipes,
                                               tuning: balance.service, tables: 3, arrivalEvery: 4, seed: 5)
        Village.apply(staff: state.village.staff, to: &setup, book: book)
        XCTAssertEqual(setup.autoOrderAfter, 4.0)
        XCTAssertEqual(setup.autoCleanAfter, 3.0)
        XCTAssertNil(setup.autoWineAfter)
        XCTAssertEqual(setup.staffSprites.count, 2)
        var sim: ServiceSim = ServiceSim(setup: setup)
        var orders: Int = 0
        var helped: Int = 0
        var step: Int = 0
        while step < 60 * 40 {
            for event in sim.step(input: ServiceInput(), dt: 1.0 / 60.0) {
                if case ServiceEvent.orderTaken = event { orders += 1 }
                if case ServiceEvent.staffHelped = event { helped += 1 }
            }
            step += 1
        }
        XCTAssertGreaterThan(orders, 2, "la cameriera deve prendere le ordinazioni da sola")
        XCTAssertGreaterThanOrEqual(helped, orders)
    }

    func testCantiniereBringsWine() throws {
        let book: VillageBook = try load(VillageBook.self, "village.json")
        let recipes: RecipeBook = try load(RecipeBook.self, "recipes.json")
        let balance: Balance = try load(Balance.self, "balance.json")
        let base: ServiceTuning = balance.service
        // Tutti i clienti chiedono il vino, così il cantiniere ha sempre da fare.
        let tuning: ServiceTuning = ServiceTuning(duration: base.duration, patienceOrder: base.patienceOrder, patienceFood: base.patienceFood,
                                                  eatTime: base.eatTime, wineChance: 1, winePrice: base.winePrice, walkSpeed: base.walkSpeed,
                                                  cleanTime: base.cleanTime, comboWindow: base.comboWindow, maxCombo: base.maxCombo)
        var setup: ServiceSetup = ServiceSetup(dishes: [PreparedDish(recipeId: "sarde_beccafico", portions: 12, price: 10)], recipes: recipes,
                                               tuning: tuning, tables: 2, arrivalEvery: 3, seed: 8)
        Village.apply(staff: ["nunzia", "bastiano"], to: &setup, book: book)
        var sim: ServiceSim = ServiceSim(setup: setup)
        var wines: Int = 0
        var step: Int = 0
        while step < 60 * 30 {
            for event in sim.step(input: ServiceInput(), dt: 1.0 / 60.0) {
                if case ServiceEvent.wineServed = event { wines += 1 }
            }
            step += 1
        }
        XCTAssertGreaterThan(wines, 0)
        XCTAssertGreaterThan(sim.result.revenue, 0)
    }

    func testFarmPlantsGrowAndTeachRecipes() throws {
        let book: VillageBook = try load(VillageBook.self, "village.json")
        let recipes: RecipeBook = try load(RecipeBook.self, "recipes.json")
        var locked: GameState = GameState()
        locked.gold = 500
        XCTAssertFalse(Village.plant("pomodoro", plot: 0, state: &locked, book: book), "l'orto arriva col secondo capitolo")

        var state: GameState = unlocked()
        XCTAssertEqual(Village.plotCount(state), 2)
        XCTAssertTrue(Village.plant("pomodoro", plot: 0, state: &state, book: book))
        XCTAssertFalse(Village.plant("basilico", plot: 0, state: &state, book: book), "aiuola occupata")
        XCTAssertEqual(state.gold, 5000 - 8)
        XCTAssertEqual(Village.harvest(plot: 0, state: &state, book: book), 0, "non è ancora maturo")
        XCTAssertEqual(Village.daysLeft(plot: state.village.plots[0], day: state.day, book: book), 3)
        state.day += 3
        XCTAssertEqual(Village.harvest(plot: 0, state: &state, book: book), 4)
        XCTAssertEqual(state.pantry.total("pomodoro"), 4)
        XCTAssertNil(state.village.plots[0].crop)
        let learned: [String] = state.learnRecipes(recipes)
        XCTAssertTrue(learned.contains("sarago_acquapazza"))
        // Aiuole in più, fino al massimo.
        var bought: Int = 0
        while Village.buyPlot(state: &state, book: book) { bought += 1 }
        XCTAssertEqual(bought, book.plotCosts.count)
        XCTAssertEqual(Village.plotCount(state), book.maxPlots)
    }

    func testPensBreedAndTrapsYield() throws {
        let book: VillageBook = try load(VillageBook.self, "village.json")
        let fish: FishCatalog = try load(FishCatalog.self, "fish.json")
        let world: WorldData = try load(WorldData.self, "zones.json")
        var state: GameState = unlocked()
        XCTAssertTrue(Village.buyPen(state: &state, book: book))
        XCTAssertFalse(Village.stock(pen: 0, species: "orata", state: &state, fish: fish), "servono due orate vive")
        state.pantry.add("orata", stars: 3, count: 2)
        XCTAssertTrue(Village.stock(pen: 0, species: "orata", state: &state, fish: fish))
        XCTAssertEqual(state.pantry.total("orata"), 0)
        XCTAssertTrue(Village.buyTrap(state: &state, book: book))
        XCTAssertTrue(Village.buyTrap(state: &state, book: book))
        XCTAssertFalse(Village.moveTrap(1, toZone: 4, state: &state, world: world, maxDepth: 110), "zona fuori portata della muta")
        XCTAssertTrue(Village.moveTrap(1, toZone: 1, state: &state, world: world, maxDepth: 110))

        var fromTraps: Int = 0
        var day: Int = 0
        while day < 12 {
            state.day += 1
            let before: Int = state.pantry.entries().reduce(0) { $0 + $1.count }
            Village.newDay(state: &state, book: book, fish: fish, world: world)
            let after: Int = state.pantry.entries().reduce(0) { $0 + $1.count }
            XCTAssertFalse(state.village.news.isEmpty)
            fromTraps += after - before
            day += 1
        }
        XCTAssertGreaterThanOrEqual(state.pantry.total("orata"), 12, "il vivaio rende almeno un pesce al giorno")
        XCTAssertGreaterThan(state.village.pens[0].count, 2, "la vasca si popola")
        XCTAssertGreaterThan(fromTraps, 18)
        // Niente bestie da nassa: solo pesce piccolo e tranquillo.
        for zone in world.zones {
            for species in Village.trapCandidates(zone: zone, fish: fish) {
                XCTAssertLessThanOrEqual(species.weight, Village.trapMaxWeight)
                XCTAssertNotEqual(species.behavior, FishBehavior.aggressive)
            }
        }
        XCTAssertFalse(Village.trapCandidates(zone: world.zones[0], fish: fish).isEmpty)
    }

    func testEventsFollowTheCalendar() throws {
        let recipes: RecipeBook = try load(RecipeBook.self, "recipes.json")
        var state: GameState = unlocked()
        state.recipes["sarde_beccafico"] = 1
        var kinds: [DayEventKind: Int] = [:]
        var day: Int = 1
        while day <= 28 {
            state.day = day
            if let event: DayEvent = Village.event(state: state, recipes: recipes) {
                kinds[event.kind, default: 0] += 1
                XCTAssertEqual(event, Village.event(state: state, recipes: recipes), "stesso giorno, stesso evento")
                if event.kind == DayEventKind.critico { XCTAssertEqual(event.dishId, "sarde_beccafico") }
            }
            day += 1
        }
        XCTAssertEqual(kinds[DayEventKind.sagra], 4)
        XCTAssertEqual(kinds[DayEventKind.critico], 3)
        XCTAssertEqual(kinds[DayEventKind.duello], 3)
        state.day = 1
        XCTAssertNil(Village.event(state: state, recipes: recipes), "il primo giorno è tranquillo")
    }

    func testCollectionTilesAndPostcards() throws {
        let book: VillageBook = try load(VillageBook.self, "village.json")
        var state: GameState = GameState()
        XCTAssertEqual(Village.relicZones(state: state, book: book).count, 6)
        let first: String = try XCTUnwrap(Village.grantTile(zone: 2, state: &state, book: book))
        XCTAssertEqual(book.collectible(first)?.zone, 2)
        _ = Village.grantTile(zone: 2, state: &state, book: book)
        XCTAssertFalse(Village.relicZones(state: state, book: book).contains(2))
        // Una terza maiolica dalla stessa zona diventa una di un'altra, per non restare mai a mani vuote.
        let third: String = try XCTUnwrap(Village.grantTile(zone: 2, state: &state, book: book))
        XCTAssertNotEqual(book.collectible(third)?.zone, 2)
        var guardCount: Int = 0
        while Village.grantTile(zone: 0, state: &state, book: book) != nil && guardCount < 40 { guardCount += 1 }
        XCTAssertEqual(state.village.collection.filter { $0.hasPrefix("tile_") }.count, 12)
        XCTAssertEqual(state.pearls, 5, "la collezione completa vale cinque perle")
        XCTAssertGreaterThan(state.gold, GameState().gold, "il doppione si vende")

        XCTAssertTrue(Village.awardPostcards(state: &state, book: book).isEmpty)
        state.fame = 45
        state.deepestDive = 210
        let cards: [String] = Village.awardPostcards(state: &state, book: book)
        XCTAssertEqual(cards.count, 2)
        XCTAssertTrue(Village.awardPostcards(state: &state, book: book).isEmpty, "una cartolina si riceve una volta sola")
    }

    func testRelicsAppearInDivesAndGoToTheBag() throws {
        let world: WorldData = try load(WorldData.self, "zones.json")
        let fish: FishCatalog = try load(FishCatalog.self, "fish.json")
        var found: Bool = false
        for seed in 1...12 as ClosedRange<UInt64> {
            let map: CaveMap = CaveGenerator.generate(seed: seed, world: world)
            var sim: DiveSim = DiveSim(map: map, catalog: fish, seed: seed, night: false, startDepthMeters: 0, maxSafeDepth: 110,
                                       relicZones: [(index: 0, from: 0, to: 40), (index: 1, from: 40, to: 110)])
            guard let index: Int = sim.pickups.firstIndex(where: { $0.kind == PickupPoint.Kind.maiolica }) else { continue }
            XCTAssertLessThanOrEqual(sim.pickups.filter { $0.kind == PickupPoint.Kind.maiolica }.count, 2)
            sim.diver.position = sim.pickups[index].position + Vec2(0, -8)
            var input: DiveInput = DiveInput()
            input.interact = true
            _ = sim.step(input: input, dt: 1.0 / 60.0)
            XCTAssertEqual(sim.bag.relics.count, 1)
            XCTAssertTrue(sim.bag.materials.isEmpty, "la maiolica non è un ingrediente")
            XCTAssertEqual(sim.bag.totalWeight, 0)
            found = true
            break
        }
        XCTAssertTrue(found, "in dodici immersioni almeno una maiolica")
    }

    func testVillageStateSurvivesSaving() throws {
        var state: GameState = unlocked()
        state.village.staff = ["tano"]
        state.village.traps = [TrapState(zone: 1)]
        state.village.records["cabinato"] = 77
        let back: GameState = try JSONDecoder().decode(GameState.self, from: try JSONEncoder().encode(state))
        XCTAssertEqual(back.village, state.village)
        let old: GameState = try JSONDecoder().decode(GameState.self, from: Data("{\"day\": 2}".utf8))
        XCTAssertEqual(old.village, VillageState())
    }

    func testRecipeLevelsRaiseThePrice() throws {
        let recipes: RecipeBook = try load(RecipeBook.self, "recipes.json")
        let balance: Balance = try load(Balance.self, "balance.json")
        let recipe: Recipe = try XCTUnwrap(recipes.find("orata_sale"))
        var state: GameState = GameState()
        state.gold = 100_000
        XCTAssertFalse(RecipeLevels.upgrade(recipe, state: &state), "una ricetta sconosciuta non si affina")
        state.recipes[recipe.id] = 1
        let base: Int = MenuPlanner.price(recipe, averageStars: 2, level: 1, balance: balance, fame: 0)
        var steps: Int = 0
        var lastCost: Int = 0
        while let cost: Int = RecipeLevels.cost(recipe, level: state.recipes[recipe.id] ?? 1) {
            XCTAssertGreaterThan(cost, lastCost, "ogni livello costa più del precedente")
            lastCost = cost
            XCTAssertTrue(RecipeLevels.upgrade(recipe, state: &state))
            steps += 1
        }
        XCTAssertEqual(steps, RecipeLevels.maxLevel - 1)
        XCTAssertEqual(state.recipes[recipe.id], RecipeLevels.maxLevel)
        let top: Int = MenuPlanner.price(recipe, averageStars: 2, level: RecipeLevels.maxLevel, balance: balance, fame: 0)
        XCTAssertGreaterThan(top, base)
        state.gold = 0
        state.recipes[recipe.id] = 1
        XCTAssertFalse(RecipeLevels.upgrade(recipe, state: &state))
    }

    // MARK: Giochi del bar

    func testBocceHandAlwaysFinishesAndScores() throws {
        for seed in [1, 2, 3, 4] as [UInt64] {
            var sim: BocceSim = BocceSim(seed: seed)
            var throwsMade: Int = 0
            var guardCount: Int = 0
            while !sim.finished && guardCount < 60 * 600 {
                guardCount += 1
                if !sim.rolling {
                    let shot: (angle: Double, power: Double) = sim.rivalThrow(skill: sim.turn == 0 ? 0.9 : 0.6)
                    XCTAssertFalse(sim.throwBall(angle: shot.angle, power: shot.power).isEmpty)
                    throwsMade += 1
                }
                _ = sim.step(dt: 1.0 / 60.0)
                for ball in sim.balls {
                    XCTAssertTrue(ball.position.x >= 0 && ball.position.x <= BocceSim.width && ball.position.y >= 0 && ball.position.y <= BocceSim.length)
                }
            }
            XCTAssertTrue(sim.finished)
            XCTAssertEqual(throwsMade, BocceSim.ballsEach * 2)
            XCTAssertEqual(sim.balls.count, 9)
            let result: (winner: Int, points: Int) = sim.score()
            XCTAssertTrue(result.points >= 1 && result.points <= BocceSim.ballsEach)
        }
    }

    func testAGoodBocceThrowLandsNearThePallino() throws {
        var sim: BocceSim = BocceSim(seed: 11)
        let shot: (angle: Double, power: Double) = sim.rivalThrow(skill: 1)
        _ = sim.throwBall(angle: shot.angle, power: shot.power)
        var step: Int = 0
        while sim.rolling && step < 60 * 20 {
            _ = sim.step(dt: 1.0 / 60.0)
            step += 1
        }
        XCTAssertLessThan(sim.bestDistance(owner: 0), 30)
    }

    func testArcadeCatchesScoreAndUrchinsCostLives() throws {
        var sim: ArcadeSim = ArcadeSim(seed: 4)
        var caught: Int = 0
        var stung: Int = 0
        var step: Int = 0
        // Per mezzo minuto insegue i pesci e scansa i ricci; poi va a cercarsi i ricci, finché non finisce le vite.
        while !sim.finished && step < 60 * 300 {
            let wantUrchins: Bool = sim.time > 30
            let target: ArcadeItem? = sim.items.filter { ($0.kind == ArcadeItem.Kind.riccio) == wantUrchins }.max(by: { $0.y < $1.y })
            let move: Double = target.map { $0.x > sim.basketX + 2 ? 1 : ($0.x < sim.basketX - 2 ? -1 : 0) } ?? 0
            for event in sim.step(moveX: move, dt: 1.0 / 60.0) {
                if case ArcadeEvent.caught = event { caught += 1 }
                if event == ArcadeEvent.stung { stung += 1 }
            }
            step += 1
        }
        XCTAssertTrue(sim.finished)
        XCTAssertEqual(stung, 3)
        XCTAssertEqual(sim.lives, 0)
        XCTAssertGreaterThan(caught, 5)
        XCTAssertGreaterThanOrEqual(sim.score, caught)
    }

    func testRhythmPerfectPlayAndSilence() throws {
        var perfect: RhythmSim = RhythmSim(seed: 3)
        XCTAssertGreaterThan(perfect.notes.count, 30)
        XCTAssertEqual(RhythmSim.chart(seed: 3, bars: 14, bpm: 100), RhythmSim.chart(seed: 3, bars: 14, bpm: 100))
        var next: Int = 0
        var guardCount: Int = 0
        while !perfect.finished && guardCount < 60 * 120 {
            guardCount += 1
            var pressed: [Bool] = [false, false]
            // Preme nel fotogramma più vicino all'istante giusto.
            while next < perfect.notes.count && perfect.notes[next].time <= perfect.time + 1.0 / 120.0 {
                pressed[perfect.notes[next].lane] = true
                next += 1
            }
            _ = perfect.step(dt: 1.0 / 60.0, pressed: pressed)
        }
        XCTAssertTrue(perfect.finished)
        XCTAssertEqual(perfect.misses, 0)
        XCTAssertEqual(perfect.score, perfect.maxScore)
        XCTAssertEqual(perfect.bestCombo, perfect.notes.count)
        XCTAssertLessThan(perfect.rivalScore(skill: 0.7), perfect.maxScore)

        var silent: RhythmSim = RhythmSim(seed: 3)
        guardCount = 0
        while !silent.finished && guardCount < 60 * 120 {
            guardCount += 1
            _ = silent.step(dt: 1.0 / 60.0, pressed: [false, false])
        }
        XCTAssertEqual(silent.score, 0)
        XCTAssertEqual(silent.misses, silent.notes.count)
    }
}
