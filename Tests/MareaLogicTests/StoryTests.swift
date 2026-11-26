import XCTest
@testable import MareaLogic

final class StoryTests: XCTestCase {

    private func load<T: Decodable>(_ type: T.Type, _ file: String) throws -> T {
        return try DataFiles.load(type, file: file, in: TestSupport.dataDirectory)
    }

    private func books() throws -> (story: StoryBook, scenes: CutsceneBook, bosses: BossBook) {
        return (story: try load(StoryBook.self, "story.json"), scenes: try load(CutsceneBook.self, "cutscenes.json"), bosses: try load(BossBook.self, "bosses.json"))
    }

    func testStoryDataIsValid() throws {
        let b: (story: StoryBook, scenes: CutsceneBook, bosses: BossBook) = try books()
        let problems: [String] = b.story.problems(scenes: b.scenes, bosses: b.bosses, fish: try load(FishCatalog.self, "fish.json"),
                                                  recipes: try load(RecipeBook.self, "recipes.json"), upgrades: try load(UpgradeBook.self, "upgrades.json"))
        XCTAssertTrue(problems.isEmpty, problems.joined(separator: "\n"))
        XCTAssertEqual(b.story.chapters.count, 5)
        XCTAssertGreaterThanOrEqual(b.story.beats.count, 18)
        // Ogni capitolo ha almeno un boss e ogni scena è usata da una tappa.
        for chapter in b.story.chapters {
            XCTAssertTrue(b.story.beats.contains(where: { $0.chapter == chapter.id && $0.goal.kind == "boss" }), "capitolo \(chapter.id) senza boss")
        }
        var used: Set<String> = []
        for beat in b.story.beats {
            if let s: String = beat.intro { used.insert(s) }
            if let s: String = beat.outro { used.insert(s) }
        }
        for scene in b.scenes.scenes { XCTAssertTrue(used.contains(scene.id), "scena mai mostrata: \(scene.id)") }
    }

    /// Le profondità chieste dalla storia devono essere raggiungibili con la muta, e ogni boss con quella che si ha a quel punto.
    func testStoryDepthsAreReachable() throws {
        let b: (story: StoryBook, scenes: CutsceneBook, bosses: BossBook) = try books()
        let upgrades: UpgradeBook = try load(UpgradeBook.self, "upgrades.json")
        let suit: UpgradeInfo = try XCTUnwrap(upgrades.upgrade("suit"))
        let deepest: Double = suit.value(level: suit.levels.count)
        var lastDepth: Int = 0
        for beat in b.story.beats where beat.goal.kind == "depth" {
            XCTAssertLessThanOrEqual(Double(beat.goal.count), deepest, "\(beat.id): più giù di quanto regga la muta")
            XCTAssertGreaterThan(beat.goal.count, lastDepth, "\(beat.id): le profondità devono crescere")
            lastDepth = beat.goal.count
        }
    }

    func testEveryCutscenePlaysToTheEnd() throws {
        let b: (story: StoryBook, scenes: CutsceneBook, bosses: BossBook) = try books()
        for scene in b.scenes.scenes {
            var cursor: CutsceneCursor = CutsceneCursor(scene: scene)
            var time: Double = 0
            var steps: Int = 0
            while !cursor.isFinished && time < 600 {
                if cursor.advance(scene: scene, dt: 0.1) { steps += 1 }
                time += 0.1
                // Un tocco ogni secondo: prima completa la battuta, poi passa oltre.
                if Int(time * 10) % 10 == 0, cursor.tap(scene: scene) { steps += 1 }
            }
            XCTAssertTrue(cursor.isFinished, "\(scene.id) non arriva alla fine")
            XCTAssertEqual(steps, scene.steps.count)
        }
    }

    func testTypewriterAndTap() throws {
        let b: (story: StoryBook, scenes: CutsceneBook, bosses: BossBook) = try books()
        let scene: Cutscene = try XCTUnwrap(b.scenes.find("s_cucina"))
        var cursor: CutsceneCursor = CutsceneCursor(scene: scene)
        _ = cursor.advance(scene: scene, dt: 0.1)
        XCTAssertGreaterThan(cursor.shown, 0)
        XCTAssertLessThan(cursor.shown, scene.steps[0].text?.text().count ?? 0)
        XCTAssertFalse(cursor.tap(scene: scene), "il primo tocco completa la battuta")
        XCTAssertEqual(cursor.shown, scene.steps[0].text?.text().count)
        XCTAssertTrue(cursor.tap(scene: scene), "il secondo passa alla successiva")
        XCTAssertEqual(cursor.index, 1)
    }

    /// Percorre tutta la storia con i fatti di gioco minimi che servono a ogni tappa.
    func testWholeStoryCanBeCompleted() throws {
        let b: (story: StoryBook, scenes: CutsceneBook, bosses: BossBook) = try books()
        var state: GameState = GameState()
        var shown: [String] = []
        var guardCount: Int = 0
        StoryEngine.settle(state: &state, book: b.story)
        while !StoryEngine.isFinished(b.story, state: state) && guardCount < 500 {
            guardCount += 1
            if let scene: String = StoryEngine.pendingScene(b.story, state: state) {
                shown.append(scene)
                StoryEngine.sceneShown(state: &state, book: b.story)
                continue
            }
            let beat: StoryBeat = try XCTUnwrap(StoryEngine.current(b.story, state: state))
            XCTAssertTrue(state.story.introSeen)
            XCTAssertFalse(state.story.done)
            let event: QuestEvent
            switch beat.goal.kind {
            case "catch": event = QuestEvent.caught(item: beat.goal.target ?? "sardina", stars: 3)
            case "serve": event = QuestEvent.served(recipe: beat.goal.target ?? "sarde_beccafico", count: 2)
            case "upgrade":
                state.upgrades["bag"] = 1
                event = QuestEvent.upgraded(id: "bag", level: 1)
            case "fame":
                state.fame += 30
                event = QuestEvent.fame(state.fame)
            case "depth":
                state.deepestDive += 45
                event = QuestEvent.depth(state.deepestDive)
            case "earn": event = QuestEvent.earned(300)
            case "boss":
                XCTAssertEqual(StoryEngine.availableBoss(b.story, state: state), beat.goal.target)
                event = QuestEvent.boss(beat.goal.target ?? "")
            default:
                XCTFail("obiettivo non gestito: \(beat.goal.kind)")
                return
            }
            StoryEngine.record(event, state: &state, book: b.story)
        }
        XCTAssertTrue(StoryEngine.isFinished(b.story, state: state))
        XCTAssertEqual(state.story.bosses.count, 6)
        XCTAssertEqual(Set(shown).count, b.scenes.scenes.count, "ogni scena va mostrata una volta sola")
        XCTAssertEqual(shown.count, b.scenes.scenes.count)
        XCTAssertTrue(state.weapons.contains("rete"))
        XCTAssertGreaterThan(state.gold, 5000)
        XCTAssertNil(StoryEngine.availableBoss(b.story, state: state))
    }

    /// Chi ha già fama, profondità o potenziamenti non deve rifarli: la tappa si compie da sola.
    func testLevelGoalsCountWhatIsAlreadyDone() throws {
        let b: (story: StoryBook, scenes: CutsceneBook, bosses: BossBook) = try books()
        var state: GameState = GameState()
        state.fame = 500
        state.deepestDive = 600
        state.upgrades["suit"] = 3
        let index: Int = try XCTUnwrap(b.story.beats.firstIndex(where: { $0.id == "c1_cantiere" }))
        state.story.beat = index
        StoryEngine.settle(state: &state, book: b.story)
        // c1_cantiere e c1_fama si chiudono subito; ci si ferma alla scena della scossa.
        XCTAssertEqual(StoryEngine.current(b.story, state: state)?.id, "c1_fama")
        XCTAssertEqual(StoryEngine.pendingScene(b.story, state: state), "s_scossa")
        XCTAssertTrue(state.weapons.contains("coltello"))
    }

    /// Ogni figura, ritratto e pezzo di boss che il gioco chiede per nome deve esistere nei file .spr.
    func testStorySpritesExist() throws {
        let b: (story: StoryBook, scenes: CutsceneBook, bosses: BossBook) = try books()
        let library: SpriteLibrary = try TestSupport.loadSpriteLibrary()
        var names: Set<String> = []
        for sprite in library.expandedSprites() { names.insert(sprite.name) }
        var missing: Set<String> = []
        func need(_ name: String) {
            if !names.contains(name) { missing.insert(name) }
        }
        for scene in b.scenes.scenes {
            for actor in scene.actors {
                let member: CastMember = try XCTUnwrap(b.story.member(actor.who))
                need("\(member.body)_stand_0")
            }
            for step in scene.steps {
                guard let who: String = step.who, let member: CastMember = b.story.member(who) else { continue }
                switch step.action {
                case "say":
                    if let portrait: String = member.portrait { need("\(portrait)_\(step.mood ?? "calm")") }
                    if !member.body.isEmpty, scene.actors.contains(where: { $0.who == who }) { need("\(member.body)_talk_0") }
                case "move":
                    need("\(member.body)_walk_0")
                case "pose":
                    need("\(member.body)_\(step.pose ?? "stand")_0")
                default:
                    break
                }
            }
        }
        for member in b.story.cast {
            guard let portrait: String = member.portrait else { continue }
            for mood in CutsceneStep.moods { need("\(portrait)_\(mood)") }
        }
        let bossSprites: [String] = [
            "murena_boss_head_0", "murena_boss_head_1", "murena_boss_body_0", "murena_boss_body_1", "den_0", "den_1",
            "granseola_walk_0", "granseola_charge_0", "granseola_rear_0", "granseola_flip_0",
            "spadaccino_swim_0", "spadaccino_hurt_0",
            "polpo_boss_head_0", "polpo_boss_head_1", "polpo_boss_head_2", "polpo_boss_arm_0", "polpo_boss_arm_1", "polpo_boss_arm_2", "polpo_boss_shield_0",
            "lanterna_boss_0", "lanterna_boss_1", "lanterna_lure_0", "lanterna_lure_1",
            "talpa_hull_0", "talpa_drill_0", "talpa_prop_0", "talpa_valve_0", "talpa_valve_1",
            "hz_dust_0", "hz_rock_0", "hz_shard_0", "hz_amphora_0", "hz_bubble_0", "hz_ink_0", "hz_ink_1", "hz_spore_0", "hz_spore_1",
            "hz_mine_0", "hz_mine_1", "hz_torpedo_0", "hz_wave_0", "hz_jet_0", "hz_jet_1",
            "pickup_campana", "pickup_campana_vuota", "alert"
        ]
        for name in bossSprites { need(name) }
        XCTAssertTrue(missing.isEmpty, "sprite mancanti: " + missing.sorted().joined(separator: ", "))
    }

    func testSavedStoryRoundTrips() throws {
        var state: GameState = GameState()
        state.story.beat = 7
        state.story.count = 2
        state.story.introSeen = true
        state.story.bosses = ["murena"]
        let data: Data = try JSONEncoder().encode(state)
        let back: GameState = try JSONDecoder().decode(GameState.self, from: data)
        XCTAssertEqual(back.story, state.story)
        // Un salvataggio precedente alla storia resta leggibile.
        let old: GameState = try JSONDecoder().decode(GameState.self, from: Data("{\"day\": 4, \"gold\": 90}".utf8))
        XCTAssertEqual(old.story, StoryLog())
        XCTAssertEqual(old.day, 4)
    }
}
