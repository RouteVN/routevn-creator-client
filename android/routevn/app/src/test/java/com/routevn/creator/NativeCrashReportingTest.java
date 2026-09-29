package com.routevn.creator;

import static org.junit.Assert.*;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class NativeCrashReportingTest {
    @Test
    public void blockedReporterDoesNotBlockStartup() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicReference<Thread> worker = new AtomicReference<>();
        NativeCrashReporting.start(() -> {
            worker.set(Thread.currentThread());
            entered.countDown();
            try {
                release.await();
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
        });
        try {
            assertTrue(entered.await(2, TimeUnit.SECONDS));
            assertNotSame(Thread.currentThread(), worker.get());
            assertTrue(worker.get().isAlive());
        } finally {
            release.countDown();
            if (worker.get() != null) worker.get().join(2000);
        }
        assertFalse(worker.get().isAlive());
    }

    @Test
    public void invalidConfigurationDoesNotEscapeOrRetry() throws Exception {
        assertInitializationFailureContained(new IllegalArgumentException("invalid DSN"));
    }

    @Test
    public void missingNativeLibraryDoesNotEscapeOrRetry() throws Exception {
        assertInitializationFailureContained(new UnsatisfiedLinkError("missing library"));
    }

    private void assertInitializationFailureContained(Throwable failure) throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        AtomicReference<Thread> worker = new AtomicReference<>();
        AtomicReference<Throwable> uncaught = new AtomicReference<>();
        AtomicInteger attempts = new AtomicInteger();
        NativeCrashReporting.start(() -> {
            Thread current = Thread.currentThread();
            current.setUncaughtExceptionHandler((thread, error) -> uncaught.set(error));
            worker.set(current);
            attempts.incrementAndGet();
            entered.countDown();
            if (failure instanceof RuntimeException) throw (RuntimeException) failure;
            throw (LinkageError) failure;
        });
        assertTrue(entered.await(2, TimeUnit.SECONDS));
        worker.get().join(2000);
        assertFalse(worker.get().isAlive());
        assertNull(uncaught.get());
        assertEquals(1, attempts.get());
    }
}
