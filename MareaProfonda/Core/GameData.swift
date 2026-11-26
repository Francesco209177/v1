import Foundation

/// Dati di gioco letti dai JSON del bundle (cartella `Data`). Se un file manca o è rotto
/// il gioco parte comunque con valori di riserva e annota il problema.
final class GameData {
    static let shared: GameData = GameData()

    let world: WorldData
    let fish: FishCatalog
    let recipes: RecipeBook
    let balance: Balance
    private(set) var problems: [String] = []

    private init() {
        var notes: [String] = []
        let directory: URL? = Bundle.main.url(forResource: "Data", withExtension: nil)
        if directory == nil { notes.append("cartella Data assente dal bundle") }

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

        world = loadedWorld ?? GameData.fallbackWorld
        fish = loadedFish ?? FishCatalog(species: [])
        recipes = loadedRecipes ?? RecipeBook(recipes: [])
        balance = loadedBalance ?? GameData.fallbackBalance
        notes.append(contentsOf: world.problems())
        notes.append(contentsOf: fish.problems())
        notes.append(contentsOf: recipes.problems(fish: fish))
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

/// Preferenze salvate in `UserDefaults`.
final class SettingsStore {
    static let shared: SettingsStore = SettingsStore()
    private static let key: String = "marea.settings.v1"

    var settings: GameSettings {
        didSet { if settings != oldValue { save() } }
    }

    private init() {
        if let data: Data = UserDefaults.standard.data(forKey: SettingsStore.key),
           let decoded: GameSettings = try? JSONDecoder().decode(GameSettings.self, from: data) {
            settings = decoded
        } else {
            settings = GameSettings()
        }
    }

    private func save() {
        if let data: Data = try? JSONEncoder().encode(settings) {
            UserDefaults.standard.set(data, forKey: SettingsStore.key)
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

    private init() {
        let base: URL = FileManager.default.urls(for: FileManager.SearchPathDirectory.applicationSupportDirectory,
                                                 in: FileManager.SearchPathDomainMask.userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        store = SaveStore(directory: base.appendingPathComponent("Salvataggi", isDirectory: true))
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

    /// Fine di un'immersione: il bottino va in dispensa e la giornata avanza.
    func finishDive(bag: DiveBag, deepest: Double) {
        guard var s: GameState = state else { return }
        newlyLearned = s.bank(bag: bag, deepest: deepest, recipes: GameData.shared.recipes)
        s.advancePhase()
        state = s
        save()
    }

    func skipPhase() {
        guard var s: GameState = state else { return }
        s.advancePhase()
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
                  let dish: PreparedDish = MenuPlanner.prepare(recipe, batches: entry.batches, state: &s, balance: GameData.shared.balance) else { return false }
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
        s.gold += result.total
        s.totalEarned += result.total
        s.fame += result.fame
        if result.vipDelighted { s.pearls += 1 }
        s.tonight = []
        if s.phase == DayPhase.evening { s.advancePhase() }
        state = s
        save()
    }

    /// Che cosa serve per aprire l'osteria con il menu preparato.
    func serviceSetup() -> ServiceSetup? {
        guard let s: GameState = state, !s.tonight.isEmpty, let rank: RankInfo = rank else { return nil }
        let seed: UInt64 = SeededRNG.combine([s.seed, UInt64(max(s.day, 0)), 99])
        return ServiceSetup(dishes: s.tonight, recipes: GameData.shared.recipes, tuning: GameData.shared.balance.service,
                            tables: rank.tables, arrivalEvery: rank.arrivalEvery, seed: seed)
    }

    func diveConfig() -> DiveScene.Config {
        var config: DiveScene.Config = DiveScene.Config()
        guard let s: GameState = state else { return config }
        config.seed = s.diveSeed()
        config.sky = s.phase == DayPhase.afternoon ? BackdropPainter.SkyStyle.afternoon : BackdropPainter.SkyStyle.morning
        return config
    }
}
