import UIKit

@main
final class PlayerAppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: connectingSceneSession.role)
        configuration.delegateClass = PlayerSceneDelegate.self
        return configuration
    }
}

final class PlayerSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var player: PlayerViewController?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.backgroundColor = .black
        let player = PlayerViewController()
        window.rootViewController = player
        window.makeKeyAndVisible()
        self.window = window
        self.player = player
    }

    func sceneWillResignActive(_ scene: UIScene) {
        player?.setAppActive(false)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        player?.setAppActive(true)
    }
}
