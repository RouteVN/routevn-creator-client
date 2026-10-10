package com.routevn.creator;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, manifest = Config.NONE)
public class MinimumWebViewTest {
    @Test
    public void blocksWebViewsBefore111() {
        assertTrue(MainActivity.isWebViewTooOld("66"));
        assertTrue(MainActivity.isWebViewTooOld("101"));
        assertTrue(MainActivity.isWebViewTooOld("110"));
        assertFalse(MainActivity.isWebViewTooOld("111"));
        assertFalse(MainActivity.isWebViewTooOld("138"));
    }

    @Test
    public void allowsAnUnreadableVersion() {
        assertFalse(MainActivity.isWebViewTooOld(null));
    }
}
