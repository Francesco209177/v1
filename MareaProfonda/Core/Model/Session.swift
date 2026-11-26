/// Ciò che cambia da una piattaforma all'altra: dove stanno i dati, dove si salva, come si
/// ricordano le preferenze. L'app iOS e quella Android lo impostano all'avvio, prima di tutto il resto.
enum GameEnvironment {
    /// Cartella con i JSON di dati (`Data`).
    static var dataDirectory: URL? = nil
    /// Cartella degli slot di salvataggio.
    static var saveDirectory: URL? = nil
    /// Lettura e scrittura delle preferenze (su iPhone le conserva il sistema, su Android un file).
    static var readSettings: () -> Data? = { () -> Data? in return nil }
    static var writeSettings: (Data) -> Void = { (_: Data) -> Void in }
    /// Nome della fase del giorno come lo mostra l'interfaccia.
    static var phaseName: (DayPhase) -> String = { (phase: DayPhase) -> String in
        switch phase {
        case .morning: return "Mattina"
        case .afternoon: return "Pomeriggio"
        case .evening: return "Sera"
        case .night: return "Notte"
        }
    }
}

/// Dati di gioco letti dai JSON della cartella `Data`. Se un file manca o è rotto
/// il gioco parte comunque con valori di riserva e annota il problema.
final class GameData {
    static let shared: GameData = GameData()

    let world: WorldData
    let fish: FishCatalog
    let recipes: RecipeBook
    let balance: Balance
    let upgrades: UpgradeBook
    let quests: QuestBook
    let story: StoryBook
    let cutscenes: CutsceneBook
    let bosses: BossBook
    let village: VillageBook
    private(set) var problems: [String] = []

    private init() {
        var notes: [String] = []
        let directory: URL? = GameEnvironment.dataDirectory
        if directory == nil { notes.append("cartella Data non impostata") }

        func load<T: Decodable>(_ type: T.Type, _ file: String) -> T? {
            guard let dir: URL = directory else { return nil }
            do {
                return try DataFiles.load(type, file: file, in: dir)
            } catch {
                notes.append("\(error)")
                return nil
            }
        }

        let loadedWorld: WorldData? = load(WorldData.self, "zones.json")
        let loadedFish: FishCatalog? = load(FishCatalog.self, "fish.json")
        let loadedRecipes: RecipeBook? = load(RecipeBook.self, "recipes.json")
        let loadedBalance: Balance? = load(Balance.self, "balance.json")
        let loadedUpgrades: UpgradeBook? = load(UpgradeBook.self, "upgrades.json")
        let loadedQuests: QuestBook? = load(QuestBook.self, "quests.json")
        let loadedStory: StoryBook? = load(StoryBook.self, "story.json")
        let loadedScenes: CutsceneBook? = load(CutsceneBook.self, "cutscenes.json")
        let loadedBosses: BossBook? = load(BossBook.self, "bosses.json")
        let loadedVillage: VillageBook? = load(VillageBook.self, "village.json")

        world = loadedWorld ?? GameData.fallbackWorld
        fish = loadedFish ?? FishCatalog(species: [])
        recipes = loadedRecipes ?? RecipeBook(recipes: [])
        balance = loadedBalance ?? GameData.fallbackBalance
        upgrades = loadedUpgrades ?? UpgradeBook(upgrades: [], weapons: [])
        quests = loadedQuests ?? QuestBook(quests: [])
        story = loadedStory ?? StoryBook(chapters: [], cast: [], beats: [])
        cutscenes = loadedScenes ?? CutsceneBook(scenes: [])
        bosses = loadedBosses ?? BossBook(bosses: [])
        village = loadedVillage ?? VillageBook.empty
        notes.append(contentsOf: village.problems(fish: fish, world: world))
        notes.append(contentsOf: bosses.problems(world: world))
        notes.append(contentsOf: story.problems(scenes: cutscenes, bosses: bosses, fish: fish, recipes: recipes, upgrades: upgrades))
        notes.append(contentsOf: upgrades.problems())
        notes.append(contentsOf: quests.problems(fish: fish, recipes: recipes, upgrades: upgrades))
        notes.append(contentsOf: world.problems())
        notes.append(contentsOf: fish.problems())
        notes.append(contentsOf: recipes.problems(fish: fish, crops: village.cropIds))
        notes.append(contentsOf: balance.problems())
        problems = notes
    }

    /// Mondo minimo usato solo se `zones.json` non è leggibile.
    private static let fallbackWorld: WorldData = WorldData(pixelsPerMeter: 16, mapWidthMeters: 96, zones: [
        ZoneInfo(id: "posidonia", name: ["it": "Prateria di Posidonia"], depthFrom: 0, depthTo: 60,
                 waterTop: "58d6d0", waterBottom: "1f8fb0", light: 1.0, needsTorch: false,
                 rock: ["3b3a55", "5c5770", "8a7f8c", "b9a99b", "e3d3b0"], cap: ["d9c58f", "f4e7b6"], outline: "2a2940",
                 shape: "bowl", wallMin: 4, wallMax: 30, islands: 0.61, stretch: 3.2)
    ])

    private static let fallbackBalance: Balance = Balance(
        startGold: 40, startBreath: 120, startBagWeight: 10, startSafeDepth: 110,
        starPriceFactor: [0.8, 1.0, 1.3], recipeLevelBonus: 0.08,
        ranks: [RankInfo(name: ["it": "Bettola"], fame: 0, tables: 3, menuSlots: 2, arrivalEvery: 7.5, priceFactor: 1.0)],
        service: ServiceTuning(duration: 110, patienceOrder: 22, patienceFood: 30, eatTime: 5, wineChance: 0.4, winePrice: 5,
                               walkSpeed: 78, cleanTime: 0.8, comboWindow: 12, maxCombo: 10))
}

/// Preferenze del giocatore, conservate fuori dagli slot (vedi `GameEnvironment`).
final class SettingsStore {
    static let shared: SettingsStore = SettingsStore()

    var settings: GameSettings {
        didSet { if settings != oldValue { save() } }
    }

    private init() {
        if let data: Data = GameEnvironment.readSettings(),
           let decoded: GameSettings = try? JSONDecoder().decode(GameSettings.self, from: data) {
            settings = decoded
        } else {
            settings = GameSettings()
        }
    }

    private func save() {
        if let data: Data = try? JSONEncoder().encode(settings) {
            GameEnvironment.writeSettings(data)
        }
    }
}

/// La partita in corso: stato salvato, slot e operazioni che lo fanno avanzare.
/// Salva da sola alla fine di ogni fase e quando l'app va in secondo piano.
final class GameSession {
    static let shared: GameSession = GameSession()

    private(set) var state: GameState?
    private let store: SaveStore
    /// false per le partite temporanee della prova automatica: non toccano gli slot.
    private var persistent: Bool = true
    /// Ricette imparate con l'ultima immersione, da annunciare al porto.
    private(set) var newlyLearned: [String] = []
    /// Risultato dell'ultimo servizio, per il riepilogo della sera.
    private(set) var lastService: ServiceResult?
    private(set) var lastFameBefore: Int = 0
    /// Missioni completate da poco, da annunciare al porto.
    private(set) var justCompleted: [String] = []
    /// Maioliche e cartoline appena entrate in collezione, da annunciare al porto.
    private(set) var newCollectibles: [String] = []
    /// Paghe del personale versate dopo l'ultimo servizio.
    private(set) var lastWages: Int = 0

    private init() {
        store = SaveStore(directory: GameEnvironment.saveDirectory ?? URL(fileURLWithPath: "Salvataggi", isDirectory: true))
    }

    // MARK: Slot

    func summary(slot: Int) -> GameState? {
        return store.load(slot: slot)
    }

    func start(slot: Int) {
        if let loaded: GameState = store.load(slot: slot) {
            state = loaded
        } else {
            var fresh: GameState = GameState()
            fresh.slot = slot
            fresh.seed = UInt64(Date().timeIntervalSince1970 * 1000) ^ (UInt64(slot) &* 0x9E37_79B9)
            fresh.gold = GameData.shared.balance.startGold
            _ = fresh.bank(bag: DiveBag(), deepest: 0, recipes: GameData.shared.recipes)
            state = fresh
        }
        if var s: GameState = state {
            StoryEngine.settle(state: &s, book: GameData.shared.story)
            state = s
        }
        persistent = true
        newlyLearned = []
        lastService = nil
        save()
    }

    /// Partita temporanea con uno stato dato: usata dalla prova automatica.
    func startEphemeral(_ custom: GameState) {
        var s: GameState = custom
        _ = s.bank(bag: DiveBag(), deepest: 0, recipes: GameData.shared.recipes)
        state = s
        persistent = false
        newlyLearned = []
        lastService = nil
    }

    func delete(slot: Int) {
        store.delete(slot: slot)
    }

    func save() {
        guard persistent, let s: GameState = state else { return }
        store.save(s)
    }

    func close() {
        save()
        state = nil
    }

    // MARK: Avanzamento

    var rank: RankInfo? {
        return GameData.shared.balance.rank(fame: state?.fame ?? 0)
    }

    func addPlayTime(_ seconds: Double) {
        state?.playSeconds += seconds
    }

    // MARK: Potenziamenti

    /// Valore attuale di un potenziamento (o `fallback` se non esiste).
    func upgradeValue(_ id: String, fallback: Double) -> Double {
        guard let s: GameState = state else { return fallback }
        return GameData.shared.upgrades.value(id, state: s, fallback: fallback)
    }

    var maxDepth: Double {
        return upgradeValue("suit", fallback: GameData.shared.balance.startSafeDepth)
    }

    func buyUpgrade(_ id: String) -> Shop.Outcome {
        guard var s: GameState = state else { return Shop.Outcome.unknown }
        let outcome: Shop.Outcome = Shop.buyUpgrade(id, state: &s, book: GameData.shared.upgrades)
        if outcome == Shop.Outcome.bought {
            record([QuestEvent.upgraded(id: id, level: s.upgrades[id] ?? 0)], into: &s)
            state = s
            save()
        }
        return outcome
    }

    func buyWeapon(_ id: String) -> Shop.Outcome {
        guard var s: GameState = state else { return Shop.Outcome.unknown }
        let outcome: Shop.Outcome = Shop.buyWeapon(id, state: &s, book: GameData.shared.upgrades)
        if outcome == Shop.Outcome.bought {
            state = s
            save()
        }
        return outcome
    }

    func equip(_ id: String?) {
        guard var s: GameState = state else { return }
        if let id: String = id, !s.weapons.contains(id) { return }
        s.equipped = id
        state = s
        save()
    }

    /// true la prima volta che viene chiesto per questa partita: serve a mostrare un'istruzione una volta sola.
    func firstTime(_ key: String) -> Bool {
        guard var s: GameState = state else { return false }
        let flag: String = "visto_\(key)"
        if s.flags[flag] ?? false { return false }
        s.flags[flag] = true
        state = s
        save()
        return true
    }

    /// Affina una ricetta conosciuta: sale di livello e si vende a un prezzo più alto.
    func upgradeRecipe(_ id: String) -> Bool {
        guard var s: GameState = state, let recipe: Recipe = GameData.shared.recipes.find(id) else { return false }
        if !RecipeLevels.upgrade(recipe, state: &s) { return false }
        state = s
        save()
        return true
    }

    // MARK: Missioni

    /// Tutte le missioni che contano oggi: quelle dei personaggi più le due commissioni del giorno.
    func questsToday() -> [Quest] {
        guard let s: GameState = state else { return [] }
        let data: GameData = GameData.shared
        return data.quests.quests + QuestEngine.daily(state: s, fish: data.fish, recipes: data.recipes, maxDepth: maxDepth)
    }

    private func record(_ events: [QuestEvent], into s: inout GameState) {
        let data: GameData = GameData.shared
        let quests: [Quest] = data.quests.quests + QuestEngine.daily(state: s, fish: data.fish, recipes: data.recipes,
                                                                    maxDepth: data.upgrades.value("suit", state: s, fallback: data.balance.startSafeDepth))
        for event in events {
            justCompleted.append(contentsOf: QuestEngine.record(event, state: &s, quests: quests))
            StoryEngine.record(event, state: &s, book: data.story)
        }
    }

    // MARK: Storia

    /// Tappa della storia in corso, se la storia non è finita.
    var storyBeat: StoryBeat? {
        guard let s: GameState = state else { return nil }
        return StoryEngine.current(GameData.shared.story, state: s)
    }

    var chapter: ChapterInfo? {
        guard let s: GameState = state else { return nil }
        return StoryEngine.chapter(GameData.shared.story, state: s)
    }

    /// Scena da mostrare prima di tornare al porto.
    func pendingScene() -> Cutscene? {
        guard let s: GameState = state, let id: String = StoryEngine.pendingScene(GameData.shared.story, state: s) else { return nil }
        return GameData.shared.cutscenes.find(id)
    }

    /// Da chiamare quando la scena in attesa è stata vista o saltata.
    func sceneShown() {
        guard var s: GameState = state else { return }
        StoryEngine.sceneShown(state: &s, book: GameData.shared.story)
        // Le ricompense della storia possono far scattare altre missioni (fama).
        record([QuestEvent.fame(s.fame)], into: &s)
        awardPostcards(&s)
        state = s
        save()
    }

    /// Boss che la storia chiede di affrontare adesso.
    var availableBoss: BossInfo? {
        guard let s: GameState = state, let id: String = StoryEngine.availableBoss(GameData.shared.story, state: s) else { return nil }
        return GameData.shared.bosses.find(id)
    }

    /// Avanzamento della tappa in corso, per il porto e il Giornale: (fatto, da fare).
    var storyProgress: (count: Int, goal: Int)? {
        guard let s: GameState = state, let beat: StoryBeat = storyBeat else { return nil }
        return (count: s.story.count, goal: beat.goal.count)
    }

    func claim(_ quest: Quest) -> Bool {
        guard var s: GameState = state else { return false }
        if !QuestEngine.claim(quest, state: &s) { return false }
        record([QuestEvent.fame(s.fame)], into: &s)
        state = s
        justCompleted.removeAll(where: { $0 == quest.id })
        save()
        return true
    }

    func clearAnnouncements() {
        newlyLearned = []
        justCompleted = []
        newCollectibles = []
        state?.village.news = []
    }

    // MARK: Giorno nuovo, paese

    /// Fa avanzare la fase; al mattino nasse e vivaio rendono e le commissioni vecchie si chiudono.
    private func advance(_ s: inout GameState) {
        s.advancePhase()
        if s.phase == DayPhase.morning {
            QuestEngine.pruneDaily(state: &s)
            let data: GameData = GameData.shared
            Village.newDay(state: &s, book: data.village, fish: data.fish, world: data.world)
        }
        awardPostcards(&s)
    }

    private func awardPostcards(_ s: inout GameState) {
        newCollectibles.append(contentsOf: Village.awardPostcards(state: &s, book: GameData.shared.village))
    }

    /// L'evento di oggi, se ce n'è uno.
    var todayEvent: DayEvent? {
        guard let s: GameState = state else { return nil }
        return Village.event(state: s, recipes: GameData.shared.recipes)
    }

    /// Applica una modifica al paese (assunzioni, orto, nasse) e salva se è andata a buon fine.
    @discardableResult
    func village(_ change: (inout GameState, GameData) -> Bool) -> Bool {
        guard var s: GameState = state else { return false }
        if !change(&s, GameData.shared) { return false }
        let learned: [String] = s.learnRecipes(GameData.shared.recipes)
        newlyLearned.append(contentsOf: learned)
        state = s
        save()
        return true
    }

    /// Registra il punteggio di un gioco del bar. Ritorna true se è un nuovo primato.
    @discardableResult
    func record(game: String, score: Int) -> Bool {
        guard var s: GameState = state else { return false }
        let best: Int = s.village.records[game] ?? 0
        if score <= best { return false }
        s.village.records[game] = score
        state = s
        save()
        return true
    }

    /// Dà o toglie monete (scommesse e gettoni del bar). Ritorna false se non bastano.
    @discardableResult
    func pay(_ amount: Int) -> Bool {
        guard var s: GameState = state else { return false }
        if s.gold - amount < 0 { return false }
        s.gold -= amount
        state = s
        save()
        return true
    }

    /// La sfida di oggi contro Lustri è ancora da giocare?
    var duelAvailable: Bool {
        guard let s: GameState = state, let event: DayEvent = todayEvent else { return false }
        return event.kind == DayEventKind.duello && s.village.lastDuelDay != s.day
    }

    /// Esito della sfida a ritmo: una volta al giorno; chi vince prende oro e fama.
    func finishDuel(won: Bool) {
        guard var s: GameState = state else { return }
        s.village.lastDuelDay = s.day
        if won {
            s.gold += 120
            s.fame += 8
            record([QuestEvent.fame(s.fame)], into: &s)
        }
        state = s
        save()
    }

    /// Fine di un'immersione: il bottino va in dispensa e la giornata avanza.
    func finishDive(_ outcome: DiveOutcome) {
        guard var s: GameState = state else { return }
        let bag: DiveBag = outcome.bag
        // Uno scontro con un boss non conta come profondità raggiunta nuotando.
        let deepest: Double = outcome.boss == nil ? outcome.deepest : 0
        newlyLearned = s.bank(bag: bag, deepest: deepest, recipes: GameData.shared.recipes)
        var events: [QuestEvent] = outcome.boss == nil ? [QuestEvent.depth(deepest)] : []
        for fish in bag.fish { events.append(QuestEvent.caught(item: fish.speciesId, stars: fish.stars)) }
        for (kind, count) in bag.materials { events.append(QuestEvent.collected(item: kind, count: count)) }
        for species in bag.photos { events.append(QuestEvent.photo(species)) }
        if let boss: String = outcome.boss, outcome.bossDefeated { events.append(QuestEvent.boss(boss)) }
        record(events, into: &s)
        for zone in bag.relics {
            if let tile: String = Village.grantTile(zone: zone, state: &s, book: GameData.shared.village) { newCollectibles.append(tile) }
        }
        advance(&s)
        state = s
        save()
    }

    func skipPhase() {
        guard var s: GameState = state else { return }
        advance(&s)
        state = s
        newlyLearned = []
        save()
    }

    func clearLearned() {
        newlyLearned = []
    }

    /// Prepara il menu della sera. `plan` associa ricetta e numero di preparazioni.
    func prepareMenu(_ plan: [(recipeId: String, batches: Int)]) -> Bool {
        guard var s: GameState = state else { return false }
        var dishes: [PreparedDish] = []
        for entry in plan where entry.batches > 0 {
            guard let recipe: Recipe = GameData.shared.recipes.find(entry.recipeId),
                  var dish: PreparedDish = MenuPlanner.prepare(recipe, batches: entry.batches, state: &s, balance: GameData.shared.balance) else { return false }
            // Alla sagra il pesce azzurro si paga di più.
            if todayEvent?.kind == DayEventKind.sagra && Village.isBlueDish(recipe, book: GameData.shared.village) {
                dish = PreparedDish(recipeId: dish.recipeId, portions: dish.portions, price: Int((Double(dish.price) * Village.sagraPriceFactor).rounded()))
            }
            dishes.append(dish)
        }
        if dishes.isEmpty { return false }
        s.tonight = dishes
        state = s
        save()
        return true
    }

    /// Fine del servizio: incasso e fama, poi si passa alla notte.
    func finishService(_ result: ServiceResult) {
        guard var s: GameState = state else { return }
        lastFameBefore = s.fame
        lastService = result
        lastWages = Village.wages(state: s, book: GameData.shared.village)
        s.gold = max(0, s.gold + result.total - lastWages)
        s.totalEarned += result.total
        s.fame += result.fame
        if result.vipDelighted { s.pearls += 1 }
        var events: [QuestEvent] = [QuestEvent.earned(result.total), QuestEvent.fame(s.fame)]
        for (recipe, count) in result.sold { events.append(QuestEvent.served(recipe: recipe, count: count)) }
        record(events, into: &s)
        s.tonight = []
        if s.phase == DayPhase.evening { advance(&s) }
        state = s
        save()
    }

    /// Che cosa serve per aprire l'osteria con il menu preparato.
    func serviceSetup() -> ServiceSetup? {
        guard let s: GameState = state, !s.tonight.isEmpty, let rank: RankInfo = rank else { return nil }
        let seed: UInt64 = SeededRNG.combine([s.seed, UInt64(max(s.day, 0)), 99])
        var setup: ServiceSetup = ServiceSetup(dishes: s.tonight, recipes: GameData.shared.recipes, tuning: GameData.shared.balance.service,
                                               tables: rank.tables, arrivalEvery: rank.arrivalEvery, seed: seed)
        setup.carryCapacity = Int(upgradeValue("tray", fallback: 1))
        setup.cookSpeed = upgradeValue("stove", fallback: 1)
        Village.apply(staff: s.village.staff, to: &setup, book: GameData.shared.village)
        if let event: DayEvent = todayEvent {
            if event.kind == DayEventKind.sagra { setup.arrivalFactor = Village.sagraArrivalFactor }
            // Il critico si presenta solo se il piatto che cerca è in menu.
            if event.kind == DayEventKind.critico, let wanted: String = event.dishId, s.tonight.contains(where: { $0.recipeId == wanted }) {
                setup.vipDishId = wanted
            }
        }
        return setup
    }

    /// Parametri dell'immersione di adesso: mappa del giorno, ora, attrezzatura posseduta.
    func diveConfig() -> DiveConfig {
        var config: DiveConfig = DiveConfig()
        guard let s: GameState = state else { return config }
        let balance: Balance = GameData.shared.balance
        config.seed = s.diveSeed()
        config.night = s.phase == DayPhase.night
        switch s.phase {
        case .morning: config.sky = BackdropPainter.SkyStyle.morning
        case .afternoon: config.sky = BackdropPainter.SkyStyle.afternoon
        case .evening: config.sky = BackdropPainter.SkyStyle.evening
        case .night: config.sky = BackdropPainter.SkyStyle.night
        }
        config.breathMax = upgradeValue("breath", fallback: balance.startBreath)
        config.maxSafeDepth = upgradeValue("suit", fallback: balance.startSafeDepth)
        config.bagWeight = upgradeValue("bag", fallback: balance.startBagWeight)
        config.harpoonDamage = upgradeValue("harpoon", fallback: 10)
        config.harpoonRange = upgradeValue("elastic", fallback: 150)
        config.swimSpeed = upgradeValue("fins", fallback: 66)
        config.torchRadius = upgradeValue("torch", fallback: 0.10)
        config.phaseLabel = GameEnvironment.phaseName(s.phase)
        if let id: String = s.equipped { config.weapon = GameData.shared.upgrades.weapon(id) }
        // Le maioliche che mancano alla collezione possono trovarsi nelle loro zone.
        let wanted: Set<Int> = Village.relicZones(state: s, book: GameData.shared.village)
        for (index, zone) in GameData.shared.world.zones.enumerated() where wanted.contains(index) {
            config.relicZones.append((index: index, from: Double(zone.depthFrom), to: Double(zone.depthTo)))
        }
        return config
    }

    /// Parametri dello scontro con un boss: stessa attrezzatura, ma nella sua sala.
    func bossConfig(_ boss: BossInfo) -> DiveConfig {
        var config: DiveConfig = diveConfig()
        config.boss = boss
        config.relicZones = []
        config.night = false
        config.startDepthMeters = boss.depth
        config.phaseLabel = ""
        return config
    }

    /// L'immersione notturna si sblocca con la prima torcia.
    var canDiveAtNight: Bool {
        return (state?.upgrades["torch"] ?? 0) >= 1
    }
}
