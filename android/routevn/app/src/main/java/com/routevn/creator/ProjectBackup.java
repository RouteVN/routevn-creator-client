package com.routevn.creator;

import android.content.Context;
import android.content.ContentResolver;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.os.StatFs;
import android.provider.DocumentsContract;
import android.system.Os;
import android.system.StructStatVfs;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Local-folder backups: folder setup, change counters, and publication.
 *
 * Every method that touches the backup folder runs on the single backup
 * thread owned by {@link BackupScheduler}, so publications never overlap.
 * {@link Storage} calls that need the working databases are routed by the
 * storage implementation to the thread that owns them.
 */
final class ProjectBackup {
    static final long RESERVE_BYTES = 1_000_000_000L;
    static final String STAGING_DIRECTORY = "project-backup-staging";
    private static final String REVISION_TABLE = "routevn_backup_revision";
    private static final String BACKUP_FOLDER_NAME = "RouteVN Backups";
    private static final String PROJECT_WRITE_PREFIX = ".routevn-project-write-";

    interface Storage {
        JSONArray projects() throws Exception;
        File root(String projectId) throws Exception;
        String name(String projectId) throws Exception;
        String counter(String projectId) throws Exception;
        /**
         * Copies a consistent, self-contained project database to {@code database}
         * and returns what it contains, captured while project writes are paused:
         * the change counter and the asset names it may reference.
         */
        Captured snapshot(String projectId, File database) throws Exception;
    }

    interface Progress {
        void files(int done, int total);
    }

    static final class Failure extends Exception {
        final String code;
        Failure(String code) { super(code); this.code = code; }
    }

    static final class Captured {
        final String counter;
        final List<String> files;
        final List<String> metadata;

        Captured(String counter, List<String> files, List<String> metadata) {
            this.counter = counter;
            this.files = files;
            this.metadata = metadata;
        }
    }

    /** A staged database waiting to be published, with the assets it needs. */
    static final class Snapshot {
        String projectId;
        String counter;
        String snapshotAt;
        String name;
        File staging;
        File database;
        File source;
        List<String> files;
        List<String> metadata;
    }

    private final Context context;
    private final ContentResolver resolver;
    private final SharedPreferences prefs;
    private final Storage storage;
    private volatile boolean cancelled;

    ProjectBackup(Context context, Storage storage) {
        this.context = context.getApplicationContext();
        this.resolver = context.getContentResolver();
        this.prefs = context.getSharedPreferences("project-backup", Context.MODE_PRIVATE);
        this.storage = storage;
    }

    static void installTracking(SQLiteDatabase database) {
        database.execSQL("CREATE TABLE IF NOT EXISTS " + REVISION_TABLE +
            " (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL)");
        database.execSQL("INSERT OR IGNORE INTO " + REVISION_TABLE + " VALUES (1,0)");
        java.util.List<String> names = new java.util.ArrayList<>();
        try (Cursor tables = database.rawQuery(
            "SELECT name FROM sqlite_master WHERE type='table'", null)) {
            while (tables.moveToNext()) names.add(tables.getString(0));
        }
        for (String table : names) {
            if (table.equals(REVISION_TABLE) || table.startsWith("sqlite_") ||
                !table.matches("[A-Za-z_][A-Za-z0-9_]*")) continue;
            for (String action : new String[] {"INSERT", "UPDATE", "DELETE"}) {
                database.execSQL("CREATE TRIGGER IF NOT EXISTS rvn_backup_" + table + "_" + action +
                    " AFTER " + action + " ON \"" + table + "\" BEGIN UPDATE " +
                    REVISION_TABLE + " SET revision=revision+1 WHERE id=1; END");
            }
        }
    }

    static long databaseRevision(SQLiteDatabase database) {
        try (Cursor row = database.rawQuery("SELECT revision FROM " + REVISION_TABLE + " WHERE id=1", null)) {
            if (!row.moveToFirst()) throw new IllegalStateException("Missing backup revision.");
            return row.getLong(0);
        }
    }

    /** Lists the assets a snapshot may reference. Call it while project writes are paused. */
    static Captured capture(String counter, File projectRoot) throws Exception {
        return new Captured(counter, assetNames(new File(projectRoot, "files")),
            assetNames(new File(projectRoot, "file-metadata")));
    }

    private static List<String> assetNames(File directory) throws Exception {
        List<String> names = new ArrayList<>();
        for (File file : listFiles(directory)) {
            if (file.getName().startsWith(PROJECT_WRITE_PREFIX)) continue;
            // Project media are flat files. A folder here (from an imported
            // project, for example) is not media and must not block backups.
            if (!file.isFile()) continue;
            names.add(file.getName());
        }
        return names;
    }

    void markAssetChange(String projectId) throws Exception {
        String key = "assets:" + projectId;
        save(prefs.edit().putLong(key, Math.addExact(prefs.getLong(key, 0), 1)));
    }

    long assetRevision(String projectId) { return prefs.getLong("assets:" + projectId, 0); }

    boolean configured() { return !prefs.getString("uri", "").isEmpty(); }

    String folderUri() { return prefs.getString("uri", ""); }

    String folderDisplayPath() { return configured() ? displayFolderPath(backupRoot()) : ""; }

    /** Last successful snapshot time per project, read from local checkpoints only. */
    Map<String, String> savedSnapshots() {
        Map<String, String> snapshots = new LinkedHashMap<>();
        for (Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
            if (!entry.getKey().startsWith("success:")) continue;
            try {
                snapshots.put(entry.getKey().substring("success:".length()),
                    new JSONObject(String.valueOf(entry.getValue())).optString("snapshotAt"));
            } catch (org.json.JSONException ignored) { }
        }
        return snapshots;
    }

    /** Last recorded backup error per project, read from local preferences only. */
    Map<String, String> savedErrors() {
        Map<String, String> errors = new LinkedHashMap<>();
        for (Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
            if (entry.getKey().startsWith("error:")) {
                errors.put(entry.getKey().substring("error:".length()), String.valueOf(entry.getValue()));
            }
        }
        return errors;
    }

    String savedSnapshotAt(String projectId) throws Exception { return savedProject(projectId).optString("snapshotAt"); }

    String savedCounter(String projectId) throws Exception { return savedProject(projectId).optString("changeCounter"); }

    String error(String projectId) { return prefs.getString("error:" + projectId, ""); }

    /** Backup folders currently in the destination, keyed by name. */
    Map<String, Uri> backupFolders() throws Exception {
        return children(backupRoot());
    }

    String folderPath(Map<String, Uri> folders, String projectId) {
        try {
            Uri folder = projectFolder(folders, projectId);
            return folder == null ? "" : displayFolderPath(folder);
        } catch (Exception error) {
            return ""; // Lost access is reported by the next pass.
        }
    }

    // Before Android 10 the provider also exposes Documents as its own "home"
    // root, so choosing Documents there gives ids like "home:<path>". Read
    // those as the same place on primary storage; I/O keeps the granted ids.
    static String primaryDocumentId(String documentId) {
        if (!documentId.startsWith("home:")) return documentId;
        String path = documentId.substring("home:".length());
        return "primary:" + android.os.Environment.DIRECTORY_DOCUMENTS + (path.isEmpty() ? "" : "/" + path);
    }

    private static String displayFolderPath(Uri directory) {
        // Display only; all backup I/O continues through the granted SAF URI.
        String documentId = primaryDocumentId(DocumentsContract.getDocumentId(directory));
        if (documentId.startsWith("primary:")) {
            return new File(android.os.Environment.getExternalStorageDirectory(),
                documentId.substring("primary:".length())).getAbsolutePath();
        }
        return documentId.replace(":", ":/");
    }

    JSONObject configure(String value, boolean acceptExisting) throws Exception {
        Uri tree = Uri.parse(value);
        if (!"content".equals(tree.getScheme()) ||
            !"com.android.externalstorage.documents".equals(tree.getAuthority())) {
            throw new Failure("localFolder");
        }
        String treeId = primaryDocumentId(DocumentsContract.getTreeDocumentId(tree));
        String relativePath = treeId.substring(treeId.indexOf(':') + 1).toLowerCase(Locale.ROOT);
        if (relativePath.equals("android") || relativePath.startsWith("android/")) throw new Failure("appFolder");
        // The picker owns consent; never manufacture permission from a raw path.
        boolean granted = resolver.getPersistedUriPermissions().stream().anyMatch(
            permission -> permission.getUri().equals(tree) && permission.isReadPermission() && permission.isWritePermission());
        if (!granted) throw new Failure("reconnect");
        Uri selected = root(tree);
        Map<String, Uri> selectedEntries = children(selected);
        Uri destination = relativePath.equals("documents") ? selectedEntries.get(BACKUP_FOLDER_NAME) : selected;
        if (destination == null) {
            probeSpace(selected);
            destination = create(selected, BACKUP_FOLDER_NAME, true, children(selected));
        }
        requireDirectory(destination);
        boolean changed = prefs.getString("uri", "").isEmpty() ||
            !DocumentsContract.getDocumentId(destination).equals(DocumentsContract.getDocumentId(backupRoot()));
        if (changed && !acceptExisting && !children(destination).isEmpty()) {
            return new JSONObject().put("needsExistingConfirmation", true);
        }
        probeSpace(destination);
        SharedPreferences.Editor editor = prefs.edit();
        if (changed) {
            for (String key : prefs.getAll().keySet()) {
                if (key.startsWith("success:") || key.startsWith("folder:") || key.startsWith("error:")) editor.remove(key);
            }
        } else {
            // The same folder may be selected through a different tree grant.
            // Keep checkpoints; drop project-folder URIs saved by older versions.
            for (String key : prefs.getAll().keySet()) {
                if (key.startsWith("folder:") || key.startsWith("error:")) editor.remove(key);
            }
        }
        save(editor.putString("uri", value).putString("directory", destination.toString())
            .putString("name", name(destination)).remove("lastAttemptAt"));
        return new JSONObject().put("configured", true).put("changed", changed);
    }

    void disable() throws Exception {
        SharedPreferences.Editor editor = prefs.edit()
            .remove("uri").remove("directory").remove("name").remove("lastAttemptAt");
        for (String key : prefs.getAll().keySet()) {
            if (key.startsWith("success:") || key.startsWith("folder:") || key.startsWith("error:")) editor.remove(key);
        }
        // Forget the destination, never delete its files. Keep asset revisions
        // and URI grants, which other import/export workflows may still use.
        save(editor);
    }

    /**
     * Returns the projects among {@code projectIds} (every project when null)
     * whose backup is missing, damaged, failed, or older than their data.
     */
    List<String> pendingProjects(Collection<String> projectIds) throws Exception {
        List<String> ids = new ArrayList<>();
        if (projectIds == null) {
            JSONArray projects = storage.projects();
            for (int i = 0; i < projects.length(); i++) ids.add(projects.getJSONObject(i).getString("id"));
        } else {
            ids.addAll(projectIds);
        }
        List<String> pending = new ArrayList<>();
        Map<String, Uri> folders = null;
        for (String id : ids) {
            if (cancelled) break;
            try {
                if (folders == null) folders = children(backupRoot());
                JSONObject saved = savedProject(id);
                Map<String, Uri> entries = intact(folders, id, saved);
                if (entries == null && saved.has("databaseSha256")) save(prefs.edit().remove("success:" + id));
                boolean due = entries == null || !storage.counter(id).equals(saved.optString("changeCounter")) ||
                    !prefs.getString("error:" + id, "").isEmpty();
                // An unchanged project's backup can still lose files outside
                // the app (a cleaner app, a person tidying the folder). The
                // next backup copies whatever is gone again.
                if (due || !complete(entries, storage.root(id), saved)) pending.add(id);
            } catch (Exception error) {
                recordError(id, error);
                pending.add(id);
            }
        }
        return pending;
    }

    // A cheap check that the last published backup is still there: the folder,
    // its database, asset folders, and metadata matching the saved checkpoint.
    // Returns the backup folder's entries, or null when it is not intact.
    private Map<String, Uri> intact(Map<String, Uri> folders, String projectId, JSONObject saved) throws Exception {
        if (!saved.has("databaseSha256")) return null;
        Uri folder = projectFolder(folders, projectId);
        if (folder == null) return null;
        Map<String, Uri> entries = children(folder);
        boolean intact = entries.containsKey("project.db") && entries.containsKey("files") &&
            entries.containsKey("file-metadata") && metadataMatches(entries.get("backup.json"), saved);
        return intact ? entries : null;
    }

    // Whether an intact, current backup still holds every media file the
    // project has and a database of the size that was published. Costs two
    // folder listings, so it runs only for projects that look up to date.
    private boolean complete(Map<String, Uri> entries, File projectRoot, JSONObject saved) throws Exception {
        if (saved.has("databaseBytes") && documentSize(entries.get("project.db")) != saved.getLong("databaseBytes")) return false;
        return children(entries.get("files")).keySet().containsAll(localAssetNames(new File(projectRoot, "files"))) &&
            children(entries.get("file-metadata")).keySet().containsAll(localAssetNames(new File(projectRoot, "file-metadata")));
    }

    // Like assetNames, but never fails: the snapshot does the strict listing.
    private static List<String> localAssetNames(File directory) {
        List<String> names = new ArrayList<>();
        File[] files = directory.listFiles();
        if (files == null) return names;
        for (File file : files) {
            if (file.isFile() && !file.getName().startsWith(PROJECT_WRITE_PREFIX)) names.add(file.getName());
        }
        return names;
    }

    /** Stages the project database. Runs before any backup-folder work. */
    Snapshot prepare(String projectId) throws Exception {
        Snapshot next = new Snapshot();
        next.projectId = projectId;
        try {
            checkActive();
            next.source = storage.root(projectId);
            next.name = storage.name(projectId);
            long databaseSize = new File(next.source, "project.db").length() +
                new File(next.source, "project.db-wal").length();
            File stagingRoot = new File(context.getNoBackupFilesDir(), STAGING_DIRECTORY);
            next.staging = new File(stagingRoot, projectId);
            removeTree(next.staging);
            if (!next.staging.mkdirs()) throw new Failure("failed");
            requireSpace(new StatFs(next.staging.getAbsolutePath()).getAvailableBytes(), Math.addExact(databaseSize, 16384));
            next.database = new File(next.staging, "project.db");
            Captured captured = storage.snapshot(projectId, next.database);
            next.counter = captured.counter;
            next.files = captured.files;
            next.metadata = captured.metadata;
            next.snapshotAt = timestamp();
            checkActive();
            return next;
        } catch (Exception error) {
            if (next.staging != null) removeTree(next.staging);
            recordError(projectId, error);
            throw error;
        }
    }

    /** Publishes a prepared snapshot. Copies assets straight from the project. */
    JSONObject publish(Snapshot current, Progress progress) throws Exception {
        String projectId = current.projectId;
        try {
            checkActive();
            // The copy of the project's own database failed its check: the
            // project is damaged, not the backup folder. Keep the last backup.
            try { validateDatabase(current.database, projectId); }
            catch (android.database.sqlite.SQLiteException | org.json.JSONException error) { throw new Failure("projectDamaged"); }
            catch (Failure error) { throw "invalidBackup".equals(error.code) ? new Failure("projectDamaged") : error; }
            Uri directory = projectDirectory(projectId, current.name);
            long[] destinationSpace = probeSpace(directory);
            Map<String, Uri> entries = children(directory);
            Map<String, Uri> existingFiles = entries.containsKey("files") ? children(entries.get("files")) : new LinkedHashMap<>();
            Map<String, Uri> existingMetadata = entries.containsKey("file-metadata") ? children(entries.get("file-metadata")) : new LinkedHashMap<>();
            List<File> missingFiles = missing(new File(current.source, "files"), current.files, existingFiles);
            List<File> missingMetadata = missing(new File(current.source, "file-metadata"), current.metadata, existingMetadata);

            long missingBytes = 0;
            for (List<File> files : java.util.Arrays.asList(missingFiles, missingMetadata)) {
                for (File file : files) missingBytes = Math.addExact(missingBytes, file.length());
            }
            long databaseSize = current.database.length();
            long required = Math.addExact(Math.addExact(databaseSize, missingBytes), 16384);
            long validationSize = Math.max(documentSize(entries.get("project.db")), documentSize(entries.get("project.db.previous")));
            long localRequired = Math.addExact(validationSize, 16384);
            // Emulated primary storage uses FUSE: its st_dev differs from /data
            // even though both consume the same physical storage pool.
            boolean primary = primaryDocumentId(DocumentsContract.getTreeDocumentId(directory)).startsWith("primary:");
            if (primary || Os.stat(current.staging.getAbsolutePath()).st_dev == destinationSpace[1]) {
                required = Math.addExact(required, localRequired);
                localRequired = required;
            }
            requireSpace(destinationSpace[0], required);
            requireSpace(new StatFs(current.staging.getAbsolutePath()).getAvailableBytes(), localRequired);
            Uri filesDirectory = ensureDirectory(directory, "files", entries);
            Uri metadataDirectory = ensureDirectory(directory, "file-metadata", entries);

            // Each verified asset stays in the backup, so an interrupted pass
            // resumes with only the remaining files. Assets are immutable once
            // written, so copying them after the snapshot is consistent.
            int total = missingFiles.size() + missingMetadata.size();
            int done = 0;
            progress.files(done, total);
            for (File file : missingFiles) {
                copyAsset(file, filesDirectory, existingFiles);
                progress.files(++done, total);
            }
            for (File file : missingMetadata) {
                copyAsset(file, metadataDirectory, existingMetadata);
                progress.files(++done, total);
            }
            checkActive();

            entries = children(directory);
            Uri canonical = entries.get("project.db");
            Uri previous = entries.get("project.db.previous");
            int canonicalState = documentDatabase(canonical, projectId, current.staging);
            // Never replace another project's database.
            if (canonicalState == DATABASE_OTHER_PROJECT) throw new Failure("invalidBackup");
            boolean canonicalValid = canonicalState == DATABASE_VALID;
            // Repair only with a verified predecessor; do not delete an only-good copy.
            if (!canonicalValid && documentDatabase(previous, projectId, current.staging) == DATABASE_VALID) {
                delete(canonical);
                entries.remove("project.db");
                canonical = rename(previous, "project.db");
                entries.remove("project.db.previous");
                entries.put("project.db", canonical);
                previous = null;
                canonicalValid = true;
            } else if (canonicalState == DATABASE_DAMAGED) {
                // An unreadable copy must not stop every later backup. Keep it
                // beside the new one, under a name restore never reads.
                if (entries.containsKey("project.db.damaged")) delete(entries.remove("project.db.damaged"));
                entries.put("project.db.damaged", rename(canonical, "project.db.damaged"));
                entries.remove("project.db");
                canonical = null;
            }
            if (entries.containsKey("project.db.next")) delete(entries.remove("project.db.next"));
            Uri incoming = create(directory, "project.db.next", false, entries);
            String hash = copyVerified(current.database, incoming);
            checkActive();
            if (canonicalValid) {
                delete(previous);
                rename(canonical, "project.db.previous");
            }
            checkActive();
            Uri published = rename(incoming, "project.db");
            if (!hash.equals(hash(published))) throw new Failure("verification");
            JSONObject metadata = new JSONObject().put("formatVersion", 1)
                .put("projectId", projectId).put("changeCounter", current.counter)
                .put("snapshotAt", current.snapshotAt).put("completedAt", timestamp())
                .put("databaseBytes", databaseSize).put("databaseSha256", hash);
            File metadataFile = new File(current.staging, "backup.json");
            try (FileOutputStream out = new FileOutputStream(metadataFile)) {
                out.write(metadata.toString(2).getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            }
            entries = children(directory);
            if (entries.containsKey("backup.json.next")) delete(entries.remove("backup.json.next"));
            Uri metadataNext = create(directory, "backup.json.next", false, entries);
            copyVerified(metadataFile, metadataNext);
            checkActive();
            delete(entries.get("backup.json"));
            rename(metadataNext, "backup.json");
            save(prefs.edit().putString("success:" + projectId, metadata.toString()).remove("error:" + projectId));
            return metadata;
        } catch (Exception error) {
            recordError(projectId, error);
            throw error;
        } finally {
            release(current);
        }
    }

    void release(Snapshot snapshot) {
        if (snapshot != null && snapshot.staging != null) removeTree(snapshot.staging);
    }

    /** Removes staged databases left by a process that ended mid-backup. */
    void removeStaleStaging() {
        removeTree(new File(context.getNoBackupFilesDir(), STAGING_DIRECTORY));
    }

    /** Stops the running copy at the next chunk boundary. */
    void cancel() { cancelled = true; }

    void resume() { cancelled = false; }

    boolean isCancelled() { return cancelled; }

    private static List<File> missing(File sourceDirectory, List<String> names, Map<String, Uri> existing) {
        List<File> files = new ArrayList<>();
        for (String name : names) {
            if (!existing.containsKey(name)) files.add(new File(sourceDirectory, name));
        }
        return files;
    }

    private void copyAsset(File file, Uri directory, Map<String, Uri> existing) throws Exception {
        checkActive();
        // Deleted after the snapshot: that snapshot would reference a missing
        // file, so stop and let the next pass take a fresh snapshot.
        if (!file.isFile()) throw new Failure("changed");
        String temporary = file.getName() + ".next";
        if (existing.containsKey(temporary)) delete(existing.remove(temporary));
        Uri incoming = create(directory, temporary, false, existing);
        try {
            copyVerified(file, incoming);
        } catch (java.io.FileNotFoundException error) {
            if (!file.exists()) throw new Failure("changed");
            throw error;
        }
        existing.remove(temporary);
        existing.put(file.getName(), rename(incoming, file.getName()));
    }

    // A project's backup folder is the one whose name ends in "-<projectId>".
    // The label before it is the project name at creation, so renames keep the
    // original folder, and stopping, re-enabling, or switching back finds it again.
    private Uri projectDirectory(String projectId, String name) throws Exception {
        Uri parent = backupRoot();
        Map<String, Uri> entries = children(parent);
        Uri folder = projectFolder(entries, projectId);
        // The id suffix keeps same-named projects distinct without rename logic.
        String label = sanitizeFolderTitle(name, "Project") + "-" + projectId;
        return folder != null ? folder : create(parent, label, true, entries);
    }

    // With several matching folders, use the one whose backup.json or project.db
    // changed most recently; ties go to the first name so the choice is stable.
    // The other folders are never touched.
    private Uri projectFolder(Map<String, Uri> entries, String projectId) throws Exception {
        List<String> names = new ArrayList<>();
        for (Map.Entry<String, Uri> entry : entries.entrySet()) {
            if (entry.getKey().endsWith("-" + projectId) && isDirectory(entry.getValue())) names.add(entry.getKey());
        }
        if (names.size() < 2) return names.isEmpty() ? null : entries.get(names.get(0));
        Collections.sort(names);
        String newest = names.get(0);
        long newestWrite = lastBackupWrite(entries.get(newest));
        for (String name : names.subList(1, names.size())) {
            long write = lastBackupWrite(entries.get(name));
            if (write > newestWrite) { newest = name; newestWrite = write; }
        }
        return entries.get(newest);
    }

    private long lastBackupWrite(Uri folder) throws Exception {
        Uri uri = DocumentsContract.buildChildDocumentsUriUsingTree(folder, DocumentsContract.getDocumentId(folder));
        long latest = 0;
        try (Cursor cursor = resolver.query(uri, new String[] {
            DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_LAST_MODIFIED
        }, null, null, null)) {
            if (cursor == null) throw new Failure("reconnect");
            while (cursor.moveToNext()) {
                String name = cursor.getString(0);
                if ((name.equals("backup.json") || name.equals("project.db")) && !cursor.isNull(1)) {
                    latest = Math.max(latest, cursor.getLong(1));
                }
            }
        }
        return latest;
    }

    private boolean metadataMatches(Uri uri, JSONObject saved) throws Exception {
        if (uri == null || !saved.has("databaseSha256")) return false;
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) throw new Failure("reconnect");
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[1024];
            int count;
            while ((count = in.read(buffer)) != -1) {
                if (bytes.size() + count > 16384) return false;
                bytes.write(buffer, 0, count);
            }
            JSONObject metadata;
            try { metadata = new JSONObject(bytes.toString("UTF-8")); }
            catch (org.json.JSONException error) { return false; }
            return metadata.optInt("formatVersion") == 1 &&
                saved.optString("projectId").equals(metadata.optString("projectId")) &&
                saved.optString("changeCounter").equals(metadata.optString("changeCounter")) &&
                saved.optString("databaseSha256").equals(metadata.optString("databaseSha256"));
        }
    }

    private JSONObject savedProject(String id) throws Exception {
        return new JSONObject(prefs.getString("success:" + id, "{}"));
    }

    void recordError(String id, Exception error) throws Exception {
        String code = failureCode(error);
        // A cancelled pass or a closed activity is not a failure of the backup.
        if ("interrupted".equals(code)) return;
        save(prefs.edit().putString("error:" + id, code));
    }

    // The project was deleted in the app. Its backup folder is kept.
    void forget(String projectId) throws Exception {
        save(prefs.edit().remove("error:" + projectId).remove("success:" + projectId));
    }

    static String errorCode(Throwable error) {
        if (error instanceof Failure) return ((Failure) error).code;
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof android.system.ErrnoException &&
                ((android.system.ErrnoException) cause).errno == android.system.OsConstants.ENOSPC) return "lowSpace";
            String message = cause.getMessage();
            if (message != null && (message.contains("ENOSPC") || message.contains("No space left"))) return "lowSpace";
        }
        if (error instanceof SecurityException || error instanceof java.io.FileNotFoundException) return "reconnect";
        return "failed";
    }

    // With an SD card or USB drive removed, the provider rejects every
    // document below the chosen folder with an IllegalArgumentException, which
    // looks like any other failure. When the backup folder itself cannot be
    // reached either, the storage is gone: ask the user to reconnect it.
    String failureCode(Throwable error) {
        String code = errorCode(error);
        return "failed".equals(code) && configured() && !folderReachable() ? "reconnect" : code;
    }

    private boolean folderReachable() {
        return exists(backupRoot());
    }

    private static void save(SharedPreferences.Editor editor) throws Exception {
        if (!editor.commit()) throw new Failure("failed");
    }

    private void checkActive() throws Exception {
        if (cancelled || Thread.currentThread().isInterrupted()) throw new Failure("interrupted");
    }

    static void requireSpace(long available, long additional) throws Exception {
        if (additional < 0 || available < RESERVE_BYTES || available - RESERVE_BYTES < additional) throw new Failure("lowSpace");
    }

    // Shared folder-title rules for export and backup destinations.
    static String sanitizeFolderTitle(String title, String fallback) {
        String resolvedTitle = title == null ? "" : title.trim();
        if (resolvedTitle.isEmpty()) resolvedTitle = fallback;
        // Providers rewrite control characters and unpaired surrogates; a
        // rewritten name would no longer match the requested folder name.
        resolvedTitle = resolvedTitle.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}\\p{Cs}]+", " ");
        resolvedTitle = resolvedTitle.replaceAll("\\s+", " ");
        // Strip dots and spaces from both ends; a leading dot hides the folder.
        resolvedTitle = resolvedTitle.replaceAll("^[.\\s]+|[.\\s]+$", "");
        if (resolvedTitle.isEmpty()) resolvedTitle = fallback;
        // Cut whole code points: at most 80, and 200 UTF-8 bytes so a suffix
        // still fits the 255-byte file name limit.
        int end = resolvedTitle.offsetByCodePoints(0, Math.min(80, resolvedTitle.codePointCount(0, resolvedTitle.length())));
        while (resolvedTitle.substring(0, end).getBytes(StandardCharsets.UTF_8).length > 200) {
            end = resolvedTitle.offsetByCodePoints(end, -1);
        }
        return resolvedTitle.substring(0, end).trim();
    }

    // Checks create, write, read, rename, and delete with a disposable file,
    // and measures the destination volume. Once per folder setup or publication.
    private long[] probeSpace(Uri directory) throws Exception {
        Uri probe = null;
        try {
            // Native-only, process-monotonic probe names; never overwrite a user's file.
            probe = create(directory, ".routevn-space-" + System.nanoTime(), false, children(directory));
            long available;
            long device;
            try (ParcelFileDescriptor descriptor = resolver.openFileDescriptor(probe, "rw")) {
                if (descriptor == null) throw new Failure("unknownSpace");
                StructStatVfs stats = Os.fstatvfs(descriptor.getFileDescriptor());
                available = Math.multiplyExact(stats.f_bavail, stats.f_frsize);
                device = Os.fstat(descriptor.getFileDescriptor()).st_dev;
                Os.write(descriptor.getFileDescriptor(), new byte[] {1}, 0, 1);
                Os.fsync(descriptor.getFileDescriptor());
            }
            try (InputStream in = resolver.openInputStream(probe)) {
                if (in == null || in.read() != 1) throw new Failure("verification");
            }
            probe = rename(probe, name(probe) + "-renamed");
            return new long[] {available, device};
        } catch (android.system.ErrnoException | ArithmeticException error) {
            throw new Failure("unknownSpace");
        } finally { delete(probe); }
    }

    // Copies through a temporary document, hashing the source as it streams,
    // then reads the copy back to verify it. Returns the verified hash.
    private String copyVerified(File source, Uri destination) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new DigestInputStream(new FileInputStream(source), digest);
             ParcelFileDescriptor descriptor = resolver.openFileDescriptor(destination, "wt")) {
            if (descriptor == null) throw new Failure("failed");
            try (OutputStream out = new FileOutputStream(descriptor.getFileDescriptor())) {
                long length = source.length();
                requireSpace(available(descriptor), length);
                byte[] buffer = new byte[128 * 1024];
                int count;
                long copied = 0;
                long nextCheck = 8L * 1024 * 1024;
                while ((count = in.read(buffer)) != -1) {
                    checkActive();
                    if (copied >= nextCheck) {
                        requireSpace(available(descriptor), Math.max(0, length - copied));
                        nextCheck = copied + 8L * 1024 * 1024;
                    }
                    out.write(buffer, 0, count);
                    copied += count;
                }
                out.flush();
                Os.fsync(descriptor.getFileDescriptor());
            }
        }
        String expected = hex(digest.digest());
        if (!expected.equals(hash(destination))) throw new Failure("verification");
        return expected;
    }

    private static long available(ParcelFileDescriptor descriptor) throws Exception {
        try {
            StructStatVfs stats = Os.fstatvfs(descriptor.getFileDescriptor());
            return Math.multiplyExact(stats.f_bavail, stats.f_frsize);
        } catch (android.system.ErrnoException | ArithmeticException error) {
            throw new Failure("unknownSpace");
        }
    }

    private static final int DATABASE_MISSING = 0;
    private static final int DATABASE_VALID = 1;
    private static final int DATABASE_DAMAGED = 2;
    private static final int DATABASE_OTHER_PROJECT = 3;

    private int documentDatabase(Uri uri, String projectId, File staging) throws Exception {
        if (uri == null) return DATABASE_MISSING;
        File candidate = new File(staging, "validate.db");
        try {
            // Read/capacity failures must abort, not turn a good backup into a
            // supposedly corrupt candidate that could be replaced.
            copyToFile(uri, candidate);
            try { validateDatabase(candidate, projectId); return DATABASE_VALID; }
            catch (android.database.sqlite.SQLiteException | org.json.JSONException error) { return DATABASE_DAMAGED; }
            catch (Failure error) {
                if (!"invalidBackup".equals(error.code)) throw error;
                return otherProjectDatabase(candidate, projectId) ? DATABASE_OTHER_PROJECT : DATABASE_DAMAGED;
            }
        } finally {
            for (String suffix : new String[] {"", "-wal", "-shm", "-journal"}) removeTree(new File(candidate.getPath() + suffix));
        }
    }

    // Whether a database that failed validation still names another project.
    private static boolean otherProjectDatabase(File file, String projectId) {
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(file.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
             Cursor info = db.rawQuery("SELECT value FROM app_state WHERE key='projectInfo'", null)) {
            if (!info.moveToFirst()) return false;
            String id = new JSONObject(info.getString(0)).optString("id");
            return !id.isEmpty() && !id.equals(projectId);
        } catch (Exception error) {
            return false;
        }
    }

    private long documentSize(Uri uri) throws Exception {
        if (uri == null) return 0;
        try (Cursor row = resolver.query(uri, new String[] {DocumentsContract.Document.COLUMN_SIZE}, null, null, null)) {
            if (row == null || !row.moveToFirst() || row.isNull(0) || row.getLong(0) < 0) throw new Failure("unknownSpace");
            return row.getLong(0);
        }
    }

    void copyToFile(Uri uri, File destination) throws Exception {
        requireSpace(new StatFs(destination.getParent()).getAvailableBytes(), documentSize(uri));
        try (InputStream in = resolver.openInputStream(uri); FileOutputStream out = new FileOutputStream(destination)) {
            if (in == null) throw new Failure("failed");
            byte[] buffer = new byte[128 * 1024];
            int count;
            while ((count = in.read(buffer)) != -1) {
                checkActive();
                requireSpace(new StatFs(destination.getParent()).getAvailableBytes(), count);
                out.write(buffer, 0, count);
            }
            out.getFD().sync();
        }
    }

    static void validateDatabase(File file, String expectedId) throws Exception {
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(file.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY)) {
            try (Cursor check = db.rawQuery("PRAGMA integrity_check", null)) {
                if (!check.moveToFirst() || !"ok".equals(check.getString(0))) throw new Failure("invalidBackup");
            }
            try (Cursor info = db.rawQuery("SELECT value FROM app_state WHERE key='projectInfo'", null)) {
                if (!info.moveToFirst()) throw new Failure("invalidBackup");
                String id = new JSONObject(info.getString(0)).getString("id");
                if (id.isEmpty() || (expectedId != null && !expectedId.equals(id))) throw new Failure("invalidBackup");
            }
        }
    }

    String hash(File file) throws Exception {
        try (InputStream in = new FileInputStream(file)) { return hash(in); }
    }

    private String hash(Uri uri) throws Exception {
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) throw new Failure("verification");
            return hash(in);
        }
    }

    private String hash(InputStream in) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[128 * 1024];
        int count;
        while ((count = in.read(buffer)) != -1) {
            checkActive();
            digest.update(buffer, 0, count);
        }
        return hex(digest.digest());
    }

    private static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder();
        for (byte b : bytes) value.append(String.format(Locale.ROOT, "%02x", b & 255));
        return value.toString();
    }

    static File[] listFiles(File directory) throws Exception {
        File[] files = directory.listFiles();
        if (files == null) throw new Failure("failed");
        return files;
    }

    static void removeTree(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) removeTree(child);
        }
        file.delete();
    }

    private static String timestamp() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private Uri root(Uri tree) { return DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)); }

    private Uri backupRoot() {
        String directory = prefs.getString("directory", "");
        // Keep existing configurations at their original destination until the
        // user explicitly selects a folder again. Never move old backups.
        return directory.isEmpty() ? root(Uri.parse(prefs.getString("uri", ""))) : Uri.parse(directory);
    }

    private void requireDirectory(Uri uri) throws Exception {
        if (!isDirectory(uri)) throw new Failure("nameConflict");
    }

    private boolean isDirectory(Uri uri) throws Exception {
        try (Cursor cursor = resolver.query(uri, new String[] {DocumentsContract.Document.COLUMN_MIME_TYPE}, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) throw new Failure("reconnect");
            return DocumentsContract.Document.MIME_TYPE_DIR.equals(cursor.getString(0));
        }
    }

    private Map<String, Uri> children(Uri directory) throws Exception {
        Uri uri = DocumentsContract.buildChildDocumentsUriUsingTree(directory, DocumentsContract.getDocumentId(directory));
        Map<String, Uri> entries = new LinkedHashMap<>();
        try (Cursor cursor = resolver.query(uri, new String[] {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME
        }, null, null, null)) {
            if (cursor == null) throw new Failure("reconnect");
            while (cursor.moveToNext()) {
                String name = cursor.getString(1);
                if (entries.containsKey(name)) throw new Failure("nameConflict");
                entries.put(name, DocumentsContract.buildDocumentUriUsingTree(directory, cursor.getString(0)));
            }
        }
        return entries;
    }

    private String name(Uri uri) throws Exception {
        try (Cursor cursor = resolver.query(uri, new String[] {DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) throw new Failure("reconnect");
            return cursor.getString(0);
        }
    }

    private Uri ensureDirectory(Uri parent, String name, Map<String, Uri> entries) throws Exception {
        Uri existing = entries.get(name);
        return existing == null ? create(parent, name, true, entries) : existing;
    }

    // `known` is the parent's current listing; it is updated with the new entry
    // so a folder is listed once per publication rather than once per file.
    private Uri create(Uri parent, String name, boolean directory, Map<String, Uri> known) throws Exception {
        if (known.containsKey(name)) throw new Failure("nameConflict");
        Uri result = DocumentsContract.createDocument(resolver, parent,
            directory ? DocumentsContract.Document.MIME_TYPE_DIR : "application/octet-stream", name);
        if (result == null) throw new Failure("nameConflict");
        if (!name.equals(name(result))) {
            delete(result); // The provider rewrote the name; do not leak the document.
            throw new Failure("nameConflict");
        }
        known.put(name, result);
        return result;
    }

    // Android 9's storage provider renames the document, then fails to find it
    // under its old name and throws FileNotFoundException. Accept that rename
    // when the old document is gone and the new one is in its place. Check
    // first that the name was free: a taken name makes the provider pick
    // "name (1)", and the file that already had the name is not the renamed one.
    private Uri rename(Uri uri, String name) throws Exception {
        boolean beforeAndroid10 = android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q;
        Uri renamed = sibling(uri, name);
        boolean nameFree = beforeAndroid10 && !exists(renamed);
        Uri result;
        try {
            result = DocumentsContract.renameDocument(resolver, uri, name);
        } catch (java.io.FileNotFoundException error) {
            // Both gone, or the old one still there: a real failure.
            if (!beforeAndroid10 || exists(uri) || !exists(renamed)) throw error;
            if (!nameFree) throw new Failure("nameConflict");
            result = renamed;
        }
        if (result == null || !name.equals(name(result))) throw new Failure("nameConflict");
        return result;
    }

    // This provider's document ids are paths: a sibling keeps the parent path.
    private static Uri sibling(Uri uri, String name) {
        String id = DocumentsContract.getDocumentId(uri);
        int end = Math.max(id.lastIndexOf('/'), id.indexOf(':'));
        return DocumentsContract.buildDocumentUriUsingTree(uri, id.substring(0, end + 1) + name);
    }

    private boolean exists(Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] {DocumentsContract.Document.COLUMN_DOCUMENT_ID}, null, null, null)) {
            return cursor != null && cursor.moveToFirst();
        } catch (RuntimeException error) {
            return false;
        }
    }

    private void delete(Uri uri) throws Exception {
        if (uri != null && !DocumentsContract.deleteDocument(resolver, uri)) throw new Failure("failed");
    }
}
