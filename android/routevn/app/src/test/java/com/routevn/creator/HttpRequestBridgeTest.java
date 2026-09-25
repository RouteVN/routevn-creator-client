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
public class HttpRequestBridgeTest {
    private static JSONObject payload(String url, String body) throws Exception {
        return new JSONObject()
            .put("url", url)
            .put("method", "POST")
            .put("headers", new JSONObject()
                .put("Content-Type", "application/json")
                .put("X-RouteVN-RPC", "1"))
            .put("body", body);
    }

    @Test public void acceptsOnlyBoundedHttpCapabilityShape() throws Exception {
        JSONObject value = payload("https://api1.routevn.com/system/rpc", "{\"hello\":true}");
        HttpRequestBridge.Request request = HttpRequestBridge.validateRequest(value);
        assertEquals("https://api1.routevn.com/system/rpc", request.endpoint.toString());
        assertEquals("{\"hello\":true}", new String(request.body, java.nio.charset.StandardCharsets.UTF_8));
        assertEquals("application/json", request.headers.get("Content-Type"));
        assertEquals("1", request.headers.get("X-RouteVN-RPC"));
        value.getJSONObject("headers").put("X-Client-Request", "metadata");
        assertEquals("metadata", HttpRequestBridge.validateRequest(value).headers.get("X-Client-Request"));
        assertThrows(IllegalArgumentException.class, () -> HttpRequestBridge.validateRequest(
            payload("https://api1.routevn.com/system/rpc", "{}")
                .put("cookie", "session=secret")));
        assertThrows(IllegalArgumentException.class, () -> HttpRequestBridge.validateRequest(
            payload("https://api1.routevn.com/system/rpc", "{}")
                .put("method", "GET")));
        JSONObject withCookie = payload("https://api1.routevn.com/system/rpc", "{}");
        withCookie.getJSONObject("headers").put("Cookie", "session=secret");
        assertThrows(IllegalArgumentException.class,
            () -> HttpRequestBridge.validateRequest(withCookie));
        JSONObject withNewline = payload("https://api1.routevn.com/system/rpc", "{}");
        withNewline.getJSONObject("headers").put("X-Test", "ok\r\nCookie: secret");
        assertThrows(IllegalArgumentException.class,
            () -> HttpRequestBridge.validateRequest(withNewline));
        assertThrows(IllegalArgumentException.class, () -> HttpRequestBridge.validateRequest(
            payload("https://api1.routevn.com/system/rpc", "{}")
                .put("body", "x".repeat(HttpRequestBridge.MAX_REQUEST_BYTES + 1))));
    }

    @Test public void restrictsEndpointsToProductionOrDebugLocalNetwork() throws Exception {
        assertEquals("api1.routevn.com", HttpRequestBridge.validateEndpoint(
            "https://api1.routevn.com/system/rpc").getHost());
        for (String url : new String[] {
            "https://example.com/system/rpc", "http://api1.routevn.com/system/rpc",
            "https://api1.routevn.com.evil.test/system/rpc",
            "https://user:password@api1.routevn.com/system/rpc",
            "https://api1.routevn.com:8443/system/rpc",
            "https://api1.routevn.com/system/rpc#fragment",
            "file:///tmp/update.json", "https://127.0.0.1/system/rpc",
            "http://8.8.8.8:8787/system/rpc"
        }) {
            assertThrows(url, IllegalArgumentException.class,
                () -> HttpRequestBridge.validateEndpoint(url));
        }
        if (BuildConfig.DEBUG) {
            assertEquals("127.0.0.1", HttpRequestBridge.validateEndpoint(
                "http://127.0.0.1:8787/system/rpc").getHost());
            assertEquals("192.168.1.2", HttpRequestBridge.validateEndpoint(
                "http://192.168.1.2:8787/system/rpc").getHost());
        }
    }

    @Test public void refusesSharedCookieStorageWithoutChangingIt() {
        java.net.CookieHandler original = java.net.CookieHandler.getDefault();
        java.net.CookieManager cookies = new java.net.CookieManager();
        try {
            java.net.CookieHandler.setDefault(cookies);
            assertThrows(IllegalStateException.class, HttpRequestBridge::requireCookieFreeTransport);
            assertSame(cookies, java.net.CookieHandler.getDefault());
            java.net.CookieHandler.setDefault(null);
            HttpRequestBridge.requireCookieFreeTransport();
        } finally {
            java.net.CookieHandler.setDefault(original);
        }
    }

    @Test public void enforcesStreamingBoundWithoutContentLength() throws Exception {
        byte[] exact = new byte[HttpRequestBridge.MAX_RESPONSE_BYTES];
        assertEquals(exact.length, HttpRequestBridge.readBody(new ByteArrayInputStream(exact)).length());
        byte[] oversized = new byte[HttpRequestBridge.MAX_RESPONSE_BYTES + 1];
        assertThrows(java.io.IOException.class,
            () -> HttpRequestBridge.readBody(new ByteArrayInputStream(oversized)));
        assertEquals("", HttpRequestBridge.readBody(null));
    }
}
