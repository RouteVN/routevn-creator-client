package com.routevn.creator;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ProviderInfo;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.provider.DocumentsContract;
import java.io.File;
import java.nio.file.Files;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowContentResolver;
import org.robolectric.shadows.ShadowStatFs;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33, manifest = Config.NONE, shadows = BackupPublicationTest.CapacityShadow.class)
public class BackupPublicationTest {
    @org.robolectric.annotation.Implements(android.system.Os.class)
    public static class CapacityShadow {
        static long available = 10_000_000_000L;
        @org.robolectric.annotation.Implementation
        protected static int write(java.io.FileDescriptor fd, byte[] bytes, int offset, int count) throws java.io.IOException {
            new java.io.FileOutputStream(fd).write(bytes, offset, count);
            return count;
        }
        @org.robolectric.annotation.Implementation
        protected static void fsync(java.io.FileDescriptor fd) throws java.io.IOException { fd.sync(); }
        @org.robolectric.annotation.Implementation
        protected static android.system.StructStatVfs fstatvfs(java.io.FileDescriptor fd) {
            return new android.system.StructStatVfs(4096, 4096, available / 4096, available / 4096, available / 4096, 100000, 90000, 90000, 1, 0, 255);
        }
    }

    Context context;
    File source;
    File destination;
    BackupDocumentsProvider provider;
    ProjectBackup backup;
    ProjectBackup.Storage storage;
    String revision = "1:0";
    String projectName = "Project One";
    String revokedTreeId;

    private void requireAccessibleTree(Uri uri) {
        if (revokedTreeId != null && DocumentsContract.isTreeUri(uri) &&
            revokedTreeId.equals(DocumentsContract.getTreeDocumentId(uri))) {
            throw new SecurityException("Tree grant revoked");
        }
    }

    @Before public void setUp() throws Exception {
        CapacityShadow.available = 10_000_000_000L;
        context = RuntimeEnvironment.getApplication();
        source = new File(context.getFilesDir(), "source"); source.mkdirs();
        new File(source, "files").mkdirs(); new File(source, "file-metadata").mkdirs();
        Files.write(new File(source, "files/asset").toPath(), new byte[] {1,2,3});
        Files.writeString(new File(source, "file-metadata/asset.mime").toPath(), "image/png");
        try (SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(new File(source, "project.db"), null)) {
            db.execSQL("CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT)");
            db.execSQL("INSERT INTO app_state VALUES ('projectInfo', '{\"id\":\"one\",\"name\":\"Project One\"}')");
        }
        destination = new File(context.getFilesDir(), "destination"); destination.mkdirs();
        provider = new BackupDocumentsProvider(); provider.root = destination;
        ProviderInfo info = new ProviderInfo(); info.authority = BackupDocumentsProvider.AUTHORITY;
        info.exported = true; info.grantUriPermissions = true;
        info.readPermission = "android.permission.MANAGE_DOCUMENTS";
        info.writePermission = "android.permission.MANAGE_DOCUMENTS";
        provider.attachInfo(context, info);
        // Robolectric's legacy query overload does not route to the Bundle
        // overload used by modern DocumentsProvider. Adapt only the test resolver.
        android.content.ContentProvider adapter = new android.content.ContentProvider() {
            public boolean onCreate() { return true; }
            public android.database.Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
                requireAccessibleTree(uri);
                return provider.query(uri, projection, (android.os.Bundle) null, null);
            }
            public String getType(Uri uri) { return provider.getType(uri); }
            public Uri insert(Uri uri, android.content.ContentValues values) { throw new UnsupportedOperationException(); }
            public int update(Uri uri, android.content.ContentValues values, String where, String[] args) { throw new UnsupportedOperationException(); }
            public int delete(Uri uri, String where, String[] args) { throw new UnsupportedOperationException(); }
            public android.os.Bundle call(String method, String arg, android.os.Bundle extras) { return provider.call(method, arg, extras); }
            public android.os.ParcelFileDescriptor openFile(Uri uri, String mode) throws java.io.FileNotFoundException {
                requireAccessibleTree(uri);
                return provider.openFile(uri, mode);
            }
            public android.content.res.AssetFileDescriptor openAssetFile(Uri uri, String mode) throws java.io.FileNotFoundException {
                return new android.content.res.AssetFileDescriptor(openFile(uri, mode), 0, -1);
            }
        };
        adapter.attachInfo(context, info);
        ShadowContentResolver.registerProviderInternal(info.authority, adapter);
        Uri tree = DocumentsContract.buildTreeDocumentUri(info.authority, "primary:Documents");
        context.getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        context.getSharedPreferences("project-backup", 0).edit().clear().putString("uri", tree.toString()).commit();
        ShadowStatFs.registerStats(context.getFilesDir().getAbsolutePath(), 10000000, 9000000, 9000000);
        ShadowStatFs.registerStats(context.getNoBackupFilesDir().getAbsolutePath(), 10000000, 9000000, 9000000);
        storage = new ProjectBackup.Storage() {
            public JSONArray projects() throws Exception { return new JSONArray().put(new JSONObject().put("id", "one").put("name", projectName)); }
            public File root(String id) { return source; }
            public String name(String id) { return projectName; }
            public String counter(String id) { return revision; }
            public void snapshot(String id, File target) throws Exception {
                Files.copy(new File(source, "project.db").toPath(), new File(target, "project.db").toPath());
            }
        };
        backup = new ProjectBackup(context, storage);
    }
    @After public void tearDown() { backup.close(); backup.cleanupAfterClose(); }
    private File output(String name) { return new File(destination, "Project One-one/" + name); }
    private void publish() throws Exception { backup.prepare("one"); backup.publish("one"); }
    @Test public void disablingPersistsAndPreservesExistingBackupFiles() throws Exception {
        publish();
        String databaseHash = backup.hash(output("project.db"));
        String metadata = Files.readString(output("backup.json").toPath());
        backup.markAssetChange("one");
        JSONObject disabled = backup.disable();
        assertFalse(disabled.getBoolean("configured"));
        assertEquals("", disabled.getJSONArray("projects").getJSONObject(0).getString("snapshotAt"));
        assertEquals("", disabled.getJSONArray("projects").getJSONObject(0).getString("backupFolderPath"));
        assertEquals(1L, backup.assetRevision("one"));
        backup.close(); backup.cleanupAfterClose();
        backup = new ProjectBackup(context, storage);
        assertFalse(backup.status().getBoolean("configured"));
        assertFalse(backup.beginPass(false).getBoolean("due"));
        assertFalse(backup.beginPass(true).getBoolean("due"));
        assertEquals(databaseHash, backup.hash(output("project.db")));
        assertEquals(metadata, Files.readString(output("backup.json").toPath()));
        assertArrayEquals(new byte[] {1,2,3}, Files.readAllBytes(output("files/asset").toPath()));
        assertEquals("image/png", Files.readString(output("file-metadata/asset.mime").toPath()));
        new File(destination, "Enabled Again").mkdirs();
        assertTrue(backup.configure(selectFolder("/Enabled Again"), false).getBoolean("configured"));
        assertTrue(backup.beginPass(false).getBoolean("due"));
    }

    @Test public void disablingCannotDiscardAnUnpublishedSnapshot() throws Exception {
        backup.prepare("one");
        try { backup.disable(); fail("disabled while prepared"); }
        catch (ProjectBackup.Failure error) { assertEquals("busy", error.code); }
        assertTrue(backup.status().getBoolean("configured"));
        backup.publish("one");
        assertFalse(backup.disable().getBoolean("configured"));
        ProjectBackup.validateDatabase(output("project.db"), "one");
    }
    private String selectFolder(String suffix) {
        Uri tree = DocumentsContract.buildTreeDocumentUri(BackupDocumentsProvider.AUTHORITY, "primary:Documents" + suffix);
        context.getContentResolver().takePersistableUriPermission(tree,
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        return tree.toString();
    }
    @Test public void createsBackupSubfolderWithoutTreatingParentFilesAsOldBackups() throws Exception {
        Files.writeString(new File(destination, "unrelated.txt").toPath(), "keep");
        JSONObject result = backup.configure(selectFolder(""), false);
        assertTrue(result.getBoolean("configured"));
        assertFalse(result.optBoolean("needsExistingConfirmation"));
        assertTrue(result.getJSONObject("folder").getString("displayPath").endsWith("/RouteVN Backups"));
        publish();
        ProjectBackup.validateDatabase(new File(destination, "RouteVN Backups/Project One-one/project.db"), "one");
        assertFalse(output("project.db").exists());
        assertEquals("keep", Files.readString(new File(destination, "unrelated.txt").toPath()));
    }
    @Test public void selectingBackupSubfolderDirectlyKeepsMappingsAndDoesNotNest() throws Exception {
        backup.configure(selectFolder(""), false);
        publish();
        JSONObject result = backup.configure(selectFolder("/RouteVN Backups"), false);
        assertFalse(result.optBoolean("needsExistingConfirmation"));
        assertFalse(new File(destination, "RouteVN Backups/RouteVN Backups").exists());
        assertEquals(0, backup.pendingProjects().getJSONArray("projectIds").length());
    }
    @Test public void reconnectingWithDirectGrantRebindsProjectUrisAndKeepsCheckpoints() throws Exception {
        String originalTree = selectFolder("");
        backup.configure(originalTree, false);
        publish();
        android.content.SharedPreferences preferences = context.getSharedPreferences("project-backup", 0);
        String checkpoint = preferences.getString("success:one", "");
        String originalDocumentId = DocumentsContract.getDocumentId(Uri.parse(preferences.getString("folder:one", "")));
        context.getContentResolver().releasePersistableUriPermission(Uri.parse(originalTree),
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        revokedTreeId = "primary:Documents";
        assertEquals(1, backup.pendingProjects().getJSONArray("projectIds").length());
        assertEquals("reconnect", preferences.getString("error:one", ""));

        String renewedTree = selectFolder("/RouteVN Backups");
        JSONObject configured = backup.configure(renewedTree, false);
        assertFalse(configured.optBoolean("needsExistingConfirmation"));
        Uri rebound = Uri.parse(preferences.getString("folder:one", ""));
        assertEquals(originalDocumentId, DocumentsContract.getDocumentId(rebound));
        assertEquals("primary:Documents/RouteVN Backups", DocumentsContract.getTreeDocumentId(rebound));
        assertEquals(checkpoint, preferences.getString("success:one", ""));
        backup.close(); backup.cleanupAfterClose();
        backup = new ProjectBackup(context, storage);
        assertEquals(rebound.toString(), preferences.getString("folder:one", ""));
        revision = "2:0";
        publish();
        assertEquals(0, backup.pendingProjects().getJSONArray("projectIds").length());
        assertEquals("", preferences.getString("error:one", ""));
        assertFalse(new File(destination, "RouteVN Backups/RouteVN Backups").exists());
    }

    @Test public void closeReturnsWhilePreparationIsBlockedAndCleanupReleasesItsLock() throws Exception {
        publish();
        String previousHash = backup.hash(output("project.db"));
        backup.close(); backup.cleanupAfterClose();
        java.util.concurrent.CountDownLatch snapshotStarted = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch releaseSnapshot = new java.util.concurrent.CountDownLatch(1);
        ProjectBackup.Storage slowStorage = new ProjectBackup.Storage() {
            public JSONArray projects() throws Exception { return storage.projects(); }
            public File root(String id) throws Exception { return storage.root(id); }
            public String name(String id) throws Exception { return storage.name(id); }
            public String counter(String id) throws Exception { return storage.counter(id); }
            public void snapshot(String id, File target) throws Exception {
                storage.snapshot(id, target);
                snapshotStarted.countDown();
                assertTrue(releaseSnapshot.await(5, java.util.concurrent.TimeUnit.SECONDS));
            }
        };
        backup = new ProjectBackup(context, slowStorage);
        ProjectBackup closing = backup;
        java.util.concurrent.ExecutorService worker = java.util.concurrent.Executors.newSingleThreadExecutor();
        java.util.concurrent.ExecutorService lifecycle = java.util.concurrent.Executors.newSingleThreadExecutor();
        try {
            java.util.concurrent.Future<String> preparation = worker.submit(() -> {
                try { closing.prepare("one"); return "unexpected success"; }
                catch (ProjectBackup.Failure error) { return error.code; }
            });
            assertTrue(snapshotStarted.await(3, java.util.concurrent.TimeUnit.SECONDS));
            // Simulates onDestroy while prepare holds its monitor and staged files.
            lifecycle.submit(() -> closing.close()).get(1, java.util.concurrent.TimeUnit.SECONDS);
            java.util.concurrent.Future<?> cleanup = worker.submit(() -> closing.cleanupAfterClose());
            assertFalse(cleanup.isDone());
            assertTrue(new File(context.getNoBackupFilesDir(), "project-backup-staging/project.db").exists());
            releaseSnapshot.countDown();
            assertEquals("interrupted", preparation.get(3, java.util.concurrent.TimeUnit.SECONDS));
            cleanup.get(3, java.util.concurrent.TimeUnit.SECONDS);
            assertFalse(new File(context.getNoBackupFilesDir(), "project-backup-staging").exists());
            backup = new ProjectBackup(context, storage);
            assertEquals(previousHash, backup.hash(output("project.db")));
            publish(); // The previous Activity must not strand or over-release the lock.
            assertEquals(0, backup.pendingProjects().getJSONArray("projectIds").length());
        } finally {
            releaseSnapshot.countDown();
            worker.shutdown();
            lifecycle.shutdown();
            assertTrue(worker.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS));
            assertTrue(lifecycle.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS));
            closing.cleanupAfterClose();
        }
    }

    @Test public void closeCancelsHashingAtTheNextChunk() throws Exception {
        java.io.InputStream input = new java.io.ByteArrayInputStream(new byte[256 * 1024]) {
            @Override public synchronized int read(byte[] bytes, int offset, int length) {
                int count = super.read(bytes, offset, length);
                backup.close();
                return count;
            }
        };
        java.lang.reflect.Method hash = ProjectBackup.class.getDeclaredMethod("hash", java.io.InputStream.class);
        hash.setAccessible(true);
        try { hash.invoke(backup, input); fail("hash ignored cancellation"); }
        catch (java.lang.reflect.InvocationTargetException error) {
            assertTrue(error.getCause() instanceof ProjectBackup.Failure);
            assertEquals("interrupted", ((ProjectBackup.Failure) error.getCause()).code);
        }
    }

    @Test public void cleanupReleasesPreparedSnapshotWhenPublicationNeverStarts() throws Exception {
        backup.prepare("one");
        backup.close();
        backup.cleanupAfterClose();
        backup.cleanupAfterClose(); // Idempotent; do not over-release the semaphore.
        assertFalse(new File(context.getNoBackupFilesDir(), "project-backup-staging").exists());
        backup = new ProjectBackup(context, storage);
        publish();
        ProjectBackup.validateDatabase(output("project.db"), "one");
    }
    @Test public void existingBackupSubfolderRequiresConfirmationAndPreservesFiles() throws Exception {
        File folder = new File(destination, "RouteVN Backups"); folder.mkdir();
        File existing = new File(folder, "old-backup.txt"); Files.writeString(existing.toPath(), "keep");
        String selected = selectFolder("");
        assertTrue(backup.configure(selected, false).getBoolean("needsExistingConfirmation"));
        assertFalse(context.getSharedPreferences("project-backup", 0).contains("directory"));
        assertTrue(backup.configure(selected, true).getBoolean("configured"));
        publish();
        assertEquals("keep", Files.readString(existing.toPath()));
    }
    @Test public void conflictingBackupFilenamePreservesPreviousConfiguration() throws Exception {
        publish();
        File conflict = new File(destination, "RouteVN Backups"); Files.writeString(conflict.toPath(), "keep");
        try { backup.configure(selectFolder(""), true); fail("accepted file as backup directory"); }
        catch (ProjectBackup.Failure error) { assertEquals("nameConflict", error.code); }
        assertFalse(context.getSharedPreferences("project-backup", 0).contains("directory"));
        assertEquals("keep", Files.readString(conflict.toPath()));
        assertEquals(0, backup.pendingProjects().getJSONArray("projectIds").length());
    }
    @Test public void changingDestinationLeavesOldBackupsUntouchedAndStartsFresh() throws Exception {
        publish();
        String previousDatabase = backup.hash(output("project.db"));
        String previousMetadata = Files.readString(output("backup.json").toPath());
        File selected = new File(destination, "new-location"); selected.mkdir();
        backup.configure(selectFolder("/new-location"), false);
        assertEquals(1, backup.pendingProjects().getJSONArray("projectIds").length());
        publish();
        ProjectBackup.validateDatabase(new File(selected, "Project One-one/project.db"), "one");
        assertFalse(new File(selected, "RouteVN Backups").exists());
        assertEquals(previousDatabase, backup.hash(output("project.db")));
        assertEquals(previousMetadata, Files.readString(output("backup.json").toPath()));
        assertArrayEquals(new byte[] {1,2,3}, Files.readAllBytes(output("files/asset").toPath()));
    }
    @Test public void reEnablingSameDestinationReclaimsFolderAndRepublishes() throws Exception {
        backup.configure(selectFolder(""), false);
        publish();
        backup.disable();
        assertTrue(backup.configure(selectFolder(""), true).getBoolean("configured"));
        // Reclaiming never trusts the old checkpoint; the next pass re-verifies it.
        JSONObject project = backup.status().getJSONArray("projects").getJSONObject(0);
        assertEquals("", project.getString("snapshotAt"));
        assertEquals(1, backup.pendingProjects().getJSONArray("projectIds").length());
        publish();
        project = backup.status().getJSONArray("projects").getJSONObject(0);
        assertTrue(project.getString("backupFolderPath").endsWith("RouteVN Backups/Project One-one"));
        assertEquals(0, backup.pendingProjects().getJSONArray("projectIds").length());
        ProjectBackup.validateDatabase(new File(destination, "RouteVN Backups/Project One-one/project.db"), "one");
        assertEquals(1, new File(destination, "RouteVN Backups").list().length);
    }
    @Test public void switchingBackToPreviousDestinationReclaimsItsBackups() throws Exception {
        backup.configure(selectFolder(""), false);
        publish();
        File secondLocation = new File(destination, "new-location"); secondLocation.mkdirs();
        backup.configure(selectFolder("/new-location"), false);
        assertEquals(1, backup.pendingProjects().getJSONArray("projectIds").length());
        publish();
        ProjectBackup.validateDatabase(new File(secondLocation, "Project One-one/project.db"), "one");
        backup.configure(selectFolder(""), true);
        revision = "2:0";
        publish();
        assertTrue(backup.status().getJSONArray("projects").getJSONObject(0).getString("backupFolderPath").endsWith("RouteVN Backups/Project One-one"));
        assertEquals(1, new File(destination, "RouteVN Backups").list().length);
        assertEquals("2:0", new JSONObject(Files.readString(new File(destination, "RouteVN Backups/Project One-one/backup.json").toPath())).getString("changeCounter"));
        assertEquals("1:0", new JSONObject(Files.readString(new File(secondLocation, "Project One-one/backup.json").toPath())).getString("changeCounter"));
    }
    @Test public void reclaimedFolderIsVerifiedBeforeItCountsAsBackedUp() throws Exception {
        backup.configure(selectFolder(""), false);
        publish();
        File folder = new File(destination, "RouteVN Backups/Project One-one");
        backup.disable();
        Files.writeString(new File(folder, "project.db").toPath(), "truncated");
        backup.configure(selectFolder(""), true);
        assertEquals(1, backup.pendingProjects().getJSONArray("projectIds").length());
        try { publish(); fail("trusted a corrupt backup"); }
        catch (ProjectBackup.Failure error) { assertEquals("invalidBackup", error.code); }
        JSONObject project = backup.status().getJSONArray("projects").getJSONObject(0);
        assertEquals("", project.getString("snapshotAt"));
        assertTrue(project.getBoolean("pending"));
        assertEquals("truncated", Files.readString(new File(folder, "project.db").toPath()));
    }
    @Test public void interruptedFirstBackupsAreReclaimedAfterMappingsReset() throws Exception {
        backup.configure(selectFolder(""), false);
        File folder = new File(destination, "RouteVN Backups/Project One-one");
        CapacityShadow.available = 999_999_999L;
        try { publish(); fail("low space accepted"); }
        catch (ProjectBackup.Failure error) { assertEquals("lowSpace", error.code); }
        assertEquals(0, folder.list().length);
        backup.disable();
        CapacityShadow.available = 10_000_000_000L;
        backup.configure(selectFolder(""), true);
        provider.failRename = "backup.json";
        try { publish(); fail("expected interruption"); } catch (Exception expected) { }
        assertFalse(new File(folder, "backup.json").exists());
        backup.disable();
        provider.failRename = null;
        backup.configure(selectFolder(""), true);
        publish();
        ProjectBackup.validateDatabase(new File(folder, "project.db"), "one");
        assertEquals("one", new JSONObject(Files.readString(new File(folder, "backup.json").toPath())).getString("projectId"));
        assertEquals(1, new File(destination, "RouteVN Backups").list().length);
    }
    private void claimedFolder(File folder) throws Exception {
        folder.mkdirs();
        Files.writeString(new File(folder, "backup.json").toPath(), "{\"formatVersion\":1,\"projectId\":\"one\"}");
    }
    @Test public void reclaimsOnlyUnambiguousFoldersEndingInTheProjectId() throws Exception {
        backup.configure(selectFolder(""), false);
        File backups = new File(destination, "RouteVN Backups");
        claimedFolder(new File(backups, "Legacy-one"));
        claimedFolder(new File(backups, "Project One-one"));
        claimedFolder(new File(backups, "Project One-one copy"));
        publish();
        ProjectBackup.validateDatabase(new File(backups, "Project One-one/project.db"), "one");
        assertFalse(new File(backups, "Legacy-one/project.db").exists());
        assertFalse(new File(backups, "Project One-one copy/project.db").exists());
        backup.disable();
        projectName = "Renamed Novel";
        backup.configure(selectFolder(""), true);
        try { publish(); fail("guessed between duplicate backups"); }
        catch (ProjectBackup.Failure error) { assertEquals("nameConflict", error.code); }
        assertFalse(new File(backups, "Renamed Novel-one").exists());
        assertEquals("", backup.status().getJSONArray("projects").getJSONObject(0).getString("backupFolderPath"));
    }
    @Test public void foreignAndUnreadableFoldersAreNeverAdopted() throws Exception {
        File backups = new File(destination, "RouteVN Backups"); backups.mkdirs();
        File foreign = new File(backups, "Someone Else");
        new File(foreign, "files").mkdirs(); new File(foreign, "file-metadata").mkdirs();
        Files.writeString(new File(foreign, "project.db").toPath(), "not sqlite");
        Files.writeString(new File(foreign, "backup.json").toPath(),
            "{\"formatVersion\":1,\"projectId\":\"other\",\"changeCounter\":\"1:0\",\"snapshotAt\":\"x\",\"completedAt\":\"x\",\"databaseBytes\":1,\"databaseSha256\":\"deadbeef\"}");
        File garbage = new File(backups, "notes"); garbage.mkdirs();
        Files.writeString(new File(garbage, "todo.txt").toPath(), "keep");
        assertTrue(backup.configure(selectFolder(""), true).getBoolean("configured"));
        JSONObject project = backup.status().getJSONArray("projects").getJSONObject(0);
        assertEquals("", project.getString("backupFolderPath"));
        assertTrue(project.getBoolean("pending"));
        publish();
        ProjectBackup.validateDatabase(new File(backups, "Project One-one/project.db"), "one");
        assertEquals("keep", Files.readString(new File(garbage, "todo.txt").toPath()));
        assertEquals("not sqlite", Files.readString(new File(foreign, "project.db").toPath()));
    }
    @Test public void unprovenSameNamedFolderStillRefuses() throws Exception {
        File backups = new File(destination, "RouteVN Backups"); backups.mkdirs();
        File squatter = new File(backups, "Project One-one");
        new File(squatter, "files").mkdirs(); new File(squatter, "file-metadata").mkdirs();
        // Complete backup structure, even this project's database: only the
        // declared project id may refuse the folder.
        Files.copy(new File(source, "project.db").toPath(), new File(squatter, "project.db").toPath());
        Files.writeString(new File(squatter, "keep.txt").toPath(), "keep");
        Files.writeString(new File(squatter, "backup.json").toPath(), "{\"formatVersion\":1,\"projectId\":\"someone-else\"}");
        assertTrue(backup.configure(selectFolder(""), true).getBoolean("configured"));
        try { backup.prepare("one"); fail("claimed an unproven folder"); }
        catch (ProjectBackup.Failure error) { assertEquals("nameConflict", error.code); }
        assertEquals("keep", Files.readString(new File(squatter, "keep.txt").toPath()));
        assertEquals(1, backups.list().length);
    }
    @Test public void unreadableMetadataIsANameConflictNotLostAccess() throws Exception {
        File folder = new File(destination, "Project One-one");
        new File(folder, "backup.json").mkdirs();
        new File(folder, "files").mkdirs(); new File(folder, "file-metadata").mkdirs();
        Files.copy(new File(source, "project.db").toPath(), new File(folder, "project.db").toPath());
        try { publish(); fail("claimed a folder with unreadable metadata"); }
        catch (ProjectBackup.Failure error) { assertEquals("nameConflict", error.code); }
        assertTrue(new File(folder, "backup.json").isDirectory());
    }
    @Test public void folderTitlesSurviveProviderNameRules() {
        assertEquals("A B", ProjectBackup.sanitizeFolderTitle("A\u0001B\u007f", "Project"));
        assertEquals("x y", ProjectBackup.sanitizeFolderTitle("x\uD800y", "Project"));
        String emoji = "a".repeat(79) + "\uD83D\uDE00";
        assertEquals(emoji, ProjectBackup.sanitizeFolderTitle(emoji + "tail", "Project"));
        String wide = ProjectBackup.sanitizeFolderTitle("\u6f22".repeat(80), "Project");
        assertEquals("\u6f22".repeat(66), wide);
        assertEquals("Project", ProjectBackup.sanitizeFolderTitle("\u0000", "Project"));
    }
    @Test public void emptyProjectNameFallsBackToStableFolderName() throws Exception {
        projectName = "";
        publish();
        ProjectBackup.validateDatabase(new File(destination, "Project-one/project.db"), "one");
    }
    @Test public void renamedProjectKeepsBackingUpToItsAdoptedFolder() throws Exception {
        backup.configure(selectFolder(""), false);
        publish();
        backup.disable();
        projectName = "Renamed Novel";
        assertTrue(backup.configure(selectFolder(""), true).getBoolean("configured"));
        revision = "2:0";
        publish();
        File backups = new File(destination, "RouteVN Backups");
        assertEquals(1, backups.list().length);
        ProjectBackup.validateDatabase(new File(backups, "Project One-one/project.db"), "one");
        assertFalse(new File(backups, "Renamed Novel-one").exists());
    }
    @Test public void publishesOrdinaryProjectAndSkipsUnchanged() throws Exception {
        publish();
        ProjectBackup.validateDatabase(output("project.db"), "one");
        assertArrayEquals(new byte[] {1,2,3}, Files.readAllBytes(output("files/asset").toPath()));
        JSONObject metadata = new JSONObject(Files.readString(output("backup.json").toPath()));
        assertEquals(backup.hash(output("project.db")), metadata.getString("databaseSha256"));
        assertEquals(0, backup.pendingProjects().getJSONArray("projectIds").length());
        revision = "2:0";
        assertEquals(1, backup.pendingProjects().getJSONArray("projectIds").length());
    }
    @Test public void stagedAssetsSurviveLiveProjectDeletion() throws Exception {
        backup.prepare("one");
        ProjectBackup.removeTree(source);
        backup.publish("one");
        ProjectBackup.validateDatabase(output("project.db"), "one");
        assertArrayEquals(new byte[] {1,2,3}, Files.readAllBytes(output("files/asset").toPath()));
        assertEquals("image/png", Files.readString(output("file-metadata/asset.mime").toPath()));
    }
    @Test public void stagesOnlyMissingMediaOnSubsequentBackup() throws Exception {
        publish();
        revision = "2:1";
        Files.writeString(new File(source, "files/new-asset").toPath(), "new media");
        Files.writeString(new File(source, "file-metadata/new-asset.mime").toPath(), "text/plain");
        backup.prepare("one");
        File staging = new File(context.getNoBackupFilesDir(), "project-backup-staging");
        assertArrayEquals(new String[] {"new-asset"}, new File(staging, "files").list());
        assertArrayEquals(new String[] {"new-asset.mime"}, new File(staging, "file-metadata").list());
        backup.publish("one");
        assertArrayEquals(new byte[] {1,2,3}, Files.readAllBytes(output("files/asset").toPath()));
        assertEquals("new media", Files.readString(output("files/new-asset").toPath()));
    }
    @Test public void reservesBothStagedAndDestinationMediaOnSharedStorage() throws Exception {
        publish();
        String hash = backup.hash(output("project.db"));
        int mediaBytes = 1024 * 1024;
        Files.write(new File(source, "files/new-asset").toPath(), new byte[mediaBytes]);
        long dbBytes = new File(source, "project.db").length();
        // Enough for destination media and DB work, but not its private staging copy.
        CapacityShadow.available = ProjectBackup.RESERVE_BYTES + mediaBytes + 3 * dbBytes + 65536;
        try { backup.prepare("one"); fail("staging allocation omitted"); }
        catch (ProjectBackup.Failure error) { assertEquals("lowSpace", error.code); }
        assertEquals(hash, backup.hash(output("project.db")));
        assertFalse(new File(context.getNoBackupFilesDir(), "project-backup-staging").exists());
    }
    @Test public void interruptedPromotionKeepsPreviousAndRetries() throws Exception {
        publish(); String previousHash = backup.hash(output("project.db"));
        revision = "2:0"; provider.failRename = "project.db";
        try { publish(); fail("expected interruption"); } catch (Exception expected) { }
        assertFalse(output("project.db").exists());
        assertEquals(previousHash, backup.hash(output("project.db.previous")));
        assertEquals("1:0", new JSONObject(Files.readString(output("backup.json").toPath())).getString("changeCounter"));
        provider.failRename = null; publish();
        ProjectBackup.validateDatabase(output("project.db"), "one");
        assertFalse(backup.status().getJSONArray("projects").getJSONObject(0).getBoolean("pending"));
    }
    @Test public void metadataFailureLeavesRecoverableCanonicalAndPendingRetry() throws Exception {
        publish(); revision = "2:0"; provider.failRename = "backup.json";
        try { publish(); fail("expected interruption"); } catch (Exception expected) { }
        ProjectBackup.validateDatabase(output("project.db"), "one");
        ProjectBackup.validateDatabase(output("project.db.previous"), "one");
        assertTrue(backup.status().getJSONArray("projects").getJSONObject(0).getBoolean("pending"));
        provider.failRename = null; publish();
        assertEquals("2:0", new JSONObject(Files.readString(output("backup.json").toPath())).getString("changeCounter"));
    }
    @Test public void failureBeforeCanonicalRenameKeepsCurrent() throws Exception {
        publish(); String hash = backup.hash(output("project.db"));
        revision = "2:0"; provider.failRename = "project.db.previous";
        try { publish(); fail("expected interruption"); } catch (Exception expected) { }
        assertEquals(hash, backup.hash(output("project.db")));
        assertTrue(backup.status().getJSONArray("projects").getJSONObject(0).getBoolean("pending"));
    }
    @Test public void failureRemovingOlderPreviousKeepsBothValidCopies() throws Exception {
        publish(); revision = "2:0"; publish();
        provider.failDelete = "project.db.previous"; revision = "3:0";
        try { publish(); fail("expected interruption"); } catch (Exception expected) { }
        ProjectBackup.validateDatabase(output("project.db"), "one");
        ProjectBackup.validateDatabase(output("project.db.previous"), "one");
    }
    @Test public void firstAssetFailureNeverPublishesDatabase() throws Exception {
        provider.failRename = "asset";
        try { publish(); fail("expected interruption"); } catch (Exception expected) { }
        assertFalse(output("project.db").exists());
        assertFalse(output("backup.json").exists());
        provider.failRename = null; publish();
        ProjectBackup.validateDatabase(output("project.db"), "one");
    }
    @Test public void spaceLossAfterStagingPreservesCurrent() throws Exception {
        publish(); String hash = backup.hash(output("project.db"));
        revision = "2:0"; backup.prepare("one");
        CapacityShadow.available = 999_999_999L;
        try { backup.publish("one"); fail("low space accepted"); }
        catch (ProjectBackup.Failure error) { assertEquals("lowSpace", error.code); }
        assertEquals(hash, backup.hash(output("project.db")));
    }
    @Test public void missingOrStaleMetadataRetriesWithoutLocalChanges() throws Exception {
        publish(); Files.writeString(output("backup.json").toPath(), "{}");
        assertEquals(1, backup.pendingProjects().getJSONArray("projectIds").length());
        publish(); Files.delete(output("project.db").toPath());
        assertEquals(1, backup.pendingProjects().getJSONArray("projectIds").length());
    }
    @Test public void importFallsBackToPreviousWithoutChangingSourceAndIgnoresNext() throws Exception {
        publish();
        Files.move(output("project.db").toPath(), output("project.db.previous").toPath());
        Files.copy(output("project.db.previous").toPath(), output("project.db.next").toPath());
        Files.writeString(output("project.db").toPath(), "interrupted");
        String previousHash = backup.hash(output("project.db.previous"));
        MainActivity activity = new MainActivity();
        org.robolectric.util.ReflectionHelpers.callInstanceMethod(activity, "attachBaseContext",
            org.robolectric.util.ReflectionHelpers.ClassParameter.from(Context.class, context));
        java.lang.reflect.Method method = MainActivity.class.getDeclaredMethod("copyImportDatabase", Uri.class, File.class);
        method.setAccessible(true);
        Uri root = DocumentsContract.buildDocumentUriUsingTree(
            DocumentsContract.buildTreeDocumentUri(BackupDocumentsProvider.AUTHORITY, "primary:Documents"), "primary:Documents/Project One-one");
        File imported = (File) method.invoke(activity, root, new File(context.getCacheDir(), "import"));
        ProjectBackup.validateDatabase(imported, "one");
        assertEquals(previousHash, backup.hash(output("project.db.previous")));
        assertEquals("interrupted", Files.readString(output("project.db").toPath()));
        Files.delete(output("project.db.previous").toPath());
        try { method.invoke(activity, root, new File(context.getCacheDir(), "import2")); fail("promoted next"); }
        catch (java.lang.reflect.InvocationTargetException expected) { }
    }

    @Test public void persistsFiveMinuteThrottleBeforeSnapshotWork() throws Exception {
        assertTrue(backup.beginPass(false).getBoolean("due"));
        assertFalse(backup.beginPass(false).getBoolean("due"));
        assertTrue(backup.beginPass(true).getBoolean("due"));
    }

    @Test public void rejectsCloudAndAppOwnedBackupFolders() throws Exception {
        for (String[] trial : new String[][] {
            {"content://cloud.example/tree/one", "localFolder"},
            {"content://com.android.externalstorage.documents/tree/primary%3AAndroid%2Fmedia%2Fcom.routevn.creator", "appFolder"}
        }) {
            try { backup.configure(trial[0], true); fail("unsafe destination accepted"); }
            catch (ProjectBackup.Failure error) { assertEquals(trial[1], error.code); }
        }
        assertTrue(backup.status().getBoolean("configured"));
    }
    @Test public void assetSessionsRejectOverwriteAtStartAndFinish() throws Exception {
        MainActivity activity = new MainActivity();
        org.robolectric.util.ReflectionHelpers.callInstanceMethod(activity, "attachBaseContext",
            org.robolectric.util.ReflectionHelpers.ClassParameter.from(Context.class, context));
        File root = new File(context.getFilesDir(), "projects/one");
        new File(root, "files").mkdirs(); new File(root, "file-metadata").mkdirs();
        Files.copy(new File(source, "project.db").toPath(), new File(root, "project.db").toPath());
        File first = new File(root, "files/first"); Files.writeString(first.toPath(), "original");
        java.lang.reflect.Method begin = MainActivity.class.getDeclaredMethod("beginProjectFileWriteSession", String.class, String.class, String.class, long.class);
        begin.setAccessible(true);
        try { begin.invoke(activity, "one", "first", "text/plain", 0L); fail("overwrote existing asset"); }
        catch (java.lang.reflect.InvocationTargetException error) { assertEquals("assetConflict", ((ProjectBackup.Failure) error.getCause()).code); }
        JSONObject session = (JSONObject) begin.invoke(activity, "one", "second", "text/plain", 0L);
        File second = new File(root, "files/second"); Files.writeString(second.toPath(), "original");
        java.lang.reflect.Method finish = MainActivity.class.getDeclaredMethod("finishProjectFileWriteSession", String.class);
        finish.setAccessible(true);
        try { finish.invoke(activity, session.getString("writeId")); fail("overwrote racing asset"); }
        catch (java.lang.reflect.InvocationTargetException error) { assertEquals("assetConflict", ((ProjectBackup.Failure) error.getCause()).code); }
        assertEquals("original", Files.readString(first.toPath()));
        assertEquals("original", Files.readString(second.toPath()));
    }

    @Test public void staleQueueEntryDoesNotRecreateDeletedProject() throws Exception {
        MainActivity activity = new MainActivity();
        org.robolectric.util.ReflectionHelpers.callInstanceMethod(activity, "attachBaseContext",
            org.robolectric.util.ReflectionHelpers.ClassParameter.from(Context.class, context));
        java.lang.reflect.Method snapshot = MainActivity.class.getDeclaredMethod("snapshotProjectForBackup", String.class, File.class);
        snapshot.setAccessible(true);
        try { snapshot.invoke(activity, "deleted", new File(context.getCacheDir(), "snapshot")); fail("accepted deleted project"); }
        catch (java.lang.reflect.InvocationTargetException error) { assertTrue(error.getCause() instanceof ProjectBackup.Failure); }
        assertFalse(new File(context.getFilesDir(), "projects/deleted/project.db").exists());
    }

}
