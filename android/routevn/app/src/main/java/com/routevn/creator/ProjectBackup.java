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
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.Semaphore;
import org.json.JSONArray;
import org.json.JSONObject;

/** Local-folder backups. All calls except publish run on the storage executor. */
final class ProjectBackup {
    static final long RESERVE_BYTES = 1_000_000_000L;
    static final long INTERVAL_MS = 10 * 60 * 1000L;
    private static final Semaphore PUBLICATION_LOCK = new Semaphore(1);
    private static final String REVISION_TABLE = "routevn_backup_revision";
    private static final String BACKUP_FOLDER_NAME = "RouteVN Backups";

    interface Storage {
        JSONArray projects() throws Exception;
        File root(String projectId) throws Exception;
        String counter(String projectId) throws Exception;
        void snapshot(String projectId, File destination) throws Exception;
    }

    static final class Failure extends Exception {
        final String code;
        Failure(String code) { super(code); this.code = code; }
    }

    private final Context context;
    private final ContentResolver resolver;
    private final SharedPreferences prefs;
    private final Storage storage;
    private volatile boolean closed;
    private volatile boolean publishing;
    private volatile Prepared prepared;

    private static final class Prepared {
        String projectId;
        String counter;
        String snapshotAt;
        Uri directory;
        File staging;
        File database;
        long destinationDevice;
    }

    ProjectBackup(Context context, Storage storage) {
        this.context = context.getApplicationContext();
        this.resolver = context.getContentResolver();
        this.prefs = context.getSharedPreferences("project-backup", Context.MODE_PRIVATE);
        this.storage = storage;
        // A killed process may leave staged assets behind. An older activity's
        // still-running worker owns the semaphore and must keep its staging.
        if (PUBLICATION_LOCK.tryAcquire()) {
            try { removeTree(new File(context.getNoBackupFilesDir(), "project-backup-staging")); }
            finally { PUBLICATION_LOCK.release(); }
        }
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

    void markAssetChange(String projectId) throws Exception {
        String key = "assets:" + projectId;
        save(prefs.edit().putLong(key, Math.addExact(prefs.getLong(key, 0), 1)));
    }

    long assetRevision(String projectId) { return prefs.getLong("assets:" + projectId, 0); }

    JSONObject status() throws Exception {
        JSONObject status = new JSONObject();
        String uri = prefs.getString("uri", "");
        status.put("configured", !uri.isEmpty());
        status.put("skipped", prefs.getBoolean("skipped", false));
        status.put("folder", new JSONObject().put("uri", uri)
            .put("displayPath", uri.isEmpty() ? "" : displayFolderPath(backupRoot())));
        status.put("lastAttemptAt", prefs.getLong("lastAttemptAt", 0));
        status.put("running", prepared != null);
        JSONArray projects = storage.projects();
        for (int i = 0; i < projects.length(); i++) {
            JSONObject project = projects.getJSONObject(i);
            String id = project.getString("id");
            JSONObject saved = savedProject(id);
            boolean pending = true;
            try { pending = !storage.counter(id).equals(saved.optString("changeCounter")); }
            catch (Exception error) { recordError(id, error); }
            project.put("pending", pending);
            project.put("snapshotAt", saved.optString("snapshotAt"));
            project.put("error", prefs.getString("error:" + id, ""));
            String backupFolder = prefs.getString("folder:" + id, "");
            project.put("backupFolderPath", backupFolder.isEmpty() ? "" : displayFolderPath(Uri.parse(backupFolder)));
        }
        status.put("projects", projects);
        return status;
    }

    private static String displayFolderPath(Uri directory) {
        // Display only; all backup I/O continues through the granted SAF URI.
        String documentId = DocumentsContract.getDocumentId(directory);
        if (documentId.startsWith("primary:")) {
            return new File(android.os.Environment.getExternalStorageDirectory(),
                documentId.substring("primary:".length())).getAbsolutePath();
        }
        return documentId.replace(":", ":/");
    }

    JSONObject configure(String value, boolean acceptExisting) throws Exception {
        if (prepared != null || !PUBLICATION_LOCK.tryAcquire()) throw new Failure("busy");
        try {
            Uri tree = Uri.parse(value);
            if (!"content".equals(tree.getScheme()) ||
                !"com.android.externalstorage.documents".equals(tree.getAuthority())) {
                throw new Failure("localFolder");
            }
            String treeId = DocumentsContract.getTreeDocumentId(tree);
            String relativePath = treeId.substring(treeId.indexOf(':') + 1).toLowerCase(Locale.ROOT);
            if (relativePath.equals("android") || relativePath.startsWith("android/")) throw new Failure("appFolder");
            // The picker owns consent; never manufacture permission from a raw path.
            boolean granted = resolver.getPersistedUriPermissions().stream().anyMatch(
                permission -> permission.getUri().equals(tree) && permission.isReadPermission() && permission.isWritePermission());
            if (!granted) throw new Failure("reconnect");
            Uri selected = root(tree);
            Uri destination = relativePath.equals("documents")
                ? children(selected).get(BACKUP_FOLDER_NAME) : selected;
            if (destination == null) {
                probeSpace(selected);
                destination = create(selected, BACKUP_FOLDER_NAME, true);
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
            }
            save(editor.putString("uri", value).putString("directory", destination.toString())
                .putString("name", name(destination))
                .putBoolean("skipped", false).putLong("lastAttemptAt", 0));
            return status();
        } finally { PUBLICATION_LOCK.release(); }
    }

    JSONObject skip() throws Exception {
        if (prefs.getString("uri", "").isEmpty()) save(prefs.edit().putBoolean("skipped", true));
        return status();
    }

    JSONObject disable() throws Exception {
        if (prepared != null || !PUBLICATION_LOCK.tryAcquire()) throw new Failure("busy");
        try {
            SharedPreferences.Editor editor = prefs.edit()
                .remove("uri").remove("directory").remove("name").remove("lastAttemptAt")
                .putBoolean("skipped", true);
            for (String key : prefs.getAll().keySet()) {
                if (key.startsWith("success:") || key.startsWith("folder:") || key.startsWith("error:")) editor.remove(key);
            }
            // Forget the destination, never delete its files. Keep asset revisions
            // and URI grants, which other import/export workflows may still use.
            save(editor);
            return status();
        } finally { PUBLICATION_LOCK.release(); }
    }

    JSONObject beginPass(boolean manual) throws Exception {
        long now = System.currentTimeMillis();
        long previous = prefs.getLong("lastAttemptAt", 0);
        boolean due = manual || previous == 0 || now < previous || now - previous >= INTERVAL_MS;
        if (!due || prefs.getString("uri", "").isEmpty()) return new JSONObject().put("due", false);
        save(prefs.edit().putLong("lastAttemptAt", now));
        return new JSONObject().put("due", true);
    }

    JSONObject pendingProjects() throws Exception {
        JSONArray projects = storage.projects();
        JSONArray pending = new JSONArray();
        for (int i = 0; i < projects.length(); i++) {
            String id = projects.getJSONObject(i).getString("id");
            try {
                JSONObject saved = savedProject(id);
                String folder = prefs.getString("folder:" + id, "");
                boolean intact = false;
                if (!folder.isEmpty()) {
                    Map<String, Uri> entries = children(Uri.parse(folder));
                    intact = entries.containsKey("project.db") && entries.containsKey("files") &&
                        entries.containsKey("file-metadata") && metadataMatches(entries.get("backup.json"), saved);
                }
                if (!intact && saved.has("databaseSha256")) save(prefs.edit().remove("success:" + id));
                if (!intact || !storage.counter(id).equals(saved.optString("changeCounter")) ||
                    !prefs.getString("error:" + id, "").isEmpty()) pending.put(id);
            } catch (Exception error) {
                recordError(id, error);
                pending.put(id);
            }
        }
        return new JSONObject().put("projectIds", pending);
    }

    synchronized JSONObject prepare(String projectId) throws Exception {
        if (closed || prepared != null || !PUBLICATION_LOCK.tryAcquire()) throw new Failure("busy");
        Prepared next = new Prepared();
        try {
            next.projectId = projectId;
            next.directory = projectDirectory(projectId);
            long[] destinationSpace = probeSpace(next.directory);
            next.destinationDevice = destinationSpace[1];
            File source = storage.root(projectId);
            File sourceDb = new File(source, "project.db");
            long databaseSize = sourceDb.length() + new File(source, "project.db-wal").length();
            Map<String, List<File>> missingAssets = missingAssets(source, next.directory);
            long missingBytes = 0;
            for (List<File> files : missingAssets.values()) {
                for (File file : files) missingBytes = Math.addExact(missingBytes, file.length());
            }
            long required = Math.addExact(Math.addExact(databaseSize, missingBytes), 16384);
            Map<String, Uri> entries = children(next.directory);
            long validationSize = Math.max(documentSize(entries.get("project.db")), documentSize(entries.get("project.db.previous")));
            long localRequired = Math.addExact(Math.addExact(Math.addExact(databaseSize, validationSize), missingBytes), 16384);
            // Emulated primary storage uses FUSE: its st_dev differs from /data
            // even though both consume the same physical storage pool.
            boolean primary = DocumentsContract.getTreeDocumentId(next.directory).startsWith("primary:");
            if (primary || Os.stat(source.getAbsolutePath()).st_dev == next.destinationDevice) {
                required = Math.addExact(required, localRequired);
                localRequired = required;
            }
            requireSpace(destinationSpace[0], required);
            requireSpace(new StatFs(context.getFilesDir().getAbsolutePath()).getAvailableBytes(), localRequired);
            next.staging = new File(context.getNoBackupFilesDir(), "project-backup-staging");
            removeTree(next.staging);
            if (!next.staging.mkdirs()) throw new Failure("failed");
            next.database = new File(next.staging, "project.db");
            storage.snapshot(projectId, next.staging);
            // Still on the storage executor: no project writes/deletes can run
            // between the database snapshot and these independent asset copies.
            stageAssets(missingAssets, next.staging);
            next.counter = storage.counter(projectId);
            next.snapshotAt = timestamp();
            prepared = next;
            return new JSONObject().put("projectId", projectId);
        } catch (Exception error) {
            if (next.staging != null) removeTree(next.staging);
            PUBLICATION_LOCK.release();
            recordError(projectId, error);
            throw error;
        }
    }

    // Runs on a separate executor: never block editor/database bridge calls on SAF copying.
    JSONObject publish(String projectId) throws Exception {
        Prepared current;
        synchronized (this) {
            current = prepared;
            if (current == null || !current.projectId.equals(projectId) || publishing) throw new Failure("busy");
            publishing = true;
        }
        try {
            checkActive();
            validateDatabase(current.database, projectId);
            for (String directory : new String[] {"files", "file-metadata"}) {
                copyAssets(new File(current.staging, directory), ensureDirectory(current.directory, directory));
            }
            checkActive();
            Map<String, Uri> entries = children(current.directory);
            Uri canonical = entries.get("project.db");
            Uri previous = entries.get("project.db.previous");
            boolean canonicalValid = validDocumentDatabase(canonical, projectId, current.staging);
            boolean previousValid = validDocumentDatabase(previous, projectId, current.staging);
            // Repair only with a verified predecessor; do not delete an only-good copy.
            if (!canonicalValid && previousValid) {
                delete(canonical);
                canonical = rename(previous, "project.db");
                previous = null;
                canonicalValid = true;
            } else if (canonical != null && !canonicalValid) {
                throw new Failure("invalidBackup");
            }
            delete(entries.get("project.db.next"));
            Uri incoming = create(current.directory, "project.db.next", false);
            copyVerified(current.database, incoming, current.directory);
            checkActive();
            if (canonicalValid) {
                delete(previous);
                rename(canonical, "project.db.previous");
            }
            checkActive();
            Uri published = rename(incoming, "project.db");
            String hash = hash(current.database);
            if (!hash.equals(hash(published))) throw new Failure("verification");
            JSONObject metadata = new JSONObject().put("formatVersion", 1)
                .put("projectId", projectId).put("changeCounter", current.counter)
                .put("snapshotAt", current.snapshotAt).put("completedAt", timestamp())
                .put("databaseBytes", current.database.length()).put("databaseSha256", hash);
            File metadataFile = new File(current.staging, "backup.json");
            try (FileOutputStream out = new FileOutputStream(metadataFile)) {
                out.write(metadata.toString(2).getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            }
            entries = children(current.directory);
            delete(entries.get("backup.json.next"));
            Uri metadataNext = create(current.directory, "backup.json.next", false);
            copyVerified(metadataFile, metadataNext, current.directory);
            checkActive();
            delete(entries.get("backup.json"));
            rename(metadataNext, "backup.json");
            save(prefs.edit().putString("success:" + projectId, metadata.toString()).remove("error:" + projectId));
            return metadata;
        } catch (Exception error) {
            recordError(projectId, error);
            throw error;
        } finally {
            synchronized (this) {
                removeTree(current.staging);
                prepared = null;
                publishing = false;
                PUBLICATION_LOCK.release();
            }
        }
    }

    synchronized void close() {
        closed = true;
        if (!publishing && prepared != null) {
            removeTree(prepared.staging);
            prepared = null;
            PUBLICATION_LOCK.release();
        }
    }

    private Uri projectDirectory(String projectId) throws Exception {
        Uri parent = backupRoot();
        String mapped = prefs.getString("folder:" + projectId, "");
        if (!mapped.isEmpty()) {
            Uri directory = Uri.parse(mapped);
            name(directory); // Lost access must not cause a silent replacement.
            return directory;
        }
        // Stable identity-based names avoid rename collisions and never claim an old backup.
        String folderName = "Project-" + projectId;
        if (children(parent).containsKey(folderName)) throw new Failure("nameConflict");
        Uri directory = create(parent, folderName, true);
        save(prefs.edit().putString("folder:" + projectId, directory.toString()));
        return directory;
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

    private void recordError(String id, Exception error) throws Exception {
        save(prefs.edit().putString("error:" + id, errorCode(error)));
    }

    static String errorCode(Throwable error) {
        if (error instanceof Failure) return ((Failure) error).code;
        if (error instanceof SecurityException || error instanceof java.io.FileNotFoundException) return "reconnect";
        return "failed";
    }

    private static void save(SharedPreferences.Editor editor) throws Exception {
        if (!editor.commit()) throw new Failure("failed");
    }

    private void checkActive() throws Exception {
        if (closed || Thread.currentThread().isInterrupted()) throw new Failure("interrupted");
    }

    static void requireSpace(long available, long additional) throws Exception {
        if (additional < 0 || available < RESERVE_BYTES || available - RESERVE_BYTES < additional) throw new Failure("lowSpace");
    }

    private long[] probeSpace(Uri directory) throws Exception {
        Uri probe = null;
        try {
            // Native-only, process-monotonic probe names; never overwrite a user's file.
            probe = create(directory, ".routevn-space-" + System.nanoTime(), false);
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

    private Map<String, List<File>> missingAssets(File source, Uri directory) throws Exception {
        Map<String, List<File>> missing = new LinkedHashMap<>();
        Map<String, Uri> rootEntries = children(directory);
        for (String subdir : new String[] {"files", "file-metadata"}) {
            Uri target = rootEntries.get(subdir);
            Map<String, Uri> existing = target == null ? new LinkedHashMap<>() : children(target);
            List<File> files = new ArrayList<>();
            for (File file : listFiles(new File(source, subdir))) {
                if (file.getName().startsWith(".routevn-project-write-")) continue;
                if (!file.isFile()) throw new Failure("failed");
                if (!existing.containsKey(file.getName())) files.add(file);
            }
            missing.put(subdir, files);
        }
        return missing;
    }

    private void stageAssets(Map<String, List<File>> missing, File staging) throws Exception {
        // Android can deny hard links even within app-private storage. Copy only
        // missing immutable assets, so dialogue edits do not recopy existing media.
        for (Map.Entry<String, List<File>> entry : missing.entrySet()) {
            File directory = new File(staging, entry.getKey());
            if (!directory.mkdirs()) throw new Failure("failed");
            for (File source : entry.getValue()) {
                checkActive();
                File target = new File(directory, source.getName());
                requireSpace(new StatFs(staging.getAbsolutePath()).getAvailableBytes(), source.length());
                try (InputStream in = new FileInputStream(source); FileOutputStream out = new FileOutputStream(target)) {
                    byte[] buffer = new byte[128 * 1024];
                    int count;
                    while ((count = in.read(buffer)) != -1) {
                        checkActive();
                        requireSpace(new StatFs(staging.getAbsolutePath()).getAvailableBytes(), count);
                        out.write(buffer, 0, count);
                    }
                    out.getFD().sync();
                }
                if (!hash(source).equals(hash(target))) throw new Failure("verification");
            }
        }
    }

    private void copyAssets(File source, Uri directory) throws Exception {
        Map<String, Uri> existing = children(directory);
        for (File file : listFiles(source)) {
            checkActive();
            Uri found = existing.get(file.getName());
            if (found != null) {
                // Asset IDs are immutable at the native write boundary. Do not reread
                // gigabytes of unchanged media for a dialogue-only database change.
                continue;
            }
            String temporary = file.getName() + ".next";
            delete(existing.get(temporary));
            Uri incoming = create(directory, temporary, false);
            copyVerified(file, incoming, directory);
            rename(incoming, file.getName());
        }
    }

    private void copyVerified(File source, Uri destination, Uri directory) throws Exception {
        requireSpace(probeSpace(directory)[0], source.length());
        try (InputStream in = new FileInputStream(source);
             ParcelFileDescriptor descriptor = resolver.openFileDescriptor(destination, "wt")) {
            if (descriptor == null) throw new Failure("failed");
            try (OutputStream out = new FileOutputStream(descriptor.getFileDescriptor())) {
                byte[] buffer = new byte[128 * 1024];
                int count;
                long copied = 0;
                while ((count = in.read(buffer)) != -1) {
                    checkActive();
                    if (copied % (8 * 1024 * 1024) < buffer.length) {
                        StructStatVfs stat = Os.fstatvfs(descriptor.getFileDescriptor());
                        requireSpace(Math.multiplyExact(stat.f_bavail, stat.f_frsize), source.length() - copied);
                    }
                    out.write(buffer, 0, count);
                    copied += count;
                }
                out.flush();
                Os.fsync(descriptor.getFileDescriptor());
            }
        }
        if (!hash(source).equals(hash(destination))) throw new Failure("verification");
    }

    private boolean validDocumentDatabase(Uri uri, String projectId, File staging) throws Exception {
        if (uri == null) return false;
        File candidate = new File(staging, "validate.db");
        try {
            // Read/capacity failures must abort, not turn a good backup into a
            // supposedly corrupt candidate that could be replaced.
            copyToFile(uri, candidate);
            try { validateDatabase(candidate, projectId); return true; }
            catch (android.database.sqlite.SQLiteException | org.json.JSONException error) { return false; }
            catch (Failure error) { if ("invalidBackup".equals(error.code)) return false; throw error; }
        } finally {
            for (String suffix : new String[] {"", "-wal", "-shm", "-journal"}) removeTree(new File(candidate.getPath() + suffix));
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

    static String hash(File file) throws Exception {
        try (InputStream in = new FileInputStream(file)) { return hash(in); }
    }

    private String hash(Uri uri) throws Exception {
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) throw new Failure("verification");
            return hash(in);
        }
    }

    private static String hash(InputStream in) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[128 * 1024];
        int count;
        while ((count = in.read(buffer)) != -1) digest.update(buffer, 0, count);
        StringBuilder value = new StringBuilder();
        for (byte b : digest.digest()) value.append(String.format(Locale.ROOT, "%02x", b & 255));
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
        try (Cursor cursor = resolver.query(uri, new String[] {DocumentsContract.Document.COLUMN_MIME_TYPE}, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) throw new Failure("reconnect");
            if (!DocumentsContract.Document.MIME_TYPE_DIR.equals(cursor.getString(0))) throw new Failure("nameConflict");
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

    private Uri ensureDirectory(Uri parent, String name) throws Exception {
        Uri existing = children(parent).get(name);
        return existing == null ? create(parent, name, true) : existing;
    }

    private Uri create(Uri parent, String name, boolean directory) throws Exception {
        if (children(parent).containsKey(name)) throw new Failure("nameConflict");
        Uri result = DocumentsContract.createDocument(resolver, parent,
            directory ? DocumentsContract.Document.MIME_TYPE_DIR : "application/octet-stream", name);
        if (result == null || !name.equals(name(result))) throw new Failure("nameConflict");
        return result;
    }

    private Uri rename(Uri uri, String name) throws Exception {
        Uri result = DocumentsContract.renameDocument(resolver, uri, name);
        if (result == null || !name.equals(name(result))) throw new Failure("nameConflict");
        return result;
    }

    private void delete(Uri uri) throws Exception {
        if (uri != null && !DocumentsContract.deleteDocument(resolver, uri)) throw new Failure("failed");
    }
}
