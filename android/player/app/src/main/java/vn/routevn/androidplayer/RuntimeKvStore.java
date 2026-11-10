package vn.routevn.androidplayer;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.Closeable;
import java.io.File;
import java.util.LinkedHashMap;
import java.util.Map;

// All calls, including close, run on PlayerBridge's single database executor.
final class RuntimeKvStore implements Closeable {
    private static final int CHUNK_SIZE = 256 * 1024;
    private final File path;
    private SQLiteDatabase db;

    RuntimeKvStore(Context context) {
        path = context.getDatabasePath("runtime.db");
    }

    void init() {
        if (db != null) return;
        File directory = path.getParentFile();
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new IllegalStateException("Cannot create runtime database directory");
        }
        SQLiteDatabase connection = SQLiteDatabase.openDatabase(path.getPath(), null,
                SQLiteDatabase.CREATE_IF_NECESSARY | SQLiteDatabase.OPEN_READWRITE);
        try {
            connection.enableWriteAheadLogging();
            connection.execSQL("PRAGMA synchronous=FULL");
            // execSQL rejects statements that return rows; this PRAGMA returns the new timeout.
            try (Cursor timeout = connection.rawQuery("PRAGMA busy_timeout=5000", null)) {
                timeout.moveToFirst();
            }
            int version = connection.getVersion();
            if (version != 0 && version != 1) {
                throw new IllegalStateException("Unsupported Db schema version: " + version);
            }
            connection.beginTransaction();
            try {
                connection.execSQL("CREATE TABLE IF NOT EXISTS kv ("
                        + "key TEXT PRIMARY KEY, "
                        + "value TEXT)");
                connection.execSQL("CREATE TRIGGER IF NOT EXISTS kv_delete_null_after_insert "
                        + "AFTER INSERT ON kv WHEN NEW.value IS NULL "
                        + "BEGIN DELETE FROM kv WHERE key = NEW.key; END");
                connection.execSQL("CREATE TRIGGER IF NOT EXISTS kv_delete_null_after_update "
                        + "AFTER UPDATE OF value ON kv WHEN NEW.value IS NULL "
                        + "BEGIN DELETE FROM kv WHERE key = NEW.key; END");
                if (version == 0) connection.setVersion(1);
                connection.setTransactionSuccessful();
            } finally {
                connection.endTransaction();
            }
            db = connection;
        } catch (RuntimeException error) {
            connection.close();
            throw error;
        }
    }

    JSONArray list(JSONObject payload) throws JSONException {
        ensureInitialized();
        String columns = "key, length(value), substr(value, 1, " + CHUNK_SIZE + ")";
        String sql = "SELECT " + columns + " FROM kv ORDER BY key";
        String[] args = null;
        if (payload.has("prefix")) {
            String prefix = requireString(payload, "prefix");
            sql = "SELECT " + columns + " FROM kv WHERE substr(key, 1, ?) = ? ORDER BY key";
            args = new String[] {Integer.toString(prefix.length()), prefix};
        }
        JSONArray rows = new JSONArray();
        // All bridge calls share one executor, while the transaction also protects
        // the snapshot from writers using another database connection.
        db.beginTransactionNonExclusive();
        try {
            try (Cursor cursor = db.rawQuery(sql, args)) {
                while (cursor.moveToNext()) {
                    String key = cursor.getString(0);
                    JSONObject row = new JSONObject();
                    row.put("key", key);
                    if (cursor.isNull(1)) {
                        row.put("value", JSONObject.NULL);
                    } else {
                        long length = cursor.getLong(1);
                        StringBuilder value = new StringBuilder(cursor.getString(2));
                        for (long offset = CHUNK_SIZE + 1L; offset <= length; offset += CHUNK_SIZE) {
                            try (Cursor chunk = db.rawQuery(
                                    "SELECT substr(value, ?, ?) FROM kv WHERE key = ?",
                                    new String[] {Long.toString(offset), Integer.toString(CHUNK_SIZE), key})) {
                                if (!chunk.moveToFirst()) throw new IllegalStateException("Missing runtime value");
                                value.append(chunk.getString(0));
                            }
                        }
                        row.put("value", value.toString());
                    }
                    rows.put(row);
                }
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return rows;
    }

    void set(JSONObject payload) throws JSONException {
        ensureInitialized();
        String key = requireKey(payload.get("key"));
        String value = requireJson(payload, "value");
        db.execSQL("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
                new Object[] {key, value});
    }

    void applyBatch(JSONObject payload) throws JSONException {
        ensureInitialized();
        JSONArray puts = payload.has("puts") ? payload.getJSONArray("puts") : new JSONArray();
        JSONArray deletes = payload.has("deletes") ? payload.getJSONArray("deletes") : new JSONArray();
        Map<String, String> operations = new LinkedHashMap<>();
        for (int index = 0; index < puts.length(); index++) {
            JSONObject entry = puts.getJSONObject(index);
            operations.put(requireKey(entry.get("key")), requireJson(entry, "value"));
        }
        for (int index = 0; index < deletes.length(); index++) {
            // Deletes override puts and duplicate keys have their last supplied value.
            operations.put(requireKey(deletes.get(index)), null);
        }
        if (operations.isEmpty()) return;
        db.beginTransaction();
        try {
            for (Map.Entry<String, String> entry : operations.entrySet()) {
                db.execSQL("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
                        new Object[] {entry.getKey(), entry.getValue()});
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    void clear() {
        ensureInitialized();
        db.execSQL("DELETE FROM kv");
    }

    private void ensureInitialized() {
        if (db == null) throw new IllegalStateException("Db not initialized. Call init() first.");
    }

    private static String requireString(JSONObject value, String key) throws JSONException {
        Object field = value.get(key);
        if (!(field instanceof String)) throw new IllegalArgumentException(key + " must be a string");
        return (String) field;
    }

    private static String requireJson(JSONObject value, String key) throws JSONException {
        String text = requireString(value, key);
        if (!JsonSyntax.isValid(text)) throw new IllegalArgumentException(key + " must be JSON text");
        return text;
    }

    private static String requireKey(Object value) {
        if (!(value instanceof String) || ((String) value).isEmpty()) {
            throw new IllegalArgumentException("Db key must be a non-empty string");
        }
        return (String) value;
    }

    @Override
    public void close() {
        if (db != null) {
            db.close();
            db = null;
        }
    }
}
