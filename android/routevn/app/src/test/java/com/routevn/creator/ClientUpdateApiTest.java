package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class ClientUpdateApiTest {
    private static final String DEVICE_ID = "123456789AbC";

    private static JSONObject payload() throws Exception {
        return new JSONObject().put("deviceId", DEVICE_ID);
    }

    @Test public void reportsDistributionIndependentlyOfDebugPlaySupport() throws Exception {
        JSONObject direct = ClientUpdateApi.context("1.15.1", 9, "arm64-v8a", "direct");
        assertEquals("direct", direct.getString("distribution"));
        assertEquals("9", direct.getString("currentBuild"));
        assertEquals("aarch64", direct.getString("arch"));
        assertEquals("1.15.1", direct.getString("currentVersion"));
        JSONObject play = ClientUpdateApi.context("1.15.1", 9, "x86_64", "google-play");
        JSONObject request = ClientUpdateApi.requestBody(play, payload().put("availableBuild", "10"));
        assertEquals("system.getClientUpdate", request.getString("method"));
        assertEquals("2.0", request.getString("jsonrpc"));
        assertEquals(1, request.getInt("id"));
        assertEquals("10", request.getJSONObject("params").getString("availableBuild"));
        assertEquals("google-play", play.getString("distribution"));
        JSONObject params = request.getJSONObject("params");
        assertEquals(DEVICE_ID, params.getJSONObject("device").getString("id"));
        assertEquals(3, params.getJSONObject("device").length());
        assertEquals(android.os.Build.MODEL, play.getJSONObject("device").getString("model"));
        assertEquals(android.os.Build.VERSION.RELEASE, play.getJSONObject("device").getString("osVersion"));
        assertFalse(params.has("deviceId"));
        assertFalse(params.has("deviceModel"));
        assertFalse(params.has("osVersion"));
    }

    @Test public void rejectsStoreBuildHintsForDirectAndInvalidPlayBuilds() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> ClientUpdateApi.requestBody(
            ClientUpdateApi.context("1.15.1", 9, "x86", "direct"), payload().put("availableBuild", "10")));
        for (Object value : new Object[] { "0", "9", "8", "-1", "01", "1.5", "2100000001", "999999999999999", 10, JSONObject.NULL }) {
            assertThrows(IllegalArgumentException.class, () -> ClientUpdateApi.requestBody(
                ClientUpdateApi.context("1.15.1", 9, "armeabi-v7a", "google-play"),
                payload().put("availableBuild", value)));
        }
    }

    @Test public void reportsDeviceMetadataAndFallsBackWhenUnavailable() throws Exception {
        JSONObject context = ClientUpdateApi.context("1.15.1", 9, "arm64-v8a", "direct", "Pixel 9", "16");
        assertEquals("Pixel 9", context.getJSONObject("device").getString("model"));
        assertEquals("16", context.getJSONObject("device").getString("osVersion"));
        JSONObject request = ClientUpdateApi.requestBody(context, payload());
        assertEquals(DEVICE_ID, request.getJSONObject("params").getJSONObject("device").getString("id"));
        assertFalse(request.getJSONObject("params").has("availableBuild"));
        for (String value : new String[] { null, "", " ", "\u00a0", "\ufeff", "a".repeat(257),
                "Pixel\n9", "Pixel" + (char) 0, "Pixel" + (char) 31, "Pixel" + (char) 127 }) {
            JSONObject missingModel = ClientUpdateApi.context(
                "1.15.1", 9, "arm64-v8a", "direct", value, "16");
            assertEquals("unknown", missingModel.getJSONObject("device").getString("model"));
            assertEquals("16", missingModel.getJSONObject("device").getString("osVersion"));
            JSONObject missingVersion = ClientUpdateApi.context(
                "1.15.1", 9, "arm64-v8a", "direct", "Pixel 9", value);
            assertEquals("unknown", missingVersion.getJSONObject("device").getString("osVersion"));
            assertEquals("Pixel 9", missingVersion.getJSONObject("device").getString("model"));
        }
    }

    @Test public void requiresExactRandomDeviceIdAndRejectsCallerMetadata() throws Exception {
        JSONObject context = ClientUpdateApi.context("1.15.1", 9, "arm64-v8a", "direct");
        assertThrows(IllegalArgumentException.class, () -> ClientUpdateApi.requestBody(context, new JSONObject()));
        for (Object value : new Object[] { "", "123456789Ab", "123456789AbCD", "023456789AbC",
                "I23456789AbC", "l23456789AbC", "O23456789AbC", DEVICE_ID + "\n", 123, JSONObject.NULL }) {
            assertThrows(IllegalArgumentException.class, () -> ClientUpdateApi.requestBody(
                context, new JSONObject().put("deviceId", value)));
        }
        for (String key : new String[] { "device", "deviceModel", "osVersion", "distribution", "currentVersion" }) {
            assertThrows(IllegalArgumentException.class, () -> ClientUpdateApi.requestBody(
                context, payload().put(key, "caller-supplied")));
        }
    }

    @Test public void rejectsCallerProvidedEndpoints() {
        assertThrows(IllegalArgumentException.class, () -> ClientUpdateApi.requestBody(
            ClientUpdateApi.context("1.15.1", 9, "x86", "direct"),
            payload().put("endpoint", "http://example.invalid")));
    }

    @Test public void mapsEverySupportedABIAndRejectsUnknownABI() {
        assertEquals("aarch64", ClientUpdateApi.architecture("arm64-v8a"));
        assertEquals("armv7", ClientUpdateApi.architecture("armeabi-v7a"));
        assertEquals("i686", ClientUpdateApi.architecture("x86"));
        assertEquals("x86_64", ClientUpdateApi.architecture("x86_64"));
        assertThrows(IllegalArgumentException.class, () -> ClientUpdateApi.architecture("unknown"));
    }

    @Test public void refusesSharedCookieStorageWithoutChangingIt() {
        java.net.CookieHandler original = java.net.CookieHandler.getDefault();
        java.net.CookieManager cookies = new java.net.CookieManager();
        try {
            java.net.CookieHandler.setDefault(cookies);
            assertThrows(IllegalStateException.class, ClientUpdateApi::requireCookieFreeTransport);
            assertSame(cookies, java.net.CookieHandler.getDefault());
            java.net.CookieHandler.setDefault(null);
            ClientUpdateApi.requireCookieFreeTransport();
        } finally {
            java.net.CookieHandler.setDefault(original);
        }
    }

    @Test public void enforcesStreamingBoundWithoutRelyingOnContentLength() throws Exception {
        byte[] exact = new byte[ClientUpdateApi.MAX_RESPONSE_BYTES];
        assertEquals(exact.length, ClientUpdateApi.readBody(new ByteArrayInputStream(exact)).length());
        byte[] oversized = new byte[ClientUpdateApi.MAX_RESPONSE_BYTES + 1];
        assertThrows(java.io.IOException.class, () -> ClientUpdateApi.readBody(new ByteArrayInputStream(oversized)));
        assertEquals("", ClientUpdateApi.readBody(null));
    }
}
