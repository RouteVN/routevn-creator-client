package com.routevn.creator;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.provider.DocumentsContract;
import java.io.File;
import java.nio.file.Files;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33, manifest = Config.NONE, shadows = BackupFixture.CapacityShadow.class)
public class BackupPublicationTest extends BackupFixture {
    @Test public void disablingPersistsAndPreservesExistingBackupFiles() throws Exception {
        publish();
        String databaseHash = backup.hash(output("project.db"));
        String metadata = Files.readString(output("backup.json").toPath());
        backup.markAssetChange("one");
        backup.disable();
        assertFalse(backup.configured());
        assertEquals("", project().getString("snapshotAt"));
        assertEquals("", project().getString("backupFolderPath"));
        assertEquals(1L, backup.assetRevision("one"));
        backup = new ProjectBackup(context, storage);
        assertFalse(backup.configured());
        assertEquals(databaseHash, backup.hash(output("project.db")));
        assertEquals(metadata, Files.readString(output("backup.json").toPath()));
        assertArrayEquals(new byte[] {1,2,3}, Files.readAllBytes(output("files/asset").toPath()));
        assertEquals("image/png", Files.readString(output("file-metadata/asset.mime").toPath()));
        new File(destination, "Enabled Again").mkdirs();
        assertTrue(backup.configure(selectFolder("/Enabled Again"), false).getBoolean("configured"));
        assertTrue(backup.configured());
    }

    @Test public void cancellingDuringMediaCopyKeepsTheLastBackupAndRecordsNoError() throws Exception {
        publish();
        String hash = backup.hash(output("project.db"));
        revision = "2:1";
        for (int i = 0; i < 3; i++) Files.writeString(new File(source, "files/new-" + i).toPath(), "media " + i);
        ProjectBackup.Snapshot snapshot = backup.prepare("one");
        try {
            backup.publish(snapshot, (done, total) -> { if (done == 1) backup.cancel(); });
            fail("cancel ignored");
        } catch (ProjectBackup.Failure error) { assertEquals("interrupted", error.code); }
        backup.resume();
        assertEquals(hash, backup.hash(output("project.db")));
        assertEquals("", backup.error("one"));
        assertFalse(snapshot.staging.exists());
        // Finished media stays; the next pass copies only what is left.
        java.util.Set<String> kept = new java.util.HashSet<>(java.util.Arrays.asList(output("files").list()));
        assertTrue(kept.size() < 4);
        provider.created.clear();
        publish();
        for (int i = 0; i < 3; i++) {
            assertEquals(!kept.contains("new-" + i), provider.created.contains("new-" + i + ".next"));
            assertEquals("media " + i, Files.readString(output("files/new-" + i).toPath()));
        }
    }
    @Test public void createsBackupSubfolderWithoutTreatingParentFilesAsOldBackups() throws Exception {
        Files.writeString(new File(destination, "unrelated.txt").toPath(), "keep");
        JSONObject result = backup.configure(selectFolder(""), false);
        assertTrue(result.getBoolean("configured"));
        assertFalse(result.optBoolean("needsExistingConfirmation"));
        assertTrue(backup.folderDisplayPath().endsWith("/RouteVN Backups"));
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
        assertEquals(0, pendingCount());
    }
    @Test public void reconnectingWithDirectGrantKeepsCheckpointsAndFolder() throws Exception {
        String originalTree = selectFolder("");
        backup.configure(originalTree, false);
        publish();
        android.content.SharedPreferences preferences = context.getSharedPreferences("project-backup", 0);
        String checkpoint = preferences.getString("success:one", "");
        context.getContentResolver().releasePersistableUriPermission(Uri.parse(originalTree),
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        revokedTreeId = "primary:Documents";
        assertEquals(1, pendingCount());
        assertEquals("reconnect", preferences.getString("error:one", ""));
        assertEquals("", project().getString("backupFolderPath"));

        // Older versions saved per-project folder URIs; reconnecting drops them.
        preferences.edit().putString("folder:one", "content://stale").commit();
        String renewedTree = selectFolder("/RouteVN Backups");
        JSONObject configured = backup.configure(renewedTree, false);
        assertFalse(configured.optBoolean("needsExistingConfirmation"));
        assertFalse(preferences.contains("folder:one"));
        assertEquals(checkpoint, preferences.getString("success:one", ""));
        assertTrue(project().getString("backupFolderPath").endsWith("RouteVN Backups/Project One-one"));
        backup = new ProjectBackup(context, storage);
        revision = "2:0";
        publish();
        assertEquals(0, pendingCount());
        assertEquals("", preferences.getString("error:one", ""));
        assertEquals(1, new File(destination, "RouteVN Backups").list().length);
        assertFalse(new File(destination, "RouteVN Backups/RouteVN Backups").exists());
    }

    @Test public void cancelStopsHashingAtTheNextChunk() throws Exception {
        java.io.InputStream input = new java.io.ByteArrayInputStream(new byte[256 * 1024]) {
            @Override public synchronized int read(byte[] bytes, int offset, int length) {
                int count = super.read(bytes, offset, length);
                backup.cancel();
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

    @Test public void staleStagingFromAnEndedProcessIsRemoved() throws Exception {
        ProjectBackup.Snapshot snapshot = backup.prepare("one");
        assertTrue(snapshot.database.exists());
        backup = new ProjectBackup(context, storage);
        backup.removeStaleStaging();
        assertFalse(new File(context.getNoBackupFilesDir(), ProjectBackup.STAGING_DIRECTORY).exists());
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
        assertEquals(0, pendingCount());
    }
    @Test public void changingDestinationLeavesOldBackupsUntouchedAndStartsFresh() throws Exception {
        publish();
        String previousDatabase = backup.hash(output("project.db"));
        String previousMetadata = Files.readString(output("backup.json").toPath());
        File selected = new File(destination, "new-location"); selected.mkdir();
        backup.configure(selectFolder("/new-location"), false);
        assertEquals(1, pendingCount());
        publish();
        ProjectBackup.validateDatabase(new File(selected, "Project One-one/project.db"), "one");
        assertFalse(new File(selected, "RouteVN Backups").exists());
        assertEquals(previousDatabase, backup.hash(output("project.db")));
        assertEquals(previousMetadata, Files.readString(output("backup.json").toPath()));
        assertArrayEquals(new byte[] {1,2,3}, Files.readAllBytes(output("files/asset").toPath()));
    }
    @Test public void reEnablingSameDestinationReusesFolderAndRepublishes() throws Exception {
        backup.configure(selectFolder(""), false);
        publish();
        backup.disable();
        assertTrue(backup.configure(selectFolder(""), true).getBoolean("configured"));
        // Re-enabling never trusts the old checkpoint; the next pass re-verifies it.
        JSONObject project = project();
        assertEquals("", project.getString("snapshotAt"));
        assertEquals(1, pendingCount());
        publish();
        project = project();
        assertTrue(project.getString("backupFolderPath").endsWith("RouteVN Backups/Project One-one"));
        assertEquals(0, pendingCount());
        ProjectBackup.validateDatabase(new File(destination, "RouteVN Backups/Project One-one/project.db"), "one");
        assertEquals(1, new File(destination, "RouteVN Backups").list().length);
    }
    @Test public void switchingBackToPreviousDestinationReusesItsFolder() throws Exception {
        backup.configure(selectFolder(""), false);
        publish();
        File secondLocation = new File(destination, "new-location"); secondLocation.mkdirs();
        backup.configure(selectFolder("/new-location"), false);
        assertEquals(1, pendingCount());
        publish();
        ProjectBackup.validateDatabase(new File(secondLocation, "Project One-one/project.db"), "one");
        backup.configure(selectFolder(""), true);
        revision = "2:0";
        publish();
        assertTrue(project().getString("backupFolderPath").endsWith("RouteVN Backups/Project One-one"));
        assertEquals(1, new File(destination, "RouteVN Backups").list().length);
        assertEquals("2:0", new JSONObject(Files.readString(new File(destination, "RouteVN Backups/Project One-one/backup.json").toPath())).getString("changeCounter"));
        assertEquals("1:0", new JSONObject(Files.readString(new File(secondLocation, "Project One-one/backup.json").toPath())).getString("changeCounter"));
    }
    @Test public void reusedFolderIsVerifiedBeforeItCountsAsBackedUp() throws Exception {
        backup.configure(selectFolder(""), false);
        publish();
        File folder = new File(destination, "RouteVN Backups/Project One-one");
        backup.disable();
        Files.writeString(new File(folder, "project.db").toPath(), "truncated");
        backup.configure(selectFolder(""), true);
        assertEquals(1, pendingCount());
        assertEquals("", project().getString("snapshotAt"));
        // The damaged copy is set aside, never trusted and never blocking.
        publish();
        ProjectBackup.validateDatabase(new File(folder, "project.db"), "one");
        assertEquals("truncated", Files.readString(new File(folder, "project.db.damaged").toPath()));
        assertNotEquals("", project().getString("snapshotAt"));
        assertEquals(0, pendingCount());
    }
    @Test public void aDamagedBackupDatabaseIsReplacedAndKeptAside() throws Exception {
        publish();
        Files.writeString(output("project.db").toPath(), "not a database");
        Files.writeString(output("project.db.damaged").toPath(), "older damage");
        revision = "2:0";
        publish();
        ProjectBackup.validateDatabase(output("project.db"), "one");
        assertEquals("not a database", Files.readString(output("project.db.damaged").toPath()));
        assertEquals("", backup.error("one"));
    }
    @Test public void mediaDeletedFromAnUnchangedBackupIsCopiedAgain() throws Exception {
        publish();
        assertEquals(0, pendingCount());
        assertTrue(output("files/asset").delete());
        assertEquals(1, pendingCount());
        publish();
        assertArrayEquals(new byte[] {1,2,3}, Files.readAllBytes(output("files/asset").toPath()));
        assertTrue(output("file-metadata/asset.mime").delete());
        assertEquals(1, pendingCount());
        publish();
        assertEquals("image/png", Files.readString(output("file-metadata/asset.mime").toPath()));
        assertEquals(0, pendingCount());
    }
    @Test public void aDamagedProjectIsReportedAsDamagedAndItsLastBackupKept() throws Exception {
        publish();
        String hash = backup.hash(output("project.db"));
        Files.writeString(new File(source, "project.db").toPath(), "damaged working copy");
        revision = "2:0";
        try { publish(); fail("backed up a damaged project"); }
        catch (ProjectBackup.Failure error) { assertEquals("projectDamaged", error.code); }
        assertEquals("projectDamaged", backup.error("one"));
        assertEquals(hash, backup.hash(output("project.db")));
        assertFalse(output("project.db.damaged").exists());
    }
    @Test public void aFolderInsideTheProjectsMediaIsSkipped() throws Exception {
        new File(source, "files/nested").mkdirs();
        Files.writeString(new File(source, "files/nested/inside").toPath(), "not media");
        publish();
        assertFalse(output("files/nested").exists());
        assertArrayEquals(new byte[] {1,2,3}, Files.readAllBytes(output("files/asset").toPath()));
        assertEquals(0, pendingCount());
    }
    @Test public void aBackupDatabaseOfTheWrongSizeIsReplaced() throws Exception {
        publish();
        String hash = backup.hash(output("project.db"));
        Files.write(output("project.db").toPath(), new byte[] {1}, java.nio.file.StandardOpenOption.APPEND);
        assertEquals(1, pendingCount());
        publish();
        assertEquals(hash, backup.hash(output("project.db")));
        assertEquals(0, pendingCount());
    }
    @Test public void interruptedFirstBackupsAreReusedAfterReEnabling() throws Exception {
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
    @Test public void findsTheFolderEndingInTheProjectIdAndPrefersTheNewestCopy() throws Exception {
        backup.configure(selectFolder(""), false);
        File backups = new File(destination, "RouteVN Backups");
        // Earlier versions named folders Project-<projectId>; they keep being used.
        File legacy = new File(backups, "Project-one"); legacy.mkdirs();
        File copy = new File(backups, "Project-one (1)"); copy.mkdirs();
        publish();
        ProjectBackup.validateDatabase(new File(legacy, "project.db"), "one");
        assertFalse(new File(backups, "Project One-one").exists());
        assertEquals(0, copy.list().length);
        // A second folder ending in the id: the most recently written one wins.
        File older = new File(backups, "Older-one"); older.mkdirs();
        Files.copy(new File(legacy, "backup.json").toPath(), new File(older, "backup.json").toPath());
        String legacyMetadata = Files.readString(new File(legacy, "backup.json").toPath());
        new File(older, "backup.json").setLastModified(1_000_000L);
        for (String name : new String[] {"backup.json", "project.db"}) new File(legacy, name).setLastModified(2_000_000L);
        assertTrue(project().getString("backupFolderPath").endsWith("/Project-one"));
        revision = "2:0";
        publish();
        assertEquals("2:0", new JSONObject(Files.readString(new File(legacy, "backup.json").toPath())).getString("changeCounter"));
        assertEquals(legacyMetadata, Files.readString(new File(older, "backup.json").toPath()));
        for (String name : new String[] {"backup.json", "project.db"}) new File(legacy, name).setLastModified(1_000_000L);
        new File(older, "backup.json").setLastModified(3_000_000L);
        revision = "3:0";
        publish();
        assertEquals("3:0", new JSONObject(Files.readString(new File(older, "backup.json").toPath())).getString("changeCounter"));
        assertEquals("2:0", new JSONObject(Files.readString(new File(legacy, "backup.json").toPath())).getString("changeCounter"));
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
        JSONObject project = project();
        assertEquals("", project.getString("backupFolderPath"));
        assertTrue(project.getBoolean("pending"));
        publish();
        ProjectBackup.validateDatabase(new File(backups, "Project One-one/project.db"), "one");
        assertEquals("keep", Files.readString(new File(garbage, "todo.txt").toPath()));
        assertEquals("not sqlite", Files.readString(new File(foreign, "project.db").toPath()));
    }
    @Test public void anotherProjectsDatabaseInTheFolderIsNeverReplaced() throws Exception {
        File folder = new File(destination, "Project One-one");
        new File(folder, "files").mkdirs(); new File(folder, "file-metadata").mkdirs();
        try (SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(new File(folder, "project.db"), null)) {
            db.execSQL("CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT)");
            db.execSQL("INSERT INTO app_state VALUES ('projectInfo', '{\"id\":\"other\"}')");
        }
        String hash = backup.hash(new File(folder, "project.db"));
        try { publish(); fail("replaced another project's database"); }
        catch (ProjectBackup.Failure error) { assertEquals("invalidBackup", error.code); }
        assertEquals(hash, backup.hash(new File(folder, "project.db")));
        assertFalse(new File(folder, "backup.json").exists());
    }
    @Test public void folderTitlesSurviveProviderNameRules() {
        assertEquals("A B", ProjectBackup.sanitizeFolderTitle("A\u0001B\u007f", "Project"));
        assertEquals("x y", ProjectBackup.sanitizeFolderTitle("x\uD800y", "Project"));
        String emoji = "a".repeat(79) + "\uD83D\uDE00";
        assertEquals(emoji, ProjectBackup.sanitizeFolderTitle(emoji + "tail", "Project"));
        String wide = ProjectBackup.sanitizeFolderTitle("\u6f22".repeat(80), "Project");
        assertEquals("\u6f22".repeat(66), wide);
        assertEquals("Project", ProjectBackup.sanitizeFolderTitle("\u0000", "Project"));
        assertEquals("Chapter One", ProjectBackup.sanitizeFolderTitle(". . . Chapter One . .", "Project"));
        assertEquals("Project", ProjectBackup.sanitizeFolderTitle(". . .", "Project"));
    }
    @Test public void emptyProjectNameFallsBackToStableFolderName() throws Exception {
        projectName = "";
        publish();
        ProjectBackup.validateDatabase(new File(destination, "Project-one/project.db"), "one");
    }
    @Test public void renamedProjectKeepsItsOriginalFolder() throws Exception {
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
        assertEquals(0, pendingCount());
        revision = "2:0";
        assertEquals(1, pendingCount());
    }
    @Test public void mediaDeletedAfterTheSnapshotStopsWithChangedAndTheNextPassSucceeds() throws Exception {
        publish();
        String hash = backup.hash(output("project.db"));
        revision = "2:1";
        Files.writeString(new File(source, "files/brief").toPath(), "deleted soon");
        ProjectBackup.Snapshot snapshot = backup.prepare("one");
        Files.delete(new File(source, "files/brief").toPath());
        try { backup.publish(snapshot, (done, total) -> { }); fail("published a snapshot whose media is gone"); }
        catch (ProjectBackup.Failure error) { assertEquals("changed", error.code); }
        assertEquals(hash, backup.hash(output("project.db")));
        assertEquals(1, pendingCount());
        revision = "3:2";
        publish();
        assertFalse(output("files/brief").exists());
        assertEquals(0, pendingCount());
    }
    @Test public void copiesOnlyMissingMediaOnSubsequentBackup() throws Exception {
        publish();
        revision = "2:1";
        Files.writeString(new File(source, "files/new-asset").toPath(), "new media");
        Files.writeString(new File(source, "file-metadata/new-asset.mime").toPath(), "text/plain");
        provider.created.clear();
        publish();
        assertTrue(provider.created.contains("new-asset.next"));
        assertTrue(provider.created.contains("new-asset.mime.next"));
        assertFalse(provider.created.contains("asset.next"));
        assertArrayEquals(new byte[] {1,2,3}, Files.readAllBytes(output("files/asset").toPath()));
        assertEquals("new media", Files.readString(output("files/new-asset").toPath()));
    }

    @Test public void listsEachFolderOnceInsteadOfOncePerMediaFile() throws Exception {
        for (int i = 0; i < 40; i++) {
            Files.writeString(new File(source, "files/media-" + i).toPath(), "media " + i);
            Files.writeString(new File(source, "file-metadata/media-" + i + ".mime").toPath(), "text/plain");
        }
        provider.childQueries = 0;
        publish();
        assertEquals(41, new File(destination, "Project One-one/files").list().length);
        assertEquals(41, new File(destination, "Project One-one/file-metadata").list().length);
        // Listings are per folder, not per file: 82 files took 2 per file before.
        assertTrue("child listings: " + provider.childQueries, provider.childQueries <= 12);
        provider.childQueries = 0;
        revision = "2:0";
        publish();
        assertTrue("child listings: " + provider.childQueries, provider.childQueries <= 12);
    }

    @Test public void needsNoPrivateCopyOfNewMedia() throws Exception {
        publish();
        String hash = backup.hash(output("project.db"));
        int mediaBytes = 1024 * 1024;
        Files.write(new File(source, "files/new-asset").toPath(), new byte[mediaBytes]);
        long dbBytes = new File(source, "project.db").length();
        // Not enough for the media, the database, and its validation copy.
        CapacityShadow.available = ProjectBackup.RESERVE_BYTES + mediaBytes + 2 * dbBytes;
        try { publish(); fail("space for the backup was not reserved"); }
        catch (ProjectBackup.Failure error) { assertEquals("lowSpace", error.code); }
        assertEquals(hash, backup.hash(output("project.db")));
        // Enough for those: no second, private copy of the media is needed.
        CapacityShadow.available = ProjectBackup.RESERVE_BYTES + mediaBytes + 3 * dbBytes + 65536;
        revision = "2:1";
        publish();
        assertEquals(mediaBytes, output("files/new-asset").length());
    }

    @Test public void failedMediaCopyKeepsFinishedFilesForTheNextPass() throws Exception {
        for (int i = 0; i < 3; i++) Files.writeString(new File(source, "files/media-" + i).toPath(), "media " + i);
        provider.failRename = "media-1";
        try { publish(); fail("expected interruption"); } catch (Exception expected) { }
        assertFalse(output("project.db").exists());
        java.util.Set<String> kept = new java.util.HashSet<>();
        for (String name : output("files").list()) if (!name.endsWith(".next")) kept.add(name);
        assertFalse(kept.contains("media-1"));
        provider.failRename = null;
        provider.created.clear();
        publish();
        ProjectBackup.validateDatabase(output("project.db"), "one");
        for (String name : new File(source, "files").list()) {
            assertEquals(name, !kept.contains(name), provider.created.contains(name + ".next"));
            assertEquals(name, Files.readString(new File(source, "files/" + name).toPath()),
                Files.readString(output("files/" + name).toPath()));
        }
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
        assertFalse(project().getBoolean("pending"));
    }
    @Test public void metadataFailureLeavesRecoverableCanonicalAndPendingRetry() throws Exception {
        publish(); revision = "2:0"; provider.failRename = "backup.json";
        try { publish(); fail("expected interruption"); } catch (Exception expected) { }
        ProjectBackup.validateDatabase(output("project.db"), "one");
        ProjectBackup.validateDatabase(output("project.db.previous"), "one");
        assertTrue(project().getBoolean("pending"));
        provider.failRename = null; publish();
        assertEquals("2:0", new JSONObject(Files.readString(output("backup.json").toPath())).getString("changeCounter"));
    }
    @Test public void failureBeforeCanonicalRenameKeepsCurrent() throws Exception {
        publish(); String hash = backup.hash(output("project.db"));
        revision = "2:0"; provider.failRename = "project.db.previous";
        try { publish(); fail("expected interruption"); } catch (Exception expected) { }
        assertEquals(hash, backup.hash(output("project.db")));
        assertTrue(project().getBoolean("pending"));
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
        revision = "2:0"; ProjectBackup.Snapshot snapshot = backup.prepare("one");
        CapacityShadow.available = 999_999_999L;
        try { backup.publish(snapshot, (done, total) -> { }); fail("low space accepted"); }
        catch (ProjectBackup.Failure error) { assertEquals("lowSpace", error.code); }
        assertEquals(hash, backup.hash(output("project.db")));
    }
    @Test public void missingOrStaleMetadataRetriesWithoutLocalChanges() throws Exception {
        publish(); Files.writeString(output("backup.json").toPath(), "{}");
        assertEquals(1, pendingCount());
        publish(); Files.delete(output("project.db").toPath());
        assertEquals(1, pendingCount());
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

    @Test public void rejectsCloudAndAppOwnedBackupFolders() throws Exception {
        for (String[] trial : new String[][] {
            {"content://cloud.example/tree/one", "localFolder"},
            {"content://com.android.externalstorage.documents/tree/primary%3AAndroid%2Fmedia%2Fcom.routevn.creator", "appFolder"}
        }) {
            try { backup.configure(trial[0], true); fail("unsafe destination accepted"); }
            catch (ProjectBackup.Failure error) { assertEquals(trial[1], error.code); }
        }
        assertTrue(backup.configured());
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

    // Android 9's storage provider renames, then throws for the old name.
    // Setup and every backup rename, so none of them could finish there.
    @Test @Config(sdk = 28) public void android9RenamesThatReportAMissingFileStillBackUp() throws Exception {
        provider.android9Rename = true;
        assertTrue(backup.configure(selectFolder(""), false).getBoolean("configured"));
        publish();
        File folder = new File(destination, "RouteVN Backups/Project One-one");
        ProjectBackup.validateDatabase(new File(folder, "project.db"), "one");
        assertArrayEquals(new byte[] {1,2,3}, Files.readAllBytes(new File(folder, "files/asset").toPath()));
        revision = "2:1";
        Files.writeString(new File(source, "files/new-asset").toPath(), "media");
        publish();
        assertEquals("2:1", new JSONObject(Files.readString(new File(folder, "backup.json").toPath())).getString("changeCounter"));
        ProjectBackup.validateDatabase(new File(folder, "project.db.previous"), "one");
        assertEquals("media", Files.readString(new File(folder, "files/new-asset").toPath()));
        assertEquals("", backup.error("one"));
        // No space probes or partial copies are left behind.
        for (File directory : new File[] {destination, folder.getParentFile(), folder, new File(folder, "files")}) {
            for (String name : directory.list()) {
                assertFalse(name, name.startsWith(".routevn-space-") || name.endsWith(".next") || name.contains(" (1)"));
            }
        }
    }

    // The provider moved the file to "b (1)" because "b" was taken: the "b"
    // that exists is another file and must not be taken for the renamed one.
    @Test @Config(sdk = 28) public void anAndroid9RenameOntoATakenNameIsNotAccepted() throws Exception {
        Files.writeString(new File(destination, "a").toPath(), "new");
        Files.writeString(new File(destination, "b").toPath(), "old");
        Uri tree = Uri.parse(selectFolder(""));
        Uri a = DocumentsContract.buildDocumentUriUsingTree(tree, "primary:Documents/a");
        provider.android9Rename = true;
        java.lang.reflect.Method rename = ProjectBackup.class.getDeclaredMethod("rename", Uri.class, String.class);
        rename.setAccessible(true);
        try {
            rename.invoke(backup, a, "b");
            fail("a rename onto a taken name was accepted");
        } catch (java.lang.reflect.InvocationTargetException error) {
            // A name conflict, not a storage problem that asks to reconnect.
            assertTrue(error.getCause() instanceof ProjectBackup.Failure);
            assertEquals("nameConflict", ((ProjectBackup.Failure) error.getCause()).code);
        }
        assertEquals("old", Files.readString(new File(destination, "b").toPath()));
        assertEquals("new", Files.readString(new File(destination, "b (1)").toPath()));
    }

    // Before Android 10, choosing Documents gives the provider's "home" root.
    // It is still Documents: back up into a RouteVN Backups folder there.
    @Test @Config(sdk = 28) public void android9DocumentsGetsARouteVNBackupsFolder() throws Exception {
        provider.homeRoot = true;
        provider.android9Rename = true;
        Files.writeString(new File(destination, "unrelated.txt").toPath(), "keep");
        Uri tree = DocumentsContract.buildTreeDocumentUri(BackupDocumentsProvider.AUTHORITY, "home:");
        context.getContentResolver().takePersistableUriPermission(tree,
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        JSONObject result = backup.configure(tree.toString(), false);
        assertTrue(result.getBoolean("configured"));
        assertFalse(result.optBoolean("needsExistingConfirmation"));
        assertEquals(new File(android.os.Environment.getExternalStorageDirectory(), "Documents/RouteVN Backups").getAbsolutePath(),
            backup.folderDisplayPath());
        publish();
        ProjectBackup.validateDatabase(new File(destination, "RouteVN Backups/Project One-one/project.db"), "one");
        assertEquals("keep", Files.readString(new File(destination, "unrelated.txt").toPath()));
    }
}
