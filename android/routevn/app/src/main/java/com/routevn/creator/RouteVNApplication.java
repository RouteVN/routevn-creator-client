package com.routevn.creator;

import android.app.Application;
import io.sentry.android.core.SentryAndroid;

/**
 * Starts native crash reporting before any activity runs. Only uncaught JVM
 * exceptions and native signal crashes are reported; see
 * docs/mobile-crash-reporting.md.
 */
public final class RouteVNApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        if (BuildConfig.SENTRY_DSN.isEmpty()) return;

        SentryAndroid.init(this, options -> {
            options.setDsn(BuildConfig.SENTRY_DSN);
            options.setRelease("routevn-creator@" + BuildConfig.VERSION_NAME);
            options.setDist(String.valueOf(BuildConfig.VERSION_CODE));
            options.setEnvironment(BuildConfig.SENTRY_ENVIRONMENT);
            options.setSendDefaultPii(false);
            options.setSendClientReports(false);
            options.setSendModules(false);
            options.setAttachServerName(false);
            options.setMaxBreadcrumbs(0);

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
