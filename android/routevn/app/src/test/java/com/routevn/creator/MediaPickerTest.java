package com.routevn.creator;

import static org.junit.Assert.*;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.provider.MediaStore;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.util.ReflectionHelpers;
import org.robolectric.util.ReflectionHelpers.ClassParameter;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {31, 33}, manifest = Config.NONE)
public class MediaPickerTest {
    private MainActivity activity;
    @Before public void setUp() {
        activity = Robolectric.buildActivity(MainActivity.class).get();
    }
    private void addHandler(Intent intent, String packageName, String name) {
        ResolveInfo info = new ResolveInfo();
        info.activityInfo = new ActivityInfo();
        info.activityInfo.packageName = packageName;
        info.activityInfo.name = name;
        Shadows.shadowOf(activity.getPackageManager()).addResolveInfoForIntent(intent, info);
    }
    private Intent open(String source, String accept, boolean multiple) {
        ReflectionHelpers.callInstanceMethod(activity, "launchAndroidFilePicker",
            ClassParameter.from(String.class, "picker-test"),
            ClassParameter.from(boolean.class, multiple),
            ClassParameter.from(String.class, accept),
            ClassParameter.from(String.class, source));
        return Shadows.shadowOf(activity).getNextStartedActivityForResult().intent;
    }
    @Test public void filesSourceKeepsDocumentFiltersAndMultiple() {
        Intent intent = open("files", "image/jpeg,image/png", true);
        assertEquals(Intent.ACTION_OPEN_DOCUMENT, intent.getAction());
        assertEquals("image/*", intent.getType());
        assertTrue(intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false));
        assertArrayEquals(new String[]{"image/jpeg", "image/png"}, intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES));
    }
    @Test public void gallerySourcePrefersGalleryOverFileManagerAndCanCancel() {
        Intent pick = new Intent(Intent.ACTION_PICK).setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*");
        addHandler(pick, "example.files", "FilesPicker");
        addHandler(pick, "example.gallery", "GalleryPicker");
        addHandler(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_APP_GALLERY), "example.gallery", "GalleryHome");
        Intent intent = open("gallery", "image/png", true);
        assertEquals(Intent.ACTION_PICK, intent.getAction());
        assertEquals("example.gallery", intent.getComponent().getPackageName());
        assertTrue(intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false));
        ReflectionHelpers.callInstanceMethod(activity, "handleAndroidFilePickerActivityResult",
            ClassParameter.from(int.class, MainActivity.RESULT_CANCELED), ClassParameter.from(Intent.class, null));
        assertNull(ReflectionHelpers.getField(activity, "pendingAndroidFilePickerRequestId"));
        assertEquals(Intent.ACTION_OPEN_DOCUMENT, open("files", "image/png", false).getAction());
    }
    @Test public void modernPhotoPickerSupportsSingleAndMultiple() {
        if (Build.VERSION.SDK_INT < 33) return;
        addHandler(new Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*"), "example.photos", "PhotoPicker");
        Intent single = MediaPickerIntents.createGallery(activity, new String[]{"image/png"}, false);
        assertEquals(MediaStore.ACTION_PICK_IMAGES, single.getAction());
        assertFalse(single.hasExtra(MediaStore.EXTRA_PICK_IMAGES_MAX));
        Intent multiple = MediaPickerIntents.createGallery(activity, new String[]{"image/png"}, true);
        assertTrue(multiple.getIntExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, 0) > 1);
    }
    @Test public void videoGalleryUsesVideoCollection() {
        Intent intent = open("gallery", "video/mp4", false);
        assertEquals(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, intent.getData());
        assertEquals("video/*", intent.getType());
        assertFalse(intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, true));
    }
}
