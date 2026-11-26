struct UpgradeLevel: Codable, Equatable {
    let cost: Int
    let value: Double
}

/// Un potenziamento comprato da Zaira: ogni livello ha un costo e un valore.
struct UpgradeInfo: Codable, Equatable {
    let id: String
    let name: LocalizedText
    let note: LocalizedText
    let unit: LocalizedText
    /// Valore senza alcun livello.
    let base: Double
    let levels: [UpgradeLevel]

    func value(level: Int) -> Double {
        if level <= 0 || levels.isEmpty { return base }
        return levels[min(level, levels.count) - 1].value
    }

    /// Costo del prossimo livello, o nil se è già al massimo.
    func nextCost(level: Int) -> Int? {
        if level < 0 || level >= levels.count { return nil }
        return levels[level].cost
    }
}

enum WeaponKind: String, Codable {
    /// Colpo ravvicinato davanti a sé.
    case melee
    /// Rete lanciata: prende vivi i pesci leggeri in un'area.
    case net
    /// Dardo che addormenta.
    case sleep
    /// Asta veloce che fa danno a distanza.
    case bolt
    /// Carica che esplode in bolle e stordisce.
    case stun
}

/// Arma secondaria. I campi non usati da un tipo valgono zero.
struct WeaponInfo: Codable, Equatable {
    let id: String
    let name: LocalizedText
    let note: LocalizedText
    let kind: WeaponKind
    let price: Int
    /// Colpi per immersione; 0 = illimitati.
    let ammo: Int
    let range: Double
    let radius: Double
    let damage: Double
    let speed: Double
    /// Durata dell'effetto (sonno, stordimento) in secondi.
    let duration: Double
    /// Peso massimo dei pesci che la rete trattiene.
    let maxWeight: Double
    let cooldown: Double
}

struct UpgradeBook: Codable, Equatable {
    let upgrades: [UpgradeInfo]
    let weapons: [WeaponInfo]

    func upgrade(_ id: String) -> UpgradeInfo? {
        return upgrades.first(where: { $0.id == id })
    }

    func weapon(_ id: String) -> WeaponInfo? {
        return weapons.first(where: { $0.id == id })
    }

    /// Valore attuale di un potenziamento per una partita.
    func value(_ id: String, state: GameState, fallback: Double) -> Double {
        guard let info: UpgradeInfo = upgrade(id) else { return fallback }
        return info.value(level: state.upgrades[id] ?? 0)
    }

    func problems() -> [String] {
        var out: [String] = []
        var seen: Set<String> = []
        for u in upgrades {
            if seen.contains(u.id) { out.append("potenziamento duplicato: \(u.id)") }
            seen.insert(u.id)
            if u.levels.isEmpty { out.append("\(u.id): nessun livello") }
            var previousCost: Int = 0
            var previousValue: Double = u.base
            for level in u.levels {
                if level.cost <= previousCost { out.append("\(u.id): i costi devono crescere") }
                if level.value <= previousValue { out.append("\(u.id): i valori devono crescere") }
                previousCost = level.cost
                previousValue = level.value
            }
        }
        for w in weapons {
            if seen.contains(w.id) { out.append("arma duplicata: \(w.id)") }
            seen.insert(w.id)
            if w.price <= 0 || w.range <= 0 || w.cooldown <= 0 { out.append("\(w.id): prezzo, gittata e ricarica devono essere positivi") }
            if (w.kind == WeaponKind.sleep || w.kind == WeaponKind.bolt || w.kind == WeaponKind.stun) && w.speed <= 0 { out.append("\(w.id): serve una velocità") }
            if (w.kind == WeaponKind.net || w.kind == WeaponKind.stun) && w.radius <= 0 { out.append("\(w.id): serve un raggio") }
        }
        return out
    }
}

/// Acquisti al cantiere di Zaira.
enum Shop {
    enum Outcome: Equatable {
        case bought
        case notEnoughGold
        case maxed
        case alreadyOwned
        case unknown
    }

    static func buyUpgrade(_ id: String, state: inout GameState, book: UpgradeBook) -> Outcome {
        guard let info: UpgradeInfo = book.upgrade(id) else { return Outcome.unknown }
        let level: Int = state.upgrades[id] ?? 0
        guard let cost: Int = info.nextCost(level: level) else { return Outcome.maxed }
        if state.gold < cost { return Outcome.notEnoughGold }
        state.gold -= cost
        state.upgrades[id] = level + 1
        return Outcome.bought
    }

    static func buyWeapon(_ id: String, state: inout GameState, book: UpgradeBook) -> Outcome {
        guard let info: WeaponInfo = book.weapon(id) else { return Outcome.unknown }
        if state.weapons.contains(id) { return Outcome.alreadyOwned }
        if state.gold < info.price { return Outcome.notEnoughGold }
        state.gold -= info.price
        state.weapons.append(id)
        if state.equipped == nil { state.equipped = id }
        return Outcome.bought
    }
}
