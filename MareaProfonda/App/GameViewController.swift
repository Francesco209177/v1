import SpriteKit
import UIKit

/// Contenitore dell'intero gioco: una `SKView` a tutto schermo, solo orizzontale.
final class GameViewController: UIViewController {
    private let skView: SKView = SKView()
    private var started: Bool = false
    private var smoke: SmokeRunner?

    override func loadView() {
        view = skView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        skView.backgroundColor = UIColor(red: 0.03, green: 0.14, blue: 0.26, alpha: 1)
        skView.ignoresSiblingOrder = true
        skView.isMultipleTouchEnabled = true
        skView.shouldCullNonVisibleNodes = true
        skView.preferredFramesPerSecond = 120
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let size: CGSize = skView.bounds.size
        if !started && size.width > size.height && size.width > 10 {
            startGame()
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Se per qualche motivo la vista non risulta ancora orizzontale, si parte comunque.
        DispatchQueue.main.asyncAfter(deadline: DispatchTime.now() + 1.5) { [weak self] in
            guard let self = self, !self.started else { return }
            self.startGame()
        }
    }

    private func startGame() {
        started = true
        SpriteForge.shared.loadIfNeeded()
        ControllerSupport.shared.start()
        SceneRouter.shared.view = skView
        if SmokeTest.isActive {
            let runner: SmokeRunner = SmokeRunner(view: skView)
            smoke = runner
            runner.start()
            return
        }
        SceneRouter.shared.showTitle(animated: false)
    }

    // MARK: - Pausa e ripresa

    func applicationWillPause() {
        (skView.scene as? DiveScene)?.pauseForBackground()
        InputManager.shared.reset()
        skView.isPaused = true
    }

    func applicationDidResume() {
        skView.isPaused = false
    }

    // MARK: - Aspetto

    override var prefersStatusBarHidden: Bool { return true }
    override var prefersHomeIndicatorAutoHidden: Bool { return true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { return UIInterfaceOrientationMask.landscape }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { return UIRectEdge.all }
}
