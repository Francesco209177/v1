import SpriteKit
import UIKit

/// HUD dell'immersione: profondità in metri con il nome della zona, e l'annuncio a centro
/// schermo quando si entra in una zona nuova.
final class DiveHUD: SKNode {
    private let panel: SKShapeNode = SKShapeNode()
    private let depthIcon: SKSpriteNode = SpriteForge.shared.node("icon_depth")
    private let depthLabel: PixelLabel = PixelLabel(text: "0 M", color: SKColor.white, alignment: PixelLabel.Alignment.left)
    private let zoneLabel: SKLabelNode = Theme.label("", size: 12, weight: UIFont.Weight.semibold, color: Theme.lime)
    private let banner: SKNode = SKNode()
    private let bannerTitle: SKLabelNode = Theme.label("", size: 26, weight: UIFont.Weight.heavy, color: Theme.lime)
    private let bannerDepth: SKLabelNode = Theme.label("", size: 14, weight: UIFont.Weight.semibold, color: Theme.ochre)
    private var shownDepth: Int = -1
    private var unit: CGFloat = 1

    override init() {
        super.init()
        panel.fillColor = Theme.ink.withAlphaComponent(0.42)
        panel.strokeColor = SKColor.clear
        addChild(panel)
        depthIcon.anchorPoint = CGPoint(x: 0.5, y: 0.5)
        depthIcon.color = Theme.ochre
        depthIcon.colorBlendFactor = 1
        depthIcon.zPosition = 1
        addChild(depthIcon)
        depthLabel.zPosition = 1
        addChild(depthLabel)
        zoneLabel.horizontalAlignmentMode = SKLabelHorizontalAlignmentMode.left
        zoneLabel.zPosition = 1
        addChild(zoneLabel)

        banner.alpha = 0
        banner.zPosition = 5
        banner.addChild(bannerTitle)
        bannerDepth.position = CGPoint(x: 0, y: -24)
        banner.addChild(bannerDepth)
        addChild(banner)
    }

    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }

    func layout(safe: CGRect, pixelScale: CGFloat) {
        unit = pixelScale
        let width: CGFloat = 148
        let height: CGFloat = 46
        let origin: CGPoint = CGPoint(x: safe.minX, y: safe.maxY - height)
        panel.path = CGPath(roundedRect: CGRect(x: origin.x, y: origin.y, width: width, height: height),
                            cornerWidth: 12, cornerHeight: 12, transform: nil)
        depthIcon.setScale(pixelScale * 2)
        depthIcon.position = CGPoint(x: origin.x + 20, y: origin.y + height / 2)
        depthLabel.setScale(pixelScale * 2)
        depthLabel.position = CGPoint(x: origin.x + 38, y: origin.y + height / 2 + 1)
        zoneLabel.position = CGPoint(x: origin.x + 38, y: origin.y + 11)
        banner.position = CGPoint(x: 0, y: safe.maxY - safe.height * 0.26)
    }

    func setDepth(meters: Double) {
        let value: Int = Int(max(meters, 0).rounded())
        if value == shownDepth { return }
        shownDepth = value
        depthLabel.text = "\(value) M"
    }

    func setZone(name: String) {
        zoneLabel.attributedText = Theme.attributed(name, size: 12, weight: UIFont.Weight.semibold, color: Theme.lime.withAlphaComponent(0.9))
    }

    /// Annuncia la zona a centro schermo per un paio di secondi.
    func announce(zone name: String, range: String) {
        bannerTitle.attributedText = Theme.attributed(name, size: 26, weight: UIFont.Weight.heavy, color: Theme.lime)
        bannerDepth.attributedText = Theme.attributed(range, size: 14, weight: UIFont.Weight.semibold, color: Theme.ochre)
        banner.removeAllActions()
        banner.alpha = 0
        banner.run(SKAction.sequence([
            SKAction.fadeIn(withDuration: 0.35),
            SKAction.wait(forDuration: 2.0),
            SKAction.fadeOut(withDuration: 0.6)
        ]))
    }
}
