import Foundation

/// Che cosa serve per aprire l'osteria stasera.
struct ServiceSetup {
    var dishes: [PreparedDish]
    var recipes: RecipeBook
    var tuning: ServiceTuning
    var tables: Int
    var arrivalEvery: Double
    var seed: UInt64
    /// Piatto chiesto dall'ospite speciale della serata, se c'è.
    var vipDishId: String? = nil
    /// Quante cose Tecla porta insieme.
    var carryCapacity: Int = 1
    /// 1 = Nonna Ines da sola; più alto con gli aiuti in cucina.
    var cookSpeed: Double = 1
}

enum CustomerPhase: Equatable {
    case arriving
    case waitingToOrder
    case waitingFood
    case eating
    case leavingHappy
    case leavingAngry
}

struct Customer: Equatable {
    let id: Int
    /// Aspetto: da 0 a 7 i clienti comuni, 100 l'ospite speciale.
    let look: Int
    let table: Int
    var phase: CustomerPhase
    var x: Double
    /// Da 1 (sereno) a 0 (se ne va).
    var patience: Double
    var timer: Double
    var dishId: String?
    var wantsWine: Bool
    var wineServed: Bool
    let isVIP: Bool
}

struct TableState: Equatable {
    let x: Double
    var customer: Int?
    var dirty: Bool
}

enum Carried: Equatable {
    case dish(String)
    case wine(perfect: Bool)
}

struct KitchenTicket: Equatable {
    let dishId: String
    let customer: Int
    var remaining: Double
}

enum ServiceEvent: Equatable {
    case customerArrived(table: Int)
    case orderTaken(table: Int, dishId: String)
    case dishReady(dishId: String)
    case pickedUp
    case served(table: Int, gold: Int, tip: Int)
    case wineServed(table: Int, perfect: Bool, gold: Int)
    case tableCleaned(table: Int)
    case leftAngry(table: Int)
    case leftEmptyHanded(table: Int)
    case pourStarted
    case pourSpilled
    case pourTooLittle
    case pourDone(perfect: Bool)
    case comboLost
    case vipDelighted
    case closed
}

struct ServiceInput {
    /// Da -1 (sinistra) a 1 (destra).
    var moveX: Double = 0
    /// Tasto azione premuto in questo fotogramma.
    var interact: Bool = false
    /// Tasto tenuto premuto: versa il vino.
    var pourHeld: Bool = false
}

enum ServiceStation: Equatable {
    /// Il passavivande della cucina.
    case pass
    /// La botte del vino della casa.
    case barrel
    case table(Int)
}

/// Che cosa farebbe adesso il tasto azione (per il suggerimento a schermo).
enum ServiceAction: Equatable {
    case takeOrder
    case serveDish
    case serveWine
    case clean
    case pickUp
    case pour
}

struct ServiceResult: Equatable {
    var revenue: Int = 0
    var tips: Int = 0
    var served: Int = 0
    var lost: Int = 0
    var perfectWines: Int = 0
    var bestCombo: Int = 0
    var vipDelighted: Bool = false
    var sold: [String: Int] = [:]

    var total: Int { return revenue + tips }
    /// Fama guadagnata nella serata.
    var fame: Int {
        return max(0, served * 2 + bestCombo + perfectWines - lost * 3 + (vipDelighted ? 15 : 0))
    }
}

/// Il servizio della sera, senza grafica: Tecla corre tra cucina, botte e tavoli; i clienti
/// arrivano, ordinano, aspettano, mangiano e pagano. La scena disegna questo stato.
struct ServiceSim {
    static let passX: Double = 44
    static let barrelX: Double = 100
    static let firstTableX: Double = 170
    static let tableSpacing: Double = 58
    static let reach: Double = 22
    static let pourTarget: Double = 0.78
    static let pourLimit: Double = 0.93

    let setup: ServiceSetup
    private(set) var time: Double = 0
    private(set) var teclaX: Double = ServiceSim.passX + 30
    private(set) var facingRight: Bool = true
    private(set) var isWalking: Bool = false
    /// Secondi che restano per finire di pulire un tavolo.
    private(set) var cleaning: Double = 0
    private var cleaningTable: Int = -1
    private(set) var carrying: [Carried] = []
    private(set) var customers: [Customer] = []
    private(set) var tables: [TableState] = []
    private(set) var tickets: [KitchenTicket] = []
    /// Piatti pronti sul passavivande, con il cliente che li aspetta.
    private(set) var pass: [KitchenTicket] = []
    private(set) var portions: [String: Int] = [:]
    private(set) var prices: [String: Int] = [:]
    private(set) var pouring: Bool = false
    private(set) var pourLevel: Double = 0
    private(set) var combo: Int = 0
    private var comboTimer: Double = 0
    private(set) var result: ServiceResult = ServiceResult()
    private(set) var finished: Bool = false
    private var nextArrival: Double = 2.0
    private var nextId: Int = 1
    private var vipPending: Bool
    private var rng: SeededRNG

    init(setup: ServiceSetup) {
        self.setup = setup
        rng = SeededRNG(seed: setup.seed &+ 606)
        vipPending = setup.vipDishId != nil
        var i: Int = 0
        while i < max(setup.tables, 1) {
            tables.append(TableState(x: ServiceSim.firstTableX + Double(i) * ServiceSim.tableSpacing, customer: nil, dirty: false))
            i += 1
        }
        for dish in setup.dishes where dish.portions > 0 {
            portions[dish.recipeId, default: 0] += dish.portions
            prices[dish.recipeId] = dish.price
        }
    }

    var doorX: Double { return (tables.last?.x ?? ServiceSim.firstTableX) + 70 }
    var isOpen: Bool { return time < setup.tuning.duration }
    var timeLeft: Double { return max(0, setup.tuning.duration - time) }
    var portionsLeft: Int {
        var n: Int = 0
        for (_, count) in portions { n += count }
        return n
    }

    func customer(id: Int) -> Customer? {
        return customers.first(where: { $0.id == id })
    }

    private func customerIndex(id: Int) -> Int? {
        return customers.firstIndex(where: { $0.id == id })
    }

    /// Postazione a portata di mano, se c'è.
    func station() -> ServiceStation? {
        var best: ServiceStation? = nil
        var bestDistance: Double = ServiceSim.reach
        let passDistance: Double = abs(teclaX - ServiceSim.passX)
        if passDistance < bestDistance {
            bestDistance = passDistance
            best = ServiceStation.pass
        }
        let barrelDistance: Double = abs(teclaX - ServiceSim.barrelX)
        if barrelDistance < bestDistance {
            bestDistance = barrelDistance
            best = ServiceStation.barrel
        }
        for (i, table) in tables.enumerated() {
            let d: Double = abs(teclaX - table.x)
            if d < bestDistance {
                bestDistance = d
                best = ServiceStation.table(i)
            }
        }
        return best
    }

    private var handsFull: Bool { return carrying.count >= max(setup.carryCapacity, 1) }

    /// Azione disponibile col tasto azione nella postazione corrente.
    func availableAction() -> ServiceAction? {
        guard cleaning <= 0, !pouring, let where_: ServiceStation = station() else { return nil }
        switch where_ {
        case .pass:
            return (!pass.isEmpty && !handsFull) ? ServiceAction.pickUp : nil
        case .barrel:
            return handsFull ? nil : ServiceAction.pour
        case .table(let index):
            let table: TableState = tables[index]
            if let id: Int = table.customer, let c: Customer = customer(id: id) {
                if c.phase == CustomerPhase.waitingToOrder { return ServiceAction.takeOrder }
                if c.phase == CustomerPhase.waitingFood, let dish: String = c.dishId, carrying.contains(Carried.dish(dish)) { return ServiceAction.serveDish }
                if c.wantsWine && !c.wineServed && (c.phase == CustomerPhase.waitingFood || c.phase == CustomerPhase.eating) && hasWine { return ServiceAction.serveWine }
                return nil
            }
            return table.dirty ? ServiceAction.clean : nil
        }
    }

    private var hasWine: Bool {
        for item in carrying {
            if case Carried.wine = item { return true }
        }
        return false
    }

    // MARK: - Passo

    mutating func step(input: ServiceInput, dt: Double) -> [ServiceEvent] {
        var events: [ServiceEvent] = []
        if finished || dt <= 0 { return events }
        time += dt
        isWalking = false

        if cleaning > 0 {
            cleaning -= dt
            if cleaning <= 0 {
                cleaning = 0
                if cleaningTable >= 0 && cleaningTable < tables.count {
                    tables[cleaningTable].dirty = false
                    events.append(ServiceEvent.tableCleaned(table: cleaningTable))
                }
                cleaningTable = -1
            }
        } else if pouring {
            stepPour(input: input, dt: dt, events: &events)
        } else {
            if abs(input.moveX) > 0.12 {
                teclaX += MathUtil.clamp(input.moveX, -1, 1) * setup.tuning.walkSpeed * dt
                teclaX = MathUtil.clamp(teclaX, 18, doorX - 26)
                facingRight = input.moveX > 0
                isWalking = true
            }
            if input.interact { interact(&events) }
        }

        stepKitchen(dt: dt, events: &events)
        stepCustomers(dt: dt, events: &events)
        stepArrivals(dt: dt, events: &events)

        if combo > 0 {
            comboTimer -= dt
            if comboTimer <= 0 {
                combo = 0
                events.append(ServiceEvent.comboLost)
            }
        }

        // Chiusura: fuori orario (o a dispensa vuota) e sala vuota.
        let nothingToSell: Bool = portionsLeft == 0 && tickets.isEmpty && pass.isEmpty
        if (!isOpen || nothingToSell) && customers.isEmpty && time > 3 {
            finished = true
            events.append(ServiceEvent.closed)
        }
        return events
    }

    private mutating func stepPour(input: ServiceInput, dt: Double, events: inout [ServiceEvent]) {
        if input.pourHeld {
            // Il getto accelera: l'ultimo tratto è il più difficile.
            pourLevel += (0.42 + pourLevel * 0.95) * dt
            if pourLevel >= 1 {
                pouring = false
                pourLevel = 0
                events.append(ServiceEvent.pourSpilled)
            }
            return
        }
        pouring = false
        let level: Double = pourLevel
        pourLevel = 0
        if level < 0.45 {
            events.append(ServiceEvent.pourTooLittle)
            return
        }
        let perfect: Bool = level >= ServiceSim.pourTarget - 0.06 && level <= ServiceSim.pourLimit
        carrying.append(Carried.wine(perfect: perfect))
        events.append(ServiceEvent.pourDone(perfect: perfect))
    }

    private mutating func interact(_ events: inout [ServiceEvent]) {
        guard let action: ServiceAction = availableAction(), let where_: ServiceStation = station() else { return }
        switch (action, where_) {
        case (.pickUp, _):
            let ticket: KitchenTicket = pass.removeFirst()
            carrying.append(Carried.dish(ticket.dishId))
            events.append(ServiceEvent.pickedUp)
        case (.pour, _):
            pouring = true
            pourLevel = 0
            events.append(ServiceEvent.pourStarted)
        case (.takeOrder, .table(let index)):
            guard let id: Int = tables[index].customer, let ci: Int = customerIndex(id: id) else { return }
            if let dish: String = chooseDish(for: customers[ci]) {
                portions[dish, default: 0] -= 1
                customers[ci].dishId = dish
                customers[ci].phase = CustomerPhase.waitingFood
                customers[ci].patience = max(customers[ci].patience, 0.75)
                let cook: Double = setup.recipes.find(dish)?.cookTime ?? 4
                tickets.append(KitchenTicket(dishId: dish, customer: id, remaining: cook))
                events.append(ServiceEvent.orderTaken(table: index, dishId: dish))
            } else {
                // Non c'è più niente di ciò che voleva: se ne va senza rancore.
                customers[ci].phase = CustomerPhase.leavingHappy
                tables[index].customer = nil
                events.append(ServiceEvent.leftEmptyHanded(table: index))
            }
        case (.serveDish, .table(let index)):
            guard let id: Int = tables[index].customer, let ci: Int = customerIndex(id: id), let dish: String = customers[ci].dishId,
                  let held: Int = carrying.firstIndex(of: Carried.dish(dish)) else { return }
            carrying.remove(at: held)
            let price: Int = prices[dish] ?? 10
            let taste: Double = Double(setup.recipes.find(dish)?.taste ?? 3)
            combo = min(combo + 1, setup.tuning.maxCombo)
            comboTimer = setup.tuning.comboWindow
            result.bestCombo = max(result.bestCombo, combo)
            let tipRate: Double = min(0.6, customers[ci].patience * 0.20 + Double(combo - 1) * 0.04 + taste * 0.01)
            let tip: Int = Int((Double(price) * tipRate).rounded())
            result.revenue += price
            result.tips += tip
            result.served += 1
            result.sold[dish, default: 0] += 1
            customers[ci].phase = CustomerPhase.eating
            customers[ci].timer = setup.tuning.eatTime
            events.append(ServiceEvent.served(table: index, gold: price, tip: tip))
            if customers[ci].isVIP {
                result.vipDelighted = true
                events.append(ServiceEvent.vipDelighted)
            }
        case (.serveWine, .table(let index)):
            guard let id: Int = tables[index].customer, let ci: Int = customerIndex(id: id) else { return }
            var perfect: Bool = false
            var held: Int? = nil
            for (i, item) in carrying.enumerated() {
                if case Carried.wine(let p) = item {
                    held = i
                    perfect = p
                    break
                }
            }
            guard let slot: Int = held else { return }
            carrying.remove(at: slot)
            let gold: Int = setup.tuning.winePrice + (perfect ? 3 : 0)
            result.revenue += gold
            if perfect { result.perfectWines += 1 }
            customers[ci].wineServed = true
            customers[ci].patience = min(1, customers[ci].patience + 0.25)
            events.append(ServiceEvent.wineServed(table: index, perfect: perfect, gold: gold))
        case (.clean, .table(let index)):
            cleaning = setup.tuning.cleanTime
            cleaningTable = index
        default:
            break
        }
    }

    /// Sceglie il piatto per un cliente tra quelli ancora disponibili, pesando per gusto.
    private mutating func chooseDish(for c: Customer) -> String? {
        if c.isVIP, let wanted: String = setup.vipDishId {
            return (portions[wanted] ?? 0) > 0 ? wanted : nil
        }
        let available: [String] = portions.keys.filter { (portions[$0] ?? 0) > 0 }.sorted()
        if available.isEmpty { return nil }
        let weights: [Double] = available.map { Double(setup.recipes.find($0)?.taste ?? 3) }
        guard let index: Int = rng.pickWeighted(weights) else { return available.first }
        return available[index]
    }

    private mutating func stepKitchen(dt: Double, events: inout [ServiceEvent]) {
        guard !tickets.isEmpty, pass.count < 4 else { return }
        tickets[0].remaining -= dt * max(setup.cookSpeed, 0.1)
        if tickets[0].remaining <= 0 {
            let done: KitchenTicket = tickets.removeFirst()
            pass.append(done)
            events.append(ServiceEvent.dishReady(dishId: done.dishId))
        }
    }

    private mutating func stepCustomers(dt: Double, events: inout [ServiceEvent]) {
        var i: Int = customers.count - 1
        while i >= 0 {
            var c: Customer = customers[i]
            let tableX: Double = tables[c.table].x
            var remove: Bool = false
            switch c.phase {
            case .arriving:
                c.x -= 58 * dt
                if c.x <= tableX + 14 {
                    c.x = tableX + 14
                    c.phase = CustomerPhase.waitingToOrder
                    c.patience = 1
                }
            case .waitingToOrder:
                c.patience -= dt / setup.tuning.patienceOrder
            case .waitingFood:
                c.patience -= dt / setup.tuning.patienceFood
            case .eating:
                c.timer -= dt
                if c.timer <= 0 {
                    c.phase = CustomerPhase.leavingHappy
                    tables[c.table].customer = nil
                    tables[c.table].dirty = true
                }
            case .leavingHappy, .leavingAngry:
                c.x += 64 * dt
                if c.x > doorX + 30 { remove = true }
            }
            if (c.phase == CustomerPhase.waitingToOrder || c.phase == CustomerPhase.waitingFood) && c.patience <= 0 {
                c.patience = 0
                c.phase = CustomerPhase.leavingAngry
                tables[c.table].customer = nil
                result.lost += 1
                if combo > 0 {
                    combo = 0
                    events.append(ServiceEvent.comboLost)
                }
                // L'ordine in sospeso si annulla; se non era ancora cucinato la porzione torna disponibile.
                if let dish: String = c.dishId {
                    if let t: Int = tickets.firstIndex(where: { $0.customer == c.id }) {
                        tickets.remove(at: t)
                        portions[dish, default: 0] += 1
                    } else if let p: Int = pass.firstIndex(where: { $0.customer == c.id }) {
                        pass.remove(at: p)
                    }
                }
                events.append(ServiceEvent.leftAngry(table: c.table))
            }
            if remove {
                customers.remove(at: i)
            } else {
                customers[i] = c
            }
            i -= 1
        }
    }

    private mutating func stepArrivals(dt: Double, events: inout [ServiceEvent]) {
        if !isOpen || portionsLeft <= 0 { return }
        nextArrival -= dt
        if nextArrival > 0 { return }
        var free: [Int] = []
        for (i, table) in tables.enumerated() where table.customer == nil && !table.dirty { free.append(i) }
        guard let table: Int = rng.pick(free) else {
            nextArrival = 1.0
            return
        }
        // L'ospite speciale arriva dopo un quarto della serata, finché il suo piatto c'è.
        var isVIP: Bool = false
        if vipPending && time > setup.tuning.duration * 0.25, let wanted: String = setup.vipDishId, (portions[wanted] ?? 0) > 0 {
            isVIP = true
            vipPending = false
        }
        let customer: Customer = Customer(id: nextId, look: isVIP ? 100 : rng.int(0, 7), table: table, phase: CustomerPhase.arriving,
                                          x: doorX + 20, patience: 1, timer: 0, dishId: nil,
                                          wantsWine: rng.chance(setup.tuning.wineChance), wineServed: false, isVIP: isVIP)
        nextId += 1
        customers.append(customer)
        tables[table].customer = customer.id
        nextArrival = setup.arrivalEvery * rng.range(0.7, 1.3)
        events.append(ServiceEvent.customerArrived(table: table))
    }
}
