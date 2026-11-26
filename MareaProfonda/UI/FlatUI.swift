import SpriteKit
import UIKit

extension SKColor {
    /// Colore da esadecimale 0xRRGGBB.
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
    }

    convenience init(_ c: RGBA) {
        self.init(red: CGFloat(c.r) / 255, green: CGFloat(c.g) / 255, blue: CGFloat(c.b) / 255, alpha: CGFloat(c.a) / 255)
    }
}

/// Colori e caratteri dell'interfaccia: piatta, pulita, con i toni del Mediterraneo
/// (calce, ocra, terracotta, turchese, cobalto) a contrasto con la pixel art del gioco.
enum Theme {
    static let ink: SKColor = SKColor(hex: 0x0E2238)
    static let lime: SKColor = SKColor(hex: 0xF7F1E3)       // bianco calce
    static let ochre: SKColor = SKColor(hex: 0xF2B84B)
    static let terracotta: SKColor = SKColor(hex: 0xD8553B)
    static let turquoise: SKColor = SKColor(hex: 0x2BB7B3)
    static let cobalt: SKColor = SKColor(hex: 0x1F4E9C)
    static let danger: SKColor = SKColor(hex: 0xE5484D)

    /// Carattere di sistema arrotondato, leggibile anche in piccolo.
    static func font(size: CGFloat, weight: UIFont.Weight = UIFont.Weight.semibold) -> UIFont {
        let base: UIFont = UIFont.systemFont(ofSize: size, weight: weight)
        if let descriptor: UIFontDescriptor = base.fontDescriptor.withDesign(UIFontDescriptor.SystemDesign.rounded) {
            return UIFont(descriptor: descriptor, size: size)
        }
        return base
    }

    static func attributed(_ text: String, size: CGFloat, weight: UIFont.Weight = UIFont.Weight.semibold, color: SKColor = Theme.lime) -> NSAttributedString {
        return NSAttributedString(string: text, attributes: [
            NSAttributedString.Key.font: font(size: size, weight: weight),
            NSAttributedString.Key.foregroundColor: color
        ])
    }

    /// Etichetta con il carattere dell'interfaccia.
    static func label(_ text: String, size: CGFloat, weight: UIFont.Weight = UIFont.Weight.semibold, color: SKColor = Theme.lime) -> SKLabelNode {
        let node: SKLabelNode = SKLabelNode()
        node.attributedText = attributed(text, size: size, weight: weight, color: color)
        node.verticalAlignmentMode = SKLabelVerticalAlignmentMode.center
        node.horizontalAlignmentMode = SKLabelHorizontalAlignmentMode.center
        return node
    }
}

/// Pulsante rotondo piatto con un'icona a pixel, per i comandi a schermo.
final class RoundButton: SKNode {
    let radius: CGFloat
    private let disc: SKShapeNode
    private let icon: SKSpriteNode
    private var baseAlpha: CGFloat = 0.34

    init(radius: CGFloat, iconName: String, tint: SKColor = Theme.lime) {
        self.radius = radius
        disc = SKShapeNode(circleOfRadius: radius)
        icon = SpriteForge.shared.node(iconName)
        super.init()
        disc.fillColor = Theme.ink.withAlphaComponent(baseAlpha)
        disc.strokeColor = tint.withAlphaComponent(0.55)
        disc.lineWidth = 1.5
        disc.isAntialiased = true
        addChild(disc)
        icon.anchorPoint = CGPoint(x: 0.5, y: 0.5)
        icon.color = tint
        icon.colorBlendFactor = 1
        icon.zPosition = 1
        addChild(icon)
    }

    required init?(coder aDecoder: NSCoder) {
        radius = 20
        disc = SKShapeNode(circleOfRadius: 20)
        icon = SKSpriteNode()
        super.init(coder: aDecoder)
    }

    /// L'icona è pixel art: va ingrandita di un multiplo intero dei pixel fisici.
    func setIconScale(_ scale: CGFloat) {
        icon.setScale(scale)
    }

    func setPressed(_ pressed: Bool) {
        disc.fillColor = pressed ? Theme.lime.withAlphaComponent(0.42) : Theme.ink.withAlphaComponent(baseAlpha)
        setScale(pressed ? 0.93 : 1.0)
    }

    func contains(point: CGPoint, slop: CGFloat = 10) -> Bool {
        let dx: CGFloat = point.x - position.x
        let dy: CGFloat = point.y - position.y
        let r: CGFloat = radius + slop
        return dx * dx + dy * dy <= r * r
    }
}

/// Pulsante rettangolare arrotondato con testo, per menu e finestre.
final class PillButton: SKNode {
    let size: CGSize
    private let body: SKShapeNode
    private let label: SKLabelNode
    private let fill: SKColor

    init(text: String, size: CGSize, fill: SKColor = Theme.turquoise, textColor: SKColor = Theme.ink) {
        self.size = size
        self.fill = fill
        body = SKShapeNode(rectOf: size, cornerRadius: size.height / 2)
        label = Theme.label(text, size: min(size.height * 0.42, 20), weight: UIFont.Weight.bold, color: textColor)
        super.init()
        body.fillColor = fill
        body.strokeColor = SKColor.clear
        body.isAntialiased = true
        addChild(body)
        label.zPosition = 1
        addChild(label)
    }

    required init?(coder aDecoder: NSCoder) {
        size = CGSize(width: 120, height: 44)
        fill = Theme.turquoise
        body = SKShapeNode(rectOf: CGSize(width: 120, height: 44), cornerRadius: 22)
        label = SKLabelNode()
        super.init(coder: aDecoder)
    }

    func setPressed(_ pressed: Bool) {
        body.fillColor = pressed ? fill.withAlphaComponent(0.7) : fill
        setScale(pressed ? 0.96 : 1.0)
    }

    func contains(point: CGPoint) -> Bool {
        return abs(point.x - position.x) <= size.width / 2 + 6 && abs(point.y - position.y) <= size.height / 2 + 6
    }
}
