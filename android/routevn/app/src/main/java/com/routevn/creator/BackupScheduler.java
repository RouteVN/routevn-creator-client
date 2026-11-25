package com.routevn.creator;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.core.content.ContextCompat;
import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Decides when projects are backed up, runs every backup on one thread, and
 * keeps the status the page shows.
 *
 * It lives as long as the process, not the activity: a backup that started
 * keeps copying after the activity closes, inside {@link BackupService} when
 * the app has left the screen. Only database snapshots need the activity,
 * because it owns the project databases.
 *
 * Backups follow changes: a pass starts once edits have been quiet for
 * {@link #QUIET_MS}, at most {@link #MAX_WAIT_MS} after the first unsaved
 * change, and shortly after the app leaves the screen. Nothing runs before the
 * app reports that its first screen is ready.
 */
final class BackupScheduler {
    private static final String TAG = "RouteVNBackup";
    static final long QUIET_MS = 30_000;
    static final long MAX_WAIT_MS = 180_000;
    static final long HIDDEN_QUIET_MS = 2_000;
    static final long LEAVE_DELAY_MS = 1_500;
    // How long a service started on leaving waits for the page's last save.
    // Android 12+ shows the notification only after about 10 s.
    static final long LEAVE_GRACE_MS = 6_000;
    static final long STARTUP_DELAY_MS = 5_000;
    static final long RESUME_DELAY_MS = 5_000;
    static final long NEW_PROJECT_DELAY_MS = 3_000;
    static final long BUSY_RETRY_MS = 3_000;
    static final int BUSY_RETRIES = 5;
    static final long[] RETRY_MS = {15_000, 30_000, 60_000, 120_000, 300_000};
    static final long CHECK_INTERVAL_MS = 30 * 60_000;
    static final long PROGRESS_INTERVAL_MS = 250;
    // Failures of the destination itself: every other project would fail the same way.
    private static final Set<String> DESTINATION_ERRORS = new HashSet<>(java.util.Arrays.asList(
        "reconnect", "unknownSpace", "localFolder", "appFolder"));
    private static final Set<String> SHORT_RETRY_ERRORS = new HashSet<>(java.util.Arrays.asList(
        "busy", "changed", "interrupted"));

    /** The activity's access to project databases. Calls block until it answers. */
    interface Host extends ProjectBackup.Storage {}

    interface Listener {
        void statusChanged(String status);
    }

    interface Callback {
        void done(JSONObject result, Exception error);
    }

    interface Cancellable {
        void cancel();
    }

    interface Timer {
        long now();
        void execute(Runnable task);
        Cancellable schedule(Runnable task, long delayMs);
    }

    interface ServiceControl {
        void start();
        void stop();
        /**
         * Android 12+: the service cannot start once the app is in the
         * background, and its notification appears only after about 10 s.
         * Earlier versions allow later starts but show the notification at once.
         */
        boolean backgroundStartRestricted();
    }

    private static final class Entry {
        final String id;
        String name = "";
        boolean pending = true;
        String snapshotAt = "";
        String error = "";
        int failures;
        long retryAt;
        String folderPath = "";

        Entry(String id) { this.id = id; }
    }

    private static BackupScheduler instance;

    static synchronized BackupScheduler get(Context context) {
        if (instance == null) {
            Context application = context.getApplicationContext();
            instance = new BackupScheduler(application, executorTimer(), serviceControl(application));
        }
        return instance;
    }

    private final ProjectBackup engine;
    private final Timer timer;
    private final ServiceControl service;
    private volatile Host host;
    private volatile Listener listener;
    private volatile boolean visible;
    private volatile String status;
    // Lets the page drop a reply that arrives after a newer pushed update.
    private long statusVersion;
    private volatile boolean workPending;
    private volatile boolean running;

    private final Object changeLock = new Object();
    private final Set<String> changed = new LinkedHashSet<>();
    private long firstChangeAt;
    private long lastChangeAt;
    private final AtomicBoolean wakePosted = new AtomicBoolean();

    // Confined to the backup thread.
    private final Map<String, Entry> projects = new LinkedHashMap<>();
    private boolean seeded;
    private boolean ready;
    private long readyAt;
    private boolean checked;
    private long lastCheckAt;
    private boolean projectsStale = true;
    private boolean forceCheck;
    private long requestedAt;
    private long leaveAt;
    private long holdUntil;
    private int holdFailures;
    private JSONObject progress;
    private long lastProgressAt;
    private Cancellable wake;
    private long wakeAt;
    // When backup work is next due, ignoring the leave grace; 0 when none is.
    private long workAt;
    private boolean serviceStarted;
    private volatile boolean serviceRequested;
    // Set on the calling thread when the app leaves the screen: a pass still
    // running on the backup thread must not stop the service that leave needs.
    private volatile long graceUntil;
    // Orders starting and stopping the service between onPause and the backup thread.
    private final Object serviceLock = new Object();

    BackupScheduler(Context context, Timer timer, ServiceControl service) {
        this.timer = timer;
        this.service = service;
        this.engine = new ProjectBackup(context, new ProjectBackup.Storage() {
            public JSONArray projects() throws Exception { return requireHost().projects(); }
            public File root(String id) throws Exception { return requireHost().root(id); }
            public String name(String id) throws Exception { return requireHost().name(id); }
            public String counter(String id) throws Exception { return requireHost().counter(id); }
            public ProjectBackup.Captured snapshot(String id, File database) throws Exception {
                return requireHost().snapshot(id, database);
            }
        });
        // No pass can be running yet in this process, so staging is stale.
        timer.execute(() -> {
            engine.removeStaleStaging();
            seed();
        });
    }

    ProjectBackup engine() { return engine; }

    // ---- Calls from the activity and the bridge. None of them waits for a backup.

    void attach(Host host, Listener listener) {
        this.host = host;
        this.listener = listener;
        timer.execute(() -> {
            // A new page starts again; wait until it is ready before backing up.
            ready = false;
            projectsStale = true;
            publish();
            reschedule();
        });
    }

    void detach(Host host) {
        if (this.host != host) return;
        this.host = null;
        this.listener = null;
        timer.execute(this::reschedule);
    }

    /** The first screen is up. Backup work may start a few seconds later. */
    void appReady() {
        timer.execute(() -> {
            if (ready) return;
            ready = true;
            readyAt = timer.now();
            publish(); // The page can receive status updates now.
            reschedule();
        });
    }

    /**
     * Called from onPause/onResume. The page saves what it holds in memory only
     * after it hears that the app left, so the last edits usually arrive just
     * after this call. Android 12+ allows starting the foreground service only
     * now, while the activity is still visible: start it on every leave and
     * keep it a few seconds for that save, stopping before Android shows the
     * notification when nothing comes. Earlier versions start it here only when
     * a backup is due, and later when a hidden save makes one due.
     */
    void setVisible(boolean value) {
        synchronized (serviceLock) {
            visible = value;
            graceUntil = value ? 0 : timer.now() + LEAVE_GRACE_MS;
            if (!value && engine.configured() &&
                (running || workPending || hasChanges() || service.backgroundStartRestricted())) startService();
        }
        timer.execute(() -> {
            // The app came back or left again since: the call queued after this
            // one decides. A return that waited behind a long copy must not stop
            // the service the next leave started.
            if (value != visible) return;
            long now = timer.now();
            if (value) {
                leaveAt = 0;
                // The user may have freed space or reconnected storage meanwhile.
                for (Entry entry : projects.values()) {
                    if (entry.failures > 0) entry.retryAt = Math.min(entry.retryAt, now + RESUME_DELAY_MS);
                }
                if (holdUntil > now) holdUntil = Math.min(holdUntil, now + RESUME_DELAY_MS);
                synchronized (serviceLock) {
                    if (visible && !running) stopService();
                }
            } else if (running || workPending || hasChanges()) {
                leaveAt = now + LEAVE_DELAY_MS;
            }
            reschedule();
        });
    }

    /** A project's database or files changed. Cheap: called for every write. */
    void noteChange(String projectId) {
        long now = timer.now();
        synchronized (changeLock) {
            changed.add(projectId);
            lastChangeAt = now;
            if (firstChangeAt == 0) firstChangeAt = now;
        }
        if (wakePosted.compareAndSet(false, true)) {
            timer.execute(() -> {
                wakePosted.set(false);
                reschedule();
            });
        }
    }

    void markAssetChange(String projectId) throws Exception {
        engine.markAssetChange(projectId);
        noteChange(projectId);
    }

    long assetRevision(String projectId) { return engine.assetRevision(projectId); }

    void projectDeleted(String projectId) {
        timer.execute(() -> {
            synchronized (changeLock) { changed.remove(projectId); }
            projects.remove(projectId);
            try { engine.forget(projectId); } catch (Exception error) { Log.w(TAG, "Could not clear backup error", error); }
            publish();
            reschedule();
        });
    }

    /** "manual" backs up now and re-verifies; "newProject" picks up a new project. */
    void request(String projectId, String reason) {
        timer.execute(() -> {
            long now = timer.now();
            if ("newProject".equals(reason)) {
                projectsStale = true;
                requestedAt = requestedAt == 0 ? now + NEW_PROJECT_DELAY_MS : Math.min(requestedAt, now + NEW_PROJECT_DELAY_MS);
            } else {
                forceCheck = true;
                holdUntil = 0;
                holdFailures = 0;
                for (Entry entry : projects.values()) {
                    if (projectId == null || projectId.equals(entry.id)) entry.retryAt = 0;
                }
                requestedAt = now;
            }
            reschedule();
        });
    }

    void configure(String uri, boolean acceptExisting, Callback callback) {
        engine.cancel(); // Stop a running copy at its next chunk; the last good backup stays.
        timer.execute(() -> {
            engine.resume();
            JSONObject result;
            try {
                result = engine.configure(uri, acceptExisting);
            } catch (Exception error) {
                callback.done(null, error);
                reschedule();
                return;
            }
            if (result.optBoolean("needsExistingConfirmation")) {
                callback.done(result, null);
                reschedule();
                return;
            }
            resetProjectState();
            holdUntil = 0;
            holdFailures = 0;
            checked = false;
            forceCheck = true;
            projectsStale = true;
            requestedAt = timer.now();
            publish();
            callback.done(statusObject(), null);
            reschedule();
        });
    }

    void disable(Callback callback) {
        engine.cancel();
        timer.execute(() -> {
            engine.resume();
            try {
                engine.disable();
            } catch (Exception error) {
                callback.done(null, error);
                reschedule();
                return;
            }
            resetProjectState();
            checked = false;
            requestedAt = 0;
            leaveAt = 0;
            publish();
            stopService();
            callback.done(statusObject(), null);
            reschedule();
        });
    }

    /** The latest status. Reads memory only, so it never waits for backup work. */
    String status() {
        String current = status;
        if (current != null) return current;
        return "{\"configured\":false,\"loading\":true,\"running\":false,\"projects\":[]}";
    }

    void serviceStarted() {
        timer.execute(() -> {
            serviceStarted = true;
            updateService();
        });
    }

    // ---- Backup thread.

    private Host requireHost() throws ProjectBackup.Failure {
        Host current = host;
        if (current == null) throw new ProjectBackup.Failure("interrupted");
        return current;
    }

    private boolean hasChanges() {
        synchronized (changeLock) { return !changed.isEmpty(); }
    }

    // Shows what the device already knows before the first check: the last
    // backup times and errors saved on this device.
    private void seed() {
        if (seeded) return;
        seeded = true;
        Map<String, String> snapshots = engine.savedSnapshots();
        Map<String, String> errors = engine.savedErrors();
        Set<String> ids = new LinkedHashSet<>(snapshots.keySet());
        ids.addAll(errors.keySet());
        for (String id : ids) {
            Entry entry = new Entry(id);
            entry.snapshotAt = snapshots.getOrDefault(id, "");
            entry.error = errors.getOrDefault(id, "");
            entry.pending = !entry.error.isEmpty();
            // Counts failures in this run only: the page raises a dialog for a
            // new failure, not for one saved before the folder is checked again.
            entry.failures = 0;
            projects.put(id, entry);
        }
        publish();
    }

    private void resetProjectState() {
        for (Entry entry : projects.values()) {
            entry.pending = true;
            entry.error = "";
            entry.failures = 0;
            entry.retryAt = 0;
            entry.folderPath = "";
            try { entry.snapshotAt = engine.savedSnapshotAt(entry.id); }
            catch (Exception error) { entry.snapshotAt = ""; }
        }
    }

    // When the next pass may start, or Long.MAX_VALUE when no work is due.
    // The only place that decides it, for both scheduling and waking.
    private long nextWork() {
        if (!engine.configured() || host == null || running || !ready) return Long.MAX_VALUE;
        long next = Long.MAX_VALUE;
        if (!checked) next = Math.min(next, readyAt + STARTUP_DELAY_MS);
        if (leaveAt > 0) next = Math.min(next, leaveAt);
        synchronized (changeLock) {
            if (!changed.isEmpty()) {
                long quiet = visible ? QUIET_MS : HIDDEN_QUIET_MS;
                next = Math.min(next, Math.min(lastChangeAt + quiet, firstChangeAt + MAX_WAIT_MS));
            }
        }
        if (checked) {
            for (Entry entry : projects.values()) {
                if (entry.pending) next = Math.min(next, entry.retryAt);
            }
            if (visible) next = Math.min(next, lastCheckAt + CHECK_INTERVAL_MS);
        }
        // Let the first screen settle; only an explicit request is sooner.
        if (next != Long.MAX_VALUE) next = Math.max(next, readyAt + STARTUP_DELAY_MS);
        if (requestedAt > 0) next = Math.min(next, requestedAt);
        if (next != Long.MAX_VALUE) next = Math.max(next, holdUntil);
        return next;
    }

    private void reschedule() {
        long now = timer.now();
        long next = nextWork();
        workAt = next == Long.MAX_VALUE ? 0 : next;
        // Wake when the leave grace ends, so an idle service stops then.
        if (!visible && graceUntil > now) next = Math.min(next, graceUntil);
        if (next == Long.MAX_VALUE) {
            cancelWake();
        } else if (wake == null || next != wakeAt) {
            cancelWake();
            wakeAt = next;
            wake = timer.schedule(this::tick, Math.max(0, next - now));
        }
        updateService();
    }

    private void cancelWake() {
        if (wake != null) wake.cancel();
        wake = null;
        wakeAt = 0;
    }

    // Also wakes when the leave grace ends, which must not start a pass during
    // a hold, before the app is ready, or before the startup delay.
    private void tick() {
        wake = null;
        wakeAt = 0;
        if (nextWork() <= timer.now()) runPass();
        else reschedule();
    }

    private void runPass() {
        if (running || !engine.configured() || host == null) {
            reschedule();
            return;
        }
        long now = timer.now();
        running = true;
        requestedAt = 0;
        leaveAt = 0;
        progress = null;
        publish();
        Set<String> changedNow;
        synchronized (changeLock) {
            changedNow = new LinkedHashSet<>(changed);
            changed.clear();
            firstChangeAt = 0;
            lastChangeAt = 0;
        }
        List<ProjectBackup.Snapshot> snapshots = new ArrayList<>();
        boolean full = !checked || forceCheck || now - lastCheckAt >= CHECK_INTERVAL_MS;
        // Until each changed project is marked pending, the set taken above is
        // the only record of those changes.
        boolean marked = false;
        try {
            if (projectsStale || full || !projects.keySet().containsAll(changedNow)) refreshProjects();
            List<String> candidates = new ArrayList<>();
            for (Entry entry : projects.values()) {
                if (full || changedNow.contains(entry.id) || (entry.pending && entry.retryAt <= now)) candidates.add(entry.id);
            }
            List<String> pending = candidates.isEmpty() ? new ArrayList<>() : engine.pendingProjects(candidates);
            if (engine.isCancelled()) return;
            if (full) {
                checked = true;
                forceCheck = false;
                lastCheckAt = now;
            }
            List<String> due = new ArrayList<>();
            for (String id : candidates) {
                Entry entry = projects.get(id);
                if (entry == null) continue;
                entry.pending = pending.contains(id);
                entry.error = engine.error(id);
                if (entry.pending && entry.retryAt <= now) due.add(id);
                else if (!entry.pending) { entry.failures = 0; entry.retryAt = 0; }
            }
            marked = true;
            publish();
            // Stage every due database first. Each copy is small and quick, so
            // the latest work is captured even if the activity closes during
            // a long media copy afterwards.
            for (String id : due) {
                if (engine.isCancelled()) return;
                try { snapshots.add(engine.prepare(id)); }
                catch (Exception error) {
                    // Publish what is already staged, even if the activity closed.
                    if (failed(id, error)) break;
                }
            }
            boolean published = false;
            for (int index = 0; index < snapshots.size(); index++) {
                ProjectBackup.Snapshot snapshot = snapshots.get(index);
                if (engine.isCancelled()) return;
                Entry entry = projects.get(snapshot.projectId);
                setProgress(snapshot.projectId, entry == null ? "" : entry.name, 0, 0, true);
                try {
                    JSONObject metadata = engine.publish(snapshot, (done, total) ->
                        setProgress(snapshot.projectId, entry == null ? "" : entry.name, done, total, false));
                    succeeded(snapshot.projectId, metadata);
                    published = true;
                } catch (Exception error) {
                    if (failed(snapshot.projectId, error)) return;
                } finally {
                    snapshots.set(index, null);
                }
            }
            if (published || full) refreshFolderPaths();
        } catch (Exception error) {
            // Listing projects or reading counters failed: the activity is
            // closing or its storage is unavailable. Wait before trying again.
            if (!engine.isCancelled()) hold();
            Log.w(TAG, "Backup pass stopped", error);
        } finally {
            // A pass cancelled or failed before that point must not forget the
            // changes: put them back for the next pass.
            if (!marked && !changedNow.isEmpty()) {
                synchronized (changeLock) {
                    changed.addAll(changedNow);
                    if (firstChangeAt == 0) firstChangeAt = now;
                    lastChangeAt = Math.max(lastChangeAt, now);
                }
            }
            for (ProjectBackup.Snapshot snapshot : snapshots) engine.release(snapshot);
            running = false;
            progress = null;
            publish();
            reschedule();
        }
    }

    // Returns true when the rest of the pass should stop.
    private boolean failed(String id, Exception error) {
        if (engine.isCancelled()) return true;
        String code = ProjectBackup.errorCode(error);
        Entry entry = projects.get(id);
        if (entry == null) return false;
        entry.pending = true;
        entry.error = code;
        entry.failures++;
        entry.retryAt = timer.now() + retryDelay(code, entry.failures);
        Log.w(TAG, "Backup failed for a project: " + code);
        publish();
        if (DESTINATION_ERRORS.contains(code)) {
            hold();
            return true;
        }
        return "interrupted".equals(code) && host == null;
    }

    // A save in progress or a file deleted mid-copy clears up within seconds;
    // anything else backs off up to five minutes.
    static long retryDelay(String code, int failures) {
        boolean shortRetry = SHORT_RETRY_ERRORS.contains(code);
        if (shortRetry && failures <= BUSY_RETRIES) return BUSY_RETRY_MS;
        int step = shortRetry ? failures - BUSY_RETRIES - 1 : failures - 1;
        return RETRY_MS[Math.min(Math.max(0, step), RETRY_MS.length - 1)];
    }

    private void hold() {
        holdUntil = timer.now() + RETRY_MS[Math.min(holdFailures, RETRY_MS.length - 1)];
        holdFailures++;
    }

    private void succeeded(String id, JSONObject metadata) {
        Entry entry = projects.get(id);
        holdUntil = 0;
        holdFailures = 0;
        if (entry == null) return;
        entry.snapshotAt = metadata.optString("snapshotAt");
        entry.error = "";
        entry.failures = 0;
        entry.retryAt = 0;
        synchronized (changeLock) { entry.pending = changed.contains(id); }
        publish();
    }

    private void refreshProjects() throws Exception {
        JSONArray list = engine.configured() ? requireHost().projects() : new JSONArray();
        Map<String, Entry> next = new LinkedHashMap<>();
        for (int i = 0; i < list.length(); i++) {
            JSONObject project = list.getJSONObject(i);
            String id = project.getString("id");
            Entry entry = projects.get(id);
            if (entry == null) {
                entry = new Entry(id);
                entry.snapshotAt = engine.savedSnapshotAt(id);
                entry.error = engine.error(id);
            }
            entry.name = project.optString("name", "");
            next.put(id, entry);
        }
        projects.clear();
        projects.putAll(next);
        projectsStale = false;
        refreshFolderPaths();
    }

    private void refreshFolderPaths() {
        if (!engine.configured() || projects.isEmpty()) return;
        Map<String, android.net.Uri> folders;
        try { folders = engine.backupFolders(); }
        catch (Exception error) { return; } // Lost access is reported by the pass.
        for (Entry entry : projects.values()) entry.folderPath = engine.folderPath(folders, entry.id);
    }

    private void setProgress(String projectId, String name, int done, int total, boolean force) {
        long now = timer.now();
        if (!force && done != total && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
        lastProgressAt = now;
        try {
            progress = new JSONObject().put("projectId", projectId).put("name", name)
                .put("done", done).put("total", total);
        } catch (org.json.JSONException ignored) { }
        publish();
    }

    private JSONObject statusObject() {
        try { return new JSONObject(status()); }
        catch (org.json.JSONException error) { return new JSONObject(); }
    }

    private void publish() {
        try {
            JSONObject next = new JSONObject();
            boolean configured = engine.configured();
            next.put("version", ++statusVersion);
            next.put("configured", configured);
            next.put("loading", false);
            next.put("checked", checked);
            next.put("running", running);
            next.put("folder", new JSONObject().put("uri", engine.folderUri())
                .put("displayPath", engine.folderDisplayPath()));
            if (progress != null) next.put("progress", progress);
            JSONArray list = new JSONArray();
            boolean pending = false;
            long now = timer.now();
            for (Entry entry : projects.values()) {
                pending |= entry.pending && entry.retryAt <= now;
                list.put(new JSONObject().put("id", entry.id).put("name", entry.name)
                    .put("pending", configured && entry.pending)
                    .put("snapshotAt", configured ? entry.snapshotAt : "")
                    .put("error", configured ? entry.error : "")
                    .put("failures", configured ? entry.failures : 0)
                    .put("backupFolderPath", configured ? entry.folderPath : ""));
            }
            next.put("projects", list);
            workPending = configured && pending;
            status = next.toString();
        } catch (org.json.JSONException error) {
            Log.w(TAG, "Could not build backup status", error);
            return;
        }
        Listener current = listener;
        if (current != null) current.statusChanged(status);
    }

    // Keeps the foreground service only while the app is hidden and a backup
    // is running or about to run, or the leave grace has not ended.
    private void updateService() {
        synchronized (serviceLock) {
            long now = timer.now();
            boolean hidden = engine.configured() && !visible;
            boolean work = running || (workAt > 0 && workAt - now <= 10_000);
            if (!(hidden && (work || graceUntil > now)) && serviceStarted) stopService();
            // Before Android 12 the service may start from the background, for
            // example when an editor's save while hidden makes a backup due.
            if (hidden && work && !serviceRequested && !service.backgroundStartRestricted()) startService();
        }
    }

    private void startService() {
        synchronized (serviceLock) {
            try {
                service.start();
                serviceRequested = true;
            } catch (RuntimeException error) {
                // Android refused (for example, the app is already in the
                // background). The backup still runs while the process lives.
                Log.w(TAG, "Could not start the backup service", error);
            }
        }
    }

    private void stopService() {
        synchronized (serviceLock) {
            serviceStarted = false;
            serviceRequested = false;
            service.stop();
        }
    }

    private static Timer executorTimer() {
        ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "RouteVN backup");
            thread.setPriority(Thread.NORM_PRIORITY - 1);
            return thread;
        });
        return new Timer() {
            public long now() { return android.os.SystemClock.elapsedRealtime(); }
            public void execute(Runnable task) { executor.execute(guard(task)); }
            public Cancellable schedule(Runnable task, long delayMs) {
                ScheduledFuture<?> future = executor.schedule(guard(task), delayMs, TimeUnit.MILLISECONDS);
                return () -> future.cancel(false);
            }
        };
    }

    // An unexpected exception must not kill the only backup thread.
    private static Runnable guard(Runnable task) {
        return () -> {
            try { task.run(); }
            catch (RuntimeException error) { Log.e(TAG, "Backup task failed", error); }
        };
    }

    private static ServiceControl serviceControl(Context context) {
        Handler main = new Handler(Looper.getMainLooper());
        return new ServiceControl() {
            public void start() {
                ContextCompat.startForegroundService(context, new Intent(context, BackupService.class));
            }
            public void stop() {
                main.post(BackupService::stopRunning);
            }
            public boolean backgroundStartRestricted() {
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
            }
        };
    }
}
