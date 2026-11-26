import Foundation

/// Cameriere automatico: sceglie sempre la cosa utile più urgente. Serve alla prova automatica,
/// ai test e, più avanti, ai camerieri assunti.
struct ServiceBot {
    /// Da 0 a 1: quanto bene ferma il getto del vino sulla linea.
    var pourSkill: Double = 1.0
    private var clock: Double = 0

    init(pourSkill: Double = 1.0) {
        self.pourSkill = pourSkill
    }

    mutating func decide(_ sim: ServiceSim, dt: Double) -> ServiceInput {
        clock += dt
        var input: ServiceInput = ServiceInput()
        if sim.pouring {
            let stopAt: Double = ServiceSim.pourTarget - (1 - pourSkill) * 0.25
            input.pourHeld = sim.pourLevel < stopAt
            return input
        }
        var carriedDish: String? = nil
        var carriedWine: Bool = false
        for item in sim.carrying {
            if case Carried.dish(let d) = item { carriedDish = d }
            if case Carried.wine = item { carriedWine = true }
        }
        var targetX: Double? = nil
        if let dish: String = carriedDish {
            for c in sim.customers where c.phase == CustomerPhase.waitingFood && c.dishId == dish { targetX = sim.tables[c.table].x }
        } else if carriedWine {
            for c in sim.customers where c.wantsWine && !c.wineServed && (c.phase == CustomerPhase.waitingFood || c.phase == CustomerPhase.eating) {
                targetX = sim.tables[c.table].x
            }
        } else {
            // Prima gli ordini di chi sta per perdere la pazienza.
            var worst: Double = 2
            for c in sim.customers where c.phase == CustomerPhase.waitingToOrder && c.patience < worst {
                worst = c.patience
                targetX = sim.tables[c.table].x
            }
            if targetX == nil && !sim.pass.isEmpty { targetX = ServiceSim.passX }
            if targetX == nil {
                for table in sim.tables where table.dirty && table.customer == nil { targetX = table.x }
            }
            if targetX == nil {
                for c in sim.customers where c.wantsWine && !c.wineServed && c.phase == CustomerPhase.waitingFood { targetX = ServiceSim.barrelX }
            }
        }
        guard let x: Double = targetX else { return input }
        if abs(x - sim.teclaX) > 5 {
            input.moveX = x > sim.teclaX ? 1 : -1
        } else if sim.availableAction() != nil {
            input.interact = true
            input.pourHeld = true
        }
        return input
    }
}
