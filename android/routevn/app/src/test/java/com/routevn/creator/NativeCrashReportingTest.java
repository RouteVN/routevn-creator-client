package com.routevn.creator;

import static org.junit.Assert.*;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class NativeCrashReportingTest {
    @Test(timeout = 5000)
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

    @Test
    public void workerCreationFailureDoesNotEscapeOrInitializeSdk() {
        AtomicInteger initializationAttempts = new AtomicInteger();
        AtomicInteger threadAttempts = new AtomicInteger();
        NativeCrashReporting.start(initializationAttempts::incrementAndGet, task -> {
            threadAttempts.incrementAndGet();
            throw new SecurityException("worker creation denied");
        });
        assertEquals(0, initializationAttempts.get());
        assertEquals(1, threadAttempts.get());
    }

    @Test
    public void workerStartFailureDoesNotEscapeOrInitializeSdk() {
        AtomicInteger initializationAttempts = new AtomicInteger();
        AtomicInteger startAttempts = new AtomicInteger();
        NativeCrashReporting.start(initializationAttempts::incrementAndGet, task -> new Thread(task) {
            @Override
            public synchronized void start() {
                startAttempts.incrementAndGet();
                throw new SecurityException("worker start denied");
            }
        });
        assertEquals(0, initializationAttempts.get());
        assertEquals(1, startAttempts.get());
    }

    @Test
    public void fatalVmErrorIsNotSwallowed() throws Exception {
        OutOfMemoryError failure = new OutOfMemoryError("simulated fatal error");
        AtomicReference<Thread> worker = new AtomicReference<>();
        AtomicReference<Throwable> uncaught = new AtomicReference<>();
        NativeCrashReporting.start(() -> { throw failure; }, task -> {
            Thread thread = new Thread(task);
            thread.setUncaughtExceptionHandler((failedThread, error) -> uncaught.set(error));
            worker.set(thread);
            return thread;
        });
        worker.get().join(2000);
        assertFalse(worker.get().isAlive());
        assertSame(failure, uncaught.get());
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

    @Test
    public void webViewConfigScriptDefinesAFrozenConfig() throws Exception {
        String script = NativeCrashReporting.webViewConfigScript(
            "https://key@errors.example.com/1",
            "routevn-creator@1.0.0",
            "production",
            "100-direct",
            "11111111111111111111abcd"
        );

        String prefix =
            "Object.defineProperty(window, '__ROUTEVN_ERROR_REPORTING__', { value: Object.freeze(";
        String suffix = ") });";
        assertTrue(script.startsWith(prefix));
        assertTrue(script.endsWith(suffix));
        JSONObject config = new JSONObject(
            script.substring(prefix.length(), script.length() - suffix.length())
        );
        assertEquals("https://key@errors.example.com/1", config.getString("dsn"));
        assertEquals("routevn-creator@1.0.0", config.getString("release"));
        assertEquals("production", config.getString("environment"));
        assertEquals("100-direct", config.getString("dist"));
        assertEquals("11111111111111111111abcd", config.getString("deviceId"));
    }

    @Test
    public void webViewConfigScriptLeavesOutAMissingDeviceId() throws Exception {
        String script = NativeCrashReporting.webViewConfigScript(
            "https://key@errors.example.com/1",
            "routevn-creator@1.0.0",
            "production",
            "100-direct",
            null
        );

        assertFalse(script.contains("deviceId"));
    }
}
