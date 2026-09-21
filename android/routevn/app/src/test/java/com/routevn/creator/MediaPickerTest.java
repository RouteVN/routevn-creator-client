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
        Intent pick = new Intent(Intent.ACTION_PICK).setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/png");
        addHandler(pick, "example.files", "FilesPicker");
        addHandler(pick, "example.gallery", "GalleryPicker");
        addHandler(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_APP_GALLERY), "example.gallery", "GalleryHome");
        Intent intent = open("gallery", "image/png", true);
        assertEquals(Intent.ACTION_PICK, intent.getAction());
        assertEquals("image/png", intent.getType());
        assertEquals("example.gallery", intent.getComponent().getPackageName());
        assertTrue(intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false));
        ReflectionHelpers.callInstanceMethod(activity, "handleAndroidFilePickerActivityResult",
            ClassParameter.from(int.class, MainActivity.RESULT_CANCELED), ClassParameter.from(Intent.class, null));
        assertNull(ReflectionHelpers.getField(activity, "pendingAndroidFilePickerRequestId"));
        assertEquals(Intent.ACTION_OPEN_DOCUMENT, open("files", "image/png", false).getAction());
    }
    @Test public void modernPhotoPickerSupportsSingleAndMultiple() {
        if (Build.VERSION.SDK_INT < 33) return;
        addHandler(new Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/png"), "example.photos", "PhotoPicker");
        Intent single = MediaPickerIntents.createGallery(activity, new String[]{"image/png"}, false);
        assertEquals(MediaStore.ACTION_PICK_IMAGES, single.getAction());
        assertEquals("image/png", single.getType());
        assertFalse(single.hasExtra(MediaStore.EXTRA_PICK_IMAGES_MAX));
        Intent multiple = MediaPickerIntents.createGallery(activity, new String[]{"image/png"}, true);
        assertEquals("image/png", multiple.getType());
        assertTrue(multiple.getIntExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, 0) > 1);
    }
    @Test public void videoGalleryUsesVideoCollection() {
        Intent intent = open("gallery", "video/mp4", false);
        assertEquals(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, intent.getData());
        assertEquals("video/mp4", intent.getType());
        assertFalse(intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, true));
    }

    @Test @Config(sdk = 33)
    public void extensionRequestsKeepExactPhotoPickerTypes() {
        addHandler(new Intent(MediaStore.ACTION_PICK_IMAGES).setType("video/mp4"), "example.photos", "PhotoPicker");
        Intent video = open("gallery", ".mp4", false);
        assertEquals(MediaStore.ACTION_PICK_IMAGES, video.getAction());
        assertEquals("video/mp4", video.getType());
    }

    @Test @Config(sdk = 33)
    public void pngAliasesAreDeduplicatedWithoutBroadening() {
        addHandler(new Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/png"), "example.photos", "PhotoPicker");
        Intent image = open("gallery", ".png,image/png", false);
        assertEquals(MediaStore.ACTION_PICK_IMAGES, image.getAction());
        assertEquals("image/png", image.getType());
    }

    @Test public void restrictedMimeListsUseContentPickerAndRetainEveryFilter() {
        addHandler(new Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*"), "example.system", "PhotoPicker");
        Intent intent = open("gallery", ".jpg,.jpeg,.png,.webp", true);
        assertEquals(Intent.ACTION_GET_CONTENT, intent.getAction());
        assertTrue(intent.hasCategory(Intent.CATEGORY_OPENABLE));
        assertEquals("image/*", intent.getType());
        assertArrayEquals(new String[]{"image/jpeg", "image/png", "image/webp"}, intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES));
        assertTrue(intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false));
    }

    @Test public void galleryChooserPreservesRestrictedFiltersForEveryApp() {
        Intent content = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
        Intent gallery = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_APP_GALLERY);
        addHandler(content, "example.files", "FilePicker");
        for (String name : new String[]{"example.gallery", "example.photos"}) {
            addHandler(content, name, "ImagePicker");
            addHandler(gallery, name, "GalleryHome");
        }
        Intent chooser = open("gallery", "image/png,image/webp", false);
        assertEquals(Intent.ACTION_CHOOSER, chooser.getAction());
        Intent primary = chooser.getParcelableExtra(Intent.EXTRA_INTENT);
        android.os.Parcelable[] alternatives = chooser.getParcelableArrayExtra(Intent.EXTRA_INITIAL_INTENTS);
        assertEquals(1, alternatives.length);
        for (Intent intent : new Intent[]{primary, (Intent) alternatives[0]}) {
            assertEquals(Intent.ACTION_GET_CONTENT, intent.getAction());
            assertNotEquals("example.files", intent.getComponent().getPackageName());
            assertArrayEquals(new String[]{"image/png", "image/webp"}, intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES));
            assertFalse(intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, true));
        }
    }
}
