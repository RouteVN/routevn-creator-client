package com.routevn.creator;

import static android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
import static android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
import static org.junit.Assert.assertEquals;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.util.ReflectionHelpers;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {28, 35}, manifest = Config.NONE)
public class PhonePortraitLockTest {
    // Lock without starting storage, the native exporter, or the WebView.
    private MainActivity lockedActivity() {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        ReflectionHelpers.callInstanceMethod(activity, "applyPhonePortraitLock");
        return activity;
    }

    @Test
    public void smallestWidthBelow600dpIsAPhone() {
        assertEquals(SCREEN_ORIENTATION_PORTRAIT, MainActivity.requestedOrientationFor(599));
        assertEquals(SCREEN_ORIENTATION_UNSPECIFIED, MainActivity.requestedOrientationFor(600));
    }

    @Test
    @Config(qualifiers = "w411dp-h891dp")
    public void phonesLockToPortrait() {
        assertEquals(SCREEN_ORIENTATION_PORTRAIT, lockedActivity().getRequestedOrientation());
    }

    @Test
    @Config(qualifiers = "w891dp-h411dp")
    public void phonesStartedInLandscapeLockToPortrait() {
        assertEquals(SCREEN_ORIENTATION_PORTRAIT, lockedActivity().getRequestedOrientation());
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    public void tabletsKeepEveryOrientation() {
        assertEquals(SCREEN_ORIENTATION_UNSPECIFIED, lockedActivity().getRequestedOrientation());
    }

    @Test
    @Config(qualifiers = "w411dp-h891dp")
    public void unfoldingToTabletSizeUnlocksAndFoldingLocksAgain() {
        MainActivity activity = lockedActivity();

        RuntimeEnvironment.setQualifiers("w841dp-h701dp");
        activity.onConfigurationChanged(activity.getResources().getConfiguration());
        assertEquals(SCREEN_ORIENTATION_UNSPECIFIED, activity.getRequestedOrientation());

        RuntimeEnvironment.setQualifiers("w411dp-h891dp");
        activity.onConfigurationChanged(activity.getResources().getConfiguration());
        assertEquals(SCREEN_ORIENTATION_PORTRAIT, activity.getRequestedOrientation());
    }
}
