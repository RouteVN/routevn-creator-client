package com.routevn.creator;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.provider.MediaStore;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

// Platform adapter only. The app's source-choice dialog lives in JS.
final class MediaPickerIntents {
    private MediaPickerIntents() {}

    static Intent createGallery(Context context, String[] mimeTypes, boolean multiple) {
        boolean images = false;
        boolean videos = false;
        for (String type : mimeTypes) {
            images |= type.startsWith("image/");
            videos |= type.startsWith("video/");
        }
        String type = images && videos ? "*/*" : videos ? "video/*" : "image/*";
        if (Build.VERSION.SDK_INT >= 33) {
            Intent photoPicker = new Intent(MediaStore.ACTION_PICK_IMAGES);
            if (!type.equals("*/*")) photoPicker.setType(type);
            if (photoPicker.resolveActivity(context.getPackageManager()) != null) {
                if (multiple) photoPicker.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, MediaStore.getPickImagesMaxLimit());
                return photoPicker;
            }
        }

        Intent pick = new Intent(Intent.ACTION_PICK);
        pick.setDataAndType(
            type.equals("video/*") ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            type
        );
        pick.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
        pick.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);

        // Older devices may route ACTION_PICK to a file manager. Prefer apps
        // advertising themselves as galleries, without hard-coding OEM packages.
        PackageManager packages = context.getPackageManager();
        Set<String> galleries = new HashSet<>();
        Intent galleryApps = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_APP_GALLERY);
        for (ResolveInfo app : packages.queryIntentActivities(galleryApps, 0)) {
            galleries.add(app.activityInfo.packageName);
        }
        List<Intent> choices = new ArrayList<>();
        for (ResolveInfo app : packages.queryIntentActivities(pick, PackageManager.MATCH_DEFAULT_ONLY)) {
            if (galleries.contains(app.activityInfo.packageName)) {
                choices.add(new Intent(pick).setClassName(app.activityInfo.packageName, app.activityInfo.name));
            }
        }
        if (choices.isEmpty()) return pick;
        if (choices.size() == 1) return choices.get(0);
        Intent chooser = Intent.createChooser(choices.remove(0), null);
        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, choices.toArray(new Intent[0]));
        return chooser;
    }
}
