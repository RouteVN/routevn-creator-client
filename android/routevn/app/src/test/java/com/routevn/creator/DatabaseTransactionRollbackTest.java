package com.routevn.creator;

import static org.junit.Assert.*;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Set;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

// The page's BEGIN/COMMIT/ROLLBACK run through execSQL as Android transactions
// on the bridge thread. A transaction the page leaves open must be rolled back,
// and its write lock released, when the database is closed or the page is lost.
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, manifest = Config.NONE)
public class DatabaseTransactionRollbackTest {
    private static final String DB = "app.db";
    private MainActivity activity;

    @Before public void setUp() throws Exception {
        activity = Robolectric.buildActivity(MainActivity.class).get();
        invoke("initializeAppDatabase", new Class<?>[] { boolean.class }, false);
        open().execSQL("CREATE TABLE IF NOT EXISTS rollback_test (x INTEGER)");
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

    private SQLiteDatabase open() throws Exception {
        return (SQLiteDatabase) invoke("openDatabase", new Class<?>[] { String.class }, DB);
    }

    @SuppressWarnings("unchecked")
    private Set<String> projectTransactions() throws Exception {
        Field field = MainActivity.class.getDeclaredField("projectTransactions");
        field.setAccessible(true);
        return (Set<String>) field.get(activity);
    }

    // A second write transaction fails with SQLITE_BUSY while the old one holds
    // the write lock; the inserted row is gone only if it was rolled back.
    private void assertRolledBackAndWritable(SQLiteDatabase database) {
        database.execSQL("BEGIN IMMEDIATE");
        try (Cursor rows = database.rawQuery("SELECT COUNT(*) FROM rollback_test", null)) {
            assertTrue(rows.moveToFirst());
            assertEquals(0, rows.getInt(0));
        }
        database.execSQL("ROLLBACK");
        assertFalse(database.inTransaction());
    }

    private SQLiteDatabase leaveTransactionOpen() throws Exception {
        SQLiteDatabase database = open();
        database.execSQL("BEGIN IMMEDIATE");
        database.execSQL("INSERT INTO rollback_test VALUES (1)");
        projectTransactions().add(DB);
        return database;
    }

    @Test public void closingADatabaseRollsBackItsOpenTransaction() throws Exception {
        leaveTransactionOpen();
        invoke("closeDatabase", new Class<?>[] { String.class }, DB);
        assertFalse(projectTransactions().contains(DB));
        assertRolledBackAndWritable(open());
    }

    @Test public void closingAllDatabasesRollsBackOpenTransactions() throws Exception {
        leaveTransactionOpen();
        invoke("closeSqliteDatabases", new Class<?>[] {});
        assertRolledBackAndWritable(open());
    }

    @Test public void losingThePageRollsBackItsOpenTransactions() throws Exception {
        SQLiteDatabase database = leaveTransactionOpen();
        database.execSQL("BEGIN");
        invoke("rollBackOpenTransactions", new Class<?>[] {});
        assertFalse(projectTransactions().contains(DB));
        assertRolledBackAndWritable(database);
    }
}
