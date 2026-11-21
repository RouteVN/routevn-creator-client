package vn.routevn.androidplayer;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.Closeable;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class PlayerBridge implements Closeable {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String NAME = "RouteVNPlayerAndroid";
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final RuntimeKvStore kv;
    private final Runnable ready;
    private boolean closed;

    PlayerBridge(Context context, Runnable ready) {
        kv = new RuntimeKvStore(context.getApplicationContext());
        this.ready = ready;
    }

    static boolean isAssetOrigin(Uri uri) {
        return "https".equals(uri.getScheme())
                && "appassets.androidplatform.net".equals(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443)
                && uri.getUserInfo() == null;
    }

    void register(WebView webView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            Log.w("RouteVNPlayer", "WebMessage listeners are unavailable; native persistence is unavailable.");
            return;
        }
        // Collections.singleton works on API 24, unlike Java 9's Set.of.
        WebViewCompat.addWebMessageListener(webView, NAME, Collections.singleton(ORIGIN),
                (view, message, sourceOrigin, isMainFrame, reply) -> {
                    if (closed || !isMainFrame || !isAssetOrigin(sourceOrigin)
                            || message.getType() != WebMessageCompat.TYPE_STRING) return;
                    String data = message.getData();
                    executor.execute(() -> respond(data, reply));
                });
    }

    private void respond(String data, JavaScriptReplyProxy reply) {
        JSONObject response = new JSONObject();
        try {
            JSONObject request = new JSONObject(data);
            Object id = request.get("id");
            if (!(id instanceof Number)) throw new IllegalArgumentException("Request id must be a number");
            response.put("id", id);
            Object method = request.get("method");
            if (!(method instanceof String)) throw new IllegalArgumentException("Request method must be a string");
            JSONObject payload = request.getJSONObject("payload");
            Object value = JSONObject.NULL;
            switch ((String) method) {
                case "player.ready":
                    main.post(() -> { if (!closed) ready.run(); });
                    break;
                case "kv.init": kv.init(); break;
                case "kv.list": value = kv.list(payload); break;
                case "kv.set": kv.set(payload); break;
                case "kv.applyBatch": kv.applyBatch(payload); break;
                case "kv.clear": kv.clear(); break;
                default: throw new IllegalArgumentException("Unknown player bridge method: " + method);
            }
            response.put("ok", true);
            response.put("value", value);
        } catch (Exception error) {
            try {
                response.put("ok", false);
                response.put("error", error.getMessage() == null ? "Player bridge request failed" : error.getMessage());
            } catch (JSONException impossible) {
                throw new IllegalStateException(impossible);
            }
        }
        String result = response.toString();
        main.post(() -> { if (!closed) reply.postMessage(result); });
    }

    @Override
    public void close() {
        closed = true;
        // Finish accepted writes before closing their connection.
        executor.execute(kv::close);
        executor.shutdown();
    }
}
