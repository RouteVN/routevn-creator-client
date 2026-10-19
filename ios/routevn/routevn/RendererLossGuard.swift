import Foundation

/**
 Decides when lost WebKit content processes mean the app's page cannot start,
 so the controller stops reloading it (see "WebView renderer loss" in
 docs/mobile-crash-reporting.md).

 A loss is rapid when the page started loading less than `rapidLossSeconds`
 earlier and the app has stayed active since. Once the app is no longer active,
 even briefly, the system may end the content process to reclaim memory, which
 says nothing about the page, so a later loss of that page is not rapid.
 `rapidLossLimit` rapid losses in a row mean the page cannot start; any other
 loss starts the count again.
 */
struct RendererLossGuard {
    static let rapidLossSeconds: TimeInterval = 30
    static let rapidLossLimit = 2

    private var pageLoadStartedAt: TimeInterval = 0
    private var activeSincePageLoad = false
    private var rapidLosses = 0

    /// A new page starts loading. Times are `ProcessInfo.systemUptime`.
    mutating func pageLoadStarted(at now: TimeInterval) {
        pageLoadStartedAt = now
        activeSincePageLoad = true
    }

    mutating func appLeftForeground() {
        activeSincePageLoad = false
    }

    /// Records a lost content process; true when the app should stop reloading.
    mutating func lossMeansPageCannotStart(at now: TimeInterval) -> Bool {
        let rapid = activeSincePageLoad && now - pageLoadStartedAt < Self.rapidLossSeconds
        rapidLosses = rapid ? rapidLosses + 1 : 0
        return rapidLosses >= Self.rapidLossLimit
    }
}
