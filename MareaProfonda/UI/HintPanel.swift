import SpriteKit
import UIKit

/// Riquadro di istruzioni che compare la prima volta che si fa una cosa: resta qualche secondo
/// in alto, non blocca il gioco e poi svanisce.
final class HintPanel: SKNode {
    private let body: SKShapeNode = SKShapeNode()
    private let label: SKLabelNode = SKLabelNode()

    override init() {
        super.init()
        body.fillColor = Theme.ink.withAlphaComponent(0.86)
        body.strokeColor = Theme.ochre.withAlphaComponent(0.8)
        body.lineWidth = 1.5
        addChild(body)
        label.numberOfLines = 0
        label.lineBreakMode = NSLineBreakMode.byWordWrapping
        label.horizontalAlignmentMode = SKLabelHorizontalAlignmentMode.center
        label.verticalAlignmentMode = SKLabelVerticalAlignmentMode.center
        label.zPosition = 1
        addChild(label)
        alpha = 0
        isHidden = true
    }

    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }

    /// Mostra il testo per `seconds` secondi. `width` è la larghezza massima del riquadro, in punti.
    func show(_ text: String, width: CGFloat, seconds: Double = 10) {
        label.preferredMaxLayoutWidth = width - 28
        label.attributedText = Theme.attributed(text, size: 13, weight: UIFont.Weight.semibold, color: Theme.lime)
        let height: CGFloat = max(label.frame.height + 20, 40)
        body.path = CGPath(roundedRect: CGRect(x: -width / 2, y: -height / 2, width: width, height: height), cornerWidth: 14, cornerHeight: 14, transform: nil)
        isHidden = false
        removeAllActions()
        alpha = 0
        run(SKAction.sequence([
            SKAction.fadeIn(withDuration: 0.3),
            SKAction.wait(forDuration: seconds),
            SKAction.fadeOut(withDuration: 0.6),
            SKAction.hide()
        ]))
    }
}
