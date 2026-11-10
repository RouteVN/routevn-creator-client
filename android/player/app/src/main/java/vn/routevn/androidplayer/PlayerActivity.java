package vn.routevn.androidplayer;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import androidx.core.splashscreen.SplashScreen;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Collections;

public final class PlayerActivity extends Activity {
    static final int MIN_WEBVIEW_MAJOR_VERSION = 111;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable releaseSplash = () -> splashDone = true;
    private boolean splashDone;
    private WebView webView;
    private PlayerBridge bridge;
    private PackageResponder packages;
    private OnBackInvokedCallback backCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        splash.setKeepOnScreenCondition(() -> !splashDone);
        main.postDelayed(releaseSplash, 10_000);

        if (isWebViewTooOld(webViewVersion())) {
            showUnsupportedWebViewError();
            splashDone = true;
            main.removeCallbacks(releaseSplash);
            return;
        }

        try {
            packages = new PackageResponder(this);
        } catch (IOException error) {
            // The web player's failed range request displays startup diagnostics after the timeout.
            Log.e("RouteVNPlayer", "Cannot open game package", error);
        }

        WebView.setWebContentsDebuggingEnabled(
                (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setDomStorageEnabled(true);
        webView.setWebChromeClient(new WebChromeClient());

        WebViewAssetLoader.AssetsPathHandler assets = new WebViewAssetLoader.AssetsPathHandler(this);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/web/", path -> assets.handle("web/" + path))
                .build();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!PlayerBridge.isAssetOrigin(uri)) return unavailable(403, "Forbidden");
                if ("GET".equals(request.getMethod()) && "/web/package.bin".equals(uri.getPath())) {
                    return packages == null ? unavailable(500, "Package Unavailable")
                            : packages.respond(request.getRequestHeaders());
                }
                WebResourceResponse response = loader.shouldInterceptRequest(uri);
                return response == null ? unavailable(404, "Not Found") : response;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (PlayerBridge.isAssetOrigin(uri)) return false;
                if (request.isForMainFrame()
                        && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
                    openExternal(uri);
                }
                return true;
            }
        });
        bridge = new PlayerBridge(this, () -> {
            splashDone = true;
            main.removeCallbacks(releaseSplash);
        });
        bridge.register(webView);
        setContentView(webView);
        hideSystemBars();
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = () -> moveTaskToBack(true);
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        webView.loadUrl(PlayerBridge.ORIGIN + "/web/index.html");
    }

    static String webViewVersionFromVersionName(String versionName) {
        if (versionName == null) return null;
        String major = versionName.split("\\.", -1)[0];
        return major.matches("[0-9]{1,4}") ? major : null;
    }

    static boolean isWebViewTooOld(String major) {
        return major != null && Integer.parseInt(major) < MIN_WEBVIEW_MAJOR_VERSION;
    }

    private String webViewVersion() {
        try {
            PackageInfo info = WebViewCompat.getCurrentWebViewPackage(this);
            return info == null ? null : webViewVersionFromVersionName(info.versionName);
        } catch (RuntimeException error) {
            return null;
        }
    }

    private void showUnsupportedWebViewError() {
        TextView message = new TextView(this);
        message.setText("This game needs a newer Android System WebView. "
                + "Update Android System WebView or Google Chrome, then reopen the game.");
        message.setTextColor(Color.WHITE);
        message.setTextSize(18);
        message.setGravity(Gravity.CENTER);
        message.setPadding(48, 48, 48, 48);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        root.addView(message, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // Keep the message clear of the navigation bar; the theme already hides the status bar.
        root.setFitsSystemWindows(true);
        setContentView(root);
    }

    private static WebResourceResponse unavailable(int status, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", status, reason,
                Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream(new byte[0]));
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Log.w("RouteVNPlayer", "No browser is available for this link", error);
        }
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && webView != null) hideSystemBars();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        moveTaskToBack(true);
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.evaluateJavascript("window.routeVNSetAppActive?.(false)", null);
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
            webView.evaluateJavascript("window.routeVNSetAppActive?.(true)", null);
        }
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacks(releaseSplash);
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        if (bridge != null) bridge.close();
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        if (packages != null) packages.close();
        super.onDestroy();
    }
}
