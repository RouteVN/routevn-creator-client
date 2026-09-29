package com.routevn.creator;

import android.app.Application;

public final class RouteVNApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        NativeCrashReporting.start(this);
    }
}
