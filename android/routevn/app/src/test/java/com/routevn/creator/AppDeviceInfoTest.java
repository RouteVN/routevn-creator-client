package com.routevn.creator;

import static org.junit.Assert.*;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class AppDeviceInfoTest {
    @Test public void exposesOnlyRawDeviceAndInstallationFacts() throws Exception {
        JSONObject direct = AppDeviceInfo.create("1.16.2", 12, "arm64-v8a", "direct", "Pixel 9", "16");
        assertEquals(6, direct.length());
        assertEquals("1.16.2", direct.getString("version"));
        assertEquals("12", direct.getString("build"));
        assertEquals("aarch64", direct.getString("arch"));
        assertEquals("direct", direct.getString("distribution"));
        assertEquals("Pixel 9", direct.getString("model"));
        assertEquals("16", direct.getString("osVersion"));
        assertFalse(direct.has("appId"));
        assertFalse(direct.has("target"));
        assertFalse(direct.has("channel"));
        assertFalse(direct.has("device"));
        JSONObject play = AppDeviceInfo.create("1.16.2", 12, "x86_64", "google-play", "device", "15");
        assertEquals("google-play", play.getString("distribution"));
        assertEquals("x86_64", play.getString("arch"));
    }

    @Test public void mapsSupportedABIs() {
        assertEquals("aarch64", AppDeviceInfo.architecture("arm64-v8a"));
        assertEquals("armv7", AppDeviceInfo.architecture("armeabi-v7a"));
        assertEquals("i686", AppDeviceInfo.architecture("x86"));
        assertEquals("x86_64", AppDeviceInfo.architecture("x86_64"));
        assertThrows(IllegalArgumentException.class, () -> AppDeviceInfo.architecture("unknown"));
    }

    @Test public void retainsNullablePlatformFieldsForJsNormalization() throws Exception {
        JSONObject info = AppDeviceInfo.create("1.16.2", 12, "arm64-v8a", "direct", null, null);
        assertEquals(6, info.length());
        assertTrue(info.has("model"));
        assertTrue(info.has("osVersion"));
        assertTrue(info.isNull("model"));
        assertTrue(info.isNull("osVersion"));
    }
}
