package com.routevn.creator;

import static org.junit.Assert.*;

import android.graphics.Rect;
import android.os.Build;
import android.view.DisplayCutout;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.DisplayCutoutCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import java.util.Collections;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.util.ReflectionHelpers;
import org.robolectric.util.ReflectionHelpers.ClassParameter;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {28, 33, 35}, manifest = Config.NONE)
public class WindowInsetsTest {
    private MainActivity activity;
    private FrameLayout root;

    @Before
    public void setUp() {
        // Exercise the real window/inset configuration without starting storage,
        // the native exporter, or the WebView's network/JavaScript runtime.
        activity = Robolectric.buildActivity(MainActivity.class).get();
        ReflectionHelpers.callInstanceMethod(activity, "configureWindow");
        root = new FrameLayout(activity);
        ReflectionHelpers.callInstanceMethod(
            activity, "applySystemBarInsets", ClassParameter.from(View.class, root)
        );
        activity.setContentView(root);
    }

    @Test
    public void systemBarsAreAppliedOnceAndDoNotAccumulate() {
        WindowInsetsCompat insets = new WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.statusBars(), Insets.of(0, 24, 0, 0))
            .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(0, 0, 0, 48))
            .build();

        WindowInsetsCompat remaining = ViewCompat.dispatchApplyWindowInsets(root, insets);
        ViewCompat.dispatchApplyWindowInsets(root, insets);

        assertEquals(24, root.getPaddingTop());
        assertEquals(48, root.getPaddingBottom());
        assertEquals(Insets.NONE, remaining.getInsets(WindowInsetsCompat.Type.systemBars()));

        ViewCompat.dispatchApplyWindowInsets(root, new WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(0, 0, 0, 16))
            .build());
        assertEquals(0, root.getPaddingTop());
        assertEquals(16, root.getPaddingBottom());
    }

    @Test
    public void landscapeCutoutAndSideNavigationRemainOutsideContent() {
        DisplayCutoutCompat cutout = new DisplayCutoutCompat(
            new Rect(80, 0, 0, 0), Collections.singletonList(new Rect(0, 100, 80, 180))
        );
        WindowInsetsCompat insets = new WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.statusBars(), Insets.of(0, 24, 0, 0))
            .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(0, 0, 48, 0))
            .setDisplayCutout(cutout)
            .build();
        if (Build.VERSION.SDK_INT == 28) {
            // Android 9 has no public WindowInsets.Builder. Use its platform
            // constructor so this fixture carries a real cutout through dispatch.
            WindowInsets platformInsets = ReflectionHelpers.callConstructor(
                WindowInsets.class,
                ClassParameter.from(Rect.class, new Rect(0, 24, 48, 0)),
                ClassParameter.from(Rect.class, new Rect()),
                ClassParameter.from(Rect.class, new Rect(0, 24, 48, 0)),
                ClassParameter.from(boolean.class, false),
                ClassParameter.from(boolean.class, false),
                ClassParameter.from(DisplayCutout.class, new DisplayCutout(
                    new Rect(80, 0, 0, 0),
                    Collections.singletonList(new Rect(0, 100, 80, 180))
                ))
            );
            insets = WindowInsetsCompat.toWindowInsetsCompat(platformInsets);
        }

        WindowInsetsCompat remaining = ViewCompat.dispatchApplyWindowInsets(root, insets);

        assertEquals(80, root.getPaddingLeft());
        assertEquals(24, root.getPaddingTop());
        assertEquals(48, root.getPaddingRight());
        assertEquals(0, root.getPaddingBottom());
        assertEquals(Insets.NONE, remaining.getInsets(
            WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
        ));
    }

    @Test
    @Config(sdk = {33, 35})
    public void keyboardInsetsReachWebViewWithoutDuplicatingNavigationPadding() {
        WindowInsetsCompat insets = new WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.statusBars(), Insets.of(0, 24, 0, 0))
            .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(0, 0, 0, 16))
            .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, 300))
            .setVisible(WindowInsetsCompat.Type.ime(), true)
            .build();

        WindowInsetsCompat remaining = ViewCompat.dispatchApplyWindowInsets(root, insets);

        assertEquals(16, root.getPaddingBottom());
        assertTrue(remaining.isVisible(WindowInsetsCompat.Type.ime()));
        assertEquals(284, remaining.getInsets(WindowInsetsCompat.Type.ime()).bottom);
    }

    @Test
    public void systemBarIconsStayLightOnTheBlackRoot() {
        Window window = activity.getWindow();
        assertFalse(WindowCompat.getInsetsController(window, window.getDecorView())
            .isAppearanceLightStatusBars());
        assertFalse(WindowCompat.getInsetsController(window, window.getDecorView())
            .isAppearanceLightNavigationBars());
    }
}
