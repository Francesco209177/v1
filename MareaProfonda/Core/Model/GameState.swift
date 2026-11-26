import Foundation

/// Fasi della giornata: due immersioni, il servizio all'osteria, la notte.
enum DayPhase: String, Codable, CaseIterable {
    case morning
    case afternoon
    case evening
    case night

    var next: DayPhase {
        switch self {
        case .morning: return DayPhase.afternoon
        case .afternoon: return DayPhase.evening
        case .evening: return DayPhase.night
        case .night: return DayPhase.morning
        }
    }
}

/// Dispensa dell'osteria: pesci (con le loro stelle) e materiali raccolti.
/// La chiave è "specie#stelle" per i pesci e "nome#0" per i materiali.
struct Pantry: Codable, Equatable {
    var counts: [String: Int] = [:]

    static func key(_ item: String, stars: Int) -> String {
        return "\(item)#\(stars)"
    }

    mutating func add(_ item: String, stars: Int, count: Int = 1) {
        if count <= 0 { return }
        counts[Pantry.key(item, stars: stars), default: 0] += count
    }

    mutating func add(bag: DiveBag) {
        for fish in bag.fish { add(fish.speciesId, stars: fish.stars) }
        for (kind, count) in bag.materials { add(kind, stars: 0, count: count) }
    }

    func count(_ item: String, stars: Int) -> Int {
        return counts[Pantry.key(item, stars: stars)] ?? 0
    }

    /// Quantità totale di un ingrediente, a prescindere dalle stelle.
    func total(_ item: String) -> Int {
        var n: Int = 0
        var s: Int = 0
        while s <= 3 {
            n += count(item, stars: s)
            s += 1
        }
        return n
    }

    /// Toglie `count` pezzi partendo dai migliori. Ritorna le stelle medie usate (0 per i materiali), o nil se non bastano.
    mutating func take(_ item: String, count: Int) -> Double? {
        if total(item) < count { return nil }
        var remaining: Int = count
        var starSum: Int = 0
        var s: Int = 3
        while s >= 0 && remaining > 0 {
            let have: Int = self.count(item, stars: s)
            let used: Int = min(have, remaining)
            if used > 0 {
                let k: String = Pantry.key(item, stars: s)
                counts[k] = have - used
                if counts[k] == 0 { counts[k] = nil }
                starSum += used * s
                remaining -= used
            }
            s -= 1
        }
        return Double(starSum) / Double(max(count, 1))
    }

    /// Elenco ordinato delle voci presenti: (ingrediente, stelle, quantità).
    func entries() -> [(item: String, stars: Int, count: Int)] {
        var out: [(item: String, stars: Int, count: Int)] = []
        for (key, count) in counts where count > 0 {
            let parts: [Substring] = key.split(separator: "#")
            if parts.count == 2, let stars: Int = Int(parts[1]) {
                out.append((item: String(parts[0]), stars: stars, count: count))
            }
        }
        out.sort { (a, b) -> Bool in
            if a.item != b.item { return a.item < b.item }
            return a.stars > b.stars
        }
        return out
    }

    var isEmpty: Bool { return counts.values.allSatisfy { $0 <= 0 } }
}

/// Scheda del Quaderno del Mare per una specie già incontrata.
struct FishRecord: Codable, Equatable {
    var caught: Int = 0
    var bestStars: Int = 0
}

/// Piatto pronto per il servizio della sera.
struct PreparedDish: Codable, Equatable {
    let recipeId: String
    var portions: Int
    let price: Int
}

/// Tutto ciò che viene salvato in uno slot.
struct GameState: Codable, Equatable {
    static let currentVersion: Int = 1

    var version: Int = GameState.currentVersion
    var slot: Int = 0
    /// Seme della partita: da qui derivano le mappe di ogni immersione.
    var seed: UInt64 = 1
    var day: Int = 1
    var phase: DayPhase = DayPhase.morning
    var gold: Int = 40
    var pearls: Int = 0
    var fame: Int = 0
    var pantry: Pantry = Pantry()
    /// Ricette conosciute e loro livello.
    var recipes: [String: Int] = [:]
    var fishLog: [String: FishRecord] = [:]
    /// Menu preparato per stasera.
    var tonight: [PreparedDish] = []
    /// Potenziamenti acquistati e loro livello.
    var upgrades: [String: Int] = [:]
    var flags: [String: Bool] = [:]
    /// Armi secondarie possedute e quella portata in immersione.
    var weapons: [String] = []
    var equipped: String? = nil
    /// Specie protette già fotografate.
    var photos: [String] = []
    var quests: QuestLog = QuestLog()
    /// Punto della storia.
    var story: StoryLog = StoryLog()
    var playSeconds: Double = 0
    var totalEarned: Int = 0
    var deepestDive: Double = 0

    init() {}

    // Decodifica tollerante: un salvataggio più vecchio resta leggibile quando si aggiungono campi.
    init(from decoder: Decoder) throws {
        let c: KeyedDecodingContainer<CodingKeys> = try decoder.container(keyedBy: CodingKeys.self)
        let d: GameState = GameState()
        version = try c.decodeIfPresent(Int.self, forKey: .version) ?? d.version
        slot = try c.decodeIfPresent(Int.self, forKey: .slot) ?? d.slot
        seed = try c.decodeIfPresent(UInt64.self, forKey: .seed) ?? d.seed
        day = try c.decodeIfPresent(Int.self, forKey: .day) ?? d.day
        phase = try c.decodeIfPresent(DayPhase.self, forKey: .phase) ?? d.phase
        gold = try c.decodeIfPresent(Int.self, forKey: .gold) ?? d.gold
        pearls = try c.decodeIfPresent(Int.self, forKey: .pearls) ?? d.pearls
        fame = try c.decodeIfPresent(Int.self, forKey: .fame) ?? d.fame
        pantry = try c.decodeIfPresent(Pantry.self, forKey: .pantry) ?? d.pantry
        recipes = try c.decodeIfPresent([String: Int].self, forKey: .recipes) ?? d.recipes
        fishLog = try c.decodeIfPresent([String: FishRecord].self, forKey: .fishLog) ?? d.fishLog
        tonight = try c.decodeIfPresent([PreparedDish].self, forKey: .tonight) ?? d.tonight
        upgrades = try c.decodeIfPresent([String: Int].self, forKey: .upgrades) ?? d.upgrades
        flags = try c.decodeIfPresent([String: Bool].self, forKey: .flags) ?? d.flags
        weapons = try c.decodeIfPresent([String].self, forKey: .weapons) ?? d.weapons
        equipped = try c.decodeIfPresent(String.self, forKey: .equipped)
        photos = try c.decodeIfPresent([String].self, forKey: .photos) ?? d.photos
        quests = try c.decodeIfPresent(QuestLog.self, forKey: .quests) ?? d.quests
        story = try c.decodeIfPresent(StoryLog.self, forKey: .story) ?? d.story
        playSeconds = try c.decodeIfPresent(Double.self, forKey: .playSeconds) ?? d.playSeconds
        totalEarned = try c.decodeIfPresent(Int.self, forKey: .totalEarned) ?? d.totalEarned
        deepestDive = try c.decodeIfPresent(Double.self, forKey: .deepestDive) ?? d.deepestDive
    }

    /// Seme della mappa per l'immersione di adesso: cambia a ogni giorno e fascia oraria.
    func diveSeed() -> UInt64 {
        let phaseIndex: UInt64 = UInt64(DayPhase.allCases.firstIndex(of: phase) ?? 0)
        return SeededRNG.combine([seed, UInt64(max(day, 0)), phaseIndex])
    }

    /// Registra il bottino di un'immersione: dispensa, Quaderno del Mare, ricette scoperte.
    /// Ritorna gli identificativi delle ricette appena imparate.
    mutating func bank(bag: DiveBag, deepest: Double, recipes book: RecipeBook) -> [String] {
        pantry.add(bag: bag)
        for species in bag.photos where !photos.contains(species) { photos.append(species) }
        for fish in bag.fish {
            var record: FishRecord = fishLog[fish.speciesId] ?? FishRecord()
            record.caught += 1
            record.bestStars = max(record.bestStars, fish.stars)
            fishLog[fish.speciesId] = record
        }
        if deepest > deepestDive { deepestDive = deepest }
        var learned: [String] = []
        for recipe in book.recipes where recipes[recipe.id] == nil {
            if recipe.unlock == "start" {
                recipes[recipe.id] = 1
            } else if recipe.unlock.hasPrefix("catch:") {
                let species: String = String(recipe.unlock.dropFirst("catch:".count))
                if fishLog[species] != nil {
                    recipes[recipe.id] = 1
                    learned.append(recipe.id)
                }
            }
        }
        return learned
    }

    mutating func advancePhase() {
        if phase == DayPhase.night {
            day += 1
            tonight = []
        }
        phase = phase.next
    }
}

/// Lettura e scrittura degli slot di salvataggio (JSON in una cartella a scelta: Application Support nell'app).
struct SaveStore {
    static let slotCount: Int = 3
    let directory: URL

    init(directory: URL) {
        self.directory = directory
    }

    private func url(slot: Int) -> URL {
        return directory.appendingPathComponent("slot\(slot).json")
    }

    private func backupURL(slot: Int) -> URL {
        return directory.appendingPathComponent("slot\(slot).bak.json")
    }

    func exists(slot: Int) -> Bool {
        return FileManager.default.fileExists(atPath: url(slot: slot).path)
    }

    /// Carica uno slot; se il file principale è rovinato prova con la copia precedente.
    func load(slot: Int) -> GameState? {
        for candidate in [url(slot: slot), backupURL(slot: slot)] {
            if let data: Data = try? Data(contentsOf: candidate), var state: GameState = try? JSONDecoder().decode(GameState.self, from: data) {
                state.slot = slot
                state.version = GameState.currentVersion
                return state
            }
        }
        return nil
    }

    /// Scrittura atomica; il file precedente resta come copia di riserva.
    @discardableResult
    func save(_ state: GameState) -> Bool {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let encoder: JSONEncoder = JSONEncoder()
            encoder.outputFormatting = [JSONEncoder.OutputFormatting.sortedKeys]
            let data: Data = try encoder.encode(state)
            let target: URL = url(slot: state.slot)
            if FileManager.default.fileExists(atPath: target.path) {
                let backup: URL = backupURL(slot: state.slot)
                try? FileManager.default.removeItem(at: backup)
                try? FileManager.default.copyItem(at: target, to: backup)
            }
            try data.write(to: target, options: Data.WritingOptions.atomic)
            return true
        } catch {
            return false
        }
    }

    func delete(slot: Int) {
        try? FileManager.default.removeItem(at: url(slot: slot))
        try? FileManager.default.removeItem(at: backupURL(slot: slot))
    }
}
