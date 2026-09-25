package com.routevn.creator;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;
import org.json.JSONObject;

/** A bounded, cookie-free HTTP capability for the app API. */
final class HttpRequestBridge implements AutoCloseable {
    static final int MAX_REQUEST_BYTES = 64 * 1024;
    static final int MAX_RESPONSE_BYTES = 64 * 1024;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService deadline = Executors.newSingleThreadScheduledExecutor();
    private final AtomicBoolean busy = new AtomicBoolean();
    private volatile HttpURLConnection connection;

    static final class Request {
        final URL endpoint;
        final byte[] body;
        final Map<String, String> headers;

        Request(URL endpoint, byte[] body, Map<String, String> headers) {
            this.endpoint = endpoint;
            this.body = body;
            this.headers = headers;
        }
    }

    static Request validateRequest(JSONObject payload) throws Exception {
        if (payload.length() != 4 || !"POST".equals(payload.opt("method"))) {
            throw new IllegalArgumentException("Invalid HTTP request.");
        }
        Object url = payload.opt("url");
        Object body = payload.opt("body");
        JSONObject headers = payload.optJSONObject("headers");
        if (!(url instanceof String) || !(body instanceof String) || headers == null ||
            headers.length() > 16) {
            throw new IllegalArgumentException("Invalid HTTP request.");
        }
        Map<String, String> requestHeaders = new LinkedHashMap<>();
        Set<String> names = new HashSet<>();
        for (java.util.Iterator<String> keys = headers.keys(); keys.hasNext();) {
            String name = keys.next();
            Object headerValue = headers.opt(name);
            String lowerName = name.toLowerCase(Locale.ROOT);
            if (!name.matches("[A-Za-z][A-Za-z0-9-]{0,63}") ||
                !names.add(lowerName) || isForbiddenHeader(lowerName) ||
                !(headerValue instanceof String) ||
                ((String) headerValue).length() > 512) {
                throw new IllegalArgumentException("Invalid HTTP request header.");
            }
            String text = (String) headerValue;
            for (int index = 0; index < text.length(); index++) {
                char character = text.charAt(index);
                if (character < 0x20 || character >= 0x7f) {
                    throw new IllegalArgumentException("Invalid HTTP request header.");
                }
            }
            requestHeaders.put(name, text);
        }
        byte[] bytes = ((String) body).getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_REQUEST_BYTES) {
            throw new IllegalArgumentException("HTTP request body is too large.");
        }
        return new Request(validateEndpoint((String) url), bytes, requestHeaders);
    }

    private static boolean isForbiddenHeader(String name) {
        return name.startsWith("cookie") || name.equals("authorization") ||
            name.equals("proxy-authorization") || name.equals("host") ||
            name.equals("connection") || name.equals("content-length") ||
            name.equals("transfer-encoding") || name.equals("origin") ||
            name.equals("referer") || name.startsWith("proxy-");
    }

    static URL validateEndpoint(String value) throws Exception {
        if (value.isEmpty() || value.length() > 2048) {
            throw new IllegalArgumentException("Invalid HTTP endpoint.");
        }
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character <= 0x20 || character >= 0x7f) {
                throw new IllegalArgumentException("Invalid HTTP endpoint.");
            }
        }
        URI uri = new URI(value);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (host == null || uri.getRawUserInfo() != null || uri.getRawFragment() != null ||
            uri.getRawPath() == null || !uri.getRawPath().startsWith("/")) {
            throw new IllegalArgumentException("Invalid HTTP endpoint.");
        }
        if ("https".equals(scheme) && "api1.routevn.com".equals(host) &&
            (uri.getPort() == -1 || uri.getPort() == 443)) {
            return uri.toURL();
        }
        if (BuildConfig.DEBUG && "http".equals(scheme) && isDebugHost(host) &&
            uri.getPort() > 0) {
            return uri.toURL();
        }
        throw new IllegalArgumentException("Invalid HTTP endpoint.");
    }

    private static boolean isDebugHost(String host) {
        if ("localhost".equals(host) || host.endsWith(".local")) return true;
        if ("[::1]".equals(host) || host.startsWith("[fc") || host.startsWith("[fd")) return true;
        String[] octets = host.split("\\.", -1);
        if (octets.length != 4) return false;
        int[] address = new int[4];
        for (int index = 0; index < 4; index++) {
            String octet = octets[index];
            if (!octet.matches("(?:0|[1-9][0-9]{0,2})")) return false;
            address[index] = Integer.parseInt(octet);
            if (address[index] > 255) return false;
        }
        return address[0] == 10 || address[0] == 127 ||
            (address[0] == 172 && address[1] >= 16 && address[1] <= 31) ||
            (address[0] == 192 && address[1] == 168);
    }

    void request(JSONObject payload, BiConsumer<JSONObject, Throwable> completion) throws Exception {
        Request request = validateRequest(payload);
        if (!busy.compareAndSet(false, true)) {
            throw new IllegalStateException("An HTTP request is already running.");
        }
        AtomicBoolean completed = new AtomicBoolean();
        ScheduledFuture<?> timeout;
        try {
            timeout = deadline.schedule(() -> {
                if (completed.compareAndSet(false, true)) {
                    completion.accept(null, new java.net.SocketTimeoutException("HTTP request timed out."));
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
                    active = (HttpURLConnection) request.endpoint.openConnection();
                    connection = active;
                    if (completed.get()) return;
                    active.setConnectTimeout(10000);
                    active.setReadTimeout(10000);
                    active.setInstanceFollowRedirects(false);
                    active.setUseCaches(false);
                    active.setRequestMethod("POST");
                    for (Map.Entry<String, String> header : request.headers.entrySet()) {
                        active.setRequestProperty(header.getKey(), header.getValue());
                    }
                    active.setRequestProperty("Cache-Control", "no-store");
                    active.setDoOutput(true);
                    active.setFixedLengthStreamingMode(request.body.length);
                    try (java.io.OutputStream stream = active.getOutputStream()) {
                        stream.write(request.body);
                    }
                    int status = active.getResponseCode();
                    if (active.getContentLengthLong() > MAX_RESPONSE_BYTES) {
                        throw new java.io.IOException("HTTP response is too large.");
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
        // HttpURLConnection shares the process cookie handler. Do not send app
        // metadata through a future app-wide authenticated cookie jar.
        if (java.net.CookieHandler.getDefault() != null) {
            throw new IllegalStateException("HTTP requests require a cookie-free transport.");
        }
    }

    static String readBody(InputStream stream) throws Exception {
        if (stream == null) return "";
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int count;
        while ((count = stream.read(buffer)) != -1) {
            if (bytes.size() + count > MAX_RESPONSE_BYTES) {
                throw new java.io.IOException("HTTP response is too large.");
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
