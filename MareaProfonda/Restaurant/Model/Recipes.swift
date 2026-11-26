import Foundation

struct RecipeIngredient: Codable, Equatable {
    let item: String
    let count: Int
}

/// Una ricetta dell'osteria, letta da `Data/recipes.json`.
struct Recipe: Codable, Equatable {
    let id: String
    let name: LocalizedText
    let note: LocalizedText
    let ingredients: [RecipeIngredient]
    /// Porzioni che si ottengono da una preparazione.
    let portions: Int
    /// Prezzo base di una porzione, in oro.
    let price: Int
    /// Da 1 a 5: quanto il piatto è richiesto e quanto invoglia alla mancia.
    let taste: Int
    /// Secondi che Nonna Ines impiega a cucinarne una porzione.
    let cookTime: Double
    /// Disegno del piatto: fried, rolls, whole, salt, red, grill, soup, pasta, salad, crudo.
    let plate: String
    /// "start" (nota dall'inizio) oppure "catch:<specie>" (si impara pescando quella specie).
    let unlock: String
}

struct RecipeBook: Codable, Equatable {
    let recipes: [Recipe]

    static let plateKinds: Set<String> = ["fried", "rolls", "whole", "salt", "red", "grill", "soup", "pasta", "salad", "crudo"]

    func find(_ id: String) -> Recipe? {
        return recipes.first(where: { $0.id == id })
    }

    func problems(fish: FishCatalog) -> [String] {
        var out: [String] = []
        var seen: Set<String> = []
        let materials: Set<String> = Set(DiveBag.materialWeights.keys)
        for r in recipes {
            if seen.contains(r.id) { out.append("ricetta duplicata: \(r.id)") }
            seen.insert(r.id)
            if r.name.text().isEmpty { out.append("\(r.id): nome mancante") }
            if r.ingredients.isEmpty { out.append("\(r.id): nessun ingrediente") }
            if r.portions < 1 || r.price < 1 || r.cookTime <= 0 { out.append("\(r.id): porzioni, prezzo e tempo devono essere positivi") }
            if r.taste < 1 || r.taste > 5 { out.append("\(r.id): gusto tra 1 e 5") }
            if !RecipeBook.plateKinds.contains(r.plate) { out.append("\(r.id): piatto sconosciuto '\(r.plate)'") }
            for ingredient in r.ingredients {
                if ingredient.count < 1 { out.append("\(r.id): quantità non valida per \(ingredient.item)") }
                if fish.find(ingredient.item) == nil && !materials.contains(ingredient.item) {
                    out.append("\(r.id): ingrediente sconosciuto '\(ingredient.item)'")
                }
            }
            if r.unlock != "start" {
                if r.unlock.hasPrefix("catch:") {
                    let species: String = String(r.unlock.dropFirst("catch:".count))
                    if fish.find(species) == nil { out.append("\(r.id): sblocco con specie sconosciuta '\(species)'") }
                } else {
                    out.append("\(r.id): regola di sblocco non valida '\(r.unlock)'")
                }
            }
        }
        return out
    }
}

/// Gradino di fama dell'osteria: più tavoli, più piatti in menu, clienti più frequenti, prezzi più alti.
struct RankInfo: Codable, Equatable {
    let name: LocalizedText
    let fame: Int
    let tables: Int
    let menuSlots: Int
    let arrivalEvery: Double
    let priceFactor: Double
}

struct ServiceTuning: Codable, Equatable {
    /// Durata dell'apertura in secondi: dopo non entrano più clienti.
    let duration: Double
    let patienceOrder: Double
    let patienceFood: Double
    let eatTime: Double
    let wineChance: Double
    let winePrice: Int
    let walkSpeed: Double
    let cleanTime: Double
    let comboWindow: Double
    let maxCombo: Int
}

/// Costanti economiche del gioco, lette da `Data/balance.json`.
struct Balance: Codable, Equatable {
    let startGold: Int
    let startBreath: Double
    let startBagWeight: Double
    let startSafeDepth: Double
    /// Moltiplicatore del prezzo per 1, 2 e 3 stelle.
    let starPriceFactor: [Double]
    let recipeLevelBonus: Double
    let ranks: [RankInfo]
    let service: ServiceTuning

    func rankIndex(fame: Int) -> Int {
        var index: Int = 0
        for (i, rank) in ranks.enumerated() where fame >= rank.fame { index = i }
        return index
    }

    func rank(fame: Int) -> RankInfo? {
        if ranks.isEmpty { return nil }
        return ranks[rankIndex(fame: fame)]
    }

    /// Fama che manca al prossimo gradino, o nil se si è già in cima.
    func fameToNextRank(fame: Int) -> Int? {
        let index: Int = rankIndex(fame: fame)
        if index + 1 >= ranks.count { return nil }
        return ranks[index + 1].fame - fame
    }

    func starFactor(_ averageStars: Double) -> Double {
        if starPriceFactor.count < 3 { return 1 }
        let s: Double = MathUtil.clamp(averageStars, 1, 3)
        if s <= 2 { return MathUtil.lerp(starPriceFactor[0], starPriceFactor[1], s - 1) }
        return MathUtil.lerp(starPriceFactor[1], starPriceFactor[2], s - 2)
    }

    func problems() -> [String] {
        var out: [String] = []
        if ranks.isEmpty { out.append("nessun gradino di fama") }
        if starPriceFactor.count != 3 { out.append("starPriceFactor deve avere 3 valori") }
        var previous: Int = -1
        for rank in ranks {
            if rank.fame <= previous { out.append("i gradini di fama devono crescere") }
            previous = rank.fame
            if rank.tables < 1 || rank.tables > 8 { out.append("tavoli tra 1 e 8") }
            if rank.menuSlots < 1 { out.append("almeno un piatto in menu") }
            if rank.arrivalEvery <= 0 { out.append("arrivalEvery deve essere positivo") }
        }
        if ranks.first?.fame != 0 { out.append("il primo gradino deve partire da fama 0") }
        if service.duration < 20 { out.append("servizio troppo corto") }
        return out
    }
}

/// Preparazione del menu della sera: trasforma ingredienti della dispensa in porzioni pronte.
enum MenuPlanner {
    /// Quante preparazioni di una ricetta si possono fare con la dispensa attuale.
    static func maxBatches(_ recipe: Recipe, pantry: Pantry) -> Int {
        var best: Int = Int.max
        for ingredient in recipe.ingredients {
            best = min(best, pantry.total(ingredient.item) / max(ingredient.count, 1))
        }
        return best == Int.max ? 0 : best
    }

    /// Prezzo di una porzione, dati la qualità media degli ingredienti, il livello della ricetta e il rango.
    static func price(_ recipe: Recipe, averageStars: Double, level: Int, balance: Balance, fame: Int) -> Int {
        let rankFactor: Double = balance.rank(fame: fame)?.priceFactor ?? 1
        let levelFactor: Double = 1 + balance.recipeLevelBonus * Double(max(level - 1, 0))
        let value: Double = Double(recipe.price) * balance.starFactor(averageStars) * levelFactor * rankFactor
        return max(1, Int(value.rounded()))
    }

    /// Prepara `batches` volte la ricetta consumando la dispensa. Ritorna nil se manca qualcosa.
    static func prepare(_ recipe: Recipe, batches: Int, state: inout GameState, balance: Balance) -> PreparedDish? {
        if batches < 1 || maxBatches(recipe, pantry: state.pantry) < batches { return nil }
        var starSum: Double = 0
        var starCount: Double = 0
        for ingredient in recipe.ingredients {
            guard let stars: Double = state.pantry.take(ingredient.item, count: ingredient.count * batches) else { return nil }
            // I materiali (0 stelle) non contano per la qualità.
            if stars > 0 {
                starSum += stars * Double(ingredient.count)
                starCount += Double(ingredient.count)
            }
        }
        let average: Double = starCount > 0 ? starSum / starCount : 2
        let level: Int = state.recipes[recipe.id] ?? 1
        let price: Int = MenuPlanner.price(recipe, averageStars: average, level: level, balance: balance, fame: state.fame)
        return PreparedDish(recipeId: recipe.id, portions: recipe.portions * batches, price: price)
    }
}
