import Foundation

/// Un capitolo della storia.
struct ChapterInfo: Codable, Equatable {
    let id: Int
    let title: LocalizedText
    let tagline: LocalizedText
}

/// Un personaggio: nome, sprite della figura intera e del ritratto.
struct CastMember: Codable, Equatable {
    let id: String
    let name: LocalizedText
    /// Prefisso degli sprite della figura (`<body>_stand_0`...).
    let body: String
    /// Prefisso dei ritratti (`<portrait>_<umore>`); nil per chi non ha volto (il narratore).
    let portrait: String?
    /// Colore del nome nel riquadro dei dialoghi, esadecimale.
    let color: String
}

/// Una tappa della storia: un obiettivo, con una scena all'inizio e una alla fine.
struct StoryBeat: Codable, Equatable {
    let id: String
    let chapter: Int
    let title: LocalizedText
    /// Che cosa fare adesso, mostrato al porto e nel Giornale di bordo.
    let objective: LocalizedText
    let goal: QuestGoal
    let reward: QuestReward?
    let intro: String?
    let outro: String?
}

struct StoryBook: Codable, Equatable {
    let chapters: [ChapterInfo]
    let cast: [CastMember]
    let beats: [StoryBeat]

    func chapter(_ id: Int) -> ChapterInfo? {
        return chapters.first(where: { $0.id == id })
    }

    func member(_ id: String) -> CastMember? {
        return cast.first(where: { $0.id == id })
    }

    func problems(scenes: CutsceneBook, bosses: BossBook, fish: FishCatalog, recipes: RecipeBook, upgrades: UpgradeBook) -> [String] {
        var out: [String] = []
        var ids: Set<String> = []
        var lastChapter: Int = 0
        for beat in beats {
            if ids.contains(beat.id) { out.append("tappa duplicata: \(beat.id)") }
            ids.insert(beat.id)
            if chapter(beat.chapter) == nil { out.append("\(beat.id): capitolo inesistente \(beat.chapter)") }
            if beat.chapter < lastChapter { out.append("\(beat.id): i capitoli devono essere in ordine") }
            lastChapter = max(lastChapter, beat.chapter)
            if beat.title.text().isEmpty || beat.objective.text().isEmpty { out.append("\(beat.id): testo mancante") }
            if !QuestBook.goalKinds.contains(beat.goal.kind) { out.append("\(beat.id): obiettivo sconosciuto '\(beat.goal.kind)'") }
            if beat.goal.count < 1 { out.append("\(beat.id): quantità non valida") }
            for scene in [beat.intro, beat.outro] {
                if let scene: String = scene, scenes.find(scene) == nil { out.append("\(beat.id): scena inesistente '\(scene)'") }
            }
            if let target: String = beat.goal.target {
                switch beat.goal.kind {
                case "boss":
                    if bosses.find(target) == nil { out.append("\(beat.id): boss sconosciuto '\(target)'") }
                case "catch", "photo":
                    if fish.find(target) == nil { out.append("\(beat.id): specie sconosciuta '\(target)'") }
                case "serve":
                    if recipes.find(target) == nil { out.append("\(beat.id): ricetta sconosciuta '\(target)'") }
                case "upgrade":
                    if upgrades.upgrade(target) == nil { out.append("\(beat.id): potenziamento sconosciuto '\(target)'") }
                default:
                    break
                }
            } else if beat.goal.kind == "boss" {
                out.append("\(beat.id): un obiettivo boss deve dire quale")
            }
            if let recipe: String = beat.reward?.recipe, recipes.find(recipe) == nil { out.append("\(beat.id): ricompensa con ricetta sconosciuta") }
            if let weapon: String = beat.reward?.weapon, upgrades.weapon(weapon) == nil { out.append("\(beat.id): ricompensa con arma sconosciuta") }
        }
        var castIds: Set<String> = []
        for member in cast {
            if castIds.contains(member.id) { out.append("personaggio duplicato: \(member.id)") }
            castIds.insert(member.id)
        }
        for boss in bosses.bosses {
            var used: Bool = false
            for beat in beats where beat.goal.kind == "boss" && beat.goal.target == boss.id { used = true }
            if !used { out.append("il boss \(boss.id) non compare in nessuna tappa") }
        }
        out.append(contentsOf: scenes.problems(cast: self))
        return out
    }
}

/// Punto della storia a cui è arrivata una partita.
struct StoryLog: Codable, Equatable {
    /// Indice della tappa in corso; uguale al numero di tappe quando la storia è finita.
    var beat: Int = 0
    var count: Int = 0
    var done: Bool = false
    var introSeen: Bool = false
    /// Boss già sconfitti.
    var bosses: [String] = []
}

enum StoryEngine {
    static func current(_ book: StoryBook, state: GameState) -> StoryBeat? {
        let index: Int = state.story.beat
        if index < 0 || index >= book.beats.count { return nil }
        return book.beats[index]
    }

    static func isFinished(_ book: StoryBook, state: GameState) -> Bool {
        return state.story.beat >= book.beats.count
    }

    static func chapter(_ book: StoryBook, state: GameState) -> ChapterInfo? {
        if let beat: StoryBeat = current(book, state: state) { return book.chapter(beat.chapter) }
        return book.chapters.last
    }

    /// Scena da mostrare adesso: l'inizio della tappa, oppure la sua fine se l'obiettivo è raggiunto.
    static func pendingScene(_ book: StoryBook, state: GameState) -> String? {
        guard let beat: StoryBeat = current(book, state: state) else { return nil }
        if !state.story.introSeen { return beat.intro }
        if state.story.done { return beat.outro }
        return nil
    }

    /// Boss che si può affrontare adesso.
    static func availableBoss(_ book: StoryBook, state: GameState) -> String? {
        guard let beat: StoryBeat = current(book, state: state), beat.goal.kind == "boss",
              state.story.introSeen, !state.story.done else { return nil }
        return beat.goal.target
    }

    /// Registra un fatto di gioco. Ritorna true se la tappa in corso si è appena compiuta.
    @discardableResult
    static func record(_ event: QuestEvent, state: inout GameState, book: StoryBook) -> Bool {
        if case QuestEvent.boss(let id) = event, !state.story.bosses.contains(id) { state.story.bosses.append(id) }
        guard let beat: StoryBeat = current(book, state: state), state.story.introSeen, !state.story.done else { return false }
        guard let next: Int = QuestEngine.advance(goal: beat.goal, event: event, count: state.story.count) else { return false }
        state.story.count = min(next, beat.goal.count)
        if next >= beat.goal.count {
            state.story.done = true
            settle(state: &state, book: book)
            return true
        }
        return false
    }

    /// Da chiamare dopo aver mostrato (o saltato) la scena in attesa.
    static func sceneShown(state: inout GameState, book: StoryBook) {
        guard let beat: StoryBeat = current(book, state: state) else { return }
        if !state.story.introSeen {
            state.story.introSeen = true
            prime(beat, state: &state)
        } else if state.story.done {
            complete(beat, state: &state)
        }
        settle(state: &state, book: book)
    }

    /// Porta avanti tutto ciò che non ha bisogno di una scena: tappe senza inizio o senza fine.
    static func settle(state: inout GameState, book: StoryBook) {
        var guardCount: Int = 0
        while let beat: StoryBeat = current(book, state: state), guardCount < book.beats.count * 2 + 2 {
            guardCount += 1
            if !state.story.introSeen {
                if beat.intro != nil { return }
                state.story.introSeen = true
                prime(beat, state: &state)
            }
            if !state.story.done { return }
            if beat.outro != nil { return }
            complete(beat, state: &state)
        }
    }

    /// Gli obiettivi "a livello" (fama, profondità, potenziamenti, boss) contano anche ciò che è già stato fatto.
    private static func prime(_ beat: StoryBeat, state: inout GameState) {
        var have: Int = 0
        switch beat.goal.kind {
        case "fame":
            have = state.fame
        case "depth":
            have = Int(state.deepestDive)
        case "upgrade":
            if let target: String = beat.goal.target {
                have = state.upgrades[target] ?? 0
            } else {
                for (_, level) in state.upgrades { have = max(have, level) }
            }
        case "boss":
            if let target: String = beat.goal.target, state.story.bosses.contains(target) { have = beat.goal.count }
        default:
            have = 0
        }
        state.story.count = min(have, beat.goal.count)
        if have >= beat.goal.count { state.story.done = true }
    }

    private static func complete(_ beat: StoryBeat, state: inout GameState) {
        if let reward: QuestReward = beat.reward { QuestEngine.grant(reward, state: &state) }
        state.flags["beat_\(beat.id)"] = true
        state.story.beat += 1
        state.story.count = 0
        state.story.done = false
        state.story.introSeen = false
    }
}
