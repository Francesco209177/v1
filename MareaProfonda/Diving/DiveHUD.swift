import SpriteKit
import UIKit

/// Barra orizzontale piatta con riempimento, usata per Fiato, recupero e tensione della lenza.
final class MeterBar: SKNode {
    private let track: SKShapeNode = SKShapeNode()
    private let fill: SKSpriteNode = SKSpriteNode(color: Theme.turquoise, size: CGSize(width: 10, height: 10))
    private var barSize: CGSize = CGSize(width: 100, height: 12)
    private var value: CGFloat = 1

    override init() {
        super.init()
        track.fillColor = Theme.ink.withAlphaComponent(0.55)
        track.strokeColor = Theme.lime.withAlphaComponent(0.35)
        track.lineWidth = 1
        addChild(track)
        fill.anchorPoint = CGPoint(x: 0, y: 0.5)
        fill.zPosition = 1
        addChild(fill)
    }

    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }

    /// L'origine del nodo è il bordo sinistro, a metà altezza.
    func resize(_ size: CGSize) {
        barSize = size
        track.path = CGPath(roundedRect: CGRect(x: 0, y: -size.height / 2, width: size.width, height: size.height),
                            cornerWidth: size.height / 2, cornerHeight: size.height / 2, transform: nil)
        apply()
    }

    func set(value newValue: Double, color: SKColor) {
        value = CGFloat(MathUtil.clamp(newValue, 0, 1))
        fill.color = color
        apply()
    }

    private func apply() {
        let inset: CGFloat = 2
        fill.position = CGPoint(x: inset, y: 0)
        fill.size = CGSize(width: max(0, (barSize.width - inset * 2) * value), height: max(1, barSize.height - inset * 2))
    }
}

/// HUD dell'immersione: Fiato, profondità e zona, carico della sacca, suggerimento
/// dell'azione disponibile, barre del tiro alla lenza, annuncio delle zone.
final class DiveHUD: SKNode {
    // Riquadro in alto a sinistra
    private let panel: SKShapeNode = SKShapeNode()
    private let breathIcon: SKSpriteNode = SpriteForge.shared.node("icon_breath")
    private let breathBar: MeterBar = MeterBar()
    private let depthIcon: SKSpriteNode = SpriteForge.shared.node("icon_depth")
    private let depthLabel: PixelLabel = PixelLabel(text: "0 M", color: SKColor.white, alignment: PixelLabel.Alignment.left)
    private let zoneLabel: SKLabelNode = Theme.label("", size: 11, weight: UIFont.Weight.semibold, color: Theme.lime)
    private let weightIcon: SKSpriteNode = SpriteForge.shared.node("icon_weight")
    private let weightLabel: PixelLabel = PixelLabel(text: "0/10 KG", color: SKColor.white, alignment: PixelLabel.Alignment.left)

    // Annuncio della zona
    private let banner: SKNode = SKNode()
    private let bannerTitle: SKLabelNode = Theme.label("", size: 26, weight: UIFont.Weight.heavy, color: Theme.lime)
    private let bannerDepth: SKLabelNode = Theme.label("", size: 14, weight: UIFont.Weight.semibold, color: Theme.ochre)

    // Messaggi brevi a centro schermo
    private let toast: SKLabelNode = Theme.label("", size: 16, weight: UIFont.Weight.bold, color: Theme.lime)

    // Suggerimento dell'azione
    private let prompt: SKNode = SKNode()
    private let promptBody: SKShapeNode = SKShapeNode()
    private let promptIcon: SKSpriteNode = SpriteForge.shared.node("icon_hand")
    private let promptLabel: SKLabelNode = Theme.label("", size: 13, weight: UIFont.Weight.bold, color: Theme.ink)
    private var promptText: String = ""

    // Tiro alla lenza
    private let reel: SKNode = SKNode()
    private let reelPanel: SKShapeNode = SKShapeNode()
    private let reelProgress: MeterBar = MeterBar()
    private let reelTension: MeterBar = MeterBar()
    private let reelHint: PixelLabel = PixelLabel(text: "", color: SKColor.white, alignment: PixelLabel.Alignment.center)
    private let reelProgressLabel: SKLabelNode = Theme.label(String(localized: "Recupero"), size: 10, weight: UIFont.Weight.bold, color: Theme.lime)
    private let reelTensionLabel: SKLabelNode = Theme.label(String(localized: "Tensione"), size: 10, weight: UIFont.Weight.bold, color: Theme.lime)

    private var shownDepth: Int = -1
    private var shownWeight: String = ""
    private var blink: Double = 0
    private var unit: CGFloat = 1

    override init() {
        super.init()
        panel.fillColor = Theme.ink.withAlphaComponent(0.42)
        panel.strokeColor = SKColor.clear
        addChild(panel)
        for icon in [breathIcon, depthIcon, weightIcon] {
            icon.anchorPoint = CGPoint(x: 0.5, y: 0.5)
            icon.colorBlendFactor = 1
            icon.zPosition = 1
            addChild(icon)
        }
        breathIcon.color = Theme.turquoise
        depthIcon.color = Theme.ochre
        weightIcon.color = Theme.lime
        breathBar.zPosition = 1
        addChild(breathBar)
        depthLabel.zPosition = 1
        addChild(depthLabel)
        weightLabel.zPosition = 1
        addChild(weightLabel)
        zoneLabel.horizontalAlignmentMode = SKLabelHorizontalAlignmentMode.left
        zoneLabel.zPosition = 1
        addChild(zoneLabel)

        banner.alpha = 0
        banner.zPosition = 5
        banner.addChild(bannerTitle)
        bannerDepth.position = CGPoint(x: 0, y: -24)
        banner.addChild(bannerDepth)
        addChild(banner)

        toast.alpha = 0
        toast.zPosition = 6
        addChild(toast)

        prompt.isHidden = true
        prompt.zPosition = 4
        promptBody.fillColor = Theme.lime.withAlphaComponent(0.94)
        promptBody.strokeColor = SKColor.clear
        prompt.addChild(promptBody)
        promptIcon.anchorPoint = CGPoint(x: 0.5, y: 0.5)
        promptIcon.color = Theme.ink
        promptIcon.colorBlendFactor = 1
        promptIcon.zPosition = 1
        prompt.addChild(promptIcon)
        promptLabel.horizontalAlignmentMode = SKLabelHorizontalAlignmentMode.left
        promptLabel.zPosition = 1
        prompt.addChild(promptLabel)
        addChild(prompt)

        reel.isHidden = true
        reel.zPosition = 4
        reelPanel.fillColor = Theme.ink.withAlphaComponent(0.6)
        reelPanel.strokeColor = SKColor.clear
        reel.addChild(reelPanel)
        reelProgress.zPosition = 1
        reelTension.zPosition = 1
        reel.addChild(reelProgress)
        reel.addChild(reelTension)
        reelHint.zPosition = 1
        reelHint.shadowColor = SKColor(hex: 0x06142A)
        reel.addChild(reelHint)
        for label in [reelProgressLabel, reelTensionLabel] {
            label.horizontalAlignmentMode = SKLabelHorizontalAlignmentMode.right
            label.zPosition = 1
            reel.addChild(label)
        }
        addChild(reel)
    }

    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }

    func layout(safe: CGRect, pixelScale: CGFloat) {
        unit = pixelScale
        let width: CGFloat = 196
        let height: CGFloat = 70
        let origin: CGPoint = CGPoint(x: safe.minX, y: safe.maxY - height)
        panel.path = CGPath(roundedRect: CGRect(x: origin.x, y: origin.y, width: width, height: height),
                            cornerWidth: 14, cornerHeight: 14, transform: nil)
        // Fiato: la barra grande in alto.
        breathIcon.setScale(pixelScale * 2)
        breathIcon.position = CGPoint(x: origin.x + 20, y: origin.y + height - 20)
        breathBar.position = CGPoint(x: origin.x + 38, y: origin.y + height - 20)
        breathBar.resize(CGSize(width: width - 50, height: 16))
        // Profondità e zona, sotto.
        depthIcon.setScale(pixelScale)
        depthIcon.position = CGPoint(x: origin.x + 16, y: origin.y + 24)
        depthLabel.setScale(pixelScale * 2)
        depthLabel.position = CGPoint(x: origin.x + 28, y: origin.y + 18)
        zoneLabel.position = CGPoint(x: origin.x + 12, y: origin.y + 8)
        // Carico della sacca, a destra della profondità.
        weightIcon.setScale(pixelScale)
        weightIcon.position = CGPoint(x: origin.x + 104, y: origin.y + 24)
        weightLabel.setScale(pixelScale)
        weightLabel.position = CGPoint(x: origin.x + 116, y: origin.y + 20)

        banner.position = CGPoint(x: 0, y: safe.maxY - safe.height * 0.26)
        toast.position = CGPoint(x: 0, y: safe.maxY - safe.height * 0.42)

        // Tiro alla lenza: in basso al centro, fuori dalla zona dei pollici.
        let reelWidth: CGFloat = min(280, safe.width * 0.36)
        reel.position = CGPoint(x: 0, y: safe.minY + 46)
        reelPanel.path = CGPath(roundedRect: CGRect(x: -reelWidth / 2 - 74, y: -30, width: reelWidth + 88, height: 78),
                                cornerWidth: 14, cornerHeight: 14, transform: nil)
        reelProgress.position = CGPoint(x: -reelWidth / 2, y: 4)
        reelProgress.resize(CGSize(width: reelWidth, height: 12))
        reelTension.position = CGPoint(x: -reelWidth / 2, y: -16)
        reelTension.resize(CGSize(width: reelWidth, height: 12))
        reelProgressLabel.position = CGPoint(x: -reelWidth / 2 - 8, y: 4)
        reelTensionLabel.position = CGPoint(x: -reelWidth / 2 - 8, y: -16)
        reelHint.setScale(pixelScale * 2)
        reelHint.position = CGPoint(x: 0, y: 22)
        promptIcon.setScale(pixelScale)
        refreshPrompt()
    }

    // MARK: - Aggiornamento

    func update(breath ratio: Double, depthMeters: Double, weight: Double, maxWeight: Double, dt: Double) {
        blink += dt
        // Fiato: turchese, poi ocra, poi rosso lampeggiante sotto il 25%.
        var color: SKColor = Theme.turquoise
        if ratio < 0.25 {
            color = Int(blink * 5) % 2 == 0 ? Theme.danger : Theme.lime
        } else if ratio < 0.5 {
            color = Theme.ochre
        }
        breathBar.set(value: ratio, color: color)
        breathIcon.color = ratio < 0.25 ? Theme.danger : Theme.turquoise

        let depth: Int = Int(max(depthMeters, 0).rounded())
        if depth != shownDepth {
            shownDepth = depth
            depthLabel.text = "\(depth) M"
        }
        let text: String = String(format: "%.1f/%.0f KG", weight, maxWeight)
        if text != shownWeight {
            shownWeight = text
            weightLabel.text = text
            let over: Bool = weight > maxWeight
            weightLabel.color = over ? SKColor(hex: 0xFF8A80) : SKColor.white
            weightIcon.color = over ? Theme.danger : Theme.lime
        }
    }

    func setZone(name: String) {
        zoneLabel.attributedText = Theme.attributed(name, size: 11, weight: UIFont.Weight.semibold, color: Theme.lime.withAlphaComponent(0.9))
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

    /// Messaggio breve (lenza spezzata, pressione, Fiato basso...).
    func showToast(_ text: String, color: SKColor = Theme.lime) {
        toast.attributedText = Theme.attributed(text, size: 16, weight: UIFont.Weight.bold, color: color)
        toast.removeAllActions()
        toast.alpha = 0
        toast.run(SKAction.sequence([
            SKAction.fadeIn(withDuration: 0.12),
            SKAction.wait(forDuration: 1.4),
            SKAction.fadeOut(withDuration: 0.4)
        ]))
    }

    /// Suggerimento dell'azione disponibile, sopra Tecla. `text` nil lo nasconde.
    func setPrompt(_ text: String?, at point: CGPoint) {
        guard let text: String = text else {
            prompt.isHidden = true
            return
        }
        prompt.isHidden = false
        prompt.position = point
        if text != promptText {
            promptText = text
            refreshPrompt()
        }
    }

    private func refreshPrompt() {
        promptLabel.attributedText = Theme.attributed(promptText, size: 13, weight: UIFont.Weight.bold, color: Theme.ink)
        let textWidth: CGFloat = promptLabel.frame.width
        let width: CGFloat = textWidth + 44
        promptBody.path = CGPath(roundedRect: CGRect(x: -width / 2, y: -13, width: width, height: 26), cornerWidth: 13, cornerHeight: 13, transform: nil)
        promptIcon.position = CGPoint(x: -width / 2 + 16, y: 0)
        promptLabel.position = CGPoint(x: -width / 2 + 30, y: 0)
    }

    /// Barre del tiro alla lenza. `visible` false le nasconde.
    func setReel(visible: Bool, progress: Double, tension: Double, surging: Bool) {
        reel.isHidden = !visible
        if !visible { return }
        reelProgress.set(value: progress, color: Theme.turquoise)
        let tensionColor: SKColor = tension > 0.75 ? Theme.danger : (tension > 0.45 ? Theme.ochre : Theme.lime)
        reelTension.set(value: tension, color: tensionColor)
        if surging {
            reelHint.text = String(localized: "MOLLA!")
            reelHint.color = Int(blink * 8) % 2 == 0 ? SKColor(hex: 0xFF6B60) : SKColor.white
        } else {
            reelHint.text = String(localized: "TIENI PREMUTO")
            reelHint.color = SKColor.white
        }
    }
}
