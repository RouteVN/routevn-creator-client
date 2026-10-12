package com.routevn.creator;

import android.content.Context;
import android.util.Log;
import io.sentry.Sentry;
import io.sentry.android.core.SentryAndroid;
import java.util.concurrent.ThreadFactory;
import org.json.JSONException;
import org.json.JSONObject;

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

    /**
     * A script that gives the page's JavaScript error reporter the same
     * configuration as native crash reporting, set before any page script
     * runs, as the desktop app does. Null when this build does not report.
     */
    static String webViewConfigScript(Context context) {
        if (BuildConfig.SENTRY_DSN.isEmpty()) return null;
        return webViewConfigScript(
            BuildConfig.SENTRY_DSN,
            release(),
            BuildConfig.SENTRY_ENVIRONMENT,
            dist(),
            NativeDeviceIdReader.read(context)
        );
    }

    static String webViewConfigScript(
        String dsn,
        String release,
        String environment,
        String dist,
        String deviceId
    ) {
        JSONObject config = new JSONObject();
        try {
            config.put("dsn", dsn);
            config.put("release", release);
            config.put("environment", environment);
            config.put("dist", dist);
            if (deviceId != null) config.put("deviceId", deviceId);
        } catch (JSONException error) {
            return null;
        }
        return "Object.defineProperty(window, '__ROUTEVN_ERROR_REPORTING__', "
            + "{ value: Object.freeze(" + config + ") });";
    }

    private static String release() {
        return "routevn-creator@" + BuildConfig.VERSION_NAME;
    }

    // Each distribution runs R8 separately, so its symbols need their own dist.
    private static String dist() {
        return BuildConfig.VERSION_CODE + "-" + BuildConfig.UPDATE_DISTRIBUTION;
    }

    // The class alone identifies the failure; messages may contain the DSN.
    private static String describe(Throwable error) {
        return error.getClass().getName();
    }

    private static void initialize(Context context) {
        // Read the existing device ID before the SDK starts; it may be absent.
        String deviceId = NativeDeviceIdReader.read(context);
        SentryAndroid.init(context, options -> {
            options.setDsn(BuildConfig.SENTRY_DSN);
            options.setRelease(release());
            options.setDist(dist());
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

            options.setBeforeSend((event, hint) -> NativeCrashScrubber.scrub(event, deviceId));
        });
    }
}
