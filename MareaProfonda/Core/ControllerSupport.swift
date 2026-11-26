import CoreHaptics
import Foundation
import GameController

/// Controller fisici (MFi, DualSense, Xbox): lettura degli assi e dei tasti secondo la
/// rimappatura scelta, simboli dei tasti per i suggerimenti a schermo, vibrazione.
final class ControllerSupport: NSObject {
    static let shared: ControllerSupport = ControllerSupport()

    struct Reading {
        var move: Vec2 = Vec2.zero
        var aim: Vec2 = Vec2.zero
        var held: GameButtons = []
    }

    private(set) var current: GCController?
    /// Chiamata quando un controller si collega o si scollega.
    var onChange: (() -> Void)?

    private var hapticEngine: CHHapticEngine?
    private var hapticsFailed: Bool = false
    private var started: Bool = false

    private override init() {
        super.init()
    }

    var isConnected: Bool { return current?.extendedGamepad != nil }

    func start() {
        if started { return }
        started = true
        let center: NotificationCenter = NotificationCenter.default
        center.addObserver(self, selector: #selector(controllersChanged), name: NSNotification.Name.GCControllerDidConnect, object: nil)
        center.addObserver(self, selector: #selector(controllersChanged), name: NSNotification.Name.GCControllerDidDisconnect, object: nil)
        center.addObserver(self, selector: #selector(controllersChanged), name: NSNotification.Name.GCControllerDidBecomeCurrent, object: nil)
        refresh()
    }

    @objc private func controllersChanged() {
        refresh()
        onChange?()
    }

    private func refresh() {
        var chosen: GCController? = GCController.current
        if chosen?.extendedGamepad == nil {
            chosen = GCController.controllers().first(where: { (c: GCController) -> Bool in c.extendedGamepad != nil })
        }
        if chosen !== current {
            current = chosen
            hapticEngine?.stop(completionHandler: nil)
            hapticEngine = nil
            hapticsFailed = false
        }
    }

    // MARK: - Lettura

    private func input(_ button: PadButton, _ pad: GCExtendedGamepad) -> GCControllerButtonInput? {
        switch button {
        case .a: return pad.buttonA
        case .b: return pad.buttonB
        case .x: return pad.buttonX
        case .y: return pad.buttonY
        case .l1: return pad.leftShoulder
        case .r1: return pad.rightShoulder
        case .l2: return pad.leftTrigger
        case .r2: return pad.rightTrigger
        case .l3: return pad.leftThumbstickButton
        case .r3: return pad.rightThumbstickButton
        case .menu: return pad.buttonMenu
        case .options: return pad.buttonOptions
        }
    }

    func poll(mapping: ControllerMapping) -> Reading? {
        guard let pad: GCExtendedGamepad = current?.extendedGamepad else { return nil }
        var reading: Reading = Reading()
        var mx: Double = Double(pad.leftThumbstick.xAxis.value)
        var my: Double = Double(pad.leftThumbstick.yAxis.value)
        let dx: Double = Double(pad.dpad.xAxis.value)
        let dy: Double = Double(pad.dpad.yAxis.value)
        if abs(dx) > 0.5 || abs(dy) > 0.5 {
            mx = dx
            my = dy
        }
        reading.move = Vec2(mx, my).clamped(maxLength: 1)
        reading.aim = Vec2(Double(pad.rightThumbstick.xAxis.value), Double(pad.rightThumbstick.yAxis.value))
        for action in GameButtons.all {
            if let button: PadButton = mapping.button(for: action), let element: GCControllerButtonInput = input(button, pad), element.isPressed {
                reading.held.insert(action)
            }
        }
        return reading
    }

    /// Primo tasto premuto in questo momento: serve alla schermata di rimappatura.
    func firstPressedButton() -> PadButton? {
        guard let pad: GCExtendedGamepad = current?.extendedGamepad else { return nil }
        for button in PadButton.allCases {
            if let element: GCControllerButtonInput = input(button, pad), element.isPressed { return button }
        }
        return nil
    }

    /// Nome del simbolo SF che rappresenta, sul controller collegato, il tasto assegnato all'azione
    /// (croce su DualSense, A su Xbox...). nil se non c'è un controller.
    func symbolName(for action: GameButtons, mapping: ControllerMapping) -> String? {
        guard let pad: GCExtendedGamepad = current?.extendedGamepad, let button: PadButton = mapping.button(for: action),
              let element: GCControllerButtonInput = input(button, pad) else { return nil }
        return element.sfSymbolsName ?? element.unmappedSfSymbolsName
    }

    // MARK: - Vibrazione

    private func obtainEngine() -> CHHapticEngine? {
        if hapticsFailed { return nil }
        if let existing: CHHapticEngine = hapticEngine { return existing }
        guard let created: CHHapticEngine = current?.haptics?.createEngine(withLocality: GCHapticsLocality.default) else {
            hapticsFailed = true
            return nil
        }
        created.stoppedHandler = { [weak self] (_: CHHapticEngine.StoppedReason) -> Void in
            self?.hapticEngine = nil
        }
        created.resetHandler = { [weak self] () -> Void in
            self?.hapticEngine = nil
        }
        do {
            try created.start()
        } catch {
            hapticsFailed = true
            return nil
        }
        hapticEngine = created
        return created
    }

    /// Vibrazione breve sul controller, se la supporta. `intensity` e `sharpness` vanno da 0 a 1.
    func rumble(intensity: Double, sharpness: Double, duration: Double) {
        guard let engine: CHHapticEngine = obtainEngine() else { return }
        let parameters: [CHHapticEventParameter] = [
            CHHapticEventParameter(parameterID: CHHapticEvent.ParameterID.hapticIntensity, value: Float(MathUtil.clamp(intensity, 0, 1))),
            CHHapticEventParameter(parameterID: CHHapticEvent.ParameterID.hapticSharpness, value: Float(MathUtil.clamp(sharpness, 0, 1)))
        ]
        let event: CHHapticEvent = CHHapticEvent(eventType: CHHapticEvent.EventType.hapticContinuous, parameters: parameters,
                                                 relativeTime: 0, duration: max(duration, 0.03))
        do {
            let pattern: CHHapticPattern = try CHHapticPattern(events: [event], parameters: [])
            let player: CHHapticPatternPlayer = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            hapticEngine = nil
        }
    }
}
