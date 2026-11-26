import Foundation

/// Come si comporta una specie.
enum FishBehavior: String, Codable {
    /// Gironzola; se viene colpita scappa.
    case passive
    /// Scappa appena vede Tecla avvicinarsi.
    case shy
    /// Vive in banco: i compagni si muovono e fuggono insieme.
    case school
    /// Difende una tana: carica chi entra nel suo territorio, poi torna al posto.
    case territorial
    /// Insegue Tecla a vista e attacca di scatto.
    case aggressive
    /// Sta ferma sul fondo: punge chi la tocca.
    case ambush
}

/// Scheda di una specie, letta da `Data/fish.json`. Tutte le velocità sono in pixel d'arte al secondo.
struct FishSpecies: Codable, Equatable {
    let id: String
    let name: LocalizedText
    let note: LocalizedText
    let behavior: FishBehavior
    /// Profondità in metri tra cui la specie compare.
    let depthMin: Double
    let depthMax: Double
    /// true se esce solo nelle immersioni notturne.
    let night: Bool
    let spawnWeight: Double
    let schoolMin: Int
    let schoolMax: Int
    let speed: Double
    let fleeSpeed: Double
    let hp: Double
    /// Peso in chili: conta per il carico e per la carne che rende.
    let weight: Double
    /// Raggio di collisione in pixel.
    let radius: Double
    /// Distanza a cui si accorge di Tecla.
    let sight: Double
    /// Fiato tolto a Tecla per contatto o attacco.
    let damage: Double
    /// Resistenza sulla lenza, da 0 (si lascia tirare) a 1 (bestia).
    let pull: Double
    /// Da 1 (comune) a 5 (leggendaria).
    let rarity: Int
    /// Valore di riferimento in oro.
    let price: Int
}

struct FishCatalog: Codable, Equatable {
    let species: [FishSpecies]

    func find(_ id: String) -> FishSpecies? {
        return species.first(where: { $0.id == id })
    }

    /// Specie che possono comparire a una profondità.
    func candidates(depthMeters: Double, night: Bool) -> [FishSpecies] {
        return species.filter { $0.night == night && depthMeters >= $0.depthMin && depthMeters <= $0.depthMax }
    }

    func problems() -> [String] {
        var out: [String] = []
        var seen: Set<String> = []
        for s in species {
            if seen.contains(s.id) { out.append("specie duplicata: \(s.id)") }
            seen.insert(s.id)
            if s.name.text().isEmpty { out.append("\(s.id): nome mancante") }
            if s.depthMax <= s.depthMin { out.append("\(s.id): profondità non valide") }
            if s.hp <= 0 || s.weight <= 0 || s.radius <= 0 { out.append("\(s.id): hp, peso e raggio devono essere positivi") }
            if s.speed <= 0 || s.fleeSpeed < s.speed { out.append("\(s.id): la velocità di fuga non può essere minore di quella normale") }
            if s.schoolMin < 1 || s.schoolMax < s.schoolMin { out.append("\(s.id): dimensioni del banco non valide") }
            if s.pull < 0 || s.pull > 1 { out.append("\(s.id): pull deve stare tra 0 e 1") }
            if s.rarity < 1 || s.rarity > 5 { out.append("\(s.id): rarità tra 1 e 5") }
            if s.spawnWeight <= 0 { out.append("\(s.id): spawnWeight deve essere positivo") }
            if (s.behavior == .territorial || s.behavior == .aggressive || s.behavior == .ambush) && s.damage <= 0 {
                out.append("\(s.id): una specie che attacca deve avere damage > 0")
            }
        }
        return out
    }
}
