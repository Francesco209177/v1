/// Un attore presente all'inizio di una scena.
struct CutsceneActor: Codable, Equatable {
    /// Identificativo nel cast.
    let who: String
    /// Posizione orizzontale in pixel d'arte, 0 = centro.
    let x: Double
    /// true se guarda a sinistra.
    let left: Bool?
    /// true se all'inizio è fuori scena (entrerà con `show`).
    let hidden: Bool?
}

/// Un passo di una scena. `action` vale:
/// say (battuta), move (cammina fino a x), wait, shake (scossa), show, hide, face (si gira),
/// pose (gesto: talk, shock...), title (cartello a tutto schermo), flash, place (cambio di luogo).
struct CutsceneStep: Codable, Equatable {
    let action: String
    let who: String?
    let mood: String?
    let text: LocalizedText?
    let sub: LocalizedText?
    let x: Double?
    let time: Double?
    let left: Bool?
    let pose: String?
    let place: String?

    private enum CodingKeys: String, CodingKey {
        case action = "do"
        case who, mood, text, sub, x, time, left, pose, place
    }

    static let actions: Set<String> = ["say", "move", "wait", "shake", "show", "hide", "face", "pose", "title", "flash", "place"]
    static let moods: [String] = ["calm", "happy", "angry", "shock", "sad"]
    static let poses: Set<String> = ["stand", "talk", "shock", "walk"]

    /// true se il passo aspetta un tocco del giocatore per proseguire.
    var waitsForInput: Bool { return action == "say" || action == "title" }

    /// Durata dei passi che avanzano da soli.
    var duration: Double {
        switch action {
        case "move": return max(time ?? 1.0, 0.05)
        case "wait": return max(time ?? 0.5, 0)
        case "shake": return max(time ?? 0.6, 0)
        case "flash": return 0.35
        case "place": return 0.7
        default: return 0
        }
    }
}

struct Cutscene: Codable, Equatable {
    let id: String
    /// Luogo: porto_mattina, porto_sera, porto_notte, osteria, mare, fondale, relitto, citta, fumarole, santuario.
    let place: String
    let actors: [CutsceneActor]
    let steps: [CutsceneStep]

    static let places: Set<String> = ["porto_mattina", "porto_sera", "porto_notte", "osteria", "mare", "fondale", "relitto", "citta", "fumarole", "santuario"]
    /// Luoghi sott'acqua: gli attori nuotano invece di camminare.
    static let underwater: Set<String> = ["fondale", "relitto", "citta", "fumarole", "santuario"]
}

struct CutsceneBook: Codable, Equatable {
    let scenes: [Cutscene]

    func find(_ id: String) -> Cutscene? {
        return scenes.first(where: { $0.id == id })
    }

    func problems(cast: StoryBook) -> [String] {
        var out: [String] = []
        var ids: Set<String> = []
        for scene in scenes {
            if ids.contains(scene.id) { out.append("scena duplicata: \(scene.id)") }
            ids.insert(scene.id)
            if !Cutscene.places.contains(scene.place) { out.append("\(scene.id): luogo sconosciuto '\(scene.place)'") }
            if scene.steps.isEmpty { out.append("\(scene.id): scena vuota") }
            var present: Set<String> = []
            for actor in scene.actors {
                if cast.member(actor.who) == nil { out.append("\(scene.id): attore sconosciuto '\(actor.who)'") }
                if present.contains(actor.who) { out.append("\(scene.id): attore ripetuto '\(actor.who)'") }
                present.insert(actor.who)
            }
            var index: Int = 0
            for step in scene.steps {
                index += 1
                let label: String = "\(scene.id) passo \(index)"
                if !CutsceneStep.actions.contains(step.action) {
                    out.append("\(label): azione sconosciuta '\(step.action)'")
                    continue
                }
                switch step.action {
                case "say":
                    guard let who: String = step.who, let member: CastMember = cast.member(who) else {
                        out.append("\(label): chi parla?")
                        continue
                    }
                    if (step.text?.text() ?? "").isEmpty { out.append("\(label): battuta vuota") }
                    if let mood: String = step.mood, !CutsceneStep.moods.contains(mood) { out.append("\(label): umore sconosciuto '\(mood)'") }
                    if member.portrait == nil && step.mood != nil { out.append("\(label): \(who) non ha ritratto") }
                case "move", "show", "hide", "face", "pose":
                    guard let who: String = step.who, present.contains(who) else {
                        out.append("\(label): attore non in scena")
                        continue
                    }
                    if (step.action == "move" || step.action == "show") && step.x == nil && step.action == "move" { out.append("\(label): manca x") }
                    if step.action == "pose", !CutsceneStep.poses.contains(step.pose ?? "") { out.append("\(label): posa sconosciuta") }
                case "title":
                    if (step.text?.text() ?? "").isEmpty { out.append("\(label): cartello vuoto") }
                case "place":
                    if !Cutscene.places.contains(step.place ?? "") { out.append("\(label): luogo sconosciuto") }
                default:
                    break
                }
            }
        }
        return out
    }
}

/// Avanzamento di una scena: quale passo è in corso e da quanto. Senza grafica, così i test
/// possono percorrere ogni scena fino in fondo.
struct CutsceneCursor: Equatable {
    private(set) var index: Int = 0
    private(set) var stepTime: Double = 0
    /// Caratteri della battuta già comparsi (effetto macchina da scrivere).
    private(set) var shown: Int = 0
    let stepCount: Int
    static let lettersPerSecond: Double = 46

    init(scene: Cutscene) {
        stepCount = scene.steps.count
    }

    var isFinished: Bool { return index >= stepCount }

    /// Fa passare il tempo. Ritorna true se si è passati a un nuovo passo.
    mutating func advance(scene: Cutscene, dt: Double) -> Bool {
        if isFinished { return false }
        let step: CutsceneStep = scene.steps[index]
        stepTime += dt
        if step.waitsForInput {
            let length: Int = step.text?.text().count ?? 0
            shown = min(length, Int(stepTime * CutsceneCursor.lettersPerSecond))
            return false
        }
        if stepTime >= step.duration {
            next()
            return true
        }
        return false
    }

    /// Tocco del giocatore: completa la battuta, oppure passa oltre. Ritorna true se si è cambiato passo.
    mutating func tap(scene: Cutscene) -> Bool {
        if isFinished { return false }
        let step: CutsceneStep = scene.steps[index]
        if !step.waitsForInput { return false }
        let length: Int = step.text?.text().count ?? 0
        if step.action == "say" && shown < length {
            shown = length
            stepTime = Double(length) / CutsceneCursor.lettersPerSecond + 0.01
            return false
        }
        // Un cartello resta almeno un attimo, per non saltarlo con un tocco involontario.
        if step.action == "title" && stepTime < 0.5 { return false }
        next()
        return true
    }

    private mutating func next() {
        index += 1
        stepTime = 0
        shown = 0
    }
}
