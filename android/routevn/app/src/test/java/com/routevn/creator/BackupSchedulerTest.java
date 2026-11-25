package com.routevn.creator;

import static org.junit.Assert.*;
import java.io.File;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.PriorityQueue;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33, manifest = Config.NONE, shadows = BackupFixture.CapacityShadow.class)
public class BackupSchedulerTest extends BackupFixture {
    /** Runs scheduled work on the test thread when the clock advances. */
    static final class FakeTimer implements BackupScheduler.Timer {
        static final class Task {
            long at;
            long order;
            Runnable run;
            boolean cancelled;
        }

        long now = 1_000_000;
        private long order;
        private final PriorityQueue<Task> queue = new PriorityQueue<>((a, b) ->
            a.at != b.at ? Long.compare(a.at, b.at) : Long.compare(a.order, b.order));

        public long now() { return now; }
        public void execute(Runnable task) { add(task, 0); }
        public BackupScheduler.Cancellable schedule(Runnable task, long delayMs) {
            Task added = add(task, delayMs);
            return () -> added.cancelled = true;
        }

        private Task add(Runnable run, long delayMs) {
            Task task = new Task();
            task.at = now + delayMs;
            task.order = order++;
            task.run = run;
            queue.add(task);
            return task;
        }

        void advance(long ms) {
            long target = now + ms;
            while (!queue.isEmpty() && queue.peek().at <= target) {
                Task task = queue.poll();
                if (task.cancelled) continue;
                now = Math.max(now, task.at);
                task.run.run();
            }
            now = target;
        }
    }

    static final class FakeService implements BackupScheduler.ServiceControl {
        int starts;
        int stops;
        boolean restricted = true; // Android 12+
        public void start() { starts++; }
        public void stop() { stops++; }
        public boolean backgroundStartRestricted() { return restricted; }
    }

    final class TestHost implements BackupScheduler.Host {
        int snapshots;
        int busy;
        Runnable duringSnapshot;
        Runnable duringCounter;
        public JSONArray projects() throws Exception { return storage.projects(); }
        public File root(String id) throws Exception { return storage.root(id); }
        public String name(String id) throws Exception { return storage.name(id); }
        public String counter(String id) throws Exception {
            if (duringCounter != null) duringCounter.run();
            return storage.counter(id);
        }
        public ProjectBackup.Captured snapshot(String id, File database) throws Exception {
            if (busy > 0) {
                busy--;
                throw new ProjectBackup.Failure("busy");
            }
            snapshots++;
            if (duringSnapshot != null) duringSnapshot.run();
            return storage.snapshot(id, database);
        }
    }

    FakeTimer timer;
    FakeService service;
    TestHost host;
    BackupScheduler scheduler;
    final List<String> statuses = new ArrayList<>();

    @Before public void createScheduler() {
        timer = new FakeTimer();
        service = new FakeService();
        host = new TestHost();
        scheduler = new BackupScheduler(context, timer, service);
        scheduler.attach(host, statuses::add);
        scheduler.setVisible(true);
        timer.advance(0);
    }

    private JSONObject status() throws Exception { return new JSONObject(scheduler.status()); }

    private JSONObject statusProject() throws Exception {
        return status().getJSONArray("projects").getJSONObject(0);
    }

    // Ready, then the startup check backs up the new project.
    private void start() throws Exception {
        scheduler.appReady();
        timer.advance(BackupScheduler.STARTUP_DELAY_MS);
        assertEquals(1, host.snapshots);
        assertFalse(statusProject().getString("snapshotAt").isEmpty());
    }

    @Test public void nothingRunsBeforeTheAppIsReady() throws Exception {
        scheduler.noteChange("one");
        timer.advance(10 * 60_000);
        assertEquals(0, host.snapshots);
        assertTrue(status().getBoolean("configured"));
        assertFalse(status().getBoolean("loading"));
        assertFalse(status().getBoolean("checked"));
        scheduler.appReady();
        timer.advance(BackupScheduler.STARTUP_DELAY_MS - 1);
        assertEquals(0, host.snapshots);
        timer.advance(1);
        assertEquals(1, host.snapshots);
        JSONObject project = statusProject();
        assertTrue(status().getBoolean("checked"));
        assertFalse(project.getBoolean("pending"));
        assertEquals("", project.getString("error"));
        assertTrue(project.getString("backupFolderPath").endsWith("Project One-one"));
        ProjectBackup.validateDatabase(output("project.db"), "one");
    }

    @Test public void statusBeforeTheFirstCheckShowsSavedBackupTimes() throws Exception {
        start();
        String snapshotAt = statusProject().getString("snapshotAt");
        BackupScheduler restarted = new BackupScheduler(context, timer, service);
        timer.advance(0);
        JSONObject project = new JSONObject(restarted.status()).getJSONArray("projects").getJSONObject(0);
        assertEquals("one", project.getString("id"));
        assertEquals(snapshotAt, project.getString("snapshotAt"));
    }

    @Test public void errorsSavedByAnEarlierRunAreShownButNotCountedAsNewFailures() throws Exception {
        host.busy = 1;
        scheduler.appReady();
        timer.advance(BackupScheduler.STARTUP_DELAY_MS);
        assertEquals(1, statusProject().getInt("failures"));
        BackupScheduler restarted = new BackupScheduler(context, timer, service);
        timer.advance(0);
        JSONObject project = new JSONObject(restarted.status()).getJSONArray("projects").getJSONObject(0);
        assertEquals("busy", project.getString("error"));
        assertTrue(project.getBoolean("pending"));
        assertEquals(0, project.getInt("failures"));
    }

    @Test public void changesAreBackedUpAfterAQuietPeriod() throws Exception {
        start();
        revision = "2:0";
        scheduler.noteChange("one");
        timer.advance(BackupScheduler.QUIET_MS - 1);
        assertEquals(1, host.snapshots);
        timer.advance(1);
        assertEquals(2, host.snapshots);
        assertEquals("2:0", new JSONObject(Files.readString(output("backup.json").toPath())).getString("changeCounter"));
        // An unchanged project is not copied again.
        scheduler.noteChange("one");
        timer.advance(BackupScheduler.QUIET_MS);
        assertEquals(2, host.snapshots);
    }

    @Test public void continuousEditingIsBackedUpWithinTheMaximumWait() throws Exception {
        start();
        long editingStarted = timer.now();
        for (int edit = 0; edit < 30 && host.snapshots == 1; edit++) {
            revision = (edit + 2) + ":0";
            scheduler.noteChange("one");
            timer.advance(10_000);
        }
        assertEquals(2, host.snapshots);
        assertTrue(timer.now() - editingStarted <= BackupScheduler.MAX_WAIT_MS + 10_000);
    }

    @Test public void aBusyProjectIsRetriedWithinSeconds() throws Exception {
        host.busy = 2;
        scheduler.appReady();
        timer.advance(BackupScheduler.STARTUP_DELAY_MS);
        assertEquals("busy", statusProject().getString("error"));
        timer.advance(BackupScheduler.BUSY_RETRY_MS);
        timer.advance(BackupScheduler.BUSY_RETRY_MS);
        assertEquals(1, host.snapshots);
        assertEquals("", statusProject().getString("error"));
        assertEquals(0, statusProject().getInt("failures"));
    }

    @Test public void failuresBackOffAndAManualRequestRetriesNow() throws Exception {
        start();
        revision = "2:0";
        provider.failRename = "project.db";
        scheduler.noteChange("one");
        timer.advance(BackupScheduler.QUIET_MS);
        assertEquals(2, host.snapshots);
        assertEquals(1, statusProject().getInt("failures"));
        timer.advance(BackupScheduler.RETRY_MS[0] - 1);
        assertEquals(2, host.snapshots);
        timer.advance(1);
        assertEquals(3, host.snapshots);
        assertEquals(2, statusProject().getInt("failures"));
        timer.advance(BackupScheduler.RETRY_MS[1] - 1);
        assertEquals(3, host.snapshots);
        provider.failRename = null;
        scheduler.request(null, "manual");
        timer.advance(0);
        assertEquals(4, host.snapshots);
        assertEquals(0, statusProject().getInt("failures"));
        assertFalse(statusProject().getBoolean("pending"));
    }

    @Test public void leavingTheAppBacksUpPendingChangesInTheForegroundService() throws Exception {
        start();
        revision = "2:0";
        scheduler.noteChange("one");
        timer.advance(5_000);
        scheduler.setVisible(false);
        assertEquals(1, service.starts);
        timer.advance(BackupScheduler.LEAVE_DELAY_MS);
        assertEquals(2, host.snapshots);
        scheduler.serviceStarted();
        timer.advance(BackupScheduler.LEAVE_GRACE_MS);
        assertTrue(service.stops > 0);
    }

    // Android 12+: the page's last save lands after onPause, when the service
    // could no longer start, so leaving always starts it for a short grace.
    @Test public void leavingStartsTheServiceBrieflyForThePagesLastSave() throws Exception {
        start();
        int stops = service.stops;
        scheduler.setVisible(false);
        assertEquals(1, service.starts);
        scheduler.serviceStarted();
        timer.advance(BackupScheduler.LEAVE_GRACE_MS - 1);
        assertEquals(stops, service.stops);
        timer.advance(1);
        assertEquals(stops + 1, service.stops);
        assertEquals(1, host.snapshots);
    }

    @Test public void editsSavedJustAfterLeavingAreBackedUpInsideTheService() throws Exception {
        start();
        int stops = service.stops;
        scheduler.setVisible(false);
        assertEquals(1, service.starts);
        scheduler.serviceStarted();
        timer.advance(500); // The page saves what it held in memory.
        revision = "2:0";
        scheduler.noteChange("one");
        timer.advance(BackupScheduler.HIDDEN_QUIET_MS);
        assertEquals(2, host.snapshots);
        assertEquals(stops, service.stops);
        timer.advance(BackupScheduler.LEAVE_GRACE_MS);
        assertEquals(stops + 1, service.stops);
    }

    @Test public void beforeAndroid12LeavingWithNothingDueStartsNoService() throws Exception {
        service.restricted = false;
        start();
        scheduler.setVisible(false);
        timer.advance(60_000);
        assertEquals(0, service.starts);
        assertEquals(1, host.snapshots);
    }

    @Test public void beforeAndroid12ASaveWhileHiddenStartsTheService() throws Exception {
        service.restricted = false;
        start();
        scheduler.setVisible(false);
        assertEquals(0, service.starts);
        revision = "2:0";
        scheduler.noteChange("one");
        timer.advance(0);
        assertEquals(1, service.starts);
        timer.advance(BackupScheduler.HIDDEN_QUIET_MS);
        assertEquals(2, host.snapshots);
    }

    @Test public void changesSurviveAPassCancelledBeforeItChecksThem() throws Exception {
        start();
        revision = "2:0";
        List<Exception> errors = new ArrayList<>();
        host.duringCounter = () -> {
            host.duringCounter = null;
            // A folder change that fails cancels the pass and changes nothing.
            scheduler.configure("content://" + BackupDocumentsProvider.AUTHORITY + "/tree/missing", false,
                (result, error) -> errors.add(error));
        };
        scheduler.noteChange("one");
        timer.advance(BackupScheduler.QUIET_MS);
        assertEquals(1, errors.size());
        assertNotNull(errors.get(0));
        assertEquals(1, host.snapshots);
        timer.advance(BackupScheduler.QUIET_MS);
        assertEquals(2, host.snapshots);
        assertFalse(statusProject().getBoolean("pending"));
    }

    @Test public void changingTheFolderCancelsTheRunningCopyAndStartsAgainThere() throws Exception {
        start();
        revision = "2:1";
        Files.writeString(new File(source, "files/new-asset").toPath(), "media");
        new File(destination, "Second").mkdirs();
        String second = selectFolder("/Second");
        List<JSONObject> results = new ArrayList<>();
        host.duringSnapshot = () -> {
            host.duringSnapshot = null;
            scheduler.configure(second, false, (result, error) -> {
                assertNull(error);
                results.add(result);
            });
        };
        scheduler.noteChange("one");
        timer.advance(BackupScheduler.QUIET_MS);
        assertEquals(1, results.size());
        assertTrue(results.get(0).getBoolean("configured"));
        // The cancelled pass recorded no error and left the old backup as it was.
        assertEquals("1:0", new JSONObject(Files.readString(output("backup.json").toPath())).getString("changeCounter"));
        timer.advance(0);
        ProjectBackup.validateDatabase(new File(destination, "Second/Project One-one/project.db"), "one");
        assertEquals("", statusProject().getString("error"));
        assertTrue(statusProject().getString("backupFolderPath").endsWith("Second/Project One-one"));
    }

    @Test public void stoppingBackupsForgetsStatusButKeepsFiles() throws Exception {
        start();
        List<JSONObject> results = new ArrayList<>();
        scheduler.disable((result, error) -> results.add(result));
        timer.advance(0);
        assertFalse(results.get(0).getBoolean("configured"));
        assertEquals("", statusProject().getString("snapshotAt"));
        ProjectBackup.validateDatabase(output("project.db"), "one");
        revision = "2:0";
        scheduler.noteChange("one");
        timer.advance(10 * 60_000);
        assertEquals(1, host.snapshots);
    }

    @Test public void statusReportsMediaCopyProgress() throws Exception {
        for (int i = 0; i < 3; i++) Files.writeString(new File(source, "files/media-" + i).toPath(), "media " + i);
        start();
        boolean sawProgress = false;
        for (String update : statuses) {
            JSONObject progress = new JSONObject(update).optJSONObject("progress");
            if (progress != null && progress.getInt("total") == 4 + 1) sawProgress = true;
        }
        assertTrue(sawProgress);
        assertFalse(status().has("progress"));
        assertFalse(status().getBoolean("running"));
    }

    @Test public void aDeletedProjectIsForgotten() throws Exception {
        start();
        scheduler.projectDeleted("one");
        timer.advance(0);
        assertEquals(0, status().getJSONArray("projects").length());
        ProjectBackup.validateDatabase(output("project.db"), "one");
    }

    @Test public void retryDelaysStayShortForBusyAndCapAtFiveMinutes() {
        assertEquals(BackupScheduler.BUSY_RETRY_MS, BackupScheduler.retryDelay("busy", 1));
        assertEquals(BackupScheduler.BUSY_RETRY_MS, BackupScheduler.retryDelay("changed", BackupScheduler.BUSY_RETRIES));
        assertEquals(BackupScheduler.RETRY_MS[0], BackupScheduler.retryDelay("busy", BackupScheduler.BUSY_RETRIES + 1));
        assertEquals(BackupScheduler.RETRY_MS[0], BackupScheduler.retryDelay("failed", 1));
        assertEquals(300_000, BackupScheduler.retryDelay("lowSpace", 50));
    }
}
