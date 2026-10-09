package com.routevn.creator;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.UUID;

/**
 * Random per-install crash ID (UUID v4, lowercase), generated and persisted by
 * the native shell before Sentry initializes. Separate from the update-check
 * device ID and never sent anywhere but the crash reporter's user.id. Used
 * only to count distinct crashing installs per version.
 */
final class NativeCrashIdStore {
    static final String PREFS_NAME = "routevn_crash_reporting";
    static final String PREFS_KEY = "crashId";
    private static String inMemoryId;

    private NativeCrashIdStore() {}

    static boolean isCrashId(String value) {
        return value != null
            && value.matches(
                "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");
    }

    static synchronized String loadOrCreate(Context context) {
        try {
            return loadOrCreate(
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE));
        } catch (RuntimeException ignored) {
            return inMemoryId();
        }
    }

    /**
     * Load the persisted crash ID, creating a fresh one when it is missing or
     * corrupt. Storage failures never block startup; the ID is then random for
     * this run only.
     */
    static synchronized String loadOrCreate(SharedPreferences preferences) {
        String stored;
        try {
            stored = preferences.getString(PREFS_KEY, null);
        } catch (ClassCastException wrongType) {
            // A value of another type under the key is replaced below.
            stored = null;
        } catch (RuntimeException ignored) {
            return inMemoryId();
        }
        if (isCrashId(stored)) return stored;
        String next = inMemoryId != null ? inMemoryId : UUID.randomUUID().toString();
        try {
            if (preferences.edit().putString(PREFS_KEY, next).commit()) return next;
        } catch (RuntimeException ignored) {
        }
        inMemoryId = next;
        return inMemoryId;
    }

    private static String inMemoryId() {
        if (inMemoryId == null) inMemoryId = UUID.randomUUID().toString();
        return inMemoryId;
    }
}
