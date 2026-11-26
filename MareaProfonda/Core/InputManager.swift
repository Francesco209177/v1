import Foundation
import UIKit

/// Stato dei comandi per il fotogramma corrente, unificato tra dita e controller.
/// Le scene leggono solo da qui: non sanno da dove arriva il comando.
final class InputManager {
    static let shared: InputManager = InputManager()

    // Scritti dai comandi a schermo.
    var touchMove: Vec2 = Vec2.zero
    var touchHeld: GameButtons = []
    /// Direzione di mira trascinata col dito, se c'è.
    var touchAim: Vec2? = nil

    /// Direzione voluta: x verso destra, y verso l'alto, lunghezza al più 1.
    private(set) var move: Vec2 = Vec2.zero
    /// Direzione di mira esplicita (levetta destra o trascinamento), se c'è.
    private(set) var aim: Vec2? = nil
    private(set) var held: GameButtons = []
    /// Premuti in questo fotogramma.
    private(set) var pressed: GameButtons = []
    private(set) var released: GameButtons = []
    /// true se l'ultimo comando è arrivato da un controller: l'interfaccia mostra i suoi simboli.
    private(set) var usingController: Bool = false

    private init() {}

    /// Da chiamare una volta per fotogramma, prima della logica di gioco.
    func beginFrame() {
        var newMove: Vec2 = touchMove
        var newHeld: GameButtons = touchHeld
        var newAim: Vec2? = touchAim
        if touchMove.lengthSquared > 0.0004 || !touchHeld.isEmpty {
            usingController = false
        }
        if let pad: ControllerSupport.Reading = ControllerSupport.shared.poll(mapping: SettingsStore.shared.settings.mapping) {
            if pad.move.length > 0.14 {
                newMove = pad.move
                usingController = true
            }
            if pad.aim.length > 0.3 {
                newAim = pad.aim.normalized()
                usingController = true
            }
            if !pad.held.isEmpty {
                newHeld.formUnion(pad.held)
                usingController = true
            }
        }
        pressed = newHeld.subtracting(held)
        released = held.subtracting(newHeld)
        held = newHeld
        move = newMove.clamped(maxLength: 1)
        aim = newAim
    }

    /// Azzera tutto: al cambio di scena o quando l'app va in pausa.
    func reset() {
        touchMove = Vec2.zero
        touchHeld = []
        touchAim = nil
        move = Vec2.zero
        aim = nil
        held = []
        pressed = []
        released = []
    }
}

/// Riscontro tattile: vibrazione dell'iPhone e, se c'è, del controller.
enum Feedback {
    private static let light: UIImpactFeedbackGenerator = UIImpactFeedbackGenerator(style: UIImpactFeedbackGenerator.FeedbackStyle.light)
    private static let medium: UIImpactFeedbackGenerator = UIImpactFeedbackGenerator(style: UIImpactFeedbackGenerator.FeedbackStyle.medium)
    private static let heavy: UIImpactFeedbackGenerator = UIImpactFeedbackGenerator(style: UIImpactFeedbackGenerator.FeedbackStyle.heavy)
    private static let notifier: UINotificationFeedbackGenerator = UINotificationFeedbackGenerator()

    private static var enabled: Bool { return SettingsStore.shared.settings.haptics && !SmokeTest.isActive }

    /// Tocco leggero: pulsanti, bolle, piccoli urti.
    static func tap() {
        if !enabled { return }
        light.impactOccurred()
        ControllerSupport.shared.rumble(intensity: 0.25, sharpness: 0.7, duration: 0.04)
    }

    /// Colpo andato a segno, scatto.
    static func hit() {
        if !enabled { return }
        medium.impactOccurred()
        ControllerSupport.shared.rumble(intensity: 0.6, sharpness: 0.6, duration: 0.08)
    }

    /// Urto forte, danno subito.
    static func thud() {
        if !enabled { return }
        heavy.impactOccurred()
        ControllerSupport.shared.rumble(intensity: 1.0, sharpness: 0.3, duration: 0.16)
    }

    /// Cattura riuscita, obiettivo raggiunto.
    static func success() {
        if !enabled { return }
        notifier.notificationOccurred(UINotificationFeedbackGenerator.FeedbackType.success)
        ControllerSupport.shared.rumble(intensity: 0.7, sharpness: 0.9, duration: 0.12)
    }

    /// Avviso: fiato basso, carico eccessivo.
    static func warning() {
        if !enabled { return }
        notifier.notificationOccurred(UINotificationFeedbackGenerator.FeedbackType.warning)
        ControllerSupport.shared.rumble(intensity: 0.8, sharpness: 0.2, duration: 0.22)
    }
}
