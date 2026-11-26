/// Un dito sullo schermo, in pixel dell'interfaccia.
struct TouchPoint {
    let id: Int
    var x: Double
    var y: Double
    let startX: Double
    let startY: Double
    /// true solo nel fotogramma in cui il dito si è posato.
    var began: Bool
    /// true solo nel fotogramma in cui il dito si è alzato (poi il tocco sparisce).
    var ended: Bool
    /// Quanto si è allontanato al massimo dal punto di partenza.
    var travel: Double
    var age: Double
    /// Chi si è preso questo tocco (joystick, lista che scorre...): gli altri lo ignorano.
    var owner: String?
}

/// Tasti di un controller come arrivano da Android, più la croce direzionale.
struct PadState {
    var move: Vec2 = Vec2.zero
    var aim: Vec2 = Vec2.zero
    var buttons: Set<PadButton> = []
    var dpadX: Int = 0
    var dpadY: Int = 0
    var connected: Bool = false
}

/// Stato dei comandi per il fotogramma corrente: dita, controller e tasto "indietro".
/// Le schermate leggono da qui; i comandi a schermo scrivono `touchMove`, `touchHeld`, `touchAim`.
final class Input {
    private(set) var touches: [TouchPoint] = []
    private var pending: [(id: Int, phase: Int, x: Double, y: Double)] = []

    // Scritti dai comandi a schermo.
    var touchMove: Vec2 = Vec2.zero
    var touchHeld: GameButtons = []
    var touchAim: Vec2? = nil

    // Scritto dal guscio Android.
    var pad: PadState = PadState()
    private var backQueued: Bool = false

    // Letti dal gioco.
    /// Direzione voluta: x verso destra, y verso l'ALTO, lunghezza al più 1.
    private(set) var move: Vec2 = Vec2.zero
    private(set) var aim: Vec2? = nil
    private(set) var held: GameButtons = []
    private(set) var pressed: GameButtons = []
    private(set) var released: GameButtons = []
    private(set) var usingController: Bool = false
    /// Tasto "indietro" di Android (o tasto B nei menu) premuto in questo fotogramma.
    private(set) var back: Bool = false

    // Navigazione dei menu col controller: scatti di una posizione, con ripetizione.
    private(set) var navX: Int = 0
    private(set) var navY: Int = 0
    private(set) var confirm: Bool = false
    private var navHeld: Double = 0
    private var navLastX: Int = 0
    private var navLastY: Int = 0
    private var padButtonsBefore: Set<PadButton> = []
    /// Tasti del controller premuti in questo fotogramma (per la rimappatura).
    private(set) var padPressed: Set<PadButton> = []

    var mapping: ControllerMapping = ControllerMapping.standard

    // MARK: Dal guscio

    /// phase: 0 = giù, 1 = mosso, 2 = su, 3 = annullato.
    func hostTouch(id: Int, phase: Int, x: Double, y: Double) {
        pending.append((id: id, phase: phase, x: x, y: y))
    }

    func hostBack() {
        backQueued = true
    }

    // MARK: Fotogramma

    func beginFrame(dt: Double) {
        // I tocchi finiti nel fotogramma scorso spariscono; gli altri non sono più "appena posati".
        touches.removeAll(where: { $0.ended })
        var i: Int = 0
        while i < touches.count {
            touches[i].began = false
            touches[i].age += dt
            i += 1
        }
        for event in pending {
            let index: Int? = touches.firstIndex(where: { $0.id == event.id && !$0.ended })
            switch event.phase {
            case 0:
                if let index: Int = index { touches[index].ended = true }
                touches.append(TouchPoint(id: event.id, x: event.x, y: event.y, startX: event.x, startY: event.y,
                                          began: true, ended: false, travel: 0, age: 0, owner: nil))
            case 1:
                if let index: Int = index {
                    touches[index].x = event.x
                    touches[index].y = event.y
                    let dx: Double = event.x - touches[index].startX
                    let dy: Double = event.y - touches[index].startY
                    touches[index].travel = max(touches[index].travel, (dx * dx + dy * dy).squareRoot())
                }
            default:
                if let index: Int = index {
                    touches[index].x = event.x
                    touches[index].y = event.y
                    touches[index].ended = true
                    // Un tocco annullato dal sistema non deve valere come pressione.
                    if event.phase == 3 { touches[index].travel = 9999 }
                }
            }
        }
        pending.removeAll(keepingCapacity: true)

        // Azioni di gioco: dita più controller.
        var newMove: Vec2 = touchMove
        var newHeld: GameButtons = touchHeld
        var newAim: Vec2? = touchAim
        if touchMove.lengthSquared > 0.0004 || !touchHeld.isEmpty || touches.contains(where: { $0.began }) {
            usingController = false
        }
        padPressed = pad.buttons.subtracting(padButtonsBefore)
        padButtonsBefore = pad.buttons
        if pad.connected {
            var stick: Vec2 = pad.move
            if pad.dpadX != 0 || pad.dpadY != 0 { stick = Vec2(Double(pad.dpadX), Double(pad.dpadY)) }
            if stick.length > 0.14 {
                newMove = stick
                usingController = true
            }
            if pad.aim.length > 0.3 {
                newAim = pad.aim.normalized()
                usingController = true
            }
            for action in GameButtons.all {
                if let button: PadButton = mapping.button(for: action), pad.buttons.contains(button) {
                    newHeld.insert(action)
                    usingController = true
                }
            }
        }
        pressed = newHeld.subtracting(held)
        released = held.subtracting(newHeld)
        held = newHeld
        move = newMove.clamped(maxLength: 1)
        aim = newAim

        // Navigazione dei menu.
        var nx: Int = 0
        var ny: Int = 0
        if pad.connected {
            nx = pad.dpadX
            ny = -pad.dpadY
            if nx == 0 && ny == 0 {
                if abs(pad.move.x) > 0.55 && abs(pad.move.x) >= abs(pad.move.y) { nx = pad.move.x > 0 ? 1 : -1 }
                if abs(pad.move.y) > 0.55 && abs(pad.move.y) > abs(pad.move.x) { ny = pad.move.y > 0 ? -1 : 1 }
            }
        }
        navX = 0
        navY = 0
        if nx != navLastX || ny != navLastY {
            navX = nx
            navY = ny
            navHeld = 0
        } else if nx != 0 || ny != 0 {
            navHeld += dt
            if navHeld > 0.42 {
                navHeld -= 0.12
                navX = nx
                navY = ny
            }
        }
        navLastX = nx
        navLastY = ny
        confirm = padPressed.contains(PadButton.a)
        back = backQueued || padPressed.contains(PadButton.b)
        backQueued = false
        if nx != 0 || ny != 0 || confirm { usingController = true }
    }

    /// Azzera tutto: al cambio di schermata o quando l'app va in secondo piano.
    func reset() {
        for index in touches.indices { touches[index].ended = true }
        touches.removeAll()
        pending.removeAll()
        touchMove = Vec2.zero
        touchHeld = []
        touchAim = nil
        move = Vec2.zero
        aim = nil
        held = []
        pressed = []
        released = []
        back = false
        confirm = false
        navX = 0
        navY = 0
    }

    /// Assegna un tocco a un comando: da quel momento gli altri lo ignorano.
    func claim(_ id: Int, owner: String) {
        if let index: Int = touches.firstIndex(where: { $0.id == id && !$0.ended }) ?? touches.firstIndex(where: { $0.id == id }) {
            touches[index].owner = owner
        }
    }

    func touch(owner: String) -> TouchPoint? {
        return touches.first(where: { $0.owner == owner })
    }

    /// Un tocco appena posato che nessuno ha ancora preso, dentro il rettangolo.
    func freshTouch(in rect: Rect) -> TouchPoint? {
        return touches.first(where: { $0.began && $0.owner == nil && rect.contains($0.x, $0.y) })
    }
}
