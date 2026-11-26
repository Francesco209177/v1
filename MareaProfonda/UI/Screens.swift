import SwiftUI

// MARK: - Elementi comuni

/// Etichetta a pastiglia scura per le barre di stato.
struct Chip: View {
    let text: String
    var icon: String? = nil
    var tint: Color = Palette.lime

    var body: some View {
        HStack(spacing: 6) {
            if let icon: String = icon {
                PixelImage(name: icon, scale: 2)
            }
            Text(text)
                .font(.system(.subheadline, design: .rounded).weight(.bold))
                .foregroundColor(tint)
                .lineLimit(1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(Capsule().fill(Palette.ink.opacity(0.72)))
    }
}

/// Piccolo pulsante rotondo (più, meno), raggiungibile col controller.
struct RoundIconButton: View {
    let symbol: String
    var enabled: Bool = true
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
            Text(symbol)
                .font(.system(.title3, design: .rounded).weight(.heavy))
                .foregroundColor(Palette.ink)
                .frame(width: 38, height: 38)
                .background(Circle().fill(Palette.ochre.opacity(enabled ? 1 : 0.3)))
                .overlay(Circle().stroke(Palette.cobalt, lineWidth: focused ? 3 : 0))
        }
        .buttonStyle(.plain)
        .onAppear {
            focus.register(order) {
                if enabled { action() }
            }
        }
    }
}

func phaseName(_ phase: DayPhase) -> String {
    switch phase {
    case .morning: return String(localized: "Mattina")
    case .afternoon: return String(localized: "Pomeriggio")
    case .evening: return String(localized: "Sera")
    case .night: return String(localized: "Notte")
    }
}

func itemName(_ id: String) -> String {
    if let species: FishSpecies = GameData.shared.fish.find(id) { return species.name.text() }
    if let kind: PickupPoint.Kind = PickupPoint.Kind(rawValue: id) { return DiveScene.pickupName(kind) }
    return id
}

// MARK: - Scelta della partita

struct SlotCard: View {
    let slot: Int
    let state: GameState?
    @ObservedObject var focus: PadFocus
    let onPlay: () -> Void
    let onDelete: () -> Void

    var body: some View {
        Card {
            VStack(spacing: 8) {
                Text("Partita \(slot + 1)")
                    .font(.system(.headline, design: .rounded).weight(.heavy))
                    .foregroundColor(Palette.ink)
                if let state: GameState = state {
                    let rank: String = GameData.shared.balance.rank(fame: state.fame)?.name.text() ?? ""
                    Text("Giorno \(state.day) · \(phaseName(state.phase))")
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundColor(Palette.ink.opacity(0.8))
                    Text("\(state.gold) oro · \(rank)")
                        .font(.system(.footnote, design: .rounded))
                        .foregroundColor(Palette.ink.opacity(0.65))
                        .lineLimit(1)
                    MenuButton(title: String(localized: "Continua"), order: slot, focus: focus, action: onPlay)
                    Button(action: onDelete) {
                        Text("Elimina")
                            .font(.system(.footnote, design: .rounded).weight(.semibold))
                            .foregroundColor(Palette.danger)
                    }
                    .buttonStyle(.plain)
                } else {
                    Text("Vuota")
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundColor(Palette.ink.opacity(0.6))
                    Text(" ")
                        .font(.system(.footnote, design: .rounded))
                    MenuButton(title: String(localized: "Nuova partita"), fill: Palette.ochre, order: slot, focus: focus, action: onPlay)
                    Text(" ")
                        .font(.system(.footnote, design: .rounded))
                }
            }
            .frame(maxWidth: .infinity)
        }
    }
}

struct SlotPickerView: View {
    let revision: Int
    @StateObject private var focus: PadFocus = PadFocus()
    @State private var deleting: Int? = nil

    var body: some View {
        VStack(spacing: 14) {
            Text("Scegli una partita")
                .font(.system(.title2, design: .rounded).weight(.heavy))
                .foregroundColor(Palette.lime)
            HStack(alignment: .top, spacing: 12) {
                ForEach(0..<SaveStore.slotCount, id: \.self) { (slot: Int) in
                    SlotCard(slot: slot, state: GameSession.shared.summary(slot: slot), focus: focus,
                             onPlay: {
                                 GameSession.shared.start(slot: slot)
                                 SceneRouter.shared.showHub()
                             },
                             onDelete: { deleting = slot })
                }
            }
            MenuButton(title: String(localized: "Indietro"), fill: Palette.lime, order: SaveStore.slotCount, focus: focus) {
                SceneRouter.shared.showTitle(animated: true)
            }
            .frame(maxWidth: 220)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ink.opacity(0.6).ignoresSafeArea())
        .alert(String(localized: "Eliminare questa partita?"), isPresented: Binding(get: { deleting != nil }, set: { (shown: Bool) in if !shown { deleting = nil } })) {
            Button(String(localized: "Elimina"), role: .destructive) {
                if let slot: Int = deleting {
                    GameSession.shared.delete(slot: slot)
                    deleting = nil
                    OverlayCenter.shared.refresh()
                }
            }
            Button(String(localized: "Annulla"), role: .cancel) {
                deleting = nil
            }
        }
        .onAppear {
            focus.onBack = { SceneRouter.shared.showTitle(animated: true) }
            focus.start()
        }
        .onDisappear { focus.stop() }
    }
}

// MARK: - Porto

struct HubStatusBar: View {
    let state: GameState

    var body: some View {
        let balance: Balance = GameData.shared.balance
        let rank: String = balance.rank(fame: state.fame)?.name.text() ?? ""
        let next: Int? = balance.fameToNextRank(fame: state.fame)
        let fameText: String = next == nil ? "\(rank)" : "\(rank) · \(state.fame) fama"
        var stock: Int = 0
        for entry in state.pantry.entries() { stock += entry.count }
        return HStack(spacing: 8) {
            Chip(text: "Giorno \(state.day) · \(phaseName(state.phase))")
            Chip(text: "\(state.gold)", icon: "icon_coin", tint: Palette.ochre)
            Chip(text: fameText, icon: "icon_heart")
            Chip(text: String(localized: "Dispensa: \(stock)"))
            Spacer(minLength: 0)
        }
    }
}

struct HubPanelView: View {
    let revision: Int
    @StateObject private var focus: PadFocus = PadFocus()

    var body: some View {
        let session: GameSession = GameSession.shared
        let state: GameState = session.state ?? GameState()
        let learned: [String] = session.newlyLearned
        return VStack(spacing: 10) {
            HubStatusBar(state: state)
            Spacer(minLength: 0)
            if !session.justCompleted.isEmpty {
                QuestBanner(questIds: session.justCompleted)
            }
            if !learned.isEmpty {
                LearnedBanner(recipeIds: learned)
            }
            HubActions(state: state, focus: focus)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear { focus.start() }
        .onDisappear { focus.stop() }
    }
}

struct LearnedBanner: View {
    let recipeIds: [String]

    var body: some View {
        var names: [String] = []
        for id in recipeIds {
            if let recipe: Recipe = GameData.shared.recipes.find(id) { names.append(recipe.name.text()) }
        }
        return HStack(spacing: 10) {
            PixelImage(name: "ines_shout_0", scale: 2)
            VStack(alignment: .leading, spacing: 2) {
                Text("Nonna Ines ti insegna una ricetta!")
                    .font(.system(.subheadline, design: .rounded).weight(.heavy))
                Text(names.joined(separator: ", "))
                    .font(.system(.footnote, design: .rounded))
            }
            .foregroundColor(Palette.ink)
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Palette.ochre))
    }
}

struct HubActions: View {
    let state: GameState
    @ObservedObject var focus: PadFocus

    var body: some View {
        HStack(spacing: 10) {
            switch state.phase {
            case .morning, .afternoon:
                MenuButton(title: String(localized: "Immergiti"), subtitle: String(localized: "Scendi nel Calderone"), order: 0, focus: focus) {
                    SceneRouter.shared.startDive()
                }
                MenuButton(title: state.phase == DayPhase.morning ? String(localized: "Aspetta il pomeriggio") : String(localized: "Vai all'osteria"),
                           subtitle: String(localized: "Salta l'immersione"), fill: Palette.lime, order: 1, focus: focus) {
                    GameSession.shared.skipPhase()
                    SceneRouter.shared.showHub()
                }
            case .evening:
                if state.tonight.isEmpty {
                    MenuButton(title: String(localized: "Prepara il menu"), subtitle: String(localized: "Scegli i piatti di stasera"), fill: Palette.ochre, order: 0, focus: focus) {
                        GameSession.shared.clearAnnouncements()
                        OverlayCenter.shared.show(OverlayScreen.menu)
                    }
                } else {
                    MenuButton(title: String(localized: "Apri l'osteria"), subtitle: String(localized: "Il menu è pronto"), fill: Palette.ochre, order: 0, focus: focus) {
                        SceneRouter.shared.startService()
                    }
                }
                MenuButton(title: String(localized: "Chiudi per stasera"), subtitle: String(localized: "Niente servizio"), fill: Palette.lime, order: 1, focus: focus) {
                    GameSession.shared.skipPhase()
                    SceneRouter.shared.showHub()
                }
            case .night:
                if GameSession.shared.canDiveAtNight {
                    MenuButton(title: String(localized: "Immersione notturna"), subtitle: String(localized: "Altre specie, più pericoli"), order: 0, focus: focus) {
                        SceneRouter.shared.startDive()
                    }
                }
                MenuButton(title: String(localized: "Vai a dormire"), subtitle: String(localized: "Comincia un nuovo giorno"), fill: Palette.cobalt, textColor: Palette.lime, order: 1, focus: focus) {
                    GameSession.shared.skipPhase()
                    SceneRouter.shared.showHub()
                }
            }
            MenuButton(title: String(localized: "Giornale di bordo"), subtitle: String(localized: "Missioni, cantiere, ricette"), fill: Palette.turquoise.opacity(0.85), order: 2, focus: focus) {
                GameSession.shared.clearAnnouncements()
                OverlayCenter.shared.show(OverlayScreen.logbook)
            }
            .frame(maxWidth: 190)
            MenuButton(title: String(localized: "Esci"), subtitle: String(localized: "La partita è salvata"), fill: Palette.ink.opacity(0.8), textColor: Palette.lime, order: 3, focus: focus) {
                GameSession.shared.close()
                SceneRouter.shared.showTitle(animated: true)
            }
            .frame(maxWidth: 120)
        }
    }
}

/// Avviso al porto: missioni appena completate, da ritirare nel Giornale di bordo.
struct QuestBanner: View {
    let questIds: [String]

    var body: some View {
        var names: [String] = []
        for quest in GameSession.shared.questsToday() where questIds.contains(quest.id) { names.append(quest.title.text()) }
        return HStack(spacing: 10) {
            Text("Missione compiuta: \(names.joined(separator: ", ")). Ritira la ricompensa nel Giornale di bordo.")
                .font(.system(.footnote, design: .rounded).weight(.heavy))
                .foregroundColor(Palette.ink)
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Palette.turquoise))
    }
}

// MARK: - Menu della sera

struct RecipeRow: View {
    let recipe: Recipe
    let count: Int
    let canAdd: Bool
    let price: Int
    let order: Int
    @ObservedObject var focus: PadFocus
    let onChange: (Int) -> Void

    var body: some View {
        var parts: [String] = []
        for ingredient in recipe.ingredients {
            parts.append("\(ingredient.count)× \(itemName(ingredient.item))")
        }
        return HStack(spacing: 10) {
            PixelImage(name: "plate_\(recipe.plate)", scale: 3)
            VStack(alignment: .leading, spacing: 2) {
                Text(recipe.name.text())
                    .font(.system(.subheadline, design: .rounded).weight(.heavy))
                    .foregroundColor(Palette.ink)
                Text(parts.joined(separator: " + "))
                    .font(.system(.caption, design: .rounded))
                    .foregroundColor(Palette.ink.opacity(0.7))
                Text("\(recipe.portions) porzioni · \(price) oro l'una")
                    .font(.system(.caption, design: .rounded).weight(.semibold))
                    .foregroundColor(Palette.terracotta)
            }
            Spacer(minLength: 4)
            RoundIconButton(symbol: "−", enabled: count > 0, order: order, focus: focus) { onChange(count - 1) }
            Text("\(count)")
                .font(.system(.title3, design: .rounded).weight(.heavy))
                .foregroundColor(Palette.ink)
                .frame(minWidth: 26)
            RoundIconButton(symbol: "+", enabled: canAdd, order: order + 1, focus: focus) { onChange(count + 1) }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Palette.ink.opacity(count > 0 ? 0.12 : 0.05)))
    }
}

struct MenuPlannerView: View {
    @StateObject private var focus: PadFocus = PadFocus()
    @State private var batches: [String: Int] = [:]

    /// Dispensa che resterebbe dopo le preparazioni già scelte.
    private func remainingPantry(_ state: GameState) -> Pantry {
        var pantry: Pantry = state.pantry
        for (id, n) in batches where n > 0 {
            guard let recipe: Recipe = GameData.shared.recipes.find(id) else { continue }
            for ingredient in recipe.ingredients {
                _ = pantry.take(ingredient.item, count: ingredient.count * n)
            }
        }
        return pantry
    }

    private func confirm() {
        var plan: [(recipeId: String, batches: Int)] = []
        for (id, n) in batches where n > 0 { plan.append((recipeId: id, batches: n)) }
        plan.sort { (a, b) -> Bool in a.recipeId < b.recipeId }
        if GameSession.shared.prepareMenu(plan) {
            SceneRouter.shared.startService()
        }
    }

    var body: some View {
        let session: GameSession = GameSession.shared
        let state: GameState = session.state ?? GameState()
        let data: GameData = GameData.shared
        let known: [Recipe] = data.recipes.recipes.filter { (r: Recipe) -> Bool in state.recipes[r.id] != nil }
        let slots: Int = session.rank?.menuSlots ?? 2
        var chosen: Int = 0
        var portions: Int = 0
        for (id, n) in batches where n > 0 {
            chosen += 1
            portions += (data.recipes.find(id)?.portions ?? 0) * n
        }
        let pantry: Pantry = remainingPantry(state)
        let backOrder: Int = known.count * 2
        return Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Menu di stasera")
                        .font(.system(.title3, design: .rounded).weight(.heavy))
                        .foregroundColor(Palette.ink)
                    Spacer()
                    Text("\(chosen)/\(slots) piatti · \(portions) porzioni")
                        .font(.system(.subheadline, design: .rounded).weight(.bold))
                        .foregroundColor(Palette.terracotta)
                }
                if known.isEmpty {
                    Text("Non conosci ancora nessuna ricetta.")
                        .font(.system(.body, design: .rounded))
                        .foregroundColor(Palette.ink.opacity(0.7))
                }
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(Array(known.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Recipe)) in
                            let index: Int = pair.offset
                            let recipe: Recipe = pair.element
                            let count: Int = batches[recipe.id] ?? 0
                            let room: Bool = count > 0 || chosen < slots
                            let more: Bool = MenuPlanner.maxBatches(recipe, pantry: pantry) >= 1
                            let price: Int = MenuPlanner.price(recipe, averageStars: 2, level: state.recipes[recipe.id] ?? 1, balance: data.balance, fame: state.fame)
                            RecipeRow(recipe: recipe, count: count, canAdd: room && more, price: price, order: index * 2, focus: focus) { (value: Int) in
                                batches[recipe.id] = max(0, value)
                            }
                        }
                    }
                }
                HStack(spacing: 10) {
                    MenuButton(title: String(localized: "Indietro"), fill: Palette.ink.opacity(0.12), order: backOrder, focus: focus) {
                        OverlayCenter.shared.show(OverlayScreen.hub)
                    }
                    .frame(maxWidth: 160)
                    MenuButton(title: String(localized: "Apri l'osteria"), fill: Palette.ochre, enabled: chosen > 0, order: backOrder + 1, focus: focus) {
                        confirm()
                    }
                }
            }
        }
        .padding(.horizontal, 26)
        .padding(.vertical, 10)
        .frame(maxWidth: 720, maxHeight: .infinity)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ink.opacity(0.6).ignoresSafeArea())
        .onAppear {
            focus.onBack = { OverlayCenter.shared.show(OverlayScreen.hub) }
            focus.start()
        }
        .onDisappear { focus.stop() }
    }
}

// MARK: - Riepilogo della serata

struct SummaryLine: View {
    let label: String
    let value: String
    var strong: Bool = false

    var body: some View {
        HStack {
            Text(label)
                .font(.system(strong ? .headline : .subheadline, design: .rounded).weight(strong ? .heavy : .regular))
            Spacer()
            Text(value)
                .font(.system(strong ? .headline : .subheadline, design: .rounded).weight(.heavy))
        }
        .foregroundColor(Palette.ink)
    }
}

struct EveningSummaryView: View {
    @StateObject private var focus: PadFocus = PadFocus()

    var body: some View {
        let session: GameSession = GameSession.shared
        let result: ServiceResult = session.lastService ?? ServiceResult()
        let state: GameState = session.state ?? GameState()
        let balance: Balance = GameData.shared.balance
        let before: Int = balance.rankIndex(fame: session.lastFameBefore)
        let after: Int = balance.rankIndex(fame: state.fame)
        let rankName: String = balance.rank(fame: state.fame)?.name.text() ?? ""
        let next: Int? = balance.fameToNextRank(fame: state.fame)
        return Card {
            VStack(spacing: 8) {
                Text("Serata conclusa")
                    .font(.system(.title3, design: .rounded).weight(.heavy))
                    .foregroundColor(Palette.ink)
                SummaryLine(label: String(localized: "Piatti e vino"), value: "\(result.revenue) oro")
                SummaryLine(label: String(localized: "Mance"), value: "\(result.tips) oro")
                SummaryLine(label: String(localized: "Clienti serviti"), value: "\(result.served)")
                SummaryLine(label: String(localized: "Clienti persi"), value: "\(result.lost)")
                SummaryLine(label: String(localized: "Serie migliore"), value: "×\(result.bestCombo)")
                Divider()
                SummaryLine(label: String(localized: "Incasso"), value: "+\(result.total) oro", strong: true)
                SummaryLine(label: String(localized: "Fama"), value: "+\(result.fame)", strong: true)
                if after > before {
                    Text("L'osteria sale di rango: \(rankName)!")
                        .font(.system(.subheadline, design: .rounded).weight(.heavy))
                        .foregroundColor(Palette.terracotta)
                } else if let next: Int = next {
                    Text("\(rankName) · mancano \(next) punti di fama al prossimo rango")
                        .font(.system(.footnote, design: .rounded))
                        .foregroundColor(Palette.ink.opacity(0.7))
                }
                MenuButton(title: String(localized: "Continua"), order: 0, focus: focus) {
                    SceneRouter.shared.showHub()
                }
            }
        }
        .frame(maxWidth: 420)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ink.opacity(0.6).ignoresSafeArea())
        .onAppear { focus.start() }
        .onDisappear { focus.stop() }
    }
}
