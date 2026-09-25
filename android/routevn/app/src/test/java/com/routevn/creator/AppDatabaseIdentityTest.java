package com.routevn.creator;

import static org.junit.Assert.*;

import android.database.sqlite.SQLiteDatabase;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, manifest = Config.NONE)
public class AppDatabaseIdentityTest {
    private MainActivity activity;
    private SQLiteDatabase database;

    @Before public void setUp() throws Exception {
        activity = Robolectric.buildActivity(MainActivity.class).get();
        invoke("initializeAppDatabase", new Class<?>[] { boolean.class }, false);
        database = (SQLiteDatabase) invoke("openDatabase", new Class<?>[] { String.class }, "app.db");
    }

    @After public void tearDown() throws Exception {
        invoke("closeSqliteDatabases", new Class<?>[] {});
    }

    private Object invoke(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = MainActivity.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        try {
            return method.invoke(activity, args);
        } catch (InvocationTargetException error) {
            throw (Exception) error.getCause();
        }
    }

    private String getOrSet(String key, String json) throws Exception {
        return (String) invoke("getOrSetAppDatabaseValue",
            new Class<?>[] { String.class, String.class }, key, json);
    }

    @Test public void preservesFirstPersistedIdentity() throws Exception {
        String first = "\"123456789ABC\"";
        assertEquals(first, getOrSet("deviceId", first));
        assertEquals(first, getOrSet("deviceId", "\"23456789ABCD\""));
    }

    @Test public void rejectsOtherKeysAndMalformedIdentityWithoutWriting() throws Exception {
        for (String key : new String[] { "userConfig", "currentProject", "" }) {
            assertThrows(IllegalArgumentException.class, () -> getOrSet(key, "\"123456789ABC\""));
        }
        for (String value : new String[] { "null", "123456789ABC", "\"invalid\"", "\"123456789ABC\"\\n" }) {
            assertThrows(IllegalArgumentException.class, () -> getOrSet("deviceId", value));
        }
        try (android.database.Cursor cursor = database.rawQuery("SELECT count(*) FROM kv", null)) {
            assertTrue(cursor.moveToFirst());
            assertEquals(0, cursor.getInt(0));
        }
    }

    @Test public void preservesExistingCorruptionForCallerToReject() throws Exception {
        database.execSQL("INSERT INTO kv (key, value) VALUES (?, ?)",
            new Object[] { "deviceId", "\"invalid\"" });
        assertEquals("\"invalid\"", getOrSet("deviceId", "\"123456789ABC\""));
    }
}
