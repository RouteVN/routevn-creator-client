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
    @Test public void reportsDistributionIndependentlyOfDebugPlaySupport() throws Exception {
        JSONObject direct = ClientUpdateApi.context("1.15.1", 9, "arm64-v8a", "direct");
        assertEquals("direct", direct.getString("distribution"));
        assertEquals("9", direct.getString("currentBuild"));
        assertEquals("aarch64", direct.getString("arch"));
        assertEquals("1.15.1", direct.getString("currentVersion"));
        JSONObject play = ClientUpdateApi.context("1.15.1", 9, "x86_64", "google-play");
        JSONObject request = ClientUpdateApi.requestBody(play, new JSONObject().put("availableBuild", "10"));
        assertEquals("system.getClientUpdate", request.getString("method"));
        assertEquals("2.0", request.getString("jsonrpc"));
        assertEquals(1, request.getInt("id"));
        assertEquals("10", request.getJSONObject("params").getString("availableBuild"));
        assertEquals("google-play", play.getString("distribution"));
    }

    @Test public void rejectsStoreBuildHintsForDirectAndInvalidPlayBuilds() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> ClientUpdateApi.requestBody(
            ClientUpdateApi.context("1.15.1", 9, "x86", "direct"), new JSONObject().put("availableBuild", "10")));
        for (Object value : new Object[] { "0", "9", "8", "-1", "01", "1.5", "2100000001", "999999999999999", 10, JSONObject.NULL }) {
            assertThrows(IllegalArgumentException.class, () -> ClientUpdateApi.requestBody(
                ClientUpdateApi.context("1.15.1", 9, "armeabi-v7a", "google-play"),
                new JSONObject().put("availableBuild", value)));
        }
    }

    @Test public void rejectsCallerProvidedEndpoints() {
        assertThrows(IllegalArgumentException.class, () -> ClientUpdateApi.requestBody(
            ClientUpdateApi.context("1.15.1", 9, "x86", "direct"),
            new JSONObject().put("endpoint", "http://example.invalid")));
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
