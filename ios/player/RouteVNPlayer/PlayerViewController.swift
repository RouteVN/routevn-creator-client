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
        webView.load(URLRequest(url: Self.startURL))
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
        if active, reloadWhenActive {
            reloadWhenActive = false
            webView.load(URLRequest(url: Self.startURL))
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
    // Saves are in the database, so start the game again.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if appActive {
            webView.load(URLRequest(url: Self.startURL))
        } else {
            reloadWhenActive = true
        }
    }

    private func openExternal(_ url: URL) {
        guard url.scheme == "https" || url.scheme == "http" else { return }
        UIApplication.shared.open(url)
    }
}
