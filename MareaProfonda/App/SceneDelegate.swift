import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var game: GameViewController?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene: UIWindowScene = scene as? UIWindowScene else { return }
        let controller: GameViewController = GameViewController()
        let newWindow: UIWindow = UIWindow(windowScene: windowScene)
        newWindow.rootViewController = controller
        newWindow.makeKeyAndVisible()
        window = newWindow
        game = controller
    }

    func sceneWillResignActive(_ scene: UIScene) {
        game?.applicationWillPause()
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        game?.applicationWillPause()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        game?.applicationDidResume()
    }
}
