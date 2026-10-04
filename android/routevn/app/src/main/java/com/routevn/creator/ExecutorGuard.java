package com.routevn.creator;

import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

/**
 * Hands work to an executor that may already be shut down. The activity shuts
 * its executors down in onDestroy, but the main looper can still deliver a
 * WebView message that was posted just before. Calling execute then throws
 * RejectedExecutionException on the main thread, where nothing catches it and
 * the app crashes. Checking isShutdown first would still race with the
 * shutdown, so the rejection itself is the signal.
 */
final class ExecutorGuard {
    private ExecutorGuard() {}

    /** Runs {@code task} on {@code executor}; false when it no longer accepts work. */
    static boolean submit(Executor executor, Runnable task) {
        try {
            executor.execute(task);
            return true;
        } catch (RejectedExecutionException error) {
            return false;
        }
    }
}
