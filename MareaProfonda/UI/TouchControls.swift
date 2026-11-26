import SpriteKit
import UIKit

/// Comandi a schermo: joystick analogico che compare dove si appoggia il pollice sinistro,
/// pulsanti rotondi a destra. Scrive in `InputManager`; il gioco non legge mai i tocchi direttamente.
final class TouchControls: SKNode {
    private struct Button {
        let action: GameButtons
        let node: RoundButton
        var touch: UITouch?
    }

    private let joyBase: SKShapeNode = SKShapeNode(circleOfRadius: 46)
    private let joyKnob: SKShapeNode = SKShapeNode(circleOfRadius: 21)
    private let joyRadius: CGFloat = 46
    private var joyTouch: UITouch?
    private var joyOrigin: CGPoint = CGPoint.zero
    private var buttons: [Button] = []
    private var leftZoneMaxX: CGFloat = 0
    private var safeRect: CGRect = CGRect.zero
    private var iconScale: CGFloat = 2

    override init() {
        super.init()
        joyBase.fillColor = Theme.lime.withAlphaComponent(0.08)
        joyBase.strokeColor = Theme.lime.withAlphaComponent(0.38)
        joyBase.lineWidth = 2
        joyBase.isHidden = true
        joyKnob.fillColor = Theme.lime.withAlphaComponent(0.55)
        joyKnob.strokeColor = SKColor.clear
        joyKnob.isHidden = true
        joyKnob.zPosition = 1
        addChild(joyBase)
        addChild(joyKnob)
    }

    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }

    /// Sceglie quali pulsanti mostrare: solo quelli che in questa scena fanno qualcosa.
    func configure(actions: [GameButtons]) {
        for button in buttons { button.node.removeFromParent() }
        buttons.removeAll()
        for action in actions {
            let node: RoundButton
            switch action {
            case .primary: node = RoundButton(radius: 36, iconName: "icon_harpoon", tint: Theme.ochre)
            case .interact: node = RoundButton(radius: 27, iconName: "icon_hand")
            case .secondary: node = RoundButton(radius: 25, iconName: "icon_net")
            case .inventory: node = RoundButton(radius: 21, iconName: "icon_bag")
            case .dash: node = RoundButton(radius: 28, iconName: "icon_dash", tint: Theme.turquoise)
            default: node = RoundButton(radius: 18, iconName: "icon_pause")
            }
            addChild(node)
            buttons.append(Button(action: action, node: node, touch: nil))
        }
        applyLayout()
    }

    func layout(safe: CGRect, pixelScale: CGFloat) {
        safeRect = safe
        leftZoneMaxX = safe.minX + safe.width * 0.46
        iconScale = pixelScale * 2
        applyLayout()
    }

    private func applyLayout() {
        if safeRect.width <= 0 { return }
        let right: CGFloat = safeRect.maxX
        let bottom: CGFloat = safeRect.minY
        let top: CGFloat = safeRect.maxY
        let hasPrimary: Bool = buttons.contains(where: { (b: Button) -> Bool in b.action == .primary })
        for button in buttons {
            let node: RoundButton = button.node
            switch button.action {
            case .primary: node.position = CGPoint(x: right - 50, y: bottom + 58)
            case .dash: node.position = hasPrimary ? CGPoint(x: right - 132, y: bottom + 40) : CGPoint(x: right - 52, y: bottom + 56)
            case .interact: node.position = CGPoint(x: right - 118, y: bottom + 108)
            case .secondary: node.position = CGPoint(x: right - 44, y: bottom + 134)
            case .inventory: node.position = CGPoint(x: right - 76, y: top - 26)
            default: node.position = CGPoint(x: right - 24, y: top - 26)
            }
            node.setIconScale(button.action == .primary ? iconScale * 1.5 : iconScale)
        }
    }

    // MARK: - Tocchi (coordinate dell'HUD, in punti)

    /// Ritorna true se il tocco è stato preso da un comando.
    func touchBegan(_ touch: UITouch, at point: CGPoint) -> Bool {
        if isHidden { return false }
        var index: Int = 0
        while index < buttons.count {
            if buttons[index].touch == nil && buttons[index].node.contains(point: point) {
                buttons[index].touch = touch
                buttons[index].node.setPressed(true)
                InputManager.shared.touchHeld.insert(buttons[index].action)
                Feedback.tap()
                return true
            }
            index += 1
        }
        if joyTouch == nil && point.x <= leftZoneMaxX {
            joyTouch = touch
            joyOrigin = point
            joyBase.position = point
            joyKnob.position = point
            joyBase.isHidden = false
            joyKnob.isHidden = false
            InputManager.shared.touchMove = Vec2.zero
            return true
        }
        return false
    }

    func touchMoved(_ touch: UITouch, at point: CGPoint) {
        if touch !== joyTouch { return }
        var dx: CGFloat = point.x - joyOrigin.x
        var dy: CGFloat = point.y - joyOrigin.y
        let dist: CGFloat = (dx * dx + dy * dy).squareRoot()
        if dist > joyRadius {
            // Il joystick segue il pollice: la base si sposta per restare a portata.
            let excess: CGFloat = dist - joyRadius
            joyOrigin.x += dx / dist * excess
            joyOrigin.y += dy / dist * excess
            joyBase.position = joyOrigin
            dx = point.x - joyOrigin.x
            dy = point.y - joyOrigin.y
        }
        joyKnob.position = CGPoint(x: joyOrigin.x + dx, y: joyOrigin.y + dy)
        var value: Vec2 = Vec2(Double(dx / joyRadius), Double(dy / joyRadius))
        let magnitude: Double = value.length
        if magnitude < 0.12 {
            value = Vec2.zero
        } else {
            // Zona morta riscalata: la risposta parte da zero appena fuori dal centro.
            value = value.normalized() * min((magnitude - 0.12) / 0.88, 1)
        }
        InputManager.shared.touchMove = value
    }

    func touchEnded(_ touch: UITouch) {
        if touch === joyTouch {
            joyTouch = nil
            joyBase.isHidden = true
            joyKnob.isHidden = true
            InputManager.shared.touchMove = Vec2.zero
            return
        }
        var index: Int = 0
        while index < buttons.count {
            if buttons[index].touch === touch {
                buttons[index].touch = nil
                buttons[index].node.setPressed(false)
                InputManager.shared.touchHeld.remove(buttons[index].action)
            }
            index += 1
        }
    }

    func releaseAll() {
        joyTouch = nil
        joyBase.isHidden = true
        joyKnob.isHidden = true
        InputManager.shared.touchMove = Vec2.zero
        var index: Int = 0
        while index < buttons.count {
            buttons[index].touch = nil
            buttons[index].node.setPressed(false)
            index += 1
        }
        InputManager.shared.touchHeld = []
    }
}
