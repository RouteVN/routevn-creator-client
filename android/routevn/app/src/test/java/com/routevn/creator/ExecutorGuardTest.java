package com.routevn.creator;

import static org.junit.Assert.*;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class ExecutorGuardTest {
    @Test public void aRunningExecutorRunsTheTask() throws Exception {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            CountDownLatch ran = new CountDownLatch(1);
            assertTrue(ExecutorGuard.submit(executor, ran::countDown));
            assertTrue(ran.await(5, TimeUnit.SECONDS));
        } finally {
            executor.shutdownNow();
        }
    }

    // This is the crash in the field: onDestroy shuts the executor down, then a
    // WebView message that was already posted runs on the main thread.
    @Test public void executingAfterShutdownThrowsWithoutTheGuard() {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        executor.shutdown();
        assertThrows(RejectedExecutionException.class, () -> executor.execute(() -> {}));
    }

    @Test public void aShutDownExecutorRejectsWithoutThrowingAndNeverRunsTheTask() {
        AtomicInteger runs = new AtomicInteger();
        for (boolean immediately : new boolean[] { false, true }) {
            ExecutorService executor = Executors.newSingleThreadExecutor();
            if (immediately) {
                executor.shutdownNow();
            } else {
                executor.shutdown();
            }
            assertFalse(ExecutorGuard.submit(executor, runs::incrementAndGet));
        }
        assertEquals(0, runs.get());
    }

    @Test public void aFullQueueIsReportedTheSameWay() throws Exception {
        ThreadPoolExecutor executor = new ThreadPoolExecutor(
            1, 1, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(1)
        );
        CountDownLatch release = new CountDownLatch(1);
        try {
            CountDownLatch started = new CountDownLatch(1);
            assertTrue(ExecutorGuard.submit(executor, () -> {
                started.countDown();
                try {
                    release.await();
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
            }));
            assertTrue(started.await(5, TimeUnit.SECONDS));
            assertTrue(ExecutorGuard.submit(executor, () -> {}));
            assertFalse(ExecutorGuard.submit(executor, () -> {}));
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }
}
