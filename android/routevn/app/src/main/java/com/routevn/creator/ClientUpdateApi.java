package com.routevn.creator;

import android.os.Build;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;
import org.json.JSONObject;

/** Metadata only: installation remains owned by Google Play. */
final class ClientUpdateApi implements AutoCloseable {
    static final int MAX_RESPONSE_BYTES = 64 * 1024;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService deadline = Executors.newSingleThreadScheduledExecutor();
    private final AtomicBoolean busy = new AtomicBoolean();
    private volatile HttpURLConnection connection;

    static String architecture(String abi) {
        switch (abi) {
            case "arm64-v8a": return "aarch64";
            case "armeabi-v7a": return "armv7";
            case "x86_64": return "x86_64";
            case "x86": return "i686";
            default: throw new IllegalArgumentException("Unsupported Android architecture.");
        }
    }

    static JSONObject context() throws Exception {
        return context(BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE,
            (android.os.Process.is64Bit() ? Build.SUPPORTED_64_BIT_ABIS : Build.SUPPORTED_32_BIT_ABIS)[0],
            BuildConfig.UPDATE_DISTRIBUTION);
    }

    static JSONObject context(String version, int build, String abi, String distribution) throws Exception {
        if (!"direct".equals(distribution) && !"google-play".equals(distribution)) {
            throw new IllegalArgumentException("Unsupported Android distribution.");
        }
        return new JSONObject()
            .put("appId", "routevn-creator")
            .put("currentVersion", version)
            .put("currentBuild", Integer.toString(build))
            .put("target", "android")
            .put("arch", architecture(abi))
            .put("distribution", distribution)
            .put("channel", "stable");
    }

    static JSONObject requestBody(JSONObject params, JSONObject payload) throws Exception {
        if (payload.length() > (payload.has("availableBuild") ? 1 : 0)) {
            throw new IllegalArgumentException("Unexpected update request parameter.");
        }
        if (payload.has("availableBuild")) {
            Object value = payload.get("availableBuild");
            if (!"google-play".equals(params.getString("distribution")) ||
                !(value instanceof String) || !((String) value).matches("[1-9][0-9]{0,9}") ||
                Long.parseLong((String) value) > 2100000000L ||
                Long.parseLong((String) value) <= Long.parseLong(params.getString("currentBuild"))) {
                throw new IllegalArgumentException("Invalid Google Play build.");
            }
            params.put("availableBuild", value);
        }
        return new JSONObject().put("jsonrpc", "2.0").put("id", 1)
            .put("method", "system.getClientUpdate").put("params", params);
    }

    void request(JSONObject payload, BiConsumer<JSONObject, Throwable> completion) throws Exception {
        byte[] body = requestBody(context(), payload).toString().getBytes(StandardCharsets.UTF_8);
        URL endpoint = new URL(BuildConfig.UPDATE_API_URL);
        if ((!"https".equals(endpoint.getProtocol()) &&
             !(BuildConfig.DEBUG && "http".equals(endpoint.getProtocol()))) ||
            endpoint.getUserInfo() != null || endpoint.getHost().isEmpty()) {
            throw new IllegalArgumentException("Invalid update API endpoint.");
        }
        if (!busy.compareAndSet(false, true)) {
            throw new IllegalStateException("An update request is already running.");
        }
        AtomicBoolean completed = new AtomicBoolean();
        ScheduledFuture<?> timeout;
        try {
            timeout = deadline.schedule(() -> {
                if (completed.compareAndSet(false, true)) {
                    completion.accept(null, new java.net.SocketTimeoutException("Update request timed out."));
                    HttpURLConnection active = connection;
                    if (active != null) active.disconnect();
                }
            }, 10, TimeUnit.SECONDS);
        } catch (RuntimeException error) {
            busy.set(false);
            throw error;
        }
        try {
            network.execute(() -> {
                HttpURLConnection active = null;
                try {
                    if (completed.get()) return;
                    requireCookieFreeTransport();
                    active = (HttpURLConnection) endpoint.openConnection();
                    connection = active;
                    if (completed.get()) return;
                    active.setConnectTimeout(10000);
                    active.setReadTimeout(10000);
                    active.setInstanceFollowRedirects(false);
                    active.setUseCaches(false);
                    active.setRequestMethod("POST");
                    active.setRequestProperty("Content-Type", "application/json");
                    active.setRequestProperty("X-RouteVN-RPC", "1");
                    active.setRequestProperty("Cache-Control", "no-store");
                    active.setDoOutput(true);
                    active.setFixedLengthStreamingMode(body.length);
                    try (java.io.OutputStream stream = active.getOutputStream()) { stream.write(body); }
                    int status = active.getResponseCode();
                    if (active.getContentLengthLong() > MAX_RESPONSE_BYTES) {
                        throw new java.io.IOException("Update response is too large.");
                    }
                    String response;
                    try (InputStream stream = status >= 400 ? active.getErrorStream() : active.getInputStream()) {
                        response = readBody(stream);
                    }
                    JSONObject result = new JSONObject().put("status", status).put("body", response);
                    String retryAfter = active.getHeaderField("Retry-After");
                    if (retryAfter != null) result.put("retryAfter", retryAfter);
                    if (completed.compareAndSet(false, true)) completion.accept(result, null);
                } catch (Exception error) {
                    if (completed.compareAndSet(false, true)) completion.accept(null, error);
                } finally {
                    timeout.cancel(false);
                    if (active != null) active.disconnect();
                    connection = null;
                    busy.set(false);
                }
            });
        } catch (RuntimeException error) {
            timeout.cancel(false);
            busy.set(false);
            throw error;
        }
    }

    static void requireCookieFreeTransport() {
        // HttpURLConnection shares the process cookie handler. Never send
        // update metadata through a future app-wide authenticated cookie jar.
        if (java.net.CookieHandler.getDefault() != null) {
            throw new IllegalStateException("Update requests require a cookie-free transport.");
        }
    }

    static String readBody(InputStream stream) throws Exception {
        if (stream == null) return "";
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int count;
        while ((count = stream.read(buffer)) != -1) {
            if (bytes.size() + count > MAX_RESPONSE_BYTES) {
                throw new java.io.IOException("Update response is too large.");
            }
            bytes.write(buffer, 0, count);
        }
        return bytes.toString(StandardCharsets.UTF_8.name());
    }

    @Override
    public void close() {
        deadline.shutdownNow();
        network.shutdownNow();
        HttpURLConnection active = connection;
        if (active != null) active.disconnect();
    }
}
