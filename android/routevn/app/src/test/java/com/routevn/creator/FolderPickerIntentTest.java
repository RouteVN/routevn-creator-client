package com.routevn.creator;

import static org.junit.Assert.*;

import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import java.io.File;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class FolderPickerIntentTest {
    @Rule public TemporaryFolder storage = new TemporaryFolder();

    private static String initialFolder(Intent intent) {
        Uri uri = intent.getParcelableExtra(DocumentsContract.EXTRA_INITIAL_URI);
        return DocumentsContract.getDocumentId(uri);
    }

    // Android 9 without a Documents folder: the picker opened at Recent and
    // showed no internal storage, so there was no folder to choose.
    @Test @Config(sdk = 28) public void android9WithoutDocumentsStartsAtTheStorageRoot() {
        Intent intent = MainActivity.folderPickerIntent(true, true, new File(storage.getRoot(), "Documents"));
        assertTrue(intent.getBooleanExtra("android.content.extra.SHOW_ADVANCED", false));
        assertEquals("primary:", initialFolder(intent));
    }

    @Test @Config(sdk = 28) public void android9WithDocumentsStartsThere() throws Exception {
        File documents = storage.newFolder("Documents");
        Intent intent = MainActivity.folderPickerIntent(true, true, documents);
        assertTrue(intent.getBooleanExtra("android.content.extra.SHOW_ADVANCED", false));
        assertEquals("primary:Documents", initialFolder(intent));
    }

    @Test @Config(sdk = 34) public void newerAndroidStartsInDocuments() {
        Intent intent = MainActivity.folderPickerIntent(true, true, new File(storage.getRoot(), "Documents"));
        assertEquals("primary:Documents", initialFolder(intent));
        assertTrue((intent.getFlags() & Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) != 0);
        assertTrue((intent.getFlags() & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0);
    }
}
