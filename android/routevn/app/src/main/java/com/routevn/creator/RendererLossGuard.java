package com.routevn.creator;

/**
 * Decides when lost WebView renderers mean the app's page cannot start, so the
 * activity stops reloading it (see "WebView renderer loss" in
 * docs/mobile-crash-reporting.md).
 *
 * A loss is rapid when the page started loading less than RAPID_LOSS_MS
 * earlier and the app has stayed in the foreground since. Once the app leaves
 * the foreground, even briefly, the system may reclaim the renderer to free
 * memory, which says nothing about the page, so a later loss of that page is
 * not rapid. RAPID_LOSS_LIMIT rapid losses in a row mean the page cannot
 * start; any other loss starts the count again.
 */
final class RendererLossGuard {
    static final long RAPID_LOSS_MS = 30_000L;
    static final int RAPID_LOSS_LIMIT = 2;

    private long pageLoadStartedAt;
    private boolean inForegroundSincePageLoad = false;
    private int rapidLosses = 0;

    /** A new page starts loading. Times are SystemClock.elapsedRealtime(). */
    void pageLoadStarted(long now) {
        pageLoadStartedAt = now;
        inForegroundSincePageLoad = true;
    }

    void appLeftForeground() {
        inForegroundSincePageLoad = false;
    }

    /** Records a lost renderer; true when the app should stop reloading. */
    boolean lossMeansPageCannotStart(long now) {
        boolean rapid =
            inForegroundSincePageLoad && now - pageLoadStartedAt < RAPID_LOSS_MS;
        rapidLosses = rapid ? rapidLosses + 1 : 0;
        return rapidLosses >= RAPID_LOSS_LIMIT;
    }
}
