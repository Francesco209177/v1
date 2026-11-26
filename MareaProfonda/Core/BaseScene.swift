import SpriteKit
import UIKit

/// Scena di base: mondo in pixel d'arte a scala intera, HUD in punti a risoluzione nativa.
///
/// - `world` contiene tutto ciò che è pixel art; un'unità vale un pixel d'arte.
/// - `hud` è figlio della camera: un'unità vale un punto dello schermo, quindi testi
///   e forme dell'interfaccia restano nitidi su ogni iPhone.
class BaseScene: SKScene {
    let cam: SKCameraNode = SKCameraNode()
    let world: SKNode = SKNode()
    let hud: SKNode = SKNode()

    private(set) var layout: PixelLayout = PixelLayout(viewWidth: 844, viewHeight: 390, screenScale: 3)
    private(set) var safeInsets: UIEdgeInsets = UIEdgeInsets.zero
    private(set) var frameCount: Int = 0
    private(set) var elapsed: Double = 0
    private var lastUpdate: TimeInterval = 0
    private var didSetup: Bool = false

    override init(size: CGSize) {
        super.init(size: size)
        scaleMode = SKSceneScaleMode.resizeFill
    }

    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }

    /// Altezza visibile desiderata in pixel d'arte: le scene d'interni la riducono per avvicinare la camera.
    var targetArtHeight: Double { return PixelLayout.targetArtHeight }

    /// Riga di stato scritta nei log dalla prova automatica; le scene la arricchiscono.
    var debugSummary: String { return "" }

    // MARK: - Ciclo di vita

    override func didMove(to view: SKView) {
        super.didMove(to: view)
        if !didSetup {
            didSetup = true
            addChild(world)
            addChild(cam)
            camera = cam
            hud.zPosition = 1000
            cam.addChild(hud)
            refreshLayout()
            setup()
        } else {
            refreshLayout()
        }
        layoutHUD()
    }

    override func didChangeSize(_ oldSize: CGSize) {
        super.didChangeSize(oldSize)
        if !didSetup { return }
        refreshLayout()
        layoutHUD()
    }

    private func refreshLayout() {
        var scale: CGFloat = 3
        if let v: SKView = view {
            scale = v.window?.screen.scale ?? v.traitCollection.displayScale
            safeInsets = v.safeAreaInsets
        }
        if scale < 1 { scale = 1 }
        layout = PixelLayout(viewWidth: Double(size.width), viewHeight: Double(size.height), screenScale: Double(scale), targetArtHeight: targetArtHeight)
        cam.setScale(CGFloat(layout.cameraScale))
    }

    override func update(_ currentTime: TimeInterval) {
        var dt: Double = lastUpdate == 0 ? 1.0 / 60.0 : currentTime - lastUpdate
        lastUpdate = currentTime
        if dt > 1.0 / 20.0 { dt = 1.0 / 20.0 }
        if dt < 0 { dt = 0 }
        frameCount += 1
        elapsed += dt
        tick(dt)
    }

    // MARK: - Da ridefinire nelle sottoclassi

    /// Chiamata una sola volta, quando la scena entra nella vista.
    func setup() {}
    /// Avanzamento del gioco; `dt` è limitato a 1/20 di secondo.
    func tick(_ dt: Double) {}
    /// Riposiziona l'HUD: chiamata all'ingresso e a ogni cambio di dimensione.
    func layoutHUD() {}

    // MARK: - Misure utili

    /// Area visibile in pixel d'arte.
    var artSize: CGSize { return CGSize(width: layout.artWidth, height: layout.artHeight) }

    /// Rettangolo dell'HUD che rispetta la safe area, in punti, con origine al centro dello schermo.
    var hudSafeRect: CGRect {
        let left: CGFloat = -size.width / 2 + max(safeInsets.left, 12)
        let right: CGFloat = size.width / 2 - max(safeInsets.right, 12)
        let bottom: CGFloat = -size.height / 2 + max(safeInsets.bottom, 10)
        let top: CGFloat = size.height / 2 - max(safeInsets.top, 10)
        return CGRect(x: left, y: bottom, width: right - left, height: top - bottom)
    }

    /// Fattore con cui scalare un elemento in pixel art dentro l'HUD perché resti a scala intera.
    func hudPixelScale(_ multiple: Int = 1) -> CGFloat {
        return CGFloat(layout.pointsPerArtPixel) * CGFloat(max(multiple, 1))
    }

    /// Scala per le icone a pixel dell'HUD: circa `points` punti per pixel dell'icona, arrotondati
    /// a un numero intero di pixel fisici. Non dipende dallo zoom della scena.
    func hudIconScale(_ points: CGFloat) -> CGFloat {
        let s: CGFloat = CGFloat(layout.screenScale)
        return max(1, (points * s).rounded()) / s
    }

    /// Sposta la camera su un punto del mondo, allineandola ai pixel fisici.
    func setCamera(x: Double, y: Double) {
        cam.position = CGPoint(x: layout.snap(x), y: layout.snap(y))
    }
}
