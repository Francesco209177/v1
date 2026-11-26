/// Testo localizzato dentro i file di dati: `{ "it": "Sardina", "en": "Sardine" }`.
/// Tenere i nomi accanto ai numeri rende semplice aggiungere pesci e ricette modificando i JSON.
typealias LocalizedText = [String: String]

extension Dictionary where Key == String, Value == String {
    /// Testo nella lingua richiesta, con ripiego sull'italiano e poi sulla prima voce disponibile.
    func text(_ language: String = "it") -> String {
        if let value: String = self[language] { return value }
        if let value: String = self["it"] { return value }
        return self.values.sorted().first ?? ""
    }
}

/// Una fascia di profondità del Calderone: colori dell'acqua, luce, stile della roccia
/// e parametri con cui il generatore ne scolpisce le pareti.
struct ZoneInfo: Codable, Equatable {
    let id: String
    let name: LocalizedText
    /// Metri dalla superficie.
    let depthFrom: Int
    let depthTo: Int
    let waterTop: String
    let waterBottom: String
    /// Luce ambiente da 0 (buio) a 1 (pieno sole).
    let light: Double
    let needsTorch: Bool
    /// Cinque toni della roccia, dal più scuro al più chiaro.
    let rock: [String]
    /// Due toni della crosta sulle superfici rivolte verso l'alto (sabbia, alghe, zolfo...).
    let cap: [String]
    let outline: String
    /// Forma generale: bowl, ledges, open, ruins, chimneys, hall.
    let shape: String
    /// Spessore minimo e massimo delle pareti laterali, in metri.
    let wallMin: Double
    let wallMax: Double
    /// Soglia del rumore per gli scogli isolati: più alta, meno scogli.
    let islands: Double
    /// Allungamento orizzontale degli scogli (cenge larghe e basse se > 1).
    let stretch: Double
}

struct WorldData: Codable, Equatable {
    let pixelsPerMeter: Int
    let mapWidthMeters: Int
    let zones: [ZoneInfo]

    var maxDepthMeters: Int {
        var deepest: Int = 0
        for zone in zones where zone.depthTo > deepest { deepest = zone.depthTo }
        return deepest
    }

    /// Zona che contiene la profondità data (in metri); oltre i limiti ritorna la prima o l'ultima.
    func zone(atDepth meters: Double) -> ZoneInfo? {
        guard let first: ZoneInfo = zones.first, let last: ZoneInfo = zones.last else { return nil }
        if meters < Double(first.depthFrom) { return first }
        for zone in zones where meters >= Double(zone.depthFrom) && meters < Double(zone.depthTo) {
            return zone
        }
        return last
    }

    func zoneIndex(atDepth meters: Double) -> Int {
        var i: Int = 0
        while i < zones.count {
            if meters < Double(zones[i].depthTo) { return i }
            i += 1
        }
        return max(zones.count - 1, 0)
    }

    /// Colore dell'acqua a una profondità: sfuma dentro ogni zona dal colore alto a quello basso.
    func waterColor(atDepth meters: Double) -> RGBA {
        guard let zone: ZoneInfo = zone(atDepth: meters) else { return RGBA(hex: 0x1F8FB0) }
        let top: RGBA = RGBA(hexString: zone.waterTop) ?? RGBA(hex: 0x1F8FB0)
        let bottom: RGBA = RGBA(hexString: zone.waterBottom) ?? top
        let span: Double = Double(max(zone.depthTo - zone.depthFrom, 1))
        let t: Double = MathUtil.clamp((meters - Double(zone.depthFrom)) / span, 0, 1)
        return top.mixed(with: bottom, t)
    }

    /// Luce ambiente a una profondità, interpolata tra i centri delle zone (1 = pieno sole, 0 = buio).
    func light(atDepth meters: Double) -> Double {
        guard let first: ZoneInfo = zones.first, let last: ZoneInfo = zones.last else { return 1 }
        func center(_ z: ZoneInfo) -> Double { return Double(z.depthFrom + z.depthTo) / 2 }
        if meters <= center(first) { return MathUtil.lerp(1.0, first.light, MathUtil.clamp(meters / max(center(first), 1), 0, 1)) }
        if meters >= center(last) { return last.light }
        var i: Int = 0
        while i < zones.count - 1 {
            let a: ZoneInfo = zones[i]
            let b: ZoneInfo = zones[i + 1]
            if meters >= center(a) && meters <= center(b) {
                let t: Double = (meters - center(a)) / max(center(b) - center(a), 1)
                return MathUtil.lerp(a.light, b.light, t)
            }
            i += 1
        }
        return last.light
    }

    /// Controlli di coerenza usati dai test e all'avvio.
    func problems() -> [String] {
        var out: [String] = []
        if pixelsPerMeter < 4 { out.append("pixelsPerMeter troppo piccolo") }
        if mapWidthMeters < 40 { out.append("mappa troppo stretta") }
        var previous: Int = 0
        for zone in zones {
            if zone.depthFrom != previous { out.append("\(zone.id): le zone devono essere contigue (inizia a \(zone.depthFrom), attesa \(previous))") }
            if zone.depthTo <= zone.depthFrom { out.append("\(zone.id): profondità non valida") }
            if zone.rock.count != 5 { out.append("\(zone.id): servono 5 toni di roccia") }
            if zone.cap.count != 2 { out.append("\(zone.id): servono 2 toni di crosta") }
            for hex in zone.rock + zone.cap + [zone.outline, zone.waterTop, zone.waterBottom] where RGBA(hexString: hex) == nil {
                out.append("\(zone.id): colore non valido '\(hex)'")
            }
            if zone.wallMin < 1 || zone.wallMax < zone.wallMin { out.append("\(zone.id): spessori delle pareti non validi") }
            if zone.wallMax * 2 + 14 > Double(mapWidthMeters) { out.append("\(zone.id): pareti troppo spesse per la larghezza della mappa") }
            previous = zone.depthTo
        }
        return out
    }
}

/// Lettura dei file JSON di dati da una cartella (il bundle nell'app, il repository nei test).
enum DataFiles {
    struct LoadError: Error, CustomStringConvertible {
        let file: String
        let underlying: Error
        var description: String { return "\(file): \(underlying)" }
    }

    static func load<T: Decodable>(_ type: T.Type, file: String, in directory: URL) throws -> T {
        do {
            let data: Data = try Data(contentsOf: directory.appendingPathComponent(file))
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw LoadError(file: file, underlying: error)
        }
    }
}
