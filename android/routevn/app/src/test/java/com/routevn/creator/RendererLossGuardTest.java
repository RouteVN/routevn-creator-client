package com.routevn.creator;

import static org.junit.Assert.*;

import org.junit.Test;

public class RendererLossGuardTest {
    private static final long SECOND = 1_000L;

    @Test public void aSingleRapidLossReloads() {
        RendererLossGuard guard = new RendererLossGuard();
        guard.pageLoadStarted(100 * SECOND);
        assertFalse(guard.lossMeansPageCannotStart(102 * SECOND));
    }

    // A page that cannot start, with the app in the foreground throughout.
    @Test public void twoRapidLossesInTheForegroundStopReloading() {
        RendererLossGuard guard = new RendererLossGuard();
        guard.pageLoadStarted(100 * SECOND);
        assertFalse(guard.lossMeansPageCannotStart(102 * SECOND));
        guard.pageLoadStarted(102 * SECOND);
        assertTrue(guard.lossMeansPageCannotStart(104 * SECOND));
    }

    // The crash in the field: on a phone short of memory, the system reclaims
    // the renderer each time the app goes to the background soon after the
    // page loads, and the page loads again when the app is resumed.
    @Test public void lossesAfterTheAppLeftTheForegroundNeverStopReloading() {
        RendererLossGuard guard = new RendererLossGuard();
        long now = 100 * SECOND;
        for (int i = 0; i < 5; i += 1) {
            guard.pageLoadStarted(now);
            guard.appLeftForeground();
            now += 5 * SECOND;
            assertFalse(guard.lossMeansPageCannotStart(now));
            now += 5 * SECOND;
        }
    }

    @Test public void aPageThatLeftTheForegroundStaysExcludedAfterItReturns() {
        RendererLossGuard guard = new RendererLossGuard();
        guard.pageLoadStarted(100 * SECOND);
        assertFalse(guard.lossMeansPageCannotStart(101 * SECOND));
        guard.pageLoadStarted(101 * SECOND);
        // A picker or permission prompt pauses the app, then it is resumed.
        guard.appLeftForeground();
        assertFalse(guard.lossMeansPageCannotStart(110 * SECOND));
    }

    @Test public void aLossAfterTheAppLeftTheForegroundBreaksTheRow() {
        RendererLossGuard guard = new RendererLossGuard();
        guard.pageLoadStarted(100 * SECOND);
        assertFalse(guard.lossMeansPageCannotStart(101 * SECOND));
        guard.pageLoadStarted(101 * SECOND);
        guard.appLeftForeground();
        assertFalse(guard.lossMeansPageCannotStart(102 * SECOND));
        guard.pageLoadStarted(200 * SECOND);
        assertFalse(guard.lossMeansPageCannotStart(201 * SECOND));
        guard.pageLoadStarted(201 * SECOND);
        assertTrue(guard.lossMeansPageCannotStart(202 * SECOND));
    }

    @Test public void aLossThirtySecondsAfterTheLoadIsNotRapidAndBreaksTheRow() {
        RendererLossGuard guard = new RendererLossGuard();
        guard.pageLoadStarted(100 * SECOND);
        assertFalse(guard.lossMeansPageCannotStart(101 * SECOND));
        guard.pageLoadStarted(101 * SECOND);
        assertFalse(guard.lossMeansPageCannotStart(
            101 * SECOND + RendererLossGuard.RAPID_LOSS_MS
        ));
        guard.pageLoadStarted(200 * SECOND);
        assertFalse(guard.lossMeansPageCannotStart(201 * SECOND));
    }

    @Test public void aLossBeforeAnyPageLoadIsNotRapid() {
        RendererLossGuard guard = new RendererLossGuard();
        assertFalse(guard.lossMeansPageCannotStart(1 * SECOND));
        guard.pageLoadStarted(2 * SECOND);
        assertFalse(guard.lossMeansPageCannotStart(3 * SECOND));
    }
}
