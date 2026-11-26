import SpriteKit
import UIKit

/// Finestra di pausa riusabile: velo scuro, titolo e due pulsanti.
final class PauseOverlay: SKNode {
    var onResume: (() -> Void)?
    var onSecondary: (() -> Void)?

    private let veil: SKSpriteNode = SKSpriteNode(color: Theme.ink, size: CGSize(width: 10, height: 10))
    private let title: PixelLabel = PixelLabel(text: "PAUSA", color: SKColor.white, alignment: PixelLabel.Alignment.center)
    private let resumeButton: PillButton
    private let secondaryButton: PillButton
    private var pressed: PillButton?

    init(secondaryTitle: String) {
        resumeButton = PillButton(text: String(localized: "Riprendi"), size: CGSize(width: 220, height: 48), fill: Theme.turquoise)
        secondaryButton = PillButton(text: secondaryTitle, size: CGSize(width: 220, height: 48), fill: Theme.lime)
        super.init()
        isHidden = true
        veil.alpha = 0.72
        addChild(veil)
        title.zPosition = 1
        addChild(title)
        resumeButton.zPosition = 1
        secondaryButton.zPosition = 1
        addChild(resumeButton)
        addChild(secondaryButton)
    }

    required init?(coder aDecoder: NSCoder) {
        return nil
    }

    func layout(sceneSize: CGSize, pixelScale: CGFloat) {
        veil.size = CGSize(width: sceneSize.width + 4, height: sceneSize.height + 4)
        title.setScale(pixelScale * 5)
        title.position = CGPoint(x: 0, y: sceneSize.height * 0.22)
        resumeButton.position = CGPoint(x: 0, y: 4)
        secondaryButton.position = CGPoint(x: 0, y: -58)
    }

    func touchBegan(at point: CGPoint) {
        if resumeButton.contains(point: point) {
            pressed = resumeButton
        } else if secondaryButton.contains(point: point) {
            pressed = secondaryButton
        }
        pressed?.setPressed(true)
    }

    func touchEnded(at point: CGPoint) {
        guard let button: PillButton = pressed else { return }
        pressed = nil
        button.setPressed(false)
        if !button.contains(point: point) { return }
        Feedback.tap()
        if button === resumeButton {
            onResume?()
        } else {
            onSecondary?()
        }
    }

    func cancelTouch() {
        pressed?.setPressed(false)
        pressed = nil
    }
}
