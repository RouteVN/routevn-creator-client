package com.routevn.creator;

import static org.junit.Assert.*;

import android.content.Context;
import android.os.LocaleList;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class AppDeviceInfoTest {
    private static JSONObject create(String abi) throws Exception {
        return AppDeviceInfo.create("1.16.2", 12, abi, "direct", "Pixel 9", "16",
            "phone", "ja-JP", "128");
    }

    @Test public void exposesOnlyRawDeviceAndInstallationFacts() throws Exception {
        JSONObject direct = create("arm64-v8a");
        assertEquals(9, direct.length());
        assertEquals("1.16.2", direct.getString("version"));
        assertEquals("12", direct.getString("build"));
        assertEquals("aarch64", direct.getString("arch"));
        assertEquals("direct", direct.getString("distribution"));
        assertEquals("Pixel 9", direct.getString("model"));
        assertEquals("16", direct.getString("osVersion"));
        assertEquals("phone", direct.getString("formFactor"));
        assertEquals("ja-JP", direct.getString("language"));
        assertEquals("128", direct.getString("webViewVersion"));
        assertFalse(direct.has("appId"));
        assertFalse(direct.has("target"));
        assertFalse(direct.has("channel"));
        assertFalse(direct.has("device"));
        JSONObject play = AppDeviceInfo.create("1.16.2", 12, "x86_64", "google-play",
            "device", "15", "tablet", "en-US", null);
        assertEquals("google-play", play.getString("distribution"));
        assertEquals("x86_64", play.getString("arch"));
        assertEquals("tablet", play.getString("formFactor"));
        assertTrue(play.isNull("webViewVersion"));
    }

    @Test public void mapsSupportedAndUnavailableABIs() throws Exception {
        assertEquals("aarch64", AppDeviceInfo.architecture("arm64-v8a"));
        assertEquals("armv7", AppDeviceInfo.architecture("armeabi-v7a"));
        assertEquals("i686", AppDeviceInfo.architecture("x86"));
        assertEquals("x86_64", AppDeviceInfo.architecture("x86_64"));
        assertEquals("unknown", AppDeviceInfo.architecture("unknown"));
        assertEquals("unknown", AppDeviceInfo.architecture(null));
        assertNull(AppDeviceInfo.primaryAbi(new String[0]));
        assertNull(AppDeviceInfo.primaryAbi(null));
        assertEquals("arm64-v8a", AppDeviceInfo.primaryAbi(new String[] { "arm64-v8a" }));
        JSONObject missing = AppDeviceInfo.create("1.16.2", 12,
            AppDeviceInfo.primaryAbi(new String[0]), "direct", "Pixel 9", "16",
            "phone", null, null);
        assertEquals(9, missing.length());
        assertEquals("unknown", missing.getString("arch"));
        assertTrue(missing.isNull("language"));
        assertTrue(missing.isNull("webViewVersion"));
    }

    @Test public void retainsNullablePlatformFieldsForJsNormalization() throws Exception {
        JSONObject info = AppDeviceInfo.create("1.16.2", 12, "arm64-v8a", "direct",
            null, null, null, null, null);
        assertEquals(9, info.length());
        assertTrue(info.has("model"));
        assertTrue(info.has("osVersion"));
        assertTrue(info.isNull("model"));
        assertTrue(info.isNull("osVersion"));
        assertTrue(info.isNull("formFactor"));
        assertTrue(info.isNull("language"));
        assertTrue(info.isNull("webViewVersion"));
    }

    @Test public void picksFormFactorFromChromeOsThenSmallestDisplayWidth() {
        assertEquals("desktop", AppDeviceInfo.formFactor(true, 300));
        assertEquals("desktop", AppDeviceInfo.formFactor(true, 1200));
        assertEquals("tablet", AppDeviceInfo.formFactor(false, 600));
        assertEquals("tablet", AppDeviceInfo.formFactor(false, 1200));
        assertEquals("phone", AppDeviceInfo.formFactor(false, 599));
        assertEquals("phone", AppDeviceInfo.formFactor(false, 0));
    }

    @Test public void readsWebViewMajorFromPackageVersionNames() {
        assertEquals("128", AppDeviceInfo.webViewVersionFromVersionName("128.0.6613.84"));
        assertEquals("137", AppDeviceInfo.webViewVersionFromVersionName("137"));
        assertEquals("128", AppDeviceInfo.webViewVersionFromVersionName("128.0.6613.84-beta"));
        assertNull(AppDeviceInfo.webViewVersionFromVersionName("beta-128.0"));
        assertNull(AppDeviceInfo.webViewVersionFromVersionName(""));
        assertNull(AppDeviceInfo.webViewVersionFromVersionName(null));
        assertNull(AppDeviceInfo.webViewVersionFromVersionName("012345"));
    }

    @Test public void readsWebViewMajorFromChromeUserAgentBeforeApi26() {
        assertEquals("128", AppDeviceInfo.webViewVersionFromUserAgent(
            "Mozilla/5.0 (Linux; Android 11; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) "
                + "Version/4.0 Chrome/128.0.6613.84 Mobile Safari/537.36"));
        assertEquals("79", AppDeviceInfo.webViewVersionFromUserAgent(
            "; Chrome/79.0.3945.116"));
        assertNull(AppDeviceInfo.webViewVersionFromUserAgent(
            "Mozilla/5.0 (Linux; Android 7.0) AppleWebKit/537.36 Version/4.0 Mobile Safari/537.36"));
        assertNull(AppDeviceInfo.webViewVersionFromUserAgent("Chrome/"));
        assertNull(AppDeviceInfo.webViewVersionFromUserAgent(null));
    }

    @Test public void readsSystemLanguageTagAndCompleteFacts() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        JSONObject info = AppDeviceInfo.read(context);
        assertEquals(9, info.length());
        // Robolectric's small default display is a phone.
        assertEquals("phone", info.getString("formFactor"));
        // Robolectric's system locale is a raw tag shared JavaScript normalizes.
        assertNotNull(info.opt("language"));
        // No real WebView package exists under Robolectric; the key stays null.
        assertTrue(info.isNull("webViewVersion"));
        assertEquals(BuildConfig.VERSION_NAME, info.getString("version"));
        assertEquals(Integer.toString(BuildConfig.VERSION_CODE), info.getString("build"));
    }

    @Test public void nullsEachUsageFieldAloneWhenItsReadFails() throws Exception {
        assertNull(AppDeviceInfo.systemLanguageTag(new LocaleList()));
        assertNull(AppDeviceInfo.systemLanguageTag(null));
        assertEquals("ja-JP", AppDeviceInfo.systemLanguageTag(
            new LocaleList(java.util.Locale.forLanguageTag("ja-JP"))));
        assertNull(AppDeviceInfo.formFactor((Context) null));
        // A failed usage read never takes the installation facts down.
        JSONObject info = AppDeviceInfo.read(null);
        assertEquals(9, info.length());
        assertEquals(BuildConfig.VERSION_NAME, info.getString("version"));
        assertEquals(Integer.toString(BuildConfig.VERSION_CODE), info.getString("build"));
        assertTrue(info.isNull("formFactor"));
        assertTrue(info.isNull("webViewVersion"));
    }
}
