package com.routevn.creator;

import android.content.Context;
import android.util.Log;
import io.sentry.Sentry;
import io.sentry.android.core.SentryAndroid;
import java.util.concurrent.ThreadFactory;

/** Best-effort diagnostics must not delay or prevent the app from opening. */
final class NativeCrashReporting {
    private NativeCrashReporting() {}

    static void start(Context context) {
        if (BuildConfig.SENTRY_DSN.isEmpty()) return;
        start(() -> initialize(context));
    }

    static void start(Runnable initializeSdk) {
        start(initializeSdk, task -> new Thread(task, "RouteVNCrashReporting"));
    }

    static void start(Runnable initializeSdk, ThreadFactory threads) {
        // SDK startup may wait for cached crashes or native libraries. Never
        // run that work on the UI thread, and never retry a failed init here.
        Runnable initialize = () -> {
            try {
                initializeSdk.run();
            } catch (RuntimeException | LinkageError error) {
                Log.w("RouteVN", "Crash reporting could not start (" + describe(error) + "); continuing without it.");
                try {
                    Sentry.close();
                } catch (RuntimeException | LinkageError cleanupError) {
                    Log.w("RouteVN", "Crash reporting cleanup failed (" + describe(cleanupError) + ").");
                }
            }
        };
        try {
            Thread worker = threads.newThread(initialize);
            worker.setDaemon(true);
            worker.start();
        } catch (RuntimeException | LinkageError error) {
            // No SDK has started, so there is nothing to close on the UI thread.
            Log.w("RouteVN", "Crash reporting worker could not start (" + describe(error) + "); continuing without it.");
        }
    }

    // The class alone identifies the failure; messages may contain the DSN.
    private static String describe(Throwable error) {
        return error.getClass().getName();
    }

    private static void initialize(Context context) {
        SentryAndroid.init(context, options -> {
            options.setDsn(BuildConfig.SENTRY_DSN);
            options.setRelease("routevn-creator@" + BuildConfig.VERSION_NAME);
            // Each distribution runs R8 separately, so its symbols need their own dist.
            options.setDist(BuildConfig.VERSION_CODE + "-" + BuildConfig.UPDATE_DISTRIBUTION);
            // Tags JVM crashes with the R8 mapping kept for this build.
            if (!BuildConfig.PROGUARD_UUID.isEmpty()) {
                options.setProguardUuid(BuildConfig.PROGUARD_UUID);
            }
            options.setEnvironment(BuildConfig.SENTRY_ENVIRONMENT);
            options.setSendDefaultPii(false);
            options.setSendClientReports(false);
            options.setSendModules(false);
            options.setAttachServerName(false);
            options.setMaxBreadcrumbs(0);
            options.setMaxCacheItems(10);
            options.setMaxQueueSize(10);
            options.setMaxAttachmentSize(0);
            options.setConnectionTimeoutMillis(5000);
            options.setReadTimeoutMillis(5000);
            // A crash is stored by the single transport thread, which may be
            // sending a cached report for up to 5s + 5s on a slow network.
            // Wait past that so the new crash is not dropped (SDK default).
            options.setFlushTimeoutMillis(15000);
            options.getLogs().setEnabled(false);
            options.getMetrics().setEnabled(false);

            // Crashes only: uncaught JVM exceptions and native signals.
            options.setEnableNdk(true);
            options.setEnableScopeSync(false);
            options.setEnableScopePersistence(false);
            options.setAnrEnabled(false);
            options.setEnableNdkAppHangTracking(false);
            options.setTombstoneEnabled(false);
            options.setEnableAutoSessionTracking(false);

            // No extra device data, attachments, breadcrumbs or tracing.
            options.setCollectAdditionalContext(false);
            options.setCollectExternalStorageContext(false);
            options.setEnableRootCheck(false);
            options.setAttachThreads(false);
            options.setAttachScreenshot(false);
            options.setAttachViewHierarchy(false);
            options.setEnableActivityLifecycleBreadcrumbs(false);
            options.setEnableAppLifecycleBreadcrumbs(false);
            options.setEnableAppComponentBreadcrumbs(false);
            options.setEnableSystemEventBreadcrumbs(false);
            options.setEnableNetworkEventBreadcrumbs(false);
            options.setEnableUserInteractionBreadcrumbs(false);
            options.setEnableAutoActivityLifecycleTracing(false);
            options.setEnableFramesTracking(false);

            options.setBeforeSend((event, hint) -> NativeCrashScrubber.scrub(event));
        });
    }
}
