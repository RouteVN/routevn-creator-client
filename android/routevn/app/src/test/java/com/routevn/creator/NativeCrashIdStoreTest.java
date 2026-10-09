package com.routevn.creator;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, manifest = Config.NONE)
public class NativeCrashIdStoreTest {
    private SharedPreferences preferences;

    @Before
    public void createFreshPreferences() {
        Context context = RuntimeEnvironment.getApplication();
        preferences = context.getSharedPreferences(
            NativeCrashIdStore.PREFS_NAME,
            Context.MODE_PRIVATE
        );
        preferences.edit().clear().commit();
    }

    @Test
    public void createsAValidIdAndReturnsTheSameIdOnEveryRead() {
        String first = NativeCrashIdStore.loadOrCreate(preferences);
        assertTrue(NativeCrashIdStore.isCrashId(first));
        assertEquals(first, preferences.getString(NativeCrashIdStore.PREFS_KEY, null));
        assertEquals(first, NativeCrashIdStore.loadOrCreate(preferences));
        assertEquals(first, NativeCrashIdStore.loadOrCreate(preferences));
    }

    @Test
    public void regeneratesAFreshValidIdWhenMissingOrCorrupt() {
        String[] corruptValues = {
            null,
            "",
            "not-a-uuid",
            "0F6B1C3E-2A4D-4C8B-9E7F-1A2B3C4D5E6F",
            "0f6b1c3e-2a4d-4c8b-9e7f-1a2b3c4d5e6",
            "0f6b1c3e-2a4d-5c8b-9e7f-1a2b3c4d5e6f",
            "0f6b1c3e-2a4d-4c8b-ee7f-1a2b3c4d5e6f",
        };
        for (String corrupt : corruptValues) {
            preferences.edit().remove(NativeCrashIdStore.PREFS_KEY).commit();
            if (corrupt != null) {
                preferences
                    .edit()
                    .putString(NativeCrashIdStore.PREFS_KEY, corrupt)
                    .commit();
            }
            String regenerated = NativeCrashIdStore.loadOrCreate(preferences);
            assertTrue("expected a fresh ID for " + corrupt, NativeCrashIdStore.isCrashId(regenerated));
            assertNotEquals(corrupt, regenerated);
            assertEquals(regenerated, preferences.getString(NativeCrashIdStore.PREFS_KEY, null));
            assertEquals(regenerated, NativeCrashIdStore.loadOrCreate(preferences));
        }
    }

    @Test
    public void recognizesOnlyLowercaseUuid4Values() {
        assertTrue(NativeCrashIdStore.isCrashId("0f6b1c3e-2a4d-4c8b-9e7f-1a2b3c4d5e6f"));
        assertTrue(NativeCrashIdStore.isCrashId("11111111-2222-4333-8444-555555555555"));
        assertFalse(NativeCrashIdStore.isCrashId(null));
        assertFalse(NativeCrashIdStore.isCrashId(""));
        assertFalse(NativeCrashIdStore.isCrashId("0F6B1C3E-2A4D-4C8B-9E7F-1A2B3C4D5E6F"));
        assertFalse(NativeCrashIdStore.isCrashId("0f6b1c3e-2a4d-4c8b-9e7f-1a2b3c4d5e6f "));
        assertFalse(NativeCrashIdStore.isCrashId("0f6b1c3e2a4d4c8b9e7f1a2b3c4d5e6f"));
        assertFalse(NativeCrashIdStore.isCrashId("0f6b1c3e-2a4d-4c8b-9e7f-1a2b3c4d5e6f/../escape"));
    }

    @Test
    public void usesOneInMemoryIdWhenOpeningPreferencesThrows() {
        Context context = new ContextWrapper(RuntimeEnvironment.getApplication()) {
            @Override
            public SharedPreferences getSharedPreferences(String name, int mode) {
                throw new IllegalStateException("storage unavailable");
            }
        };

        String first = NativeCrashIdStore.loadOrCreate(context);
        assertTrue(NativeCrashIdStore.isCrashId(first));
        assertEquals(first, NativeCrashIdStore.loadOrCreate(context));
        assertNull(preferences.getString(NativeCrashIdStore.PREFS_KEY, null));
    }
}
