// MARK: - Dati del paese (Data/village.json)

/// Una persona che si può assumere all'osteria. `effect` vale:
/// order (prende le ordinazioni), clean (sparecchia), cook (aiuta in cucina), wine (porta il vino).
struct StaffInfo: Codable, Equatable {
    let id: String
    let name: LocalizedText
    let role: LocalizedText
    let note: LocalizedText
    let effect: String
    /// Secondi d'attesa prima che intervenga (order, clean, wine) o moltiplicatore di velocità (cook).
    let value: Double
    let hire: Int
    /// Paga per ogni serata lavorata.
    let wage: Int
    let minFame: Int
    /// Sprite della figura in sala.
    let sprite: String

    static let effects: Set<String> = ["order", "clean", "cook", "wine"]
}

/// Una coltura dell'orto: diventa un ingrediente della dispensa.
struct CropInfo: Codable, Equatable {
    let id: String
    let name: LocalizedText
    let note: LocalizedText
    /// Giorni dalla semina al raccolto.
    let days: Int
    let yield: Int
    let seedCost: Int
}

/// Un oggetto da collezione. `kind` è maiolica (si trova in immersione, in una zona) o cartolina (si guadagna con un traguardo).
struct Collectible: Codable, Equatable {
    let id: String
    let kind: String
    let name: LocalizedText
    let note: LocalizedText
    /// Maioliche: indice della zona in cui si trova.
    let zone: Int?
    /// Cartoline: traguardo, nella forma "tipo:quantità" (fame, depth, species, caught, recipes, photos, bosses, earned).
    let rule: String?
}

struct VillageBook: Codable, Equatable {
    let staff: [StaffInfo]
    let crops: [CropInfo]
    let collectibles: [Collectible]
    /// Costo di ogni aiuola dell'orto oltre le prime due.
    let plotCosts: [Int]
    let penCosts: [Int]
    let trapCosts: [Int]
    /// Specie del "pesce azzurro", in festa alla sagra.
    let blueFish: [String]

    static let empty: VillageBook = VillageBook(staff: [], crops: [], collectibles: [], plotCosts: [], penCosts: [], trapCosts: [], blueFish: [])
    static let freePlots: Int = 2
    static let rules: Set<String> = ["fame", "depth", "species", "caught", "recipes", "photos", "bosses", "earned"]

    func member(_ id: String) -> StaffInfo? { return staff.first(where: { $0.id == id }) }
    func crop(_ id: String) -> CropInfo? { return crops.first(where: { $0.id == id }) }
    func collectible(_ id: String) -> Collectible? { return collectibles.first(where: { $0.id == id }) }
    var cropIds: Set<String> { return Set(crops.map { $0.id }) }
    var tiles: [Collectible] { return collectibles.filter { $0.kind == "maiolica" } }
    var postcards: [Collectible] { return collectibles.filter { $0.kind == "cartolina" } }
    var maxPlots: Int { return VillageBook.freePlots + plotCosts.count }

    func problems(fish: FishCatalog, world: WorldData) -> [String] {
        var out: [String] = []
        var ids: Set<String> = []
        for s in staff {
            if ids.contains(s.id) { out.append("personale duplicato: \(s.id)") }
            ids.insert(s.id)
            if !StaffInfo.effects.contains(s.effect) { out.append("\(s.id): effetto sconosciuto '\(s.effect)'") }
            if s.value <= 0 || s.hire < 0 || s.wage < 0 { out.append("\(s.id): valori non validi") }
        }
        for c in crops {
            if ids.contains(c.id) { out.append("coltura duplicata: \(c.id)") }
            ids.insert(c.id)
            if c.days < 1 || c.yield < 1 || c.seedCost < 0 { out.append("\(c.id): valori non validi") }
            if fish.find(c.id) != nil || DiveBag.materialWeights[c.id] != nil { out.append("\(c.id): nome già usato da un altro ingrediente") }
        }
        for item in collectibles {
            if ids.contains(item.id) { out.append("oggetto da collezione duplicato: \(item.id)") }
            ids.insert(item.id)
            if item.kind == "maiolica" {
                if let zone: Int = item.zone, zone >= 0, zone < world.zones.count { continue }
                out.append("\(item.id): zona non valida")
            } else if item.kind == "cartolina" {
                let parts: [Substring] = (item.rule ?? "").split(separator: ":")
                if parts.count != 2 || !VillageBook.rules.contains(String(parts[0])) || Int(parts[1]) == nil { out.append("\(item.id): traguardo non valido") }
            } else {
                out.append("\(item.id): tipo sconosciuto '\(item.kind)'")
            }
        }
        for species in blueFish where fish.find(species) == nil { out.append("pesce azzurro sconosciuto: \(species)") }
        return out
    }
}

// MARK: - Stato salvato

struct PlotState: Codable, Equatable {
    var crop: String? = nil
    var plantedDay: Int = 0
}

/// Una vasca del vivaio: una specie sola, che si riproduce.
struct PenState: Codable, Equatable {
    var species: String? = nil
    var count: Int = 0
    var stockedDay: Int = 0
}

/// Una nassa calata in una zona: ogni mattina può rendere qualcosa.
struct TrapState: Codable, Equatable {
    var zone: Int = 0
}

struct VillageState: Codable, Equatable {
    var staff: [String] = []
    var plots: [PlotState] = []
    var pens: [PenState] = []
    var traps: [TrapState] = []
    /// Maioliche e cartoline possedute.
    var collection: [String] = []
    /// Punteggi migliori dei giochi del bar.
    var records: [String: Int] = [:]
    /// Ciò che è successo nella notte (nasse, vivaio), da leggere al porto.
    var news: [String] = []
    /// Giorno dell'ultima sfida vinta contro Lustri: una sola al giorno.
    var lastDuelDay: Int = 0

    init() {}

    init(from decoder: Decoder) throws {
        let c: KeyedDecodingContainer<CodingKeys> = try decoder.container(keyedBy: CodingKeys.self)
        staff = try c.decodeIfPresent([String].self, forKey: .staff) ?? []
        plots = try c.decodeIfPresent([PlotState].self, forKey: .plots) ?? []
        pens = try c.decodeIfPresent([PenState].self, forKey: .pens) ?? []
        traps = try c.decodeIfPresent([TrapState].self, forKey: .traps) ?? []
        collection = try c.decodeIfPresent([String].self, forKey: .collection) ?? []
        records = try c.decodeIfPresent([String: Int].self, forKey: .records) ?? [:]
        news = try c.decodeIfPresent([String].self, forKey: .news) ?? []
        lastDuelDay = try c.decodeIfPresent(Int.self, forKey: .lastDuelDay) ?? 0
    }
}

// MARK: - Eventi del giorno

enum DayEventKind: String, Equatable {
    /// Sagra del pesce azzurro: più clienti, e i piatti di pesce azzurro si pagano di più.
    case sagra
    /// Sera del critico: un ospite speciale chiede un piatto preciso.
    case critico
    /// Chef Lustri lancia una sfida a tempo di musica.
    case duello
}

struct DayEvent: Equatable {
    let kind: DayEventKind
    let title: String
    let text: String
    /// Sera del critico: il piatto che vorrà.
    let dishId: String?
}

// MARK: - Regole

enum Village {
    static let sagraPriceFactor: Double = 1.5
    static let sagraArrivalFactor: Double = 0.72
    static let maxPenCount: Int = 6
    static let penMaxWeight: Double = 4.0
    static let trapMaxWeight: Double = 3.5

    // MARK: Sblocchi

    /// Orto, vivaio e nasse arrivano con il secondo capitolo; il personale quando l'osteria è una trattoria.
    static func farmUnlocked(_ state: GameState) -> Bool { return state.flags["beat_c1_baronessa"] ?? false }
    static func staffUnlocked(_ state: GameState) -> Bool { return state.fame >= 40 || !state.village.staff.isEmpty }

    // MARK: Personale

    enum HireOutcome: Equatable {
        case hired
        case alreadyHired
        case notEnoughGold
        case notEnoughFame
        case unknown
    }

    static func hire(_ id: String, state: inout GameState, book: VillageBook) -> HireOutcome {
        guard let info: StaffInfo = book.member(id) else { return HireOutcome.unknown }
        if state.village.staff.contains(id) { return HireOutcome.alreadyHired }
        if state.fame < info.minFame { return HireOutcome.notEnoughFame }
        if state.gold < info.hire { return HireOutcome.notEnoughGold }
        state.gold -= info.hire
        state.village.staff.append(id)
        return HireOutcome.hired
    }

    static func dismiss(_ id: String, state: inout GameState) {
        state.village.staff.removeAll(where: { $0 == id })
    }

    /// Paghe da versare dopo una serata.
    static func wages(state: GameState, book: VillageBook) -> Int {
        var total: Int = 0
        for id in state.village.staff { total += book.member(id)?.wage ?? 0 }
        return total
    }

    /// Applica al servizio l'aiuto del personale assunto.
    static func apply(staff ids: [String], to setup: inout ServiceSetup, book: VillageBook) {
        for id in ids {
            guard let info: StaffInfo = book.member(id) else { continue }
            switch info.effect {
            case "order": setup.autoOrderAfter = min(setup.autoOrderAfter ?? Double.greatestFiniteMagnitude, info.value)
            case "clean": setup.autoCleanAfter = min(setup.autoCleanAfter ?? Double.greatestFiniteMagnitude, info.value)
            case "wine": setup.autoWineAfter = min(setup.autoWineAfter ?? Double.greatestFiniteMagnitude, info.value)
            case "cook": setup.cookSpeed *= info.value
            default: break
            }
            setup.staffSprites.append(info.sprite)
        }
    }

    // MARK: Orto

    static func plotCount(_ state: GameState) -> Int {
        return max(state.village.plots.count, farmUnlocked(state) ? VillageBook.freePlots : 0)
    }

    /// Porta l'elenco delle aiuole al numero posseduto (le prime due sono in regalo).
    private static func ensurePlots(_ state: inout GameState) {
        while state.village.plots.count < plotCount(state) { state.village.plots.append(PlotState()) }
    }

    static func nextPlotCost(_ state: GameState, book: VillageBook) -> Int? {
        let extra: Int = plotCount(state) - VillageBook.freePlots
        if extra < 0 || extra >= book.plotCosts.count { return nil }
        return book.plotCosts[extra]
    }

    static func buyPlot(state: inout GameState, book: VillageBook) -> Bool {
        guard farmUnlocked(state), let cost: Int = nextPlotCost(state, book: book), state.gold >= cost else { return false }
        ensurePlots(&state)
        state.gold -= cost
        state.village.plots.append(PlotState())
        return true
    }

    static func plant(_ crop: String, plot: Int, state: inout GameState, book: VillageBook) -> Bool {
        guard farmUnlocked(state), let info: CropInfo = book.crop(crop) else { return false }
        ensurePlots(&state)
        if plot < 0 || plot >= state.village.plots.count || state.village.plots[plot].crop != nil || state.gold < info.seedCost { return false }
        state.gold -= info.seedCost
        state.village.plots[plot] = PlotState(crop: crop, plantedDay: state.day)
        return true
    }

    /// Giorni che mancano al raccolto di un'aiuola (0 = pronta), o nil se è vuota.
    static func daysLeft(plot: PlotState, day: Int, book: VillageBook) -> Int? {
        guard let id: String = plot.crop, let info: CropInfo = book.crop(id) else { return nil }
        return max(0, plot.plantedDay + info.days - day)
    }

    /// Raccoglie un'aiuola pronta: il raccolto va in dispensa. Ritorna quanto si è raccolto.
    static func harvest(plot: Int, state: inout GameState, book: VillageBook) -> Int {
        ensurePlots(&state)
        guard plot >= 0, plot < state.village.plots.count, let id: String = state.village.plots[plot].crop, let info: CropInfo = book.crop(id),
              daysLeft(plot: state.village.plots[plot], day: state.day, book: book) == 0 else { return 0 }
        state.pantry.add(id, stars: 0, count: info.yield)
        state.village.plots[plot] = PlotState()
        return info.yield
    }

    // MARK: Vivaio

    static func nextPenCost(_ state: GameState, book: VillageBook) -> Int? {
        let owned: Int = state.village.pens.count
        return owned < book.penCosts.count ? book.penCosts[owned] : nil
    }

    static func buyPen(state: inout GameState, book: VillageBook) -> Bool {
        guard farmUnlocked(state), let cost: Int = nextPenCost(state, book: book), state.gold >= cost else { return false }
        state.gold -= cost
        state.village.pens.append(PenState())
        return true
    }

    /// Specie che si possono mettere in vasca: commestibili, non troppo grosse, e ne servono due vive (tre stelle).
    static func stockable(_ state: GameState, fish: FishCatalog) -> [FishSpecies] {
        return fish.species.filter { $0.isEdible && $0.item == nil && $0.weight <= penMaxWeight && state.pantry.count($0.id, stars: 3) >= 2 }
    }

    static func stock(pen: Int, species: String, state: inout GameState, fish: FishCatalog) -> Bool {
        guard pen >= 0, pen < state.village.pens.count, state.village.pens[pen].species == nil,
              stockable(state, fish: fish).contains(where: { $0.id == species }) else { return false }
        state.pantry.counts[Pantry.key(species, stars: 3), default: 0] -= 2
        if (state.pantry.counts[Pantry.key(species, stars: 3)] ?? 0) <= 0 { state.pantry.counts[Pantry.key(species, stars: 3)] = nil }
        state.village.pens[pen] = PenState(species: species, count: 2, stockedDay: state.day)
        return true
    }

    static func emptyPen(_ pen: Int, state: inout GameState) {
        guard pen >= 0, pen < state.village.pens.count, let species: String = state.village.pens[pen].species else { return }
        // I riproduttori tornano in dispensa.
        state.pantry.add(species, stars: 2, count: state.village.pens[pen].count)
        state.village.pens[pen] = PenState()
    }

    // MARK: Nasse

    static func nextTrapCost(_ state: GameState, book: VillageBook) -> Int? {
        let owned: Int = state.village.traps.count
        return owned < book.trapCosts.count ? book.trapCosts[owned] : nil
    }

    static func buyTrap(state: inout GameState, book: VillageBook) -> Bool {
        guard farmUnlocked(state), let cost: Int = nextTrapCost(state, book: book), state.gold >= cost else { return false }
        state.gold -= cost
        state.village.traps.append(TrapState(zone: 0))
        return true
    }

    /// Zone in cui si può calare una nassa: quelle dove la muta permette di arrivare.
    static func reachableZones(world: WorldData, maxDepth: Double) -> [Int] {
        var out: [Int] = []
        for (index, zone) in world.zones.enumerated() where Double(zone.depthFrom) < maxDepth { out.append(index) }
        return out
    }

    static func moveTrap(_ trap: Int, toZone zone: Int, state: inout GameState, world: WorldData, maxDepth: Double) -> Bool {
        guard trap >= 0, trap < state.village.traps.count, reachableZones(world: world, maxDepth: maxDepth).contains(zone) else { return false }
        state.village.traps[trap].zone = zone
        return true
    }

    /// Ciò che può finire in una nassa in una zona.
    static func trapCandidates(zone: ZoneInfo, fish: FishCatalog) -> [FishSpecies] {
        return fish.species.filter { (s: FishSpecies) -> Bool in
            s.isEdible && !s.night && s.item == nil && s.weight <= trapMaxWeight && s.behavior != FishBehavior.aggressive
                && s.depthMin < Double(zone.depthTo) && s.depthMax > Double(zone.depthFrom)
        }
    }

    // MARK: Nuovo giorno

    /// Da chiamare quando comincia un nuovo giorno: nasse e vivaio rendono, e se ne prende nota.
    static func newDay(state: inout GameState, book: VillageBook, fish: FishCatalog, world: WorldData) {
        var news: [String] = []
        var rng: SeededRNG = SeededRNG(seed: SeededRNG.combine([state.seed, UInt64(max(state.day, 0)), 9090]))

        var trapped: [String: Int] = [:]
        for trap in state.village.traps where trap.zone >= 0 && trap.zone < world.zones.count {
            let candidates: [FishSpecies] = trapCandidates(zone: world.zones[trap.zone], fish: fish)
            let roll: Double = rng.unit()
            let count: Int = roll < 0.15 ? 0 : (roll < 0.70 ? 1 : 2)
            var n: Int = 0
            while n < count {
                if let index: Int = rng.pickWeighted(candidates.map { $0.spawnWeight }) {
                    let species: FishSpecies = candidates[index]
                    state.pantry.add(species.id, stars: 2)
                    var record: FishRecord = state.fishLog[species.id] ?? FishRecord()
                    record.caught += 1
                    record.bestStars = max(record.bestStars, 2)
                    state.fishLog[species.id] = record
                    trapped[species.name.text(), default: 0] += 1
                }
                n += 1
            }
        }
        if !state.village.traps.isEmpty {
            if trapped.isEmpty {
                news.append("Le nasse stamattina erano vuote.")
            } else {
                let parts: [String] = trapped.keys.sorted().map { (name: String) -> String in "\(name) × \(trapped[name] ?? 0)" }
                news.append("Nelle nasse: " + parts.joined(separator: ", ") + ".")
            }
        }

        var p: Int = 0
        while p < state.village.pens.count {
            if let id: String = state.village.pens[p].species, let species: FishSpecies = fish.find(id) {
                let born: Int = max(1, state.village.pens[p].count / 2)
                state.pantry.add(id, stars: 2, count: born)
                // Ogni tre giorni la vasca si popola un po' di più.
                if (state.day - state.village.pens[p].stockedDay) % 3 == 0 && state.village.pens[p].count < maxPenCount {
                    state.village.pens[p].count += 1
                }
                news.append("Dal vivaio: \(species.name.text()) × \(born).")
            }
            p += 1
        }

        var ready: Int = 0
        for plot in state.village.plots where daysLeft(plot: plot, day: state.day, book: book) == 0 { ready += 1 }
        if ready > 0 { news.append(ready == 1 ? "Nell'orto c'è un'aiuola da raccogliere." : "Nell'orto ci sono \(ready) aiuole da raccogliere.") }
        state.village.news = news
    }

    // MARK: Eventi

    /// L'evento di oggi, se ce n'è uno. Stesso giorno della stessa partita, stesso evento.
    static func event(state: GameState, recipes: RecipeBook) -> DayEvent? {
        let day: Int = state.day
        if day >= 7 && day % 7 == 0 {
            return DayEvent(kind: DayEventKind.sagra, title: "Sagra del pesce azzurro",
                            text: "Stasera il paese è in piazza: più clienti, e sarde, sgombri e tonni si pagano la metà in più.", dishId: nil)
        }
        if day >= 5 && day % 7 == 3 && state.fame >= 40 {
            var rng: SeededRNG = SeededRNG(seed: SeededRNG.combine([state.seed, UInt64(day), 3131]))
            let known: [Recipe] = recipes.recipes.filter { state.recipes[$0.id] != nil }.sorted { $0.id < $1.id }
            if let wanted: Recipe = rng.pick(known) {
                return DayEvent(kind: DayEventKind.critico, title: "Sera del critico",
                                text: "Un ospite di riguardo verrà a cena e chiederà: \(wanted.name.text()). Se lo trova in menu, la fama vola.", dishId: wanted.id)
            }
        }
        if day >= 6 && day % 7 == 5 && farmUnlocked(state) {
            return DayEvent(kind: DayEventKind.duello, title: "La sfida di Lustri",
                            text: "Chef Lustri ti aspetta al bar per una gara di coltello, a tempo di musica. In palio, oro e fama.", dishId: nil)
        }
        return nil
    }

    /// true se una ricetta usa pesce azzurro: alla sagra si paga di più.
    static func isBlueDish(_ recipe: Recipe, book: VillageBook) -> Bool {
        return recipe.ingredients.contains(where: { book.blueFish.contains($0.item) })
    }

    // MARK: Collezione

    /// Assegna una maiolica trovata in una zona: la prima che manca di quella zona, poi di qualunque altra.
    /// Ritorna l'identificativo, o nil se la collezione delle maioliche è completa (il doppione vale qualche moneta).
    static func grantTile(zone: Int, state: inout GameState, book: VillageBook) -> String? {
        let missing: [Collectible] = book.tiles.filter { !state.village.collection.contains($0.id) }
        let pick: Collectible? = missing.first(where: { $0.zone == zone }) ?? missing.first
        guard let tile: Collectible = pick else {
            state.gold += 25
            return nil
        }
        state.village.collection.append(tile.id)
        if book.tiles.allSatisfy({ state.village.collection.contains($0.id) }) { state.pearls += 5 }
        return tile.id
    }

    /// Zone in cui manca ancora una maiolica: lì il mare può nasconderne una.
    static func relicZones(state: GameState, book: VillageBook) -> Set<Int> {
        var out: Set<Int> = []
        for tile in book.tiles where !state.village.collection.contains(tile.id) {
            if let zone: Int = tile.zone { out.insert(zone) }
        }
        return out
    }

    private static func measure(_ rule: String, state: GameState) -> Int {
        switch rule {
        case "fame": return state.fame
        case "depth": return Int(state.deepestDive)
        case "species": return state.fishLog.count
        case "caught":
            var n: Int = 0
            for (_, record) in state.fishLog { n += record.caught }
            return n
        case "recipes": return state.recipes.count
        case "photos": return state.photos.count
        case "bosses": return state.story.bosses.count
        case "earned": return state.totalEarned
        default: return 0
        }
    }

    /// Assegna le cartoline i cui traguardi sono stati raggiunti. Ritorna quelle nuove.
    static func awardPostcards(state: inout GameState, book: VillageBook) -> [String] {
        var new: [String] = []
        for card in book.postcards where !state.village.collection.contains(card.id) {
            let parts: [Substring] = (card.rule ?? "").split(separator: ":")
            guard parts.count == 2, let target: Int = Int(parts[1]) else { continue }
            if measure(String(parts[0]), state: state) >= target {
                state.village.collection.append(card.id)
                new.append(card.id)
            }
        }
        if !new.isEmpty && book.postcards.allSatisfy({ state.village.collection.contains($0.id) }) { state.pearls += 5 }
        return new
    }
}
