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
            connection.execSQL("PRAGMA busy_timeout=5000");
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
        String sql = "SELECT key, value FROM kv ORDER BY key";
        String[] args = null;
        if (payload.has("prefix")) {
            String prefix = requireString(payload, "prefix");
            sql = "SELECT key, value FROM kv WHERE substr(key, 1, ?) = ? ORDER BY key";
            args = new String[] {Integer.toString(prefix.length()), prefix};
        }
        JSONArray rows = new JSONArray();
        try (Cursor cursor = db.rawQuery(sql, args)) {
            while (cursor.moveToNext()) {
                JSONObject row = new JSONObject();
                row.put("key", cursor.getString(0));
                // Keep JSON text intact across the bridge; JS parses it just as the desktop client does.
                row.put("value", cursor.isNull(1) ? JSONObject.NULL : cursor.getString(1));
                rows.put(row);
            }
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
