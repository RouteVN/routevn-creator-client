package com.routevn.creator;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.core.app.NotificationCompat;

/**
 * Keeps the process running while a backup finishes after the app leaves the
 * screen. {@link BackupScheduler} starts it from onPause, only when a backup is
 * running or due, and stops it when the work is done. Android 12 and later
 * show its notification only if it runs longer than about ten seconds.
 */
public final class BackupService extends Service {
    private static final String TAG = "RouteVNBackup";
    private static final String CHANNEL_ID = "project-backups";
    private static final int NOTIFICATION_ID = 3107;
    private static BackupService running;
    // The page sends localized text at startup. The service only starts while
    // the page runs in this process, so the text never needs to be saved.
    private static volatile String channelName = "Project backups";
    private static volatile String title = "Backing up projects";

    /** Keeps the localized notification text the page provides. */
    static void setCopy(String channel, String nextTitle) {
        if (channel != null && !channel.trim().isEmpty()) channelName = channel.trim();
        if (nextTitle != null && !nextTitle.trim().isEmpty()) title = nextTitle.trim();
    }

    /** Main thread. Stops the service once it has entered the foreground. */
    static void stopRunning() {
        if (running != null) running.stopSelf();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (RuntimeException error) {
            // Android may refuse once the app is in the background. The backup
            // still runs while the process lives.
            Log.w(TAG, "Backup service could not enter the foreground", error);
            stopSelf();
            return START_NOT_STICKY;
        }
        running = this;
        BackupScheduler.get(this).serviceStarted();
        return START_NOT_STICKY;
    }

    @Override
    public void onTimeout(int startId, int foregroundServiceType) {
        // Android 15 limits how long a data sync service may run each day.
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (running == this) running = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification buildNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                channelName, NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        PendingIntent content = PendingIntent.getActivity(this, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_backup)
            .setContentTitle(title)
            .setContentIntent(content)
            .setProgress(0, 0, true)
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }
}
