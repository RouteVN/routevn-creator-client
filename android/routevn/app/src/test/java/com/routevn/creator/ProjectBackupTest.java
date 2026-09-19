package com.routevn.creator;

import static org.junit.Assert.*;
import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;
import java.nio.file.Files;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33, manifest = Config.NONE)
public class ProjectBackupTest {
    private File projectDatabase() throws Exception {
        File file = new File(RuntimeEnvironment.getApplication().getCacheDir(), "project.db");
        try (SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(file, null)) {
            db.execSQL("CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT)");
            db.execSQL("INSERT INTO app_state VALUES ('projectInfo', '{\"id\":\"one\",\"name\":\"Project One\"}')");
        }
        return file;
    }

    @Test public void tracksOnlyCommittedWritesAcrossReopen() throws Exception {
        File file = projectDatabase();
        try (SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(file, null)) {
            ProjectBackup.installTracking(db);
            assertEquals(0, ProjectBackup.databaseRevision(db));
            db.execSQL("BEGIN");
            db.execSQL("INSERT INTO app_state VALUES ('draft', 'value')");
            assertEquals(1, ProjectBackup.databaseRevision(db));
            db.execSQL("ROLLBACK");
            assertEquals(0, ProjectBackup.databaseRevision(db));
            db.execSQL("UPDATE app_state SET value='changed' WHERE key='projectInfo'");
            assertEquals(1, ProjectBackup.databaseRevision(db));
            ProjectBackup.installTracking(db);
            assertEquals(1, ProjectBackup.databaseRevision(db));
        }
        try (SQLiteDatabase db = SQLiteDatabase.openOrCreateDatabase(file, null)) {
            assertEquals(1, ProjectBackup.databaseRevision(db));
            db.execSQL("CREATE TABLE new_state (id TEXT)");
            ProjectBackup.installTracking(db);
            db.execSQL("INSERT INTO new_state VALUES ('one')");
            assertEquals(2, ProjectBackup.databaseRevision(db));
        }
    }

    @Test public void validatesDatabaseIntegrityAndIdentity() throws Exception {
        File file = projectDatabase();
        ProjectBackup.validateDatabase(file, "one");
        try { ProjectBackup.validateDatabase(file, "two"); fail("wrong identity accepted"); }
        catch (ProjectBackup.Failure error) { assertEquals("invalidBackup", error.code); }
        Files.write(file.toPath(), new byte[] {1, 2, 3});
        try { ProjectBackup.validateDatabase(file, "one"); fail("corrupt database accepted"); }
        catch (android.database.sqlite.SQLiteException expected) { }
    }

    @Test public void reserveIncludesAdditionalSpaceAndRejectsOverflow() throws Exception {
        ProjectBackup.requireSpace(1_000_000_100L, 100);
        for (long[] value : new long[][] {{999_999_999L, 0}, {1_000_000_100L, 101}, {Long.MAX_VALUE, -1}}) {
            try { ProjectBackup.requireSpace(value[0], value[1]); fail("unsafe allocation allowed"); }
            catch (ProjectBackup.Failure error) { assertEquals("lowSpace", error.code); }
        }
    }
}
