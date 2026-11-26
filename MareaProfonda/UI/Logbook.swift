import SwiftUI

/// Sezioni del Giornale di bordo.
enum LogbookTab: Int, CaseIterable {
    case quests
    case fish
    case recipes
    case yard
    case ledger
    case chart
    case settings

    var title: String {
        switch self {
        case .quests: return String(localized: "Missioni")
        case .fish: return String(localized: "Quaderno")
        case .recipes: return String(localized: "Ricette")
        case .yard: return String(localized: "Cantiere")
        case .ledger: return String(localized: "Conti")
        case .chart: return String(localized: "Carta")
        case .settings: return String(localized: "Opzioni")
        }
    }
}

func characterName(_ id: String) -> String {
    switch id {
    case "ines": return "Nonna Ines"
    case "zaira": return "Zaira"
    case "pinuccio": return "Don Pinuccio"
    case "bianca": return "Bianca"
    case "saverio": return "Saverio"
    case "lustri": return "Chef Lustri"
    default: return id.capitalized
    }
}

/// Il Giornale di bordo di Tecla: missioni, specie, ricette, cantiere, conti, carta, impostazioni.
struct LogbookView: View {
    let revision: Int
    @StateObject private var focus: PadFocus = PadFocus()
    @State private var tab: LogbookTab = LogbookTab.quests

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(LogbookTab.allCases, id: \.rawValue) { (item: LogbookTab) in
                                TabChip(title: item.title, selected: item == tab, order: item.rawValue, focus: focus) {
                                    focus.clear(from: 20)
                                    tab = item
                                }
                            }
                        }
                    }
                    TabChip(title: String(localized: "Chiudi"), selected: false, order: 9, focus: focus) {
                        OverlayCenter.shared.show(OverlayScreen.hub)
                    }
                }
                Divider()
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        switch tab {
                        case .quests: QuestsTab(focus: focus)
                        case .fish: FishTab()
                        case .recipes: RecipesTab(focus: focus)
                        case .yard: YardTab(focus: focus)
                        case .ledger: LedgerTab()
                        case .chart: ChartTab()
                        case .settings: SettingsTab(focus: focus)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 8)
        .frame(maxWidth: 780, maxHeight: .infinity)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ink.opacity(0.6).ignoresSafeArea())
        .onAppear {
            focus.onBack = { OverlayCenter.shared.show(OverlayScreen.hub) }
            focus.start()
        }
        .onDisappear { focus.stop() }
    }
}

struct TabChip: View {
    let title: String
    let selected: Bool
    let order: Int
    @ObservedObject var focus: PadFocus
    let action: () -> Void

    var body: some View {
        let focused: Bool = focus.active && focus.index == order
        return Button(action: {
            Feedback.tap()
            action()
        }) {
            Text(title)
                .font(.system(.footnote, design: .rounded).weight(.heavy))
                .foregroundColor(selected ? Palette.lime : Palette.ink)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Capsule().fill(selected ? Palette.cobalt : Palette.ink.opacity(0.10)))
                .overlay(Capsule().stroke(Palette.terracotta, lineWidth: focused ? 3 : 0))
        }
        .buttonStyle(.plain)
        .onAppear { focus.register(order, action: action) }
    }
}

/// Pulsante compatto dentro una riga (Ritira, Compra, Equipaggia).
struct RowButton: View {
    let title: String
    var enabled: Bool = true
    var fill: Color = Palette.turquoise
    let order: Int
    @ObservedObject var focus: PadFocus
    let action: () -> Void

    var body: some View {
        let focused: Bool = focus.active && focus.index == order
        return Button(action: {
            if enabled {
                Feedback.tap()
                action()
            }
        }) {
            Text(title)
                .font(.system(.footnote, design: .rounded).weight(.heavy))
                .foregroundColor(Palette.ink)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(fill.opacity(enabled ? 1 : 0.35)))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Palette.cobalt, lineWidth: focused ? 3 : 0))
        }
        .buttonStyle(.plain)
        .onAppear {
            focus.register(order) {
                if enabled { action() }
            }
        }
    }
}

struct RowBox<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Palette.ink.opacity(0.06)))
    }
}

// MARK: - Missioni

func rewardText(_ reward: QuestReward) -> String {
    var parts: [String] = []
    if let gold: Int = reward.gold, gold > 0 { parts.append("\(gold) oro") }
    if let pearls: Int = reward.pearls, pearls > 0 { parts.append(pearls == 1 ? "1 perla" : "\(pearls) perle") }
    if let fame: Int = reward.fame, fame > 0 { parts.append("\(fame) fama") }
    if let recipe: String = reward.recipe { parts.append(GameData.shared.recipes.find(recipe)?.name.text() ?? recipe) }
    if let weapon: String = reward.weapon { parts.append(GameData.shared.upgrades.weapon(weapon)?.name.text() ?? weapon) }
    return parts.joined(separator: " · ")
}

struct QuestsTab: View {
    @ObservedObject var focus: PadFocus

    var body: some View {
        let session: GameSession = GameSession.shared
        let state: GameState = session.state ?? GameState()
        let quests: [Quest] = session.questsToday().filter { QuestEngine.isActive($0, state: state) }
        return Group {
            StoryCard()
            if quests.isEmpty {
                Text("Nessuna missione in corso.")
                    .font(.system(.body, design: .rounded))
                    .foregroundColor(Palette.ink.opacity(0.7))
            }
            ForEach(Array(quests.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Quest)) in
                let quest: Quest = pair.element
                let progress: QuestProgress = state.quests.progress[quest.id] ?? QuestProgress()
                RowBox {
                    HStack(alignment: .top, spacing: 10) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("\(quest.title.text()) — \(characterName(quest.giver))")
                                .font(.system(.subheadline, design: .rounded).weight(.heavy))
                                .foregroundColor(Palette.ink)
                            Text(quest.text.text())
                                .font(.system(.footnote, design: .rounded))
                                .foregroundColor(Palette.ink.opacity(0.8))
                                .fixedSize(horizontal: false, vertical: true)
                            Text("\(min(progress.count, quest.goal.count))/\(quest.goal.count) · Ricompensa: \(rewardText(quest.reward))")
                                .font(.system(.caption, design: .rounded).weight(.semibold))
                                .foregroundColor(Palette.terracotta)
                        }
                        Spacer(minLength: 4)
                        if progress.done {
                            RowButton(title: String(localized: "Ritira"), fill: Palette.ochre, order: 20 + pair.offset, focus: focus) {
                                if GameSession.shared.claim(quest) { OverlayCenter.shared.refresh() }
                            }
                        }
                    }
                }
            }
        }
    }
}

/// La storia in corso: capitolo, tappa, obiettivo e avanzamento.
struct StoryCard: View {
    var body: some View {
        let session: GameSession = GameSession.shared
        let chapter: ChapterInfo? = session.chapter
        return RowBox {
            VStack(alignment: .leading, spacing: 3) {
                if let chapter: ChapterInfo = chapter {
                    Text("Capitolo \(chapter.id) — \(chapter.title.text())")
                        .font(.system(.caption, design: .rounded).weight(.heavy))
                        .foregroundColor(Palette.cobalt)
                }
                if let beat: StoryBeat = session.storyBeat {
                    Text(beat.title.text())
                        .font(.system(.subheadline, design: .rounded).weight(.heavy))
                        .foregroundColor(Palette.ink)
                    Text(beat.objective.text())
                        .font(.system(.footnote, design: .rounded))
                        .foregroundColor(Palette.ink.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                    if let progress: (count: Int, goal: Int) = session.storyProgress {
                        let reward: String = beat.reward.map { rewardText($0) } ?? ""
                        Text(reward.isEmpty ? "\(progress.count)/\(progress.goal)" : "\(progress.count)/\(progress.goal) · Ricompensa: \(reward)")
                            .font(.system(.caption, design: .rounded).weight(.semibold))
                            .foregroundColor(Palette.terracotta)
                    }
                } else {
                    Text("La storia è conclusa. Il mare, però, continua.")
                        .font(.system(.subheadline, design: .rounded).weight(.heavy))
                        .foregroundColor(Palette.ink)
                }
            }
        }
    }
}

// MARK: - Quaderno del Mare

struct FishTab: View {
    var body: some View {
        let state: GameState = GameSession.shared.state ?? GameState()
        // Una scheda per ingrediente: le varianti notturne stanno nella scheda della specie di giorno.
        let species: [FishSpecies] = GameData.shared.fish.species.filter { $0.item == nil && $0.sprite == nil }
        var known: Int = 0
        for s in species where state.fishLog[s.id] != nil || state.photos.contains(s.id) { known += 1 }
        return Group {
            Text("Specie conosciute: \(known) su \(species.count)")
                .font(.system(.subheadline, design: .rounded).weight(.heavy))
                .foregroundColor(Palette.ink)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 210), spacing: 8)], spacing: 8) {
                ForEach(species, id: \.id) { (s: FishSpecies) in
                    FishCard(species: s, record: state.fishLog[s.id], photographed: state.photos.contains(s.id))
                }
            }
        }
    }
}

struct FishCard: View {
    let species: FishSpecies
    let record: FishRecord?
    let photographed: Bool

    var body: some View {
        let seen: Bool = record != nil || photographed
        let stars: String = String(repeating: "★", count: record?.bestStars ?? 0)
        return RowBox {
            HStack(spacing: 8) {
                PixelImage(name: "\(species.id)_swim_0", scale: species.radius > 12 ? 1 : 2)
                    .opacity(seen ? 1 : 0.18)
                    .frame(width: 64, height: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(seen ? species.name.text() : "???")
                        .font(.system(.footnote, design: .rounded).weight(.heavy))
                        .foregroundColor(Palette.ink)
                    Text("\(Int(species.depthMin))–\(Int(species.depthMax)) m")
                        .font(.system(.caption2, design: .rounded))
                        .foregroundColor(Palette.ink.opacity(0.7))
                    if seen {
                        Text(species.isProtected ? String(localized: "Fotografata") : "\(stars)  ×\(record?.caught ?? 0)")
                            .font(.system(.caption2, design: .rounded).weight(.semibold))
                            .foregroundColor(Palette.terracotta)
                        Text(species.note.text())
                            .font(.system(.caption2, design: .rounded))
                            .foregroundColor(Palette.ink.opacity(0.75))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }
}

// MARK: - Ricettario

struct RecipesTab: View {
    @ObservedObject var focus: PadFocus

    var body: some View {
        let state: GameState = GameSession.shared.state ?? GameState()
        let data: GameData = GameData.shared
        return ForEach(Array(data.recipes.recipes.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Recipe)) in
            let recipe: Recipe = pair.element
            let level: Int? = state.recipes[recipe.id]
            let cost: Int? = level.flatMap { RecipeLevels.cost(recipe, level: $0) }
            RowBox {
                HStack(spacing: 10) {
                    PixelImage(name: "plate_\(recipe.plate)", scale: 3)
                        .opacity(level == nil ? 0.2 : 1)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(level == nil ? "???" : recipe.name.text())
                            .font(.system(.subheadline, design: .rounded).weight(.heavy))
                            .foregroundColor(Palette.ink)
                        if level != nil {
                            Text(recipe.note.text())
                                .font(.system(.caption, design: .rounded))
                                .foregroundColor(Palette.ink.opacity(0.75))
                            Text(recipeLine(recipe) + String(localized: " · livello \(level ?? 1)"))
                                .font(.system(.caption, design: .rounded).weight(.semibold))
                                .foregroundColor(Palette.terracotta)
                        } else {
                            Text(unlockHint(recipe))
                                .font(.system(.caption, design: .rounded))
                                .foregroundColor(Palette.ink.opacity(0.6))
                        }
                    }
                    Spacer(minLength: 4)
                    // Affinare una ricetta: Nonna Ines la prova e riprova, e il piatto si paga di più.
                    if let cost: Int = cost {
                        RowButton(title: String(localized: "Affina · \(cost)"), enabled: state.gold >= cost, fill: Palette.ochre, order: 20 + pair.offset, focus: focus) {
                            if GameSession.shared.upgradeRecipe(recipe.id) { OverlayCenter.shared.refresh() }
                        }
                    }
                }
            }
        }
    }

    private func recipeLine(_ recipe: Recipe) -> String {
        var parts: [String] = []
        for ingredient in recipe.ingredients { parts.append("\(ingredient.count)× \(itemName(ingredient.item))") }
        return parts.joined(separator: " + ") + " · \(recipe.portions) porzioni · \(recipe.price) oro"
    }

    private func unlockHint(_ recipe: Recipe) -> String {
        if recipe.unlock.hasPrefix("catch:") {
            return String(localized: "Nonna Ines te la insegna quando le porti l'ingrediente giusto.")
        }
        if recipe.unlock.hasPrefix("crop:") {
            return String(localized: "Serve qualcosa dell'orto di Saverio.")
        }
        return String(localized: "Da scoprire.")
    }
}

// MARK: - Cantiere di Zaira

struct YardTab: View {
    @ObservedObject var focus: PadFocus

    var body: some View {
        let session: GameSession = GameSession.shared
        let state: GameState = session.state ?? GameState()
        let book: UpgradeBook = GameData.shared.upgrades
        return Group {
            Text("«Qui non si vende elettronica. Si vende roba che funziona.» — Zaira   ·   Hai \(state.gold) oro")
                .font(.system(.footnote, design: .rounded).weight(.semibold))
                .foregroundColor(Palette.ink.opacity(0.8))
            ForEach(Array(book.upgrades.enumerated()), id: \.element.id) { (pair: (offset: Int, element: UpgradeInfo)) in
                let info: UpgradeInfo = pair.element
                let level: Int = state.upgrades[info.id] ?? 0
                let cost: Int? = info.nextCost(level: level)
                RowBox {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(info.name.text())  ·  livello \(level)/\(info.levels.count)")
                                .font(.system(.subheadline, design: .rounded).weight(.heavy))
                                .foregroundColor(Palette.ink)
                            Text(info.note.text())
                                .font(.system(.caption, design: .rounded))
                                .foregroundColor(Palette.ink.opacity(0.75))
                                .fixedSize(horizontal: false, vertical: true)
                            Text(valueLine(info, level: level))
                                .font(.system(.caption, design: .rounded).weight(.semibold))
                                .foregroundColor(Palette.terracotta)
                        }
                        Spacer(minLength: 4)
                        if let cost: Int = cost {
                            RowButton(title: "\(cost) oro", enabled: state.gold >= cost, fill: Palette.ochre, order: 20 + pair.offset, focus: focus) {
                                if GameSession.shared.buyUpgrade(info.id) == Shop.Outcome.bought { OverlayCenter.shared.refresh() }
                            }
                        } else {
                            Text("Al massimo")
                                .font(.system(.caption, design: .rounded).weight(.heavy))
                                .foregroundColor(Palette.turquoise)
                        }
                    }
                }
            }
            Text("Armi secondarie")
                .font(.system(.subheadline, design: .rounded).weight(.heavy))
                .foregroundColor(Palette.ink)
                .padding(.top, 6)
            ForEach(Array(book.weapons.enumerated()), id: \.element.id) { (pair: (offset: Int, element: WeaponInfo)) in
                let weapon: WeaponInfo = pair.element
                let owned: Bool = state.weapons.contains(weapon.id)
                let equipped: Bool = state.equipped == weapon.id
                RowBox {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(weapon.ammo > 0 ? "\(weapon.name.text())  ·  \(weapon.ammo) colpi" : weapon.name.text())
                                .font(.system(.subheadline, design: .rounded).weight(.heavy))
                                .foregroundColor(Palette.ink)
                            Text(weapon.note.text())
                                .font(.system(.caption, design: .rounded))
                                .foregroundColor(Palette.ink.opacity(0.75))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 4)
                        if !owned {
                            RowButton(title: "\(weapon.price) oro", enabled: state.gold >= weapon.price, fill: Palette.ochre, order: 40 + pair.offset, focus: focus) {
                                if GameSession.shared.buyWeapon(weapon.id) == Shop.Outcome.bought { OverlayCenter.shared.refresh() }
                            }
                        } else {
                            RowButton(title: equipped ? String(localized: "In uso") : String(localized: "Usa"), enabled: !equipped,
                                      fill: Palette.turquoise, order: 40 + pair.offset, focus: focus) {
                                GameSession.shared.equip(weapon.id)
                                OverlayCenter.shared.refresh()
                            }
                        }
                    }
                }
            }
        }
    }

    private func valueLine(_ info: UpgradeInfo, level: Int) -> String {
        func show(_ v: Double) -> String {
            return v == v.rounded() ? String(format: "%.0f", v) : String(format: "%.2f", v)
        }
        let now: String = show(info.value(level: level))
        if level >= info.levels.count { return "\(now) \(info.unit.text())" }
        return "\(now) → \(show(info.value(level: level + 1))) \(info.unit.text())"
    }
}

// MARK: - Conti

struct LedgerTab: View {
    var body: some View {
        let state: GameState = GameSession.shared.state ?? GameState()
        let data: GameData = GameData.shared
        let rank: String = data.balance.rank(fame: state.fame)?.name.text() ?? ""
        let species: Int = data.fish.species.filter { $0.item == nil && $0.sprite == nil }.count
        let hours: Int = Int(state.playSeconds) / 3600
        let minutes: Int = (Int(state.playSeconds) % 3600) / 60
        return Group {
            SummaryLine(label: String(localized: "Giorno"), value: "\(state.day)")
            SummaryLine(label: String(localized: "Oro in cassa"), value: "\(state.gold)")
            SummaryLine(label: String(localized: "Incasso totale"), value: "\(state.totalEarned)")
            SummaryLine(label: String(localized: "Perle"), value: "\(state.pearls)")
            SummaryLine(label: String(localized: "Rango dell'osteria"), value: "\(rank) (\(state.fame) fama)")
            SummaryLine(label: String(localized: "Immersione più profonda"), value: "\(Int(state.deepestDive)) m")
            SummaryLine(label: String(localized: "Specie nel Quaderno"), value: "\(state.fishLog.count + state.photos.count) su \(species)")
            SummaryLine(label: String(localized: "Ricette conosciute"), value: "\(state.recipes.count) su \(data.recipes.recipes.count)")
            SummaryLine(label: String(localized: "Tempo di gioco"), value: "\(hours) h \(minutes) min")
        }
    }
}

// MARK: - Carta del Calderone

struct ChartTab: View {
    var body: some View {
        let session: GameSession = GameSession.shared
        let limit: Double = session.maxDepth
        let data: GameData = GameData.shared
        return Group {
            Text("La tua muta regge fino a \(Int(limit)) metri.")
                .font(.system(.subheadline, design: .rounded).weight(.heavy))
                .foregroundColor(Palette.ink)
            ForEach(data.world.zones, id: \.id) { (zone: ZoneInfo) in
                let open: Bool = Double(zone.depthFrom) < limit
                let mid: Double = Double(zone.depthFrom + zone.depthTo) / 2
                let found: [FishSpecies] = data.fish.candidates(depthMeters: mid, night: false)
                RowBox {
                    HStack(spacing: 10) {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(LinearGradient(colors: [zoneColor(zone.waterTop), zoneColor(zone.waterBottom)], startPoint: .top, endPoint: .bottom))
                            .frame(width: 44, height: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(zone.name.text())  ·  \(zone.depthFrom)–\(zone.depthTo) m")
                                .font(.system(.subheadline, design: .rounded).weight(.heavy))
                                .foregroundColor(Palette.ink)
                            Text(open ? found.prefix(6).map { $0.name.text() }.joined(separator: ", ") : String(localized: "Troppo profonda per la muta che hai."))
                                .font(.system(.caption, design: .rounded))
                                .foregroundColor(Palette.ink.opacity(0.75))
                            if zone.needsTorch {
                                Text("Serve la torcia.")
                                    .font(.system(.caption, design: .rounded).weight(.semibold))
                                    .foregroundColor(Palette.terracotta)
                            }
                        }
                    }
                }
                .opacity(open ? 1 : 0.55)
            }
        }
    }

    private func zoneColor(_ hex: String) -> Color {
        let c: RGBA = RGBA(hexString: hex) ?? RGBA.black
        return Color(red: Double(c.r) / 255, green: Double(c.g) / 255, blue: Double(c.b) / 255)
    }
}

// MARK: - Impostazioni

struct SettingsTab: View {
    @ObservedObject var focus: PadFocus
    @State private var settings: GameSettings = SettingsStore.shared.settings
    @State private var listening: String? = nil
    @State private var listenTimer: Timer? = nil

    private func actionName(_ action: GameButtons) -> String {
        switch action {
        case .primary: return String(localized: "Arpione")
        case .interact: return String(localized: "Azione")
        case .secondary: return String(localized: "Arma secondaria")
        case .inventory: return String(localized: "Giornale")
        case .dash: return String(localized: "Scatto")
        default: return String(localized: "Pausa")
        }
    }

    private func store() {
        SettingsStore.shared.settings = settings
        AudioDirector.shared.applyVolumes()
    }

    /// Aspetta il prossimo tasto premuto sul controller e lo assegna all'azione.
    private func listen(for action: GameButtons) {
        listening = action.key
        focus.suspended = true
        listenTimer?.invalidate()
        var armed: Bool = false
        listenTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { (timer: Timer) -> Void in
            let pressed: PadButton? = ControllerSupport.shared.firstPressedButton()
            // Prima si aspetta che il tasto usato per confermare venga rilasciato.
            if !armed {
                if pressed == nil { armed = true }
                return
            }
            if let button: PadButton = pressed {
                settings.mapping.assign(button, to: action)
                store()
                timer.invalidate()
                listening = nil
                focus.suspended = false
            }
        }
    }

    var body: some View {
        Group {
            Toggle(isOn: Binding(get: { settings.haptics }, set: { (v: Bool) in settings.haptics = v; store() })) {
                Text("Vibrazione")
            }
            Toggle(isOn: Binding(get: { settings.autoAim }, set: { (v: Bool) in settings.autoAim = v; store() })) {
                Text("Mira automatica dell'arpione")
            }
            Toggle(isOn: Binding(get: { settings.dynamicLights }, set: { (v: Bool) in settings.dynamicLights = v; store() })) {
                Text("Luce dinamica della torcia")
            }
            Toggle(isOn: Binding(get: { settings.showPerformance }, set: { (v: Bool) in settings.showPerformance = v; store() })) {
                Text("Mostra fotogrammi al secondo")
            }
            HStack {
                Text("Musica")
                Slider(value: Binding(get: { settings.musicVolume }, set: { (v: Double) in settings.musicVolume = v; store() }), in: 0...1)
            }
            HStack {
                Text("Effetti")
                Slider(value: Binding(get: { settings.effectsVolume }, set: { (v: Double) in settings.effectsVolume = v; store() }), in: 0...1)
            }
            Text("Tasti del controller")
                .font(.system(.subheadline, design: .rounded).weight(.heavy))
                .padding(.top, 6)
            if !ControllerSupport.shared.isConnected {
                Text("Collega un controller per cambiare i tasti.")
                    .font(.system(.caption, design: .rounded))
                    .opacity(0.7)
            }
            ForEach(Array(GameButtons.all.enumerated()), id: \.offset) { (pair: (offset: Int, element: GameButtons)) in
                let action: GameButtons = pair.element
                let button: String = settings.mapping.button(for: action)?.rawValue.uppercased() ?? "—"
                HStack {
                    Text(actionName(action))
                    Spacer()
                    Text(listening == action.key ? String(localized: "Premi un tasto…") : button)
                        .font(.system(.footnote, design: .rounded).weight(.heavy))
                    RowButton(title: String(localized: "Cambia"), enabled: ControllerSupport.shared.isConnected, order: 20 + pair.offset, focus: focus) {
                        listen(for: action)
                    }
                }
            }
        }
        .font(.system(.subheadline, design: .rounded))
        .foregroundColor(Palette.ink)
        .tint(Palette.turquoise)
        .onDisappear {
            listenTimer?.invalidate()
            focus.suspended = false
        }
    }
}
