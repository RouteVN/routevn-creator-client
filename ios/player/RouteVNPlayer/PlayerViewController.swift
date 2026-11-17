import UIKit
import WebKit

// One full-screen web view running the web player. Its files come from the
// app bundle's `web` folder and the game from the encrypted package, both
// through PlayerSchemeHandler; saves go through PlayerBridge.
final class PlayerViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    static let scheme = "routevn-player"
    static let host = "game"
    private static let startURL = URL(string: "\(scheme)://\(host)/web/index.html")!

    private var webView: WKWebView!
    private var bridge: PlayerBridge!
    private var appActive = false
    private var reloadWhenActive = false
    private var messageLabel: UILabel?
    // Web content process loss (see webViewWebContentProcessDidTerminate):
    // when the game's page last started, whether the game has left the
    // foreground since, and how many losses in a row came soon after a start.
    private var gameStartedAt = DispatchTime.now()
    private var leftForegroundSinceGameStart = false
    private var rapidProcessLosses = 0

    // Two losses in a row within this long after a start, with the game in
    // the foreground the whole time, mean the game cannot run on this device,
    // so it stops restarting. Once the game leaves the foreground iOS may end
    // the process to free memory, which says nothing about the game.
    static let rapidLossInterval: TimeInterval = 30
    static let rapidLossLimit = 2

    static func isRapidProcessLoss(inForegroundSinceStart: Bool, sinceStart: TimeInterval) -> Bool {
        inForegroundSinceStart && sinceStart < rapidLossInterval
    }

    static func isPlayerURL(_ url: URL) -> Bool {
        url.scheme == scheme && url.host == host
    }

    override func loadView() {
        let view = UIView()
        view.backgroundColor = .black
        self.view = view
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let package = PlayerPackage.openBundled()
        if package == nil {
            // The web player's failed range request shows its startup error.
            NSLog("RouteVN player: the game package cannot be opened.")
        }

        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.setURLSchemeHandler(
            PlayerSchemeHandler(webRoot: Bundle.main.bundleURL.appendingPathComponent("web", isDirectory: true), package: package),
            forURLScheme: Self.scheme
        )
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = preferences

        let contentController = WKUserContentController()
        bridge = PlayerBridge(ready: {})
        contentController.addUserScript(WKUserScript(
            source: PlayerBridge.installScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        contentController.addScriptMessageHandler(bridge, contentWorld: .page, name: PlayerBridge.name)
        configuration.userContentController = contentController

        webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif
        view.addSubview(webView)
        startGame()
    }

    // Loads the game from its first page. Also restarts it after iOS ended
    // the web content process.
    private func startGame() {
        messageLabel?.removeFromSuperview()
        messageLabel = nil
        gameStartedAt = DispatchTime.now()
        leftForegroundSinceGameStart = false
        webView.load(URLRequest(url: Self.startURL))
    }

    private func showMessage(_ text: String) {
        messageLabel?.removeFromSuperview()
        let label = UILabel()
        label.text = text
        label.textColor = .white
        label.backgroundColor = .black
        label.font = .systemFont(ofSize: 18)
        label.textAlignment = .center
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        // Fills the screen, so the stopped game is covered, and keeps the
        // text clear of the screen edges.
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: view.topAnchor),
            label.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            label.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
        ])
        messageLabel = label
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(
            forName: PlayerBridge.name,
            contentWorld: .page
        )
        bridge?.close()
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    // Pauses the game's audio and timers while the app is in the background.
    func setAppActive(_ active: Bool) {
        appActive = active
        guard let webView else { return }
        if !active {
            leftForegroundSinceGameStart = true
        }
        if active, reloadWhenActive {
            reloadWhenActive = false
            startGame()
            return
        }
        if active {
            webView.setAllMediaPlaybackSuspended(false) { [weak self] in
                guard let self, self.appActive else { return }
                self.dispatchAppActiveState()
            }
        } else {
            dispatchAppActiveState()
            webView.setAllMediaPlaybackSuspended(true, completionHandler: nil)
        }
    }

    private func dispatchAppActiveState() {
        let value = appActive ? "true" : "false"
        webView.evaluateJavaScript(
            "window.routeVNAppActive = \(value); window.routeVNSetAppActive?.(\(value));"
        )
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        // A link to a new window goes on to createWebViewWith below.
        if Self.isPlayerURL(url) || navigationAction.targetFrame == nil {
            decisionHandler(.allow)
            return
        }
        if navigationAction.targetFrame?.isMainFrame == true {
            openExternal(url)
        }
        decisionHandler(.cancel)
    }

    // Links that open a new window, such as target="_blank", open in Safari.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            openExternal(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        dispatchAppActiveState()
    }

    // iOS can end the web content process, for example under memory pressure.
    // Saves are in the database, so start the game again: it returns to its
    // title screen. A game that keeps losing the process right after it
    // starts shows a message instead of restarting in a loop.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        let rapid = Self.isRapidProcessLoss(
            inForegroundSinceStart: !leftForegroundSinceGameStart,
            sinceStart: TimeInterval(DispatchTime.now().uptimeNanoseconds - gameStartedAt.uptimeNanoseconds) / 1_000_000_000
        )
        rapidProcessLosses = rapid ? rapidProcessLosses + 1 : 0
        if rapidProcessLosses >= Self.rapidLossLimit {
            showMessage("The game stopped and could not restart. Close other apps, then reopen the game.")
            // Coming back to the game starts it again.
            rapidProcessLosses = 0
            reloadWhenActive = true
            return
        }
        if appActive {
            startGame()
        } else {
            // A game restarted in the background would lose its process again.
            reloadWhenActive = true
        }
    }

    private func openExternal(_ url: URL) {
        guard url.scheme == "https" || url.scheme == "http" else { return }
        UIApplication.shared.open(url)
    }
}
