package com.routevn.creator;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;

/** Reads the JavaScript-owned device ID through a read-only database connection. */
final class NativeDeviceIdReader {
    private NativeDeviceIdReader() {}

    static boolean isDeviceId(String value) {
        return value != null && value.matches("[1-9A-HJ-NP-Za-km-z]{24}");
    }

    static String read(Context context) {
        try {
            return read(context.getDatabasePath("app.db"));
        } catch (RuntimeException | LinkageError ignored) {
            return null;
        }
    }

    static String read(File file) {
        try {
            if (!file.isFile()) return null;
        } catch (RuntimeException ignored) {
            return null;
        }
        try (SQLiteDatabase database = SQLiteDatabase.openDatabase(
                file.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY)) {
            try (Cursor timeout = database.rawQuery("PRAGMA busy_timeout=50", null)) {
                timeout.moveToFirst();
            }
            try (Cursor cursor = database.rawQuery(
                    "SELECT value FROM kv WHERE key = ? LIMIT 1", new String[] { "deviceId" })) {
                if (!cursor.moveToFirst()) return null;
                String json = cursor.getString(0);
                // JavaScript stores JSON.stringify(id); Base58 needs no escapes.
                if (json == null || json.length() != 26 ||
                    json.charAt(0) != '"' || json.charAt(25) != '"') return null;
                String id = json.substring(1, 25);
                return isDeviceId(id) ? id : null;
            }
        } catch (Exception | LinkageError ignored) {
            return null;
        }
    }
}
