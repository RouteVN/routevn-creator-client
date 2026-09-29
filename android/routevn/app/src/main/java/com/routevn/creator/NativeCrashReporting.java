package com.routevn.creator;

import android.content.Context;
import android.util.Log;
import io.sentry.Sentry;
import io.sentry.android.core.SentryAndroid;

/** Best-effort diagnostics must not delay or prevent the app from opening. */
final class NativeCrashReporting {
    private NativeCrashReporting() {}

    static void start(Context context) {
        if (BuildConfig.SENTRY_DSN.isEmpty()) return;
        start(() -> initialize(context));
    }

    static void start(Runnable initializeSdk) {
        // SDK startup may wait for cached crashes or native libraries. Never
        // run that work on the UI thread, and never retry a failed init here.
        Thread worker = new Thread(() -> {
            try {
                initializeSdk.run();
            } catch (RuntimeException | LinkageError error) {
                Log.w("RouteVN", "Crash reporting could not start; continuing without it.");
                try {
                    Sentry.close();
                } catch (RuntimeException | LinkageError cleanupError) {
                    Log.w("RouteVN", "Crash reporting cleanup failed.");
                }
            }
        }, "RouteVNCrashReporting");
        worker.setDaemon(true);
        worker.start();
    }

    private static void initialize(Context context) {
        SentryAndroid.init(context, options -> {
            options.setDsn(BuildConfig.SENTRY_DSN);
            options.setRelease("routevn-creator@" + BuildConfig.VERSION_NAME);
            options.setDist(String.valueOf(BuildConfig.VERSION_CODE));
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
            options.setFlushTimeoutMillis(1000);
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
