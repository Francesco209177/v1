/// Azioni di gioco, indipendenti da come vengono impartite (dita o controller).
struct GameButtons: OptionSet, Hashable {
    let rawValue: Int

    /// Arpione, attacco, conferma.
    static let primary: GameButtons = GameButtons(rawValue: 1 << 0)
    /// Azione, raccogli.
    static let interact: GameButtons = GameButtons(rawValue: 1 << 1)
    /// Arma secondaria.
    static let secondary: GameButtons = GameButtons(rawValue: 1 << 2)
    static let inventory: GameButtons = GameButtons(rawValue: 1 << 3)
    static let dash: GameButtons = GameButtons(rawValue: 1 << 4)
    static let pause: GameButtons = GameButtons(rawValue: 1 << 5)

    static let all: [GameButtons] = [.primary, .interact, .secondary, .inventory, .dash, .pause]

    /// Nome stabile, usato per salvare la rimappatura.
    var key: String {
        switch self {
        case .primary: return "primary"
        case .interact: return "interact"
        case .secondary: return "secondary"
        case .inventory: return "inventory"
        case .dash: return "dash"
        case .pause: return "pause"
        default: return "none"
        }
    }
}

/// Tasti fisici di un controller esteso (nomi neutri: `a` è il tasto in basso, `b` quello a destra...).
enum PadButton: String, Codable, CaseIterable {
    case a
    case b
    case x
    case y
    case l1
    case r1
    case l2
    case r2
    case l3
    case r3
    case menu
    case options
}

/// Associazione azione → tasto, modificabile dalle impostazioni.
struct ControllerMapping: Codable, Equatable {
    var buttons: [String: PadButton]

    static let standard: ControllerMapping = ControllerMapping(buttons: [
        GameButtons.primary.key: PadButton.r2,
        GameButtons.interact.key: PadButton.a,
        GameButtons.secondary.key: PadButton.x,
        GameButtons.inventory.key: PadButton.y,
        GameButtons.dash.key: PadButton.b,
        GameButtons.pause.key: PadButton.menu
    ])

    func button(for action: GameButtons) -> PadButton? {
        return buttons[action.key] ?? ControllerMapping.standard.buttons[action.key]
    }

    /// Assegna un tasto a un'azione; se era già usato da un'altra, le due si scambiano.
    mutating func assign(_ button: PadButton, to action: GameButtons) {
        let previous: PadButton? = self.button(for: action)
        for other in GameButtons.all where other != action && self.button(for: other) == button {
            if let previous: PadButton = previous {
                buttons[other.key] = previous
            }
        }
        buttons[action.key] = button
    }
}

/// Preferenze del giocatore, salvate fuori dagli slot di gioco.
struct GameSettings: Codable, Equatable {
    var musicVolume: Double = 0.7
    var effectsVolume: Double = 0.9
    var haptics: Bool = true
    /// Mira automatica dell'arpione sul bersaglio più vicino.
    var autoAim: Bool = true
    /// Luce dinamica della torcia (più bella, un po' più pesante).
    var dynamicLights: Bool = true
    /// Contatore di fotogrammi e nodi in sovrimpressione.
    var showPerformance: Bool = false
    var mapping: ControllerMapping = ControllerMapping.standard

    init() {}

    // Decodifica tollerante: i campi aggiunti in versioni successive prendono il valore predefinito.
    init(from decoder: Decoder) throws {
        let c: KeyedDecodingContainer<CodingKeys> = try decoder.container(keyedBy: CodingKeys.self)
        let d: GameSettings = GameSettings()
        musicVolume = try c.decodeIfPresent(Double.self, forKey: .musicVolume) ?? d.musicVolume
        effectsVolume = try c.decodeIfPresent(Double.self, forKey: .effectsVolume) ?? d.effectsVolume
        haptics = try c.decodeIfPresent(Bool.self, forKey: .haptics) ?? d.haptics
        autoAim = try c.decodeIfPresent(Bool.self, forKey: .autoAim) ?? d.autoAim
        dynamicLights = try c.decodeIfPresent(Bool.self, forKey: .dynamicLights) ?? d.dynamicLights
        showPerformance = try c.decodeIfPresent(Bool.self, forKey: .showPerformance) ?? d.showPerformance
        mapping = try c.decodeIfPresent(ControllerMapping.self, forKey: .mapping) ?? d.mapping
    }
}
