package com.routevn.creator;

import static org.junit.Assert.assertEquals;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.pm.ProviderInfo;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.nio.file.Files;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowContentResolver;
import org.robolectric.util.ReflectionHelpers;
import org.robolectric.util.ReflectionHelpers.ClassParameter;

/** Android 9 media documents report an audio file's title tag as its name. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, manifest = Config.NONE)
public class PickerFileNameTest {
    private static final String AUTHORITY = "example.media.documents";
    private MainActivity activity;
    private String displayName;
    private String mimeType;

    @Before public void setUp() throws Exception {
        activity = Robolectric.buildActivity(MainActivity.class).get();
        File content = new File(activity.getCacheDir(), "picked-content");
        Files.write(content.toPath(), new byte[] {'I', 'D', '3'});
        ContentProvider provider = new ContentProvider() {
            public boolean onCreate() { return true; }
            public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
                MatrixCursor cursor = new MatrixCursor(new String[] {OpenableColumns.DISPLAY_NAME});
                cursor.addRow(new Object[] {displayName});
                return cursor;
            }
            public String getType(Uri uri) { return mimeType; }
            public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
            public int update(Uri uri, ContentValues values, String where, String[] args) { throw new UnsupportedOperationException(); }
            public int delete(Uri uri, String where, String[] args) { throw new UnsupportedOperationException(); }
            public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
                return ParcelFileDescriptor.open(content, ParcelFileDescriptor.MODE_READ_ONLY);
            }
            public AssetFileDescriptor openAssetFile(Uri uri, String mode) throws FileNotFoundException {
                return new AssetFileDescriptor(openFile(uri, mode), 0, -1);
            }
        };
        ProviderInfo info = new ProviderInfo(); info.authority = AUTHORITY;
        provider.attachInfo(activity, info);
        ShadowContentResolver.registerProviderInternal(AUTHORITY, provider);
    }

    private String pickedName(String name, String type) throws Exception {
        displayName = name;
        mimeType = type;
        JSONObject file = ReflectionHelpers.callInstanceMethod(activity, "createPickerFileResult",
            ClassParameter.from(String.class, "picker-test"),
            ClassParameter.from(Uri.class, Uri.parse("content://" + AUTHORITY + "/audio/1")),
            ClassParameter.from(int.class, 0));
        return file.getString("name");
    }

    @Test public void audioTitlesGetTheExtensionForTheirType() throws Exception {
        assertEquals("Song One Op. (Live) || Two.mp3", pickedName("Song One Op. (Live) || Two", "audio/mpeg"));
        assertEquals("Song One.wav", pickedName("Song One", "audio/x-wav"));
        assertEquals("Song One.ogg", pickedName("Song One", "application/ogg"));
    }

    @Test public void namesWithAnAudioExtensionAndOtherTypesStayUnchanged() throws Exception {
        assertEquals("Song One.MP3", pickedName("Song One.MP3", "audio/mpeg"));
        assertEquals("Song One.wav", pickedName("Song One.wav", "audio/wav"));
        assertEquals("Image One", pickedName("Image One", "image/png"));
    }
}
