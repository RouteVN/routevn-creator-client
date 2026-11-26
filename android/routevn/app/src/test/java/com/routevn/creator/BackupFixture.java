package com.routevn.creator;

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
import org.robolectric.RuntimeEnvironment;
import org.robolectric.shadows.ShadowContentResolver;
import org.robolectric.shadows.ShadowStatFs;

/** A project, a file-backed SAF destination with a persisted grant, and capacity shadows. */
public abstract class BackupFixture {
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
            public ProjectBackup.Captured snapshot(String id, File database) throws Exception {
                Files.copy(new File(source, "project.db").toPath(), database.toPath());
                return ProjectBackup.capture(revision, source);
            }
        };
        backup = new ProjectBackup(context, storage);
    }

    File output(String name) { return new File(destination, "Project One-one/" + name); }

    JSONObject publish() throws Exception { return backup.publish(backup.prepare("one"), (done, total) -> { }); }

    String selectFolder(String suffix) {
        Uri tree = DocumentsContract.buildTreeDocumentUri(BackupDocumentsProvider.AUTHORITY, "primary:Documents" + suffix);
        context.getContentResolver().takePersistableUriPermission(tree,
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        return tree.toString();
    }

    int pendingCount() throws Exception { return backup.pendingProjects(null).size(); }

    /** The project's status as the page sees it, read from local checkpoints only. */
    JSONObject project() throws Exception {
        java.util.Map<String, Uri> folders = new java.util.LinkedHashMap<>();
        if (backup.configured()) {
            try { folders = backup.backupFolders(); } catch (Exception lostAccess) { }
        }
        return new JSONObject().put("id", "one")
            .put("pending", !revision.equals(backup.savedCounter("one")))
            .put("snapshotAt", backup.savedSnapshotAt("one"))
            .put("backupFolderPath", backup.configured() ? backup.folderPath(folders, "one") : "");
    }
}
