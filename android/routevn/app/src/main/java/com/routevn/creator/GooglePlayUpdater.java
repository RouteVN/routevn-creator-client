package com.routevn.creator;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallException;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallErrorCode;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import org.json.JSONObject;

final class GooglePlayUpdater {
    private static final String PLAY_STORE = "com.android.vending";
    private final Activity activity;
    private final Consumer<JSONObject> notifyState;
    private final InstallStateUpdatedListener listener;
    private AppUpdateManager manager;
    private int versionCode;
    private boolean foreground;
    private boolean unavailable;

    GooglePlayUpdater(Activity activity, Consumer<JSONObject> notifyState) {
        this.activity = activity;
        this.notifyState = notifyState;
        listener = state -> {
            if (foreground) {
                notifyState.accept(result(installStatus(state.installStatus())));
            }
        };
    }

    @SuppressWarnings("deprecation")
    boolean isSupported() {
        if (!BuildConfig.GOOGLE_PLAY_UPDATES || unavailable) return false;
        try {
            PackageManager packages = activity.getPackageManager();
            if (!packages.getApplicationInfo(PLAY_STORE, 0).enabled) return false;
            // USB-installed debug builds can exercise the real Play API too.
            if (BuildConfig.DEBUG) return true;
            String installer = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? packages.getInstallSourceInfo(activity.getPackageName()).getInstallingPackageName()
                : packages.getInstallerPackageName(activity.getPackageName());
            return PLAY_STORE.equals(installer);
        } catch (PackageManager.NameNotFoundException | SecurityException error) {
            return false;
        }
    }

    private AppUpdateManager getManager() {
        if (manager == null) {
            manager = AppUpdateManagerFactory.create(activity);
            manager.registerListener(listener);
        }
        return manager;
    }

    private Task<AppUpdateInfo> getInfo() {
        return Tasks.withTimeout(getManager().getAppUpdateInfo(), 20, TimeUnit.SECONDS);
    }

    Task<JSONObject> handle(String method) {
        if (!isSupported()) return Tasks.forResult(result("unsupported"));
        if ("getAppUpdateSupport".equals(method)) {
            return Tasks.forResult(result("supported"));
        }
        Task<JSONObject> request = getInfo().onSuccessTask(info -> {
            versionCode = info.availableVersionCode();
            String status = status(info);
            if ("completeAppUpdate".equals(method)) {
                if (!foreground) return Tasks.forResult(result("cancelled"));
                if (!"downloaded".equals(status)) {
                    return Tasks.forException(new IllegalStateException("Update is not ready to install."));
                }
                return getManager().completeUpdate().onSuccessTask(ignored ->
                    Tasks.forResult(result("installing"))
                );
            }
            if ("startAppUpdate".equals(method) && "available".equals(status)) {
                if (!foreground) return Tasks.forResult(result("cancelled"));
                return getManager().startUpdateFlow(
                    info, activity, AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build()
                ).onSuccessTask(code -> {
                    if (code == Activity.RESULT_OK) return Tasks.forResult(result("downloading"));
                    if (code == Activity.RESULT_CANCELED) return Tasks.forResult(result("cancelled"));
                    return Tasks.forException(new IllegalStateException("Google Play could not start the update."));
                });
            }
            return Tasks.forResult(result(status));
        });
        return request.continueWith(task -> {
            if (task.isSuccessful()) return task.getResult();
            Exception error = task.getException();
            if (error instanceof InstallException installError) {
                int code = installError.getErrorCode();
                if (code == InstallErrorCode.ERROR_API_NOT_AVAILABLE ||
                    code == InstallErrorCode.ERROR_APP_NOT_OWNED ||
                    code == InstallErrorCode.ERROR_PLAY_STORE_NOT_FOUND) {
                    // Keep manual checks available while testing a debug installation.
                    if (BuildConfig.DEBUG) return result("unavailable");
                    unavailable = true;
                    return result("unsupported");
                }
            }
            throw error;
        });
    }

    private String status(AppUpdateInfo info) {
        String installing = installStatus(info.installStatus());
        if ("downloading".equals(installing) || "downloaded".equals(installing) ||
            "installing".equals(installing)) return installing;
        if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE) {
            return info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE) ? "available" : "not-allowed";
        }
        if (info.updateAvailability() == UpdateAvailability.UPDATE_NOT_AVAILABLE) return "up-to-date";
        return "unknown";
    }

    private String installStatus(int status) {
        return switch (status) {
            case InstallStatus.PENDING, InstallStatus.DOWNLOADING -> "downloading";
            case InstallStatus.DOWNLOADED -> "downloaded";
            case InstallStatus.INSTALLING -> "installing";
            case InstallStatus.FAILED -> "failed";
            default -> "idle";
        };
    }

    private JSONObject result(String status) {
        try {
            return new JSONObject().put("status", status).put("versionCode", versionCode);
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    void onResume() {
        foreground = true;
        // Recover an already downloaded update after returning from Play or restarting.
        if (manager != null && isSupported()) {
            getInfo().addOnSuccessListener(info -> {
                versionCode = info.availableVersionCode();
                if (foreground && info.installStatus() == InstallStatus.DOWNLOADED) {
                    notifyState.accept(result("downloaded"));
                }
            }).addOnFailureListener(error -> Log.d("RouteVNUpdater", "Could not recover update state", error));
        }
    }

    void onPause() {
        foreground = false;
    }

    void destroy() {
        foreground = false;
        if (manager != null) manager.unregisterListener(listener);
    }
}
