import SwiftUI

/// Sezioni della schermata del paese.
enum VillageTab: Int, CaseIterable {
    case staff
    case garden
    case pens
    case traps
    case collection
    case bar

    var title: String {
        switch self {
        case .staff: return String(localized: "Personale")
        case .garden: return String(localized: "Orto")
        case .pens: return String(localized: "Vivaio")
        case .traps: return String(localized: "Nasse")
        case .collection: return String(localized: "Collezione")
        case .bar: return String(localized: "Bar")
        }
    }
}

/// Il paese di Pietrasale: chi lavora all'osteria, l'orto di Saverio, il vivaio delle saline,
/// le nasse, la collezione di maioliche e cartoline, il bar del porto.
struct VillageView: View {
    let revision: Int
    @StateObject private var focus: PadFocus = PadFocus()
    @State private var tab: VillageTab = VillageTab.staff

    var body: some View {
        let state: GameState = GameSession.shared.state ?? GameState()
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    ForEach(VillageTab.allCases, id: \.rawValue) { (item: VillageTab) in
                        TabChip(title: item.title, selected: item == tab, order: item.rawValue, focus: focus) {
                            focus.clear(from: 20)
                            tab = item
                        }
                    }
                    Spacer(minLength: 0)
                    Chip(text: "\(state.gold)", icon: "icon_coin", tint: Palette.ochre)
                    TabChip(title: String(localized: "Chiudi"), selected: false, order: 9, focus: focus) {
                        SceneRouter.shared.backToHub()
                    }
                }
                Divider()
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        switch tab {
                        case .staff: StaffTab(state: state, focus: focus)
                        case .garden: GardenTab(state: state, focus: focus)
                        case .pens: PensTab(state: state, focus: focus)
                        case .traps: TrapsTab(state: state, focus: focus)
                        case .collection: CollectionTab(state: state)
                        case .bar: BarTab(state: state, focus: focus)
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
            focus.onBack = { SceneRouter.shared.backToHub() }
            focus.start()
        }
        .onDisappear { focus.stop() }
    }
}

/// Testo di spiegazione in cima a una sezione, o al posto di una sezione ancora chiusa.
struct SectionNote: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(.footnote, design: .rounded))
            .foregroundColor(Palette.ink.opacity(0.75))
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct RowTitle: View {
    let title: String
    let detail: String
    var extra: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.system(.subheadline, design: .rounded).weight(.heavy))
                .foregroundColor(Palette.ink)
            Text(detail)
                .font(.system(.footnote, design: .rounded))
                .foregroundColor(Palette.ink.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)
            if let extra: String = extra {
                Text(extra)
                    .font(.system(.caption, design: .rounded).weight(.semibold))
                    .foregroundColor(Palette.terracotta)
            }
        }
    }
}

// MARK: - Personale

struct StaffTab: View {
    let state: GameState
    @ObservedObject var focus: PadFocus

    var body: some View {
        let book: VillageBook = GameData.shared.village
        return Group {
            if !Village.staffUnlocked(state) {
                SectionNote(text: String(localized: "Quando l'osteria sarà una trattoria (40 punti di fama) potrai assumere qualcuno che ti dia una mano in sala e in cucina."))
            } else {
                SectionNote(text: String(localized: "Chi assumi lavora ogni sera e va pagato a fine servizio."))
            }
            ForEach(Array(book.staff.enumerated()), id: \.element.id) { (pair: (offset: Int, element: StaffInfo)) in
                let info: StaffInfo = pair.element
                let hired: Bool = state.village.staff.contains(info.id)
                let can: Bool = state.fame >= info.minFame && state.gold >= info.hire
                RowBox {
                    HStack(alignment: .top, spacing: 10) {
                        PixelImage(name: "\(info.sprite)_walk_0", scale: 2)
                        RowTitle(title: "\(info.name.text()) — \(info.role.text())", detail: info.note.text(),
                                 extra: hired ? String(localized: "Al lavoro · paga \(info.wage) oro a serata")
                                              : String(localized: "Assunzione \(info.hire) oro · paga \(info.wage) a serata · serve fama \(info.minFame)"))
                        Spacer(minLength: 4)
                        if hired {
                            RowButton(title: String(localized: "Licenzia"), fill: Palette.ink.opacity(0.15), order: 20 + pair.offset, focus: focus) {
                                GameSession.shared.village { (s: inout GameState, _: GameData) -> Bool in
                                    Village.dismiss(info.id, state: &s)
                                    return true
                                }
                                OverlayCenter.shared.refresh()
                            }
                        } else {
                            RowButton(title: String(localized: "Assumi"), enabled: can, fill: Palette.ochre, order: 20 + pair.offset, focus: focus) {
                                GameSession.shared.village { (s: inout GameState, data: GameData) -> Bool in
                                    Village.hire(info.id, state: &s, book: data.village) == Village.HireOutcome.hired
                                }
                                OverlayCenter.shared.refresh()
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Orto

struct GardenTab: View {
    let state: GameState
    @ObservedObject var focus: PadFocus

    var body: some View {
        let book: VillageBook = GameData.shared.village
        let count: Int = Village.plotCount(state)
        return Group {
            if !Village.farmUnlocked(state) {
                SectionNote(text: String(localized: "Saverio ti presterà due aiuole del suo orto quando la Baronessa avrà smesso di svuotare le nasse: dal secondo capitolo."))
            } else {
                SectionNote(text: String(localized: "Semina, aspetta qualche giorno, raccogli: gli ortaggi finiscono in dispensa e insegnano ricette nuove."))
                ForEach(0..<count, id: \.self) { (index: Int) in
                    let plot: PlotState = index < state.village.plots.count ? state.village.plots[index] : PlotState()
                    let left: Int? = Village.daysLeft(plot: plot, day: state.day, book: book)
                    RowBox {
                        if let id: String = plot.crop, let crop: CropInfo = book.crop(id), let left: Int = left {
                            HStack(spacing: 10) {
                                PixelImage(name: "crop_\(crop.id)", scale: 3)
                                RowTitle(title: String(localized: "Aiuola \(index + 1): \(crop.name.text())"),
                                         detail: left == 0 ? String(localized: "Pronti da raccogliere: \(crop.yield) in dispensa.")
                                                           : (left == 1 ? String(localized: "Pronti domani.") : String(localized: "Pronti tra \(left) giorni.")))
                                Spacer(minLength: 4)
                                if left == 0 {
                                    RowButton(title: String(localized: "Raccogli"), fill: Palette.ochre, order: 20 + index * 8, focus: focus) {
                                        GameSession.shared.village { (s: inout GameState, data: GameData) -> Bool in
                                            Village.harvest(plot: index, state: &s, book: data.village) > 0
                                        }
                                        OverlayCenter.shared.refresh()
                                    }
                                }
                            }
                        } else {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Aiuola \(index + 1): vuota. Che cosa semini?")
                                    .font(.system(.subheadline, design: .rounded).weight(.heavy))
                                    .foregroundColor(Palette.ink)
                                HStack(spacing: 6) {
                                    ForEach(Array(book.crops.enumerated()), id: \.element.id) { (pair: (offset: Int, element: CropInfo)) in
                                        let crop: CropInfo = pair.element
                                        RowButton(title: "\(crop.name.text()) · \(crop.seedCost)", enabled: state.gold >= crop.seedCost,
                                                  order: 20 + index * 8 + pair.offset, focus: focus) {
                                            GameSession.shared.village { (s: inout GameState, data: GameData) -> Bool in
                                                Village.plant(crop.id, plot: index, state: &s, book: data.village)
                                            }
                                            OverlayCenter.shared.refresh()
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if let cost: Int = Village.nextPlotCost(state, book: book) {
                    RowButton(title: String(localized: "Un'altra aiuola · \(cost) oro"), enabled: state.gold >= cost, fill: Palette.ochre, order: 90, focus: focus) {
                        GameSession.shared.village { (s: inout GameState, data: GameData) -> Bool in
                            Village.buyPlot(state: &s, book: data.village)
                        }
                        OverlayCenter.shared.refresh()
                    }
                }
            }
        }
    }
}

// MARK: - Vivaio

struct PensTab: View {
    let state: GameState
    @ObservedObject var focus: PadFocus

    var body: some View {
        let data: GameData = GameData.shared
        let options: [FishSpecies] = Village.stockable(state, fish: data.fish)
        return Group {
            if !Village.farmUnlocked(state) {
                SectionNote(text: String(localized: "Le vasche delle vecchie saline si riaprono dal secondo capitolo."))
            } else {
                SectionNote(text: String(localized: "Metti in vasca due pesci vivi (tre stelle) della stessa specie, fino a quattro chili: ogni mattina ne troverai di nuovi in dispensa."))
                ForEach(Array(state.village.pens.enumerated()), id: \.offset) { (pair: (offset: Int, element: PenState)) in
                    let pen: PenState = pair.element
                    RowBox {
                        if let id: String = pen.species, let species: FishSpecies = data.fish.find(id) {
                            HStack(spacing: 10) {
                                PixelImage(name: "\(species.spriteId)_swim_0", scale: 2)
                                RowTitle(title: String(localized: "Vasca \(pair.offset + 1): \(species.name.text()) × \(pen.count)"),
                                         detail: String(localized: "Rende \(max(1, pen.count / 2)) al giorno, a due stelle."))
                                Spacer(minLength: 4)
                                RowButton(title: String(localized: "Svuota"), fill: Palette.ink.opacity(0.15), order: 20 + pair.offset * 8, focus: focus) {
                                    GameSession.shared.village { (s: inout GameState, _: GameData) -> Bool in
                                        Village.emptyPen(pair.offset, state: &s)
                                        return true
                                    }
                                    OverlayCenter.shared.refresh()
                                }
                            }
                        } else {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Vasca \(pair.offset + 1): vuota.")
                                    .font(.system(.subheadline, design: .rounded).weight(.heavy))
                                    .foregroundColor(Palette.ink)
                                if options.isEmpty {
                                    SectionNote(text: String(localized: "In dispensa non hai due pesci vivi della stessa specie. Prendili con la rete o con i dardi soporiferi."))
                                }
                                HStack(spacing: 6) {
                                    ForEach(Array(options.prefix(5).enumerated()), id: \.element.id) { (choice: (offset: Int, element: FishSpecies)) in
                                        RowButton(title: choice.element.name.text(), order: 20 + pair.offset * 8 + choice.offset, focus: focus) {
                                            GameSession.shared.village { (s: inout GameState, d: GameData) -> Bool in
                                                Village.stock(pen: pair.offset, species: choice.element.id, state: &s, fish: d.fish)
                                            }
                                            OverlayCenter.shared.refresh()
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if let cost: Int = Village.nextPenCost(state, book: data.village) {
                    RowButton(title: String(localized: "Riapri una vasca · \(cost) oro"), enabled: state.gold >= cost, fill: Palette.ochre, order: 90, focus: focus) {
                        GameSession.shared.village { (s: inout GameState, d: GameData) -> Bool in
                            Village.buyPen(state: &s, book: d.village)
                        }
                        OverlayCenter.shared.refresh()
                    }
                }
            }
        }
    }
}

// MARK: - Nasse

struct TrapsTab: View {
    let state: GameState
    @ObservedObject var focus: PadFocus

    var body: some View {
        let data: GameData = GameData.shared
        let zones: [Int] = Village.reachableZones(world: data.world, maxDepth: GameSession.shared.maxDepth)
        return Group {
            if !Village.farmUnlocked(state) {
                SectionNote(text: String(localized: "Finché c'è la Baronessa, calare una nassa è regalarle il pranzo. Dal secondo capitolo."))
            } else {
                SectionNote(text: String(localized: "Una nassa calata in una zona rende ogni mattina uno o due pesci piccoli di quella zona. Puoi calarla fin dove arriva la tua muta."))
                ForEach(Array(state.village.traps.enumerated()), id: \.offset) { (pair: (offset: Int, element: TrapState)) in
                    let zone: Int = pair.element.zone
                    let name: String = zone < data.world.zones.count ? data.world.zones[zone].name.text() : ""
                    let position: Int = zones.firstIndex(of: zone) ?? 0
                    RowBox {
                        HStack(spacing: 10) {
                            RowTitle(title: String(localized: "Nassa \(pair.offset + 1)"), detail: String(localized: "Calata in: \(name)"))
                            Spacer(minLength: 4)
                            RowButton(title: String(localized: "Più su"), enabled: position > 0, order: 20 + pair.offset * 2, focus: focus) {
                                GameSession.shared.village { (s: inout GameState, d: GameData) -> Bool in
                                    Village.moveTrap(pair.offset, toZone: zones[max(position - 1, 0)], state: &s, world: d.world, maxDepth: GameSession.shared.maxDepth)
                                }
                                OverlayCenter.shared.refresh()
                            }
                            RowButton(title: String(localized: "Più giù"), enabled: position < zones.count - 1, order: 21 + pair.offset * 2, focus: focus) {
                                GameSession.shared.village { (s: inout GameState, d: GameData) -> Bool in
                                    Village.moveTrap(pair.offset, toZone: zones[min(position + 1, zones.count - 1)], state: &s, world: d.world, maxDepth: GameSession.shared.maxDepth)
                                }
                                OverlayCenter.shared.refresh()
                            }
                        }
                    }
                }
                if let cost: Int = Village.nextTrapCost(state, book: data.village) {
                    RowButton(title: String(localized: "Una nassa da Zaira · \(cost) oro"), enabled: state.gold >= cost, fill: Palette.ochre, order: 90, focus: focus) {
                        GameSession.shared.village { (s: inout GameState, d: GameData) -> Bool in
                            Village.buyTrap(state: &s, book: d.village)
                        }
                        OverlayCenter.shared.refresh()
                    }
                }
            }
        }
    }
}

// MARK: - Collezione

struct CollectionTab: View {
    let state: GameState
    @State private var selected: String? = nil

    private func grid(_ items: [Collectible], scale: CGFloat) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 70), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(items, id: \.id) { (item: Collectible) in
                let owned: Bool = state.village.collection.contains(item.id)
                Button(action: {
                    Feedback.tap()
                    selected = owned ? item.id : nil
                }) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Palette.ink.opacity(selected == item.id ? 0.22 : 0.07))
                        if owned {
                            PixelImage(name: item.id, scale: scale)
                        } else {
                            Text("?")
                                .font(.system(.title2, design: .rounded).weight(.heavy))
                                .foregroundColor(Palette.ink.opacity(0.3))
                        }
                    }
                    .frame(width: 70, height: 62)
                }
                .buttonStyle(.plain)
            }
        }
    }

    var body: some View {
        let book: VillageBook = GameData.shared.village
        let tiles: Int = book.tiles.filter { state.village.collection.contains($0.id) }.count
        let cards: Int = book.postcards.filter { state.village.collection.contains($0.id) }.count
        return Group {
            Text("Maioliche dei Nerei \(tiles)/\(book.tiles.count)")
                .font(.system(.subheadline, design: .rounded).weight(.heavy))
                .foregroundColor(Palette.ink)
            SectionNote(text: String(localized: "Si trovano sul fondo, due per zona: brillano. La collezione completa vale cinque perle."))
            grid(book.tiles, scale: 2.5)
            Text("Cartoline \(cards)/\(book.postcards.count)")
                .font(.system(.subheadline, design: .rounded).weight(.heavy))
                .foregroundColor(Palette.ink)
            SectionNote(text: String(localized: "Arrivano da sole, quando raggiungi un traguardo."))
            grid(book.postcards, scale: 2)
            if let id: String = selected, let item: Collectible = book.collectible(id) {
                RowBox {
                    RowTitle(title: item.name.text(), detail: item.note.text())
                }
            }
        }
    }
}

// MARK: - Bar

struct BarTab: View {
    let state: GameState
    @ObservedObject var focus: PadFocus

    var body: some View {
        let session: GameSession = GameSession.shared
        let records: [String: Int] = state.village.records
        return Group {
            SectionNote(text: String(localized: "Al bar del porto si gioca a bocce con Don Pinuccio e si butta un gettone nel vecchio cabinato."))
            RowBox {
                HStack(spacing: 10) {
                    PixelImage(name: "boccia_0", scale: 3)
                    RowTitle(title: String(localized: "Bocce contro Don Pinuccio"),
                             detail: String(localized: "Quattro bocce a testa, vince chi va più vicino al pallino. Levetta per mirare, tieni premuto per la forza."),
                             extra: String(localized: "Scommessa \(BocceScene.bet) oro · miglior mano \(records["bocce"] ?? 0) punti"))
                    Spacer(minLength: 4)
                    RowButton(title: String(localized: "Gioca"), enabled: state.gold >= BocceScene.bet, fill: Palette.ochre, order: 20, focus: focus) {
                        SceneRouter.shared.startBocce()
                    }
                }
            }
            RowBox {
                HStack(spacing: 10) {
                    PixelImage(name: "sardina_swim_0", scale: 3)
                    RowTitle(title: String(localized: "Il cabinato: Acchiappasarde"),
                             detail: String(localized: "Prendi le sarde con la cassetta, lascia cadere i ricci. Tre vite."),
                             extra: String(localized: "Gettone \(ArcadeScene.coin) oro · primato \(records["cabinato"] ?? 0)"))
                    Spacer(minLength: 4)
                    RowButton(title: String(localized: "Gioca"), enabled: state.gold >= ArcadeScene.coin, fill: Palette.ochre, order: 21, focus: focus) {
                        SceneRouter.shared.startArcade()
                    }
                }
            }
            RowBox {
                HStack(spacing: 10) {
                    PixelImage(name: "note_0", scale: 3)
                    RowTitle(title: String(localized: "La sfida di Lustri"),
                             detail: session.duelAvailable ? String(localized: "Lustri è al bancone con due coltelli. Gara a tempo di musica: chi vince prende 120 monete e 8 punti di fama.")
                                                           : String(localized: "Lustri oggi non c'è. Torna nel giorno della sfida: lo leggi al porto."),
                             extra: String(localized: "Miglior punteggio \(records["sfida"] ?? 0)"))
                    Spacer(minLength: 4)
                    RowButton(title: String(localized: "Sfida"), enabled: session.duelAvailable, fill: Palette.terracotta, order: 22, focus: focus) {
                        SceneRouter.shared.startDuel()
                    }
                }
            }
        }
    }
}

/// Avvisi del mattino al porto: l'evento del giorno, ciò che hanno reso nasse e vivaio, i pezzi nuovi della collezione.
struct NewsBanner: View {
    let state: GameState

    var body: some View {
        let session: GameSession = GameSession.shared
        var lines: [String] = []
        if let event: DayEvent = session.todayEvent { lines.append("\(event.title). \(event.text)") }
        lines.append(contentsOf: state.village.news)
        for id in session.newCollectibles {
            if let item: Collectible = GameData.shared.village.collectible(id) {
                lines.append(item.kind == "maiolica" ? String(localized: "Nuova maiolica: \(item.name.text()).") : String(localized: "Nuova cartolina: \(item.name.text())."))
            }
        }
        return Group {
            if !lines.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                        Text(pair.element)
                            .font(.system(.caption, design: .rounded).weight(.semibold))
                            .foregroundColor(Palette.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Palette.lime.opacity(0.92)))
            }
        }
    }
}
