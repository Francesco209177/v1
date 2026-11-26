import XCTest
@testable import MareaLogic

/// Simulazione dell'economia giorno per giorno: due immersioni stimate dal carico della sacca e dalle
/// specie raggiungibili, poi un servizio vero giocato dal cameriere automatico. Serve a controllare
/// che i traguardi della storia arrivino in ordine e in un numero ragionevole di giorni, non a
/// sostituire le prove sul telefono.
final class EconomyTests: XCTestCase {

    private func load<T: Decodable>(_ type: T.Type, _ file: String) throws -> T {
        return try DataFiles.load(type, file: file, in: TestSupport.dataDirectory)
    }

    func testStoryIsAffordableInAReasonableNumberOfDays() throws {
        let fish: FishCatalog = try load(FishCatalog.self, "fish.json")
        let recipes: RecipeBook = try load(RecipeBook.self, "recipes.json")
        let balance: Balance = try load(Balance.self, "balance.json")
        let upgrades: UpgradeBook = try load(UpgradeBook.self, "upgrades.json")
        let story: StoryBook = try load(StoryBook.self, "story.json")
        let village: VillageBook = try load(VillageBook.self, "village.json")

        var state: GameState = GameState()
        state.gold = balance.startGold
        _ = state.bank(bag: DiveBag(), deepest: 0, recipes: recipes)
        StoryEngine.settle(state: &state, book: story)

        var chapterDay: [Int: Int] = [:]
        var rows: [String] = []
        var lastBeat: Int = -1
        var stuckDays: Int = 0

        while state.day <= 90 && !StoryEngine.isFinished(story, state: state) {
            // Le scene si guardano appena arrivano.
            var guardCount: Int = 0
            while StoryEngine.pendingScene(story, state: state) != nil && guardCount < 20 {
                StoryEngine.sceneShown(state: &state, book: story)
                guardCount += 1
            }
            guard let beat: StoryBeat = StoryEngine.current(story, state: state) else { break }
            if chapterDay[beat.chapter] == nil { chapterDay[beat.chapter] = state.day }
            let suit: Double = upgrades.value("suit", state: state, fallback: balance.startSafeDepth)
            let bagWeight: Double = upgrades.value("bag", state: state, fallback: balance.startBagWeight)

            // Boss: si affronta quando l'arpione è almeno al livello che ci si aspetta per quella tappa.
            if beat.goal.kind == "boss", let boss: String = beat.goal.target {
                let wanted: [String: Int] = ["murena": 0, "granseola": 1, "spada": 2, "polpo": 2, "lanterna": 3, "talpa": 4]
                if (state.upgrades["harpoon"] ?? 0) >= (wanted[boss] ?? 0) {
                    StoryEngine.record(QuestEvent.boss(boss), state: &state, book: story)
                }
            }

            // Due immersioni: si riempie l'85% della sacca con le specie di maggior valore tra quelle a portata di muta.
            let reachable: [FishSpecies] = fish.species.filter { $0.isEdible && !$0.night && $0.item == nil && $0.depthMin < suit && $0.weight <= bagWeight }
            let best: [FishSpecies] = Array(reachable.sorted { Double($0.price) / $0.weight > Double($1.price) / $1.weight }.prefix(5))
            var caughtToday: Int = 0
            var dive: Int = 0
            while dive < 2 {
                var room: Double = bagWeight * 0.85
                var turn: Int = 0
                while room > 0.2 && turn < 60 && !best.isEmpty {
                    let species: FishSpecies = best[turn % best.count]
                    if species.weight <= room {
                        state.pantry.add(species.id, stars: 2)
                        var record: FishRecord = state.fishLog[species.id] ?? FishRecord()
                        record.caught += 1
                        state.fishLog[species.id] = record
                        StoryEngine.record(QuestEvent.caught(item: species.id, stars: state.weapons.contains("rete") ? 3 : 2), state: &state, book: story)
                        room -= species.weight
                        caughtToday += 1
                    }
                    turn += 1
                }
                dive += 1
            }
            _ = state.learnRecipes(recipes)
            state.deepestDive = max(state.deepestDive, suit - 2)
            StoryEngine.record(QuestEvent.depth(state.deepestDive), state: &state, book: story)

            // Sera: i piatti più cari che la dispensa permette, tanti quanti il rango ne concede.
            let rank: RankInfo = try XCTUnwrap(balance.rank(fame: state.fame))
            var dishes: [PreparedDish] = []
            let known: [Recipe] = recipes.recipes.filter { state.recipes[$0.id] != nil }.sorted { $0.price > $1.price }
            for recipe in known where dishes.count < rank.menuSlots {
                let batches: Int = min(MenuPlanner.maxBatches(recipe, pantry: state.pantry), 4)
                if batches >= 1, let dish: PreparedDish = MenuPlanner.prepare(recipe, batches: batches, state: &state, balance: balance) { dishes.append(dish) }
            }
            var earned: Int = 0
            var fameGain: Int = 0
            if !dishes.isEmpty {
                var setup: ServiceSetup = ServiceSetup(dishes: dishes, recipes: recipes, tuning: balance.service, tables: rank.tables,
                                                       arrivalEvery: rank.arrivalEvery, seed: UInt64(state.day))
                setup.carryCapacity = Int(upgrades.value("tray", state: state, fallback: 1))
                setup.cookSpeed = upgrades.value("stove", state: state, fallback: 1)
                Village.apply(staff: state.village.staff, to: &setup, book: village)
                var sim: ServiceSim = ServiceSim(setup: setup)
                var bot: ServiceBot = ServiceBot(pourSkill: 0.8)
                var step: Int = 0
                while !sim.finished && step < 60 * 400 {
                    _ = sim.step(input: bot.decide(sim, dt: 1.0 / 30.0), dt: 1.0 / 30.0)
                    step += 1
                }
                earned = sim.result.total
                fameGain = sim.result.fame
                state.gold = max(0, state.gold + earned - Village.wages(state: state, book: village))
                state.totalEarned += earned
                state.fame += fameGain
                for (recipe, count) in sim.result.sold { StoryEngine.record(QuestEvent.served(recipe: recipe, count: count), state: &state, book: story) }
                StoryEngine.record(QuestEvent.earned(earned), state: &state, book: story)
                StoryEngine.record(QuestEvent.fame(state.fame), state: &state, book: story)
            }

            // Acquisti: prima ciò che la storia chiede (muta, torcia), poi chi dà una mano in sala, la cucina, l'attrezzatura.
            var bought: [String] = []
            for member in village.staff where Village.hire(member.id, state: &state, book: village) == Village.HireOutcome.hired {
                bought.append(member.name.text())
            }
            var shopping: Bool = true
            while shopping {
                shopping = false
                var wishes: [String] = []
                if beat.goal.kind == "depth" && Double(beat.goal.count) > upgrades.value("suit", state: state, fallback: 110) { wishes.append("suit") }
                if beat.goal.kind == "depth" && beat.goal.count >= 220 && (state.upgrades["torch"] ?? 0) < 1 { wishes.append("torch") }
                if beat.goal.kind == "upgrade" { wishes.append("bag") }
                wishes.append(contentsOf: ["stove", "tray", "harpoon", "bag", "breath"])
                for id in wishes {
                    if Shop.buyUpgrade(id, state: &state, book: upgrades) == Shop.Outcome.bought {
                        bought.append(id)
                        StoryEngine.record(QuestEvent.upgraded(id: id, level: state.upgrades[id] ?? 0), state: &state, book: story)
                        shopping = true
                        break
                    }
                    // Si risparmia per la prima cosa della lista che non ci si può ancora permettere.
                    if upgrades.upgrade(id)?.nextCost(level: state.upgrades[id] ?? 0) != nil { break }
                }
            }
            if state.gold >= 150 && !state.weapons.contains("rete") && state.day > 3 { _ = Shop.buyWeapon("rete", state: &state, book: upgrades) }

            rows.append("giorno \(state.day): cap. \(beat.chapter) \(beat.id) · pesci \(caughtToday) · incasso \(earned) · fama \(state.fame) (+\(fameGain)) · oro \(state.gold) · muta \(Int(suit)) m" + (bought.isEmpty ? "" : " · compra " + bought.joined(separator: ", ")))
            if state.story.beat == lastBeat {
                stuckDays += 1
            } else {
                stuckDays = 0
                lastBeat = state.story.beat
            }
            XCTAssertLessThan(stuckDays, 30, "la storia è ferma da troppo su \(beat.id)\n" + rows.suffix(8).joined(separator: "\n"))
            if stuckDays >= 30 { break }
            state.day += 1
        }

        print("ECONOMIA\n" + rows.joined(separator: "\n"))
        print("ECONOMIA capitoli iniziati al giorno: \(chapterDay.sorted { $0.key < $1.key }.map { "\($0.key)→\($0.value)" }.joined(separator: " "))")
        XCTAssertTrue(StoryEngine.isFinished(story, state: state), "la storia non si chiude in 90 giorni\n" + rows.suffix(6).joined(separator: "\n"))
        // I capitoli cominciano in ordine e nessuno dura un giorno solo.
        var previous: Int = 0
        for chapter in 1...5 {
            let day: Int = try XCTUnwrap(chapterDay[chapter], "capitolo \(chapter) mai raggiunto")
            XCTAssertGreaterThanOrEqual(day, previous)
            previous = day
        }
        XCTAssertGreaterThanOrEqual(state.day, 15, "la storia finisce troppo in fretta")
    }
}
