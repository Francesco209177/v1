import Foundation

/// Obiettivo di una missione. `kind` vale: catch (pesca, per ingrediente), serve (porzioni servite
/// di una ricetta), collect (materiali raccolti), earn (oro incassato), depth (metri raggiunti),
/// fame (fama totale), photo (specie fotografata), upgrade (livello di un potenziamento), boss.
struct QuestGoal: Codable, Equatable {
    let kind: String
    /// Specie, ricetta, materiale, potenziamento o boss; nil = qualunque.
    let target: String?
    let count: Int
    let minStars: Int?
}

struct QuestReward: Codable, Equatable {
    let gold: Int?
    let pearls: Int?
    let fame: Int?
    let recipe: String?
    let weapon: String?
    /// Interruttore di trama da accendere (sblocca sistemi o capitoli).
    let flag: String?
}

/// Una missione, letta da `Data/quests.json`.
struct Quest: Codable, Equatable {
    let id: String
    /// main, side, photo, daily.
    let kind: String
    /// Personaggio che la affida.
    let giver: String
    let title: LocalizedText
    let text: LocalizedText
    let goal: QuestGoal
    let reward: QuestReward
    /// Missioni che devono essere già state riscosse.
    let requires: [String]?
    let minFame: Int?
    let chapter: Int?
}

struct QuestBook: Codable, Equatable {
    let quests: [Quest]

    func find(_ id: String) -> Quest? {
        return quests.first(where: { $0.id == id })
    }

    static let goalKinds: Set<String> = ["catch", "serve", "collect", "earn", "depth", "fame", "photo", "upgrade", "boss"]

    func problems(fish: FishCatalog, recipes: RecipeBook, upgrades: UpgradeBook) -> [String] {
        var out: [String] = []
        var ids: Set<String> = []
        for q in quests { ids.insert(q.id) }
        if ids.count != quests.count { out.append("missioni con identificativo duplicato") }
        for q in quests {
            if !QuestBook.goalKinds.contains(q.goal.kind) { out.append("\(q.id): tipo di obiettivo sconosciuto '\(q.goal.kind)'") }
            if q.goal.count < 1 { out.append("\(q.id): quantità non valida") }
            if q.title.text().isEmpty || q.text.text().isEmpty { out.append("\(q.id): testo mancante") }
            for other in q.requires ?? [] where !ids.contains(other) { out.append("\(q.id): richiede una missione inesistente '\(other)'") }
            if let target: String = q.goal.target {
                switch q.goal.kind {
                case "catch", "photo":
                    if fish.find(target) == nil { out.append("\(q.id): specie sconosciuta '\(target)'") }
                case "serve":
                    if recipes.find(target) == nil { out.append("\(q.id): ricetta sconosciuta '\(target)'") }
                case "collect":
                    if DiveBag.materialWeights[target] == nil { out.append("\(q.id): materiale sconosciuto '\(target)'") }
                case "upgrade":
                    if upgrades.upgrade(target) == nil { out.append("\(q.id): potenziamento sconosciuto '\(target)'") }
                default:
                    break
                }
            }
            if let recipe: String = q.reward.recipe, recipes.find(recipe) == nil { out.append("\(q.id): ricompensa con ricetta sconosciuta") }
            if let weapon: String = q.reward.weapon, upgrades.weapon(weapon) == nil { out.append("\(q.id): ricompensa con arma sconosciuta") }
        }
        return out
    }
}

struct QuestProgress: Codable, Equatable {
    var count: Int = 0
    var done: Bool = false
}

/// Avanzamento delle missioni di una partita.
struct QuestLog: Codable, Equatable {
    var progress: [String: QuestProgress] = [:]
    /// Missioni di cui si è già ritirata la ricompensa.
    var claimed: [String] = []
}

/// Fatti di gioco che possono far avanzare una missione.
enum QuestEvent: Equatable {
    case caught(item: String, stars: Int)
    case served(recipe: String, count: Int)
    case collected(item: String, count: Int)
    case earned(Int)
    case depth(Double)
    case fame(Int)
    case photo(String)
    case upgraded(id: String, level: Int)
    case boss(String)
}

enum QuestEngine {
    /// Una missione è attiva se non è stata riscossa e i suoi requisiti sono soddisfatti.
    static func isActive(_ q: Quest, state: GameState) -> Bool {
        if state.quests.claimed.contains(q.id) { return false }
        for other in q.requires ?? [] where !state.quests.claimed.contains(other) { return false }
        if let fame: Int = q.minFame, state.fame < fame { return false }
        return true
    }

    static func active(_ book: QuestBook, state: GameState) -> [Quest] {
        return book.quests.filter { isActive($0, state: state) }
    }

    /// Missioni completate di cui si può ritirare la ricompensa.
    static func claimable(_ book: QuestBook, state: GameState) -> [Quest] {
        return active(book, state: state).filter { state.quests.progress[$0.id]?.done ?? false }
    }

    /// Registra un fatto. Ritorna le missioni completate in questo momento.
    static func record(_ event: QuestEvent, state: inout GameState, quests: [Quest]) -> [String] {
        var finished: [String] = []
        for q in quests where isActive(q, state: state) {
            var p: QuestProgress = state.quests.progress[q.id] ?? QuestProgress()
            if p.done { continue }
            let goal: QuestGoal = q.goal
            var touched: Bool = false
            switch (goal.kind, event) {
            case ("catch", .caught(let item, let stars)):
                if (goal.target == nil || goal.target == item) && stars >= (goal.minStars ?? 0) {
                    p.count += 1
                    touched = true
                }
            case ("serve", .served(let recipe, let count)):
                if goal.target == nil || goal.target == recipe {
                    p.count += count
                    touched = true
                }
            case ("collect", .collected(let item, let count)):
                if goal.target == nil || goal.target == item {
                    p.count += count
                    touched = true
                }
            case ("earn", .earned(let gold)):
                p.count += gold
                touched = true
            case ("depth", .depth(let meters)):
                p.count = max(p.count, Int(meters))
                touched = true
            case ("fame", .fame(let total)):
                p.count = max(p.count, total)
                touched = true
            case ("photo", .photo(let species)):
                if goal.target == nil || goal.target == species {
                    p.count += 1
                    touched = true
                }
            case ("upgrade", .upgraded(let id, let level)):
                if goal.target == nil || goal.target == id {
                    p.count = max(p.count, level)
                    touched = true
                }
            case ("boss", .boss(let id)):
                if goal.target == nil || goal.target == id {
                    p.count += 1
                    touched = true
                }
            default:
                break
            }
            if touched {
                if p.count >= goal.count {
                    p.count = goal.count
                    p.done = true
                    finished.append(q.id)
                }
                state.quests.progress[q.id] = p
            }
        }
        return finished
    }

    /// Ritira la ricompensa di una missione completata.
    static func claim(_ q: Quest, state: inout GameState) -> Bool {
        guard isActive(q, state: state), state.quests.progress[q.id]?.done ?? false else { return false }
        state.gold += q.reward.gold ?? 0
        state.pearls += q.reward.pearls ?? 0
        state.fame += q.reward.fame ?? 0
        if let recipe: String = q.reward.recipe, state.recipes[recipe] == nil { state.recipes[recipe] = 1 }
        if let weapon: String = q.reward.weapon, !state.weapons.contains(weapon) {
            state.weapons.append(weapon)
            if state.equipped == nil { state.equipped = weapon }
        }
        if let flag: String = q.reward.flag { state.flags[flag] = true }
        state.quests.claimed.append(q.id)
        return true
    }

    /// Due commissioni del giorno, sempre le stesse per quel giorno di quella partita.
    static func daily(state: GameState, fish: FishCatalog, recipes: RecipeBook, maxDepth: Double) -> [Quest] {
        var rng: SeededRNG = SeededRNG(seed: SeededRNG.combine([state.seed, UInt64(max(state.day, 0)), 4242]))
        var out: [Quest] = []
        let reachable: [FishSpecies] = fish.species.filter { $0.isEdible && !$0.night && $0.depthMin < maxDepth && $0.item == nil }
        if let species: FishSpecies = rng.pick(reachable) {
            let count: Int = species.weight > 5 ? 1 : (species.behavior == FishBehavior.school ? 5 : 2)
            let gold: Int = max(20, species.price * count + 15)
            out.append(Quest(id: "daily_\(state.day)_pesca", kind: "daily", giver: "bianca",
                             title: ["it": "Pescato del giorno"],
                             text: ["it": "Al mercato chiedono: \(species.name.text()) × \(count)."],
                             goal: QuestGoal(kind: "catch", target: species.id, count: count, minStars: nil),
                             reward: QuestReward(gold: gold, pearls: nil, fame: nil, recipe: nil, weapon: nil, flag: nil),
                             requires: nil, minFame: nil, chapter: nil))
        }
        let known: [Recipe] = recipes.recipes.filter { state.recipes[$0.id] != nil }
        if let recipe: Recipe = rng.pick(known) {
            let count: Int = max(2, min(6, recipe.portions))
            out.append(Quest(id: "daily_\(state.day)_sala", kind: "daily", giver: "pinuccio",
                             title: ["it": "Voglia del giorno"],
                             text: ["it": "In paese non si parla d'altro: \(recipe.name.text()). Servine \(count) porzioni."],
                             goal: QuestGoal(kind: "serve", target: recipe.id, count: count, minStars: nil),
                             reward: QuestReward(gold: recipe.price * 2, pearls: nil, fame: 4, recipe: nil, weapon: nil, flag: nil),
                             requires: nil, minFame: nil, chapter: nil))
        }
        return out
    }

    /// Toglie dall'avanzamento le commissioni dei giorni passati.
    static func pruneDaily(state: inout GameState) {
        let prefix: String = "daily_\(state.day)_"
        for key in state.quests.progress.keys where key.hasPrefix("daily_") && !key.hasPrefix(prefix) {
            state.quests.progress[key] = nil
        }
        state.quests.claimed.removeAll(where: { $0.hasPrefix("daily_") && !$0.hasPrefix(prefix) })
    }
}
