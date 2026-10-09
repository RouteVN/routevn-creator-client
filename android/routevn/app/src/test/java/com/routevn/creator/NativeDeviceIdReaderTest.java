package com.routevn.creator;

import static org.junit.Assert.*;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, manifest = Config.NONE)
public class NativeDeviceIdReaderTest {
    private static final String ID = "7mQkR2vXa9Lp8nRmS3wYb2Mq";
    private Context context;
    private File file;

    @Before
    public void setUp() {
        context = RuntimeEnvironment.getApplication();
        file = context.getDatabasePath("app.db");
        file.delete();
    }

    @Test
    public void missingDatabaseIsNotCreated() {
        assertNull(NativeDeviceIdReader.read(context));
        assertFalse(file.exists());
    }

    @Test
    public void missingTableAndRowGiveNoId() {
        try (SQLiteDatabase database = createDatabase()) {
            assertNull(NativeDeviceIdReader.read(context));
            database.execSQL("CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)");
            assertNull(NativeDeviceIdReader.read(context));
        }
    }

    @Test
    public void readsOnlyAValidJsonString() {
        try (SQLiteDatabase database = createDatabase()) {
            database.execSQL("CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)");
            for (String value : new String[] {
                "not json", ID, "42", "null", "\"short\"",
                "\"0OQkR2vXa9Lp8nRmS3wYb2Mq\"", "\"" + ID + "\" trailing"
            }) {
                put(database, value);
                assertNull(value, NativeDeviceIdReader.read(context));
            }
            put(database, "\"" + ID + "\"");
            assertEquals(ID, NativeDeviceIdReader.read(context));
        }
    }

    private SQLiteDatabase createDatabase() {
        file.getParentFile().mkdirs();
        return SQLiteDatabase.openOrCreateDatabase(file, null);
    }

    private void put(SQLiteDatabase database, String value) {
        database.execSQL("INSERT OR REPLACE INTO kv (key, value) VALUES ('deviceId', ?)",
            new Object[] { value });
    }
}
