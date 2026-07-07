package com.routevn.creator;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteStatement;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.provider.MediaStore;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.util.Log;
import android.view.WindowInsets;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.widget.Toast;
import android.widget.FrameLayout;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import androidx.core.splashscreen.SplashScreen;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String TAG = "RouteVNAndroid";
    private static final String APP_ASSET_HOST = "appassets.androidplatform.net";
    private static final String APP_URL = "https://" + APP_ASSET_HOST + "/web/index.html";
    private static final String DEV_SERVER_HOST = "127.0.0.1";
    private static final int DEV_SERVER_PORT = 3001;
    private static final String DEV_SERVER_URL =
        "http://" + DEV_SERVER_HOST + ":" + DEV_SERVER_PORT + "/android/index.html";
    private static final int FILE_CHOOSER_REQUEST_CODE = 3711;
    private static final int ANDROID_FILE_PICKER_REQUEST_CODE = 3712;
    private static final int ANDROID_SAVE_FILE_PICKER_REQUEST_CODE = 3713;
    private static final int ANDROID_FOLDER_PICKER_REQUEST_CODE = 3714;
    private static final long SPLASH_MIN_VISIBLE_MS = 1400L;
    private static final long SPLASH_MAX_VISIBLE_MS = 5000L;
    private static final String DEBUG_VALIDATION_PREFS = "debug-validation";
    private static final String NATIVE_EXPORTER_SMOKE_LAST_UPDATE_KEY =
        "nativeExporterSmokeLastUpdateTime";

    private WebView webView;
    private long splashStartedAt;
    private boolean splashDismissRequested = false;
    private boolean splashReady = false;
    private boolean systemInsetsApplied = false;
    private WebViewAssetLoader assetLoader;
    private ValueCallback<Uri[]> fileChooserCallback;
    private boolean canGoBackInWebApp = false;
    private Object backInvokedCallback;
    private String pendingAndroidFilePickerRequestId;
    private boolean pendingAndroidFilePickerMultiple = false;
    private String pendingAndroidSaveFilePickerRequestId;
    private String pendingAndroidFolderPickerRequestId;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable finishSplashRunnable = this::finishSplash;
    private final Map<String, SQLiteDatabase> sqliteDatabases = new HashMap<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        configureSplashState();
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> !splashReady);
        splashScreen.setOnExitAnimationListener(splashScreenView ->
            splashScreenView.remove()
        );

        super.onCreate(savedInstanceState);

        validateNativeExporterSmoke();
        configureWindow();
        configureWebView();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerBackInvokedCallback();
        }
    }

    private void registerBackInvokedCallback() {
        OnBackInvokedCallback callback = this::handleBackPressed;
        backInvokedCallback = callback;
        getOnBackInvokedDispatcher()
            .registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                callback
            );
    }

    private void unregisterBackInvokedCallback() {
        if (backInvokedCallback instanceof OnBackInvokedCallback callback) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(callback);
            backInvokedCallback = null;
        }
    }

    private void validateNativeExporterSmoke() {
        if (!BuildConfig.DEBUG || !shouldRunNativeExporterSmoke()) {
            return;
        }

        try {
            Log.i(
                TAG,
                "Native exporter JNI smoke: " + NativeExporter.selfTest()
            );

            File smokeRoot = new File(getCacheDir(), "native-exporter-smoke");
            if (!smokeRoot.exists() && !smokeRoot.mkdirs()) {
                throw new IllegalStateException(
                    "Failed to create native exporter smoke directory."
                );
            }
            File smokeFile = File.createTempFile("smoke-", ".zip", smokeRoot);
            File smokePartFile = new File(smokeFile.getPath() + ".part");
            File smokeAssetA = new File(smokeRoot, "smoke-asset-a.png");
            File smokeAssetB = new File(smokeRoot, "smoke-asset-b.png");
            try {
                writeNativeExporterSmokePng(smokeAssetA, 28, 36, 0xffff5566);
                writeNativeExporterSmokePng(smokeAssetB, 136, 148, 0xff44aaff);

                JSONArray assets = new JSONArray();
                assets.put(
                    createNativeExporterSmokeAsset(
                        "smoke-asset-a",
                        smokeAssetA
                    )
                );
                assets.put(
                    createNativeExporterSmokeAsset(
                        "smoke-asset-b",
                        smokeAssetB
                    )
                );

                JSONObject payload = new JSONObject();
                payload.put("outputPath", smokeFile.getAbsolutePath());
                payload.put("assets", assets);
                payload.put("instructionsJson", "{}");
                payload.put("usePartFile", true);
                JSONObject stats = NativeExporter.createDistributionZipStreamed(
                    payload
                );
                Log.i(
                    TAG,
                    "Native exporter ZIP smoke: " +
                    stats.toString() +
                    ", zipFileBytes=" +
                    smokeFile.length()
                );
            } finally {
                deleteTemporaryFile(smokeFile);
                deleteTemporaryFile(smokePartFile);
                deleteTemporaryFile(smokeAssetA);
                deleteTemporaryFile(smokeAssetB);
            }
            markNativeExporterSmokeComplete();
        } catch (Throwable error) {
            Log.e(TAG, "Native exporter JNI smoke failed.", error);
        }
    }

    private boolean shouldRunNativeExporterSmoke() {
        try {
            long packageUpdatedAt = getPackageManager()
                .getPackageInfo(getPackageName(), 0)
                .lastUpdateTime;
            SharedPreferences preferences = getSharedPreferences(
                DEBUG_VALIDATION_PREFS,
                MODE_PRIVATE
            );
            return (
                preferences.getLong(
                    NATIVE_EXPORTER_SMOKE_LAST_UPDATE_KEY,
                    0L
                ) !=
                packageUpdatedAt
            );
        } catch (Exception error) {
            return true;
        }
    }

    private void markNativeExporterSmokeComplete() throws Exception {
        long packageUpdatedAt = getPackageManager()
            .getPackageInfo(getPackageName(), 0)
            .lastUpdateTime;
        getSharedPreferences(DEBUG_VALIDATION_PREFS, MODE_PRIVATE)
            .edit()
            .putLong(NATIVE_EXPORTER_SMOKE_LAST_UPDATE_KEY, packageUpdatedAt)
            .apply();
    }

    private void writeNativeExporterSmokePng(
        File file,
        int accentX,
        int accentY,
        int accentColor
    ) throws Exception {
        Bitmap bitmap = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888);
        try {
            for (int y = 0; y < 256; y += 1) {
                for (int x = 0; x < 256; x += 1) {
                    int noise = ((x * 31) ^ (y * 17) ^ ((x * y) % 251)) & 0xff;
                    bitmap.setPixel(
                        x,
                        y,
                        Color.argb(
                            255,
                            noise,
                            (noise + 37) & 0xff,
                            (noise + 91) & 0xff
                        )
                    );
                }
            }

            for (int y = 24; y < 232; y += 1) {
                for (int x = 20; x < 236; x += 1) {
                    if ((x + y) % 7 == 0) {
                        bitmap.setPixel(x, y, Color.argb(255, 240, 240, 240));
                    }
                }
            }

            for (int y = accentY; y < accentY + 40; y += 1) {
                for (int x = accentX; x < accentX + 40; x += 1) {
                    bitmap.setPixel(x, y, accentColor);
                }
            }

            ByteArrayOutputStream output = new ByteArrayOutputStream();
            if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
                throw new IllegalStateException(
                    "Failed to encode native exporter smoke PNG."
                );
            }
            writeBytes(file, output.toByteArray());
        } finally {
            bitmap.recycle();
        }
    }

    private JSONObject createNativeExporterSmokeAsset(String id, File file)
        throws Exception {
        JSONObject asset = new JSONObject();
        asset.put("id", safePathSegment(id));
        asset.put("path", file.getAbsolutePath());
        asset.put("mime", "image/png");
        return asset;
    }

    private void configureWindow() {
        Window window = getWindow();
        window.setStatusBarColor(Color.BLACK);
        window.setNavigationBarColor(Color.BLACK);
    }

    private void configureSplashState() {
        splashStartedAt = System.currentTimeMillis();
        splashDismissRequested = false;
        splashReady = false;
        systemInsetsApplied = false;
    }

    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        assetLoader =
            new WebViewAssetLoader.Builder()
                .setDomain(APP_ASSET_HOST)
                .addPathHandler(
                    "/android-files/",
                    new RouteVNInternalFilePathHandler()
                )
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setLayoutParams(
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        webView.setBackgroundColor(Color.BLACK);
        webView.addJavascriptInterface(new AndroidBridge(), "RouteVNAndroid");
        configureWebSettings(webView.getSettings());
        configureCookies();

        webView.setWebViewClient(new RouteVNWebViewClient());
        webView.setWebChromeClient(new RouteVNWebChromeClient());
        webView.loadUrl(getInitialAppUrl());

        FrameLayout rootView = new FrameLayout(this);
        rootView.setBackgroundColor(Color.BLACK);
        rootView.addView(webView);
        applySystemBarInsets(rootView);
        setContentView(rootView);
        rootView.requestApplyInsets();
        mainHandler.postDelayed(finishSplashRunnable, SPLASH_MAX_VISIBLE_MS);
    }

    private void requestSplashDismiss() {
        if (splashDismissRequested) {
            return;
        }

        splashDismissRequested = true;
        scheduleSplashFinishIfReady();
    }

    private void scheduleSplashFinishIfReady() {
        if (!splashDismissRequested || !systemInsetsApplied) {
            return;
        }

        long elapsedMs = System.currentTimeMillis() - splashStartedAt;
        long remainingMs = Math.max(0L, SPLASH_MIN_VISIBLE_MS - elapsedMs);
        mainHandler.removeCallbacks(finishSplashRunnable);
        mainHandler.postDelayed(finishSplashRunnable, remainingMs);
    }

    private void finishSplash() {
        splashReady = true;
        if (webView != null) {
            webView.invalidate();
        }
    }

    private void configureWebSettings(WebSettings settings) {
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setSupportMultipleWindows(false);
        settings.setTextZoom(100);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        if (BuildConfig.DEBUG) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        } else {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
    }

    private void applySystemBarInsets(View targetView) {
        targetView.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets systemBars = insets.getInsets(
                    WindowInsets.Type.systemBars()
                );
                view.setPadding(
                    systemBars.left,
                    systemBars.top,
                    systemBars.right,
                    systemBars.bottom
                );
                systemInsetsApplied = true;
                scheduleSplashFinishIfReady();
                return insets;
            }

            view.setPadding(
                insets.getSystemWindowInsetLeft(),
                insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(),
                insets.getSystemWindowInsetBottom()
            );
            systemInsetsApplied = true;
            scheduleSplashFinishIfReady();
            return insets;
        });
    }

    private void configureCookies() {
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);
    }

    private String getInitialAppUrl() {
        if (BuildConfig.DEBUG) {
            Log.i(TAG, "Loading Android dev server URL: " + DEV_SERVER_URL);
            return DEV_SERVER_URL;
        }

        return APP_URL;
    }

    private boolean isAppAssetUrl(Uri uri) {
        return (
            uri != null &&
            "https".equals(uri.getScheme()) &&
            APP_ASSET_HOST.equals(uri.getHost())
        );
    }

    private boolean isDebugDevServerUrl(Uri uri) {
        return (
            BuildConfig.DEBUG &&
            uri != null &&
            "http".equals(uri.getScheme()) &&
            DEV_SERVER_HOST.equals(uri.getHost()) &&
            uri.getPort() == DEV_SERVER_PORT
        );
    }

    private boolean openExternalUri(Uri uri) {
        if (uri == null) {
            return false;
        }

        String scheme = uri.getScheme();
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            return false;
        }

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
            return true;
        } catch (ActivityNotFoundException error) {
            Toast
                .makeText(this, "No app can open this link.", Toast.LENGTH_SHORT)
                .show();
            return true;
        }
    }

    private void handleBackPressed() {
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }

        webView.evaluateJavascript(
            "(function(){return Boolean(window.routeVNNativeBack && window.routeVNNativeBack());})()",
            value -> {
                if (!"true".equals(value)) {
                    moveTaskToBack(true);
                }
            }
        );
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            unregisterBackInvokedCallback();
        }

        closeSqliteDatabases();

        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        mainHandler.removeCallbacks(finishSplashRunnable);

        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == ANDROID_FILE_PICKER_REQUEST_CODE) {
            handleAndroidFilePickerActivityResult(resultCode, data);
            return;
        }

        if (requestCode == ANDROID_SAVE_FILE_PICKER_REQUEST_CODE) {
            handleAndroidSaveFilePickerActivityResult(resultCode, data);
            return;
        }

        if (requestCode == ANDROID_FOLDER_PICKER_REQUEST_CODE) {
            handleAndroidFolderPickerActivityResult(resultCode, data);
            return;
        }

        if (requestCode != FILE_CHOOSER_REQUEST_CODE || fileChooserCallback == null) {
            return;
        }

        Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        fileChooserCallback.onReceiveValue(results);
        fileChooserCallback = null;
    }

    private final class RouteVNWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(
            WebView view,
            WebResourceRequest request
        ) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return assetLoader.shouldInterceptRequest(Uri.parse(url));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isAppAssetUrl(uri) || isDebugDevServerUrl(uri)) {
                return false;
            }

            return openExternalUri(uri);
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = Uri.parse(url);
            if (isAppAssetUrl(uri) || isDebugDevServerUrl(uri)) {
                return false;
            }

            return openExternalUri(uri);
        }

        @Override
        public void onReceivedError(
            WebView view,
            WebResourceRequest request,
            WebResourceError error
        ) {
            super.onReceivedError(view, request, error);
            Log.e(
                TAG,
                "WebView error " +
                error.getErrorCode() +
                " for " +
                request.getUrl() +
                ": " +
                error.getDescription()
            );
        }
    }

    private final class RouteVNWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(
            WebView webView,
            ValueCallback<Uri[]> filePathCallback,
            FileChooserParams fileChooserParams
        ) {
            if (fileChooserCallback != null) {
                fileChooserCallback.onReceiveValue(null);
            }

            fileChooserCallback = filePathCallback;

            try {
                startActivityForResult(
                    fileChooserParams.createIntent(),
                    FILE_CHOOSER_REQUEST_CODE
                );
                return true;
            } catch (ActivityNotFoundException error) {
                fileChooserCallback = null;
                Toast
                    .makeText(
                        MainActivity.this,
                        "No file picker is available.",
                        Toast.LENGTH_SHORT
                    )
                    .show();
                return false;
            }
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
            if (BuildConfig.DEBUG) {
                Log.d(
                    TAG,
                    "console " +
                    consoleMessage.messageLevel() +
                    " " +
                    consoleMessage.sourceId() +
                    ":" +
                    consoleMessage.lineNumber() +
                    " " +
                    consoleMessage.message()
                );
            }
            return super.onConsoleMessage(consoleMessage);
        }
    }

    private final class RouteVNInternalFilePathHandler
        implements WebViewAssetLoader.PathHandler {
        @Override
        public WebResourceResponse handle(String path) {
            try {
                String normalizedPath = normalizeInternalStoragePath(path);
                File file = resolveInternalStorageFileForPath(normalizedPath);
                if (!file.isFile()) {
                    return null;
                }

                String mimeType = readMimeTypeForInternalPath(normalizedPath, file);
                return new WebResourceResponse(
                    mimeType,
                    null,
                    new FileInputStream(file)
                );
            } catch (Exception error) {
                return null;
            }
        }
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public boolean isDebugBuild() {
            return BuildConfig.DEBUG;
        }

        @JavascriptInterface
        public void updateBackState(boolean canGoBack) {
            canGoBackInWebApp = canGoBack;
        }

        @JavascriptInterface
        public void openExternalUrl(String url) {
            runOnUiThread(() -> openExternalUri(Uri.parse(url)));
        }

        @JavascriptInterface
        public void markSplashReady() {
            runOnUiThread(MainActivity.this::requestSplashDismiss);
        }

        @JavascriptInterface
        public String sqliteOpen(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                String dbPath = payload.getString("dbPath");
                openDatabase(dbPath);
                return bridgeSuccess(true);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String sqliteQuery(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                SQLiteDatabase database = openDatabase(payload.getString("dbPath"));
                JSONArray rows = queryDatabase(
                    database,
                    payload.getString("sql"),
                    payload.optJSONArray("args")
                );
                return bridgeSuccess(rows);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String sqliteExec(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                SQLiteDatabase database = openDatabase(payload.getString("dbPath"));
                int rowsAffected = executeDatabaseStatement(
                    database,
                    payload.getString("sql"),
                    payload.optJSONArray("args")
                );
                JSONObject result = new JSONObject();
                result.put("rowsAffected", rowsAffected);
                return bridgeSuccess(result);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String sqliteClose(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                closeDatabase(payload.getString("dbPath"));
                return bridgeSuccess(true);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String ensureProjectStorage(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                ensureProjectDirectories(payload.getString("projectId"));
                return bridgeSuccess(true);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String listProjectFolders(String payloadJson) {
            try {
                return bridgeSuccess(MainActivity.this.listProjectFolders());
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String writeProjectFile(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                JSONObject result = writeProjectFileBytes(
                    payload.getString("projectId"),
                    payload.getString("fileId"),
                    payload.getString("base64"),
                    payload.optString("mimeType", "application/octet-stream")
                );
                return bridgeSuccess(result);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String readProjectFile(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                JSONObject result = readProjectFileBytes(
                    payload.getString("projectId"),
                    payload.getString("fileId")
                );
                return bridgeSuccess(result);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String readProjectFileMetadata(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                JSONObject result = readProjectFileMetadataRecord(
                    payload.getString("projectId"),
                    payload.getString("fileId")
                );
                return bridgeSuccess(result);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String writeDownloadFile(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                String uri = writeDownloadFileBytes(
                    payload.optString("filename", "download"),
                    payload.getString("base64"),
                    payload.optString("mimeType", "application/octet-stream")
                );
                return bridgeSuccess(uri);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String writeFileToUri(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                String uri = writeFileToUriBytes(
                    payload.getString("uri"),
                    payload.getString("base64")
                );
                return bridgeSuccess(uri);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String createDistributionZipStreamedToUri(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                JSONObject result =
                    MainActivity.this.createDistributionZipStreamedToUri(payload);
                return bridgeSuccess(result);
            } catch (Throwable error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String openFilePicker(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                String requestId = safePathSegment(payload.getString("requestId"));
                boolean multiple = payload.optBoolean("multiple", false);
                String accept = payload.optString("accept", "");

                runOnUiThread(() ->
                    launchAndroidFilePicker(requestId, multiple, accept)
                );
                return bridgeSuccess(true);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String openSaveFilePicker(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                String requestId = safePathSegment(payload.getString("requestId"));
                String filename = payload.optString("filename", "download");
                String mimeType = payload.optString(
                    "mimeType",
                    "application/octet-stream"
                );

                runOnUiThread(() ->
                    launchAndroidSaveFilePicker(requestId, filename, mimeType)
                );
                return bridgeSuccess(true);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String openFolderPicker(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                String requestId = safePathSegment(payload.getString("requestId"));
                boolean writable = payload.optBoolean("writable", false);

                runOnUiThread(() -> launchAndroidFolderPicker(requestId, writable));
                return bridgeSuccess(true);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String importProjectFolder(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                JSONObject result = importProjectFolderFromTreeUri(
                    payload.getString("uri")
                );
                return bridgeSuccess(result);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String exportProjectFolder(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                String requestId = safePathSegment(payload.getString("requestId"));
                String projectId = payload.getString("projectId");
                String destinationUri = payload.getString("destinationUri");

                Thread exportThread = new Thread(() -> {
                    try {
                        JSONObject exportResult = exportProjectFolderToTreeUri(
                            projectId,
                            destinationUri
                        );
                        JSONObject result = new JSONObject();
                        result.put("requestId", requestId);
                        result.put("export", exportResult);
                        sendAndroidProjectExportResult(result);
                    } catch (Exception error) {
                        sendAndroidProjectExportError(
                            requestId,
                            error.getMessage() == null
                                ? "Failed to export project."
                                : error.getMessage(),
                            error
                        );
                    }
                });
                exportThread.start();
                return bridgeSuccess(true);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }

        @JavascriptInterface
        public String deletePickerRequest(String payloadJson) {
            try {
                JSONObject payload = new JSONObject(payloadJson);
                deletePickerRequestFiles(payload.getString("requestId"));
                return bridgeSuccess(true);
            } catch (Exception error) {
                return bridgeFailure(error);
            }
        }
    }

    private String bridgeSuccess(Object value) throws Exception {
        JSONObject result = new JSONObject();
        result.put("ok", true);
        result.put("value", value == null ? JSONObject.NULL : value);
        return result.toString();
    }

    private String bridgeFailure(Throwable error) {
        Log.e(TAG, "Android bridge call failed.", error);
        try {
            JSONObject result = new JSONObject();
            JSONObject errorBody = new JSONObject();
            result.put("ok", false);
            errorBody.put(
                "message",
                error.getMessage() == null ? "Android bridge call failed" : error.getMessage()
            );
            errorBody.put("code", error.getClass().getSimpleName());
            result.put("error", errorBody);
            return result.toString();
        } catch (Exception jsonError) {
            return "{\"ok\":false,\"error\":{\"message\":\"Android bridge call failed\"}}";
        }
    }

    private synchronized SQLiteDatabase openDatabase(String dbPath) throws Exception {
        SQLiteDatabase cachedDatabase = sqliteDatabases.get(dbPath);
        if (cachedDatabase != null && cachedDatabase.isOpen()) {
            return cachedDatabase;
        }

        File databasesRoot = new File(getFilesDir(), "databases");
        File databaseFile = resolveSafeRelativeFile(databasesRoot, dbPath);
        File parentFile = databaseFile.getParentFile();
        if (parentFile != null && !parentFile.exists() && !parentFile.mkdirs()) {
            throw new IllegalStateException("Failed to create database directory.");
        }

        SQLiteDatabase database = SQLiteDatabase.openOrCreateDatabase(
            databaseFile,
            null
        );
        database.enableWriteAheadLogging();
        try (Cursor ignored = database.rawQuery("PRAGMA busy_timeout=5000", null)) {
            // Android's SQLiteDatabase requires PRAGMA statements to use rawQuery.
        }
        sqliteDatabases.put(dbPath, database);
        return database;
    }

    private synchronized void closeDatabase(String dbPath) {
        SQLiteDatabase database = sqliteDatabases.remove(dbPath);
        if (database != null && database.isOpen()) {
            database.close();
        }
    }

    private synchronized void closeSqliteDatabases() {
        for (SQLiteDatabase database : sqliteDatabases.values()) {
            if (database != null && database.isOpen()) {
                database.close();
            }
        }
        sqliteDatabases.clear();
    }

    private JSONArray queryDatabase(
        SQLiteDatabase database,
        String sql,
        JSONArray args
    ) throws Exception {
        JSONArray rows = new JSONArray();
        try (Cursor cursor = database.rawQuery(sql, toRawQueryArgs(args))) {
            while (cursor.moveToNext()) {
                JSONObject row = new JSONObject();
                for (int index = 0; index < cursor.getColumnCount(); index += 1) {
                    String columnName = cursor.getColumnName(index);
                    switch (cursor.getType(index)) {
                        case Cursor.FIELD_TYPE_INTEGER:
                            row.put(columnName, cursor.getLong(index));
                            break;
                        case Cursor.FIELD_TYPE_FLOAT:
                            row.put(columnName, cursor.getDouble(index));
                            break;
                        case Cursor.FIELD_TYPE_BLOB:
                            JSONObject blobValue = new JSONObject();
                            blobValue.put("__routevn_sql_type", "bytes");
                            blobValue.put(
                                "base64",
                                Base64.encodeToString(cursor.getBlob(index), Base64.NO_WRAP)
                            );
                            row.put(columnName, blobValue);
                            break;
                        case Cursor.FIELD_TYPE_NULL:
                            row.put(columnName, JSONObject.NULL);
                            break;
                        case Cursor.FIELD_TYPE_STRING:
                        default:
                            row.put(columnName, cursor.getString(index));
                            break;
                    }
                }
                rows.put(row);
            }
        }
        return rows;
    }

    private String[] toRawQueryArgs(JSONArray args) throws Exception {
        if (args == null || args.length() == 0) {
            return null;
        }

        String[] rawArgs = new String[args.length()];
        for (int index = 0; index < args.length(); index += 1) {
            Object arg = args.get(index);
            rawArgs[index] = arg == JSONObject.NULL ? null : String.valueOf(arg);
        }
        return rawArgs;
    }

    private int executeDatabaseStatement(
        SQLiteDatabase database,
        String sql,
        JSONArray args
    ) throws Exception {
        String normalizedSql = sql == null ? "" : sql.trim();
        if (!usesCompiledStatement(normalizedSql, args)) {
            database.execSQL(sql);
            return 0;
        }

        SQLiteStatement statement = database.compileStatement(sql);
        try {
            bindStatementArgs(statement, args);
            if (isUpdateStatement(normalizedSql)) {
                return statement.executeUpdateDelete();
            }
            statement.execute();
            return 0;
        } finally {
            statement.close();
        }
    }

    private boolean usesCompiledStatement(String sql, JSONArray args) {
        return (args != null && args.length() > 0) || isUpdateStatement(sql);
    }

    private boolean isUpdateStatement(String sql) {
        String upperSql = sql.toUpperCase();
        return (
            upperSql.startsWith("INSERT") ||
            upperSql.startsWith("UPDATE") ||
            upperSql.startsWith("DELETE") ||
            upperSql.startsWith("REPLACE")
        );
    }

    private void bindStatementArgs(SQLiteStatement statement, JSONArray args)
        throws Exception {
        if (args == null) {
            return;
        }

        for (int index = 0; index < args.length(); index += 1) {
            int bindIndex = index + 1;
            Object arg = args.get(index);
            if (arg == JSONObject.NULL) {
                statement.bindNull(bindIndex);
            } else if (arg instanceof Number) {
                if (arg instanceof Float || arg instanceof Double) {
                    statement.bindDouble(bindIndex, ((Number) arg).doubleValue());
                } else {
                    statement.bindLong(bindIndex, ((Number) arg).longValue());
                }
            } else if (arg instanceof Boolean) {
                statement.bindLong(bindIndex, (Boolean) arg ? 1 : 0);
            } else if (arg instanceof JSONObject) {
                JSONObject object = (JSONObject) arg;
                if ("bytes".equals(object.optString("__routevn_sql_type"))) {
                    statement.bindBlob(bindIndex, jsonArrayToBytes(object.getJSONArray("data")));
                } else {
                    statement.bindString(bindIndex, object.toString());
                }
            } else {
                statement.bindString(bindIndex, String.valueOf(arg));
            }
        }
    }

    private byte[] jsonArrayToBytes(JSONArray values) throws Exception {
        byte[] bytes = new byte[values.length()];
        for (int index = 0; index < values.length(); index += 1) {
            bytes[index] = (byte) values.getInt(index);
        }
        return bytes;
    }

    private void ensureProjectDirectories(String projectId) throws Exception {
        File projectRoot = getProjectRoot(projectId);
        File filesRoot = new File(projectRoot, "files");
        File metadataRoot = new File(projectRoot, "file-metadata");
        if (!filesRoot.exists() && !filesRoot.mkdirs()) {
            throw new IllegalStateException("Failed to create project file directory.");
        }
        if (!metadataRoot.exists() && !metadataRoot.mkdirs()) {
            throw new IllegalStateException("Failed to create project metadata directory.");
        }
    }

    private JSONObject writeProjectFileBytes(
        String projectId,
        String fileId,
        String base64,
        String mimeType
    ) throws Exception {
        String safeProjectId = safePathSegment(projectId);
        String safeFileId = safePathSegment(fileId);
        ensureProjectDirectories(safeProjectId);
        File projectRoot = getProjectRoot(safeProjectId);
        File file = resolveSafeRelativeFile(new File(projectRoot, "files"), safeFileId);
        writeBytes(file, Base64.decode(base64, Base64.DEFAULT));

        File metadataFile = resolveSafeRelativeFile(
            new File(projectRoot, "file-metadata"),
            safeFileId + ".mime"
        );
        writeBytes(
            metadataFile,
            normalizeMimeType(mimeType).getBytes(StandardCharsets.UTF_8)
        );

        JSONObject result = new JSONObject();
        result.put(
            "url",
            "https://" +
            APP_ASSET_HOST +
            "/android-files/projects/" +
            safeProjectId +
            "/files/" +
            safeFileId
        );
        return result;
    }

    private JSONObject readProjectFileBytes(String projectId, String fileId)
        throws Exception {
        String safeProjectId = safePathSegment(projectId);
        String safeFileId = safePathSegment(fileId);
        File projectRoot = getProjectRoot(safeProjectId);
        File file = resolveSafeRelativeFile(new File(projectRoot, "files"), safeFileId);
        if (!file.isFile()) {
            throw new IllegalArgumentException("Project file was not found.");
        }

        JSONObject result = new JSONObject();
        result.put("base64", Base64.encodeToString(readBytes(file), Base64.NO_WRAP));
        result.put(
            "mimeType",
            resolveProjectFileMimeType(safeProjectId, safeFileId, file)
        );
        return result;
    }

    private JSONObject readProjectFileMetadataRecord(String projectId, String fileId)
        throws Exception {
        String safeProjectId = safePathSegment(projectId);
        String safeFileId = safePathSegment(fileId);
        File projectRoot = getProjectRoot(safeProjectId);
        File file = resolveSafeRelativeFile(new File(projectRoot, "files"), safeFileId);
        if (!file.isFile()) {
            throw new IllegalArgumentException("Project file was not found.");
        }

        JSONObject result = new JSONObject();
        result.put(
            "mimeType",
            resolveProjectFileMimeType(safeProjectId, safeFileId, file)
        );
        result.put("size", file.length());
        return result;
    }

    private String writeDownloadFileBytes(
        String filename,
        String base64,
        String mimeType
    ) throws Exception {
        String safeFilename = sanitizeDownloadFilename(filename);
        byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
        String normalizedMimeType = normalizeMimeType(mimeType);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeFilename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, normalizedMimeType);
            values.put(
                MediaStore.MediaColumns.RELATIVE_PATH,
                Environment.DIRECTORY_DOWNLOADS + "/RouteVN Creator"
            );

            ContentResolver resolver = getContentResolver();
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                throw new IllegalStateException("Failed to create download entry.");
            }

            try (OutputStream output = resolver.openOutputStream(uri)) {
                if (output == null) {
                    throw new IllegalStateException("Failed to open download entry.");
                }
                output.write(bytes);
            }
            return uri.toString();
        }

        File downloadsRoot = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (downloadsRoot == null) {
            downloadsRoot = new File(getFilesDir(), "downloads");
        }
        File outputFile = resolveSafeRelativeFile(downloadsRoot, safeFilename);
        writeBytes(outputFile, bytes);
        return Uri.fromFile(outputFile).toString();
    }

    private String writeFileToUriBytes(
        String uriString,
        String base64
    ) throws Exception {
        String normalizedUri = uriString == null ? "" : uriString.trim();
        if (normalizedUri.isEmpty()) {
            throw new IllegalArgumentException("Save location is required.");
        }

        Uri uri = Uri.parse(normalizedUri);
        byte[] bytes = Base64.decode(base64, Base64.DEFAULT);

        try (
            OutputStream output = getContentResolver().openOutputStream(uri, "wt")
        ) {
            if (output == null) {
                throw new IllegalStateException("Failed to open save location.");
            }
            output.write(bytes);
        }

        return uri.toString();
    }

    private JSONObject createDistributionZipStreamedToUri(JSONObject payload)
        throws Exception {
        String safeProjectId = safePathSegment(payload.getString("projectId"));
        String destinationUri = payload.getString("uri");
        String instructionsJson = payload.getString("instructionsJson");

        File exportsRoot = new File(getCacheDir(), "distribution-exports");
        if (!exportsRoot.exists() && !exportsRoot.mkdirs()) {
            throw new IllegalStateException("Failed to create export cache directory.");
        }

        File outputFile = File.createTempFile("distribution-", ".zip", exportsRoot);
        File partFile = new File(outputFile.getPath() + ".part");

        try {
            JSONObject nativePayload = new JSONObject();
            nativePayload.put("outputPath", outputFile.getAbsolutePath());
            nativePayload.put(
                "assets",
                buildDistributionZipAssets(
                    safeProjectId,
                    payload.optJSONArray("fileEntries")
                )
            );
            nativePayload.put("instructionsJson", instructionsJson);
            nativePayload.put("usePartFile", payload.optBoolean("usePartFile", true));

            String indexHtml = optionalJsonString(payload, "indexHtml");
            if (indexHtml != null) {
                nativePayload.put("indexHtml", indexHtml);
            }

            String mainJs = optionalJsonString(payload, "mainJs");
            if (mainJs != null) {
                nativePayload.put("mainJs", mainJs);
            }

            JSONObject stats = NativeExporter.createDistributionZipStreamed(
                nativePayload
            );
            Uri uri = copyFileToUri(outputFile, destinationUri);

            JSONObject result = new JSONObject();
            result.put("uri", uri.toString());
            result.put("stats", stats);
            return result;
        } finally {
            deleteTemporaryFile(outputFile);
            deleteTemporaryFile(partFile);
        }
    }

    private JSONArray buildDistributionZipAssets(
        String projectId,
        JSONArray fileEntries
    ) throws Exception {
        JSONArray assets = new JSONArray();
        if (fileEntries == null) {
            return assets;
        }

        File filesRoot = new File(getProjectRoot(projectId), "files");
        for (int index = 0; index < fileEntries.length(); index += 1) {
            JSONObject entry = fileEntries.getJSONObject(index);
            String safeFileId = safePathSegment(
                entry.optString("id", entry.optString("fileId", ""))
            );
            File file = resolveSafeRelativeFile(filesRoot, safeFileId);
            if (!file.isFile()) {
                Log.w(
                    TAG,
                    "Skipping missing file during native ZIP export: " + safeFileId
                );
                continue;
            }

            String mimeType = entry.optString("mimeType", "");
            if (isUnreliableMimeType(mimeType)) {
                mimeType = resolveProjectFileMimeType(projectId, safeFileId, file);
            } else {
                mimeType = normalizeMimeType(mimeType);
            }

            JSONObject asset = new JSONObject();
            asset.put("id", safeFileId);
            asset.put("path", file.getAbsolutePath());
            asset.put("mime", mimeType);
            assets.put(asset);
        }

        return assets;
    }

    private Uri copyFileToUri(File inputFile, String uriString) throws Exception {
        String normalizedUri = uriString == null ? "" : uriString.trim();
        if (normalizedUri.isEmpty()) {
            throw new IllegalArgumentException("Save location is required.");
        }

        if (!inputFile.isFile()) {
            throw new IllegalStateException("Native export output was not created.");
        }

        Uri uri = Uri.parse(normalizedUri);
        try (
            FileInputStream input = new FileInputStream(inputFile);
            OutputStream output = getContentResolver().openOutputStream(uri, "wt")
        ) {
            if (output == null) {
                throw new IllegalStateException("Failed to open save location.");
            }
            writeOutputStream(output, input);
        }

        return uri;
    }

    private String optionalJsonString(JSONObject object, String key) {
        if (!object.has(key) || object.isNull(key)) {
            return null;
        }
        return object.optString(key, null);
    }

    private void deleteTemporaryFile(File file) {
        if (file == null || !file.exists()) {
            return;
        }
        if (!file.delete() && file.exists()) {
            Log.w(TAG, "Failed to delete temporary file: " + file.getAbsolutePath());
        }
    }

    private JSONObject importProjectFolderFromTreeUri(String uriString)
        throws Exception {
        String normalizedUri = uriString == null ? "" : uriString.trim();
        if (normalizedUri.isEmpty()) {
            throw new IllegalArgumentException("Project folder is required.");
        }

        Uri treeUri = Uri.parse(normalizedUri);
        Uri rootDocumentUri = getTreeRootDocumentUri(treeUri);
        Uri projectDbUri = requireChildDocument(
            rootDocumentUri,
            "project.db",
            false
        );
        Uri filesUri = requireChildDocument(rootDocumentUri, "files", true);
        Uri metadataUri = findChildDocument(rootDocumentUri, "file-metadata", true);
        Uri projectWalUri = findChildDocument(rootDocumentUri, "project.db-wal", false);
        Uri projectShmUri = findChildDocument(rootDocumentUri, "project.db-shm", false);
        Uri projectJournalUri = findChildDocument(
            rootDocumentUri,
            "project.db-journal",
            false
        );

        File importRoot = new File(getCacheDir(), "project-import");
        File importWorkDir = new File(
            importRoot,
            String.valueOf(System.currentTimeMillis())
        );
        deleteRecursively(importWorkDir);

        try {
            File tempDbFile = new File(importWorkDir, "project.db");
            copyDocumentToFile(projectDbUri, tempDbFile);
            if (projectWalUri != null) {
                copyDocumentToFile(projectWalUri, new File(importWorkDir, "project.db-wal"));
            }
            if (projectShmUri != null) {
                copyDocumentToFile(projectShmUri, new File(importWorkDir, "project.db-shm"));
            }
            if (projectJournalUri != null) {
                copyDocumentToFile(
                    projectJournalUri,
                    new File(importWorkDir, "project.db-journal")
                );
            }

            JSONObject projectInfo = readProjectInfoFromDatabaseFile(tempDbFile);
            String projectId = safePathSegment(projectInfo.optString("id", ""));
            String projectDbPath = getProjectDatabasePath(projectId);
            File targetDbFile = getProjectDatabaseFile(projectId);
            File targetDbDirectory = targetDbFile.getParentFile();
            File projectRoot = getProjectRoot(projectId);
            File targetFilesRoot = new File(projectRoot, "files");
            File targetMetadataRoot = new File(projectRoot, "file-metadata");
            boolean alreadyImported = targetDbFile.isFile() && targetFilesRoot.isDirectory();

            if (!alreadyImported) {
                closeDatabase(projectDbPath);
                try {
                    deleteRecursively(targetDbDirectory);
                    deleteRecursively(projectRoot);

                    copyFile(tempDbFile, targetDbFile);
                    File tempWalFile = new File(importWorkDir, "project.db-wal");
                    if (tempWalFile.isFile()) {
                        copyFile(
                            tempWalFile,
                            new File(targetDbDirectory, "project.db-wal")
                        );
                    }
                    File tempShmFile = new File(importWorkDir, "project.db-shm");
                    if (tempShmFile.isFile()) {
                        copyFile(
                            tempShmFile,
                            new File(targetDbDirectory, "project.db-shm")
                        );
                    }
                    File tempJournalFile = new File(
                        importWorkDir,
                        "project.db-journal"
                    );
                    if (tempJournalFile.isFile()) {
                        copyFile(
                            tempJournalFile,
                            new File(targetDbDirectory, "project.db-journal")
                        );
                    }

                    copyDocumentDirectoryContents(filesUri, targetFilesRoot);
                    if (metadataUri != null) {
                        copyDocumentDirectoryContents(metadataUri, targetMetadataRoot);
                    }
                } catch (Exception importError) {
                    try {
                        closeDatabase(projectDbPath);
                        deleteRecursively(targetDbDirectory);
                        deleteRecursively(projectRoot);
                    } catch (Exception cleanupError) {
                        importError.addSuppressed(cleanupError);
                    }
                    throw importError;
                }
            }

            JSONObject result = new JSONObject();
            result.put("id", projectId);
            result.put("name", projectInfo.optString("name", ""));
            result.put("description", projectInfo.optString("description", ""));
            if (projectInfo.has("iconFileId") && !projectInfo.isNull("iconFileId")) {
                result.put("iconFileId", projectInfo.optString("iconFileId", ""));
            } else {
                result.put("iconFileId", JSONObject.NULL);
            }
            result.put("sourceUri", normalizedUri);
            result.put(
                "sourceName",
                resolveDocumentDisplayName(rootDocumentUri, "Selected Folder")
            );
            result.put("alreadyImported", alreadyImported);
            return result;
        } finally {
            deleteRecursively(importWorkDir);
        }
    }

    private JSONObject exportProjectFolderToTreeUri(
        String projectId,
        String destinationUriString
    ) throws Exception {
        String safeProjectId = safePathSegment(projectId);
        String normalizedUri = destinationUriString == null
            ? ""
            : destinationUriString.trim();
        if (normalizedUri.isEmpty()) {
            throw new IllegalArgumentException("Export destination is required.");
        }

        File projectDbFile = getProjectDatabaseFile(safeProjectId);
        File projectRoot = getProjectRoot(safeProjectId);
        File projectFilesRoot = new File(projectRoot, "files");
        if (!projectDbFile.isFile() || !projectFilesRoot.isDirectory()) {
            throw new IllegalArgumentException("Project storage was not found.");
        }

        checkpointProjectDatabaseForExport(safeProjectId);
        JSONObject projectInfo = readProjectInfoFromDatabaseFile(projectDbFile);
        String projectInfoId = safePathSegment(projectInfo.optString("id", ""));
        if (!safeProjectId.equals(projectInfoId)) {
            throw new IllegalArgumentException("Project storage id does not match.");
        }
        String exportFolderName = resolveProjectExportFolderName(projectInfo);

        Uri treeUri = Uri.parse(normalizedUri);
        Uri destinationRootUri = getTreeRootDocumentUri(treeUri);

        Uri exportRootUri = createChildDirectory(
            destinationRootUri,
            exportFolderName
        );
        copyFileToDocumentDirectory(
            projectDbFile,
            exportRootUri,
            "project.db",
            "application/octet-stream"
        );

        Uri filesUri = createChildDirectory(exportRootUri, "files");
        copyFileDirectoryContentsToDocumentDirectory(projectFilesRoot, filesUri);

        JSONObject result = new JSONObject();
        result.put("uri", exportRootUri.toString());
        result.put("name", exportFolderName);
        return result;
    }

    private void checkpointProjectDatabaseForExport(String projectId)
        throws Exception {
        String projectDbPath = getProjectDatabasePath(projectId);
        closeDatabase(projectDbPath);

        File projectDbFile = getProjectDatabaseFile(projectId);
        SQLiteDatabase database = SQLiteDatabase.openDatabase(
            projectDbFile.getAbsolutePath(),
            null,
            SQLiteDatabase.OPEN_READWRITE
        );
        try (
            Cursor ignored = database.rawQuery(
                "PRAGMA wal_checkpoint(TRUNCATE)",
                null
            )
        ) {
            // Materialize pending WAL frames into project.db before copying it.
        } finally {
            database.close();
        }
    }

    private String resolveProjectExportFolderName(JSONObject projectInfo) {
        String title = sanitizeExportFolderTitle(projectInfo.optString("name", ""));
        String timestamp = new SimpleDateFormat(
            "yyyyMMdd-HHmmss",
            Locale.US
        ).format(new Date());
        return title + "-" + timestamp;
    }

    private String getProjectDatabasePath(String projectId) {
        return "projects/" + safePathSegment(projectId) + "/project.db";
    }

    private File getProjectDatabaseFile(String projectId) throws Exception {
        return resolveSafeRelativeFile(
            new File(getFilesDir(), "databases"),
            getProjectDatabasePath(projectId)
        );
    }

    private JSONArray listProjectFolders() throws Exception {
        JSONArray projects = new JSONArray();
        File projectDatabasesRoot = new File(
            new File(getFilesDir(), "databases"),
            "projects"
        );
        File[] projectDirectories = projectDatabasesRoot.listFiles();
        if (projectDirectories == null) {
            return projects;
        }

        for (File projectDirectory : projectDirectories) {
            if (!projectDirectory.isDirectory()) {
                continue;
            }

            String projectId;
            try {
                projectId = safePathSegment(projectDirectory.getName());
            } catch (Exception error) {
                continue;
            }

            File projectDbFile = new File(projectDirectory, "project.db");
            File projectFilesRoot = new File(getProjectRoot(projectId), "files");
            if (!projectDbFile.isFile() || !projectFilesRoot.isDirectory()) {
                continue;
            }

            try {
                JSONObject projectInfo = readProjectInfoFromDatabaseFile(
                    projectDbFile
                );
                String projectInfoId = safePathSegment(
                    projectInfo.optString("id", "")
                );
                if (!projectId.equals(projectInfoId)) {
                    continue;
                }

                JSONObject project = new JSONObject();
                project.put("id", projectId);
                project.put("name", projectInfo.optString("name", ""));
                project.put(
                    "description",
                    projectInfo.optString("description", "")
                );
                if (
                    projectInfo.has("iconFileId") &&
                    !projectInfo.isNull("iconFileId")
                ) {
                    project.put("iconFileId", projectInfo.optString("iconFileId", ""));
                } else {
                    project.put("iconFileId", JSONObject.NULL);
                }
                projects.put(project);
            } catch (Exception error) {
                Log.w(
                    TAG,
                    "Skipping invalid Android project folder: " + projectId,
                    error
                );
            }
        }

        return projects;
    }

    private File getProjectRoot(String projectId) throws Exception {
        return resolveSafeRelativeFile(
            new File(getFilesDir(), "projects"),
            safePathSegment(projectId)
        );
    }

    private File getPickerRoot(String requestId) throws Exception {
        return resolveSafeRelativeFile(
            new File(getFilesDir(), "picker"),
            safePathSegment(requestId)
        );
    }

    private void deletePickerRequestFiles(String requestId) throws Exception {
        deleteRecursively(getPickerRoot(requestId));
    }

    private void deleteRecursively(File file) throws Exception {
        if (file == null || !file.exists()) {
            return;
        }

        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }

        if (!file.delete() && file.exists()) {
            throw new IllegalStateException(
                "Failed to delete temporary picker file."
            );
        }
    }

    private String readProjectFileMimeType(String projectId, String fileId)
        throws Exception {
        File metadataFile = resolveSafeRelativeFile(
            new File(getProjectRoot(projectId), "file-metadata"),
            safePathSegment(fileId) + ".mime"
        );
        if (!metadataFile.isFile()) {
            return "application/octet-stream";
        }
        return normalizeMimeType(
            new String(readBytes(metadataFile), StandardCharsets.UTF_8)
        );
    }

    private String resolveProjectFileMimeType(
        String projectId,
        String fileId,
        File file
    ) throws Exception {
        String mimeType = readProjectFileMimeType(projectId, fileId);
        if (isUnreliableMimeType(mimeType)) {
            String sniffedMimeType = detectMimeTypeFromFile(file);
            if (sniffedMimeType != null) {
                return sniffedMimeType;
            }
        }

        return normalizeMimeType(mimeType);
    }

    private String readPickerFileMimeType(String requestId, String fileId)
        throws Exception {
        File metadataFile = resolveSafeRelativeFile(
            new File(getPickerRoot(requestId), "file-metadata"),
            safePathSegment(fileId) + ".mime"
        );
        if (!metadataFile.isFile()) {
            return "application/octet-stream";
        }
        return normalizeMimeType(
            new String(readBytes(metadataFile), StandardCharsets.UTF_8)
        );
    }

    private String readMimeTypeForInternalPath(String path, File file)
        throws Exception {
        String normalizedPath = normalizeInternalStoragePath(path);
        String mimeType = null;
        String[] parts = normalizedPath.split("/");
        if (
            parts.length == 4 &&
            "projects".equals(parts[0]) &&
            "files".equals(parts[2])
        ) {
            mimeType = readProjectFileMimeType(parts[1], parts[3]);
        } else if (
            isTypedProjectFilePath(parts)
        ) {
            mimeType = readProjectFileMimeType(parts[1], parts[3]);
        } else if (
            parts.length == 4 &&
            "picker".equals(parts[0]) &&
            "files".equals(parts[2])
        ) {
            mimeType = readPickerFileMimeType(parts[1], parts[3]);
        } else {
            mimeType = URLConnection.guessContentTypeFromName(normalizedPath);
        }

        if (isUnreliableMimeType(mimeType)) {
            String sniffedMimeType = detectMimeTypeFromFile(file);
            if (sniffedMimeType != null) {
                return sniffedMimeType;
            }
        }

        return normalizeMimeType(mimeType);
    }

    private File resolveInternalStorageFileForPath(String normalizedPath)
        throws Exception {
        String[] parts = normalizeInternalStoragePath(normalizedPath).split("/");
        if (isTypedProjectFilePath(parts)) {
            String safeProjectId = safePathSegment(parts[1]);
            String safeFileId = safePathSegment(parts[3]);
            File projectRoot = getProjectRoot(safeProjectId);
            return resolveSafeRelativeFile(new File(projectRoot, "files"), safeFileId);
        }

        return resolveSafeRelativeFile(getFilesDir(), normalizedPath);
    }

    private boolean isTypedProjectFilePath(String[] parts) {
        return (
            parts.length == 5 &&
            "projects".equals(parts[0]) &&
            "typed-files".equals(parts[2]) &&
            parts[4].startsWith("asset.")
        );
    }

    private boolean isUnreliableMimeType(String mimeType) {
        String normalizedMimeType = mimeType == null ? "" : mimeType.trim().toLowerCase();
        return (
            normalizedMimeType.isEmpty() ||
            "text/plain".equals(normalizedMimeType) ||
            "application/octet-stream".equals(normalizedMimeType)
        );
    }

    private String detectMimeTypeFromFile(File file) {
        byte[] header = readFileHeader(file, 16);
        if (header.length >= 8 &&
            (header[0] & 0xff) == 0x89 &&
            header[1] == 0x50 &&
            header[2] == 0x4e &&
            header[3] == 0x47 &&
            header[4] == 0x0d &&
            header[5] == 0x0a &&
            header[6] == 0x1a &&
            header[7] == 0x0a) {
            return "image/png";
        }

        if (
            header.length >= 3 &&
            (header[0] & 0xff) == 0xff &&
            (header[1] & 0xff) == 0xd8
        ) {
            return "image/jpeg";
        }

        if (
            header.length >= 12 &&
            header[0] == 0x52 &&
            header[1] == 0x49 &&
            header[2] == 0x46 &&
            header[3] == 0x46 &&
            header[8] == 0x57 &&
            header[9] == 0x45 &&
            header[10] == 0x42 &&
            header[11] == 0x50
        ) {
            return "image/webp";
        }

        if (
            header.length >= 4 &&
            header[0] == 0x00 &&
            header[1] == 0x01 &&
            header[2] == 0x00 &&
            header[3] == 0x00
        ) {
            return "font/ttf";
        }

        if (
            header.length >= 4 &&
            header[0] == 0x4f &&
            header[1] == 0x54 &&
            header[2] == 0x54 &&
            header[3] == 0x4f
        ) {
            return "font/otf";
        }

        if (
            header.length >= 4 &&
            header[0] == 0x77 &&
            header[1] == 0x4f &&
            header[2] == 0x46 &&
            header[3] == 0x46
        ) {
            return "font/woff";
        }

        if (
            header.length >= 4 &&
            header[0] == 0x77 &&
            header[1] == 0x4f &&
            header[2] == 0x46 &&
            header[3] == 0x32
        ) {
            return "font/woff2";
        }

        return null;
    }

    private String normalizeMimeType(String mimeType) {
        String normalizedMimeType = mimeType == null ? "" : mimeType.trim();
        return normalizedMimeType.isEmpty()
            ? "application/octet-stream"
            : normalizedMimeType;
    }

    private String normalizeInternalStoragePath(String path) {
        String normalizedPath = path == null ? "" : path.trim();
        while (normalizedPath.startsWith("/")) {
            normalizedPath = normalizedPath.substring(1);
        }
        if (normalizedPath.startsWith("android-files/")) {
            normalizedPath = normalizedPath.substring("android-files/".length());
        }
        return normalizedPath;
    }

    private void launchAndroidFilePicker(
        String requestId,
        boolean multiple,
        String accept
    ) {
        if (pendingAndroidFilePickerRequestId != null) {
            sendAndroidFilePickerError(
                requestId,
                "Another file picker is already open."
            );
            return;
        }

        try {
            deletePickerRequestFiles(requestId);
        } catch (Exception error) {
            sendAndroidFilePickerError(
                requestId,
                "Failed to prepare file picker storage."
            );
            return;
        }

        pendingAndroidFilePickerRequestId = requestId;
        pendingAndroidFilePickerMultiple = multiple;

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);

        String[] mimeTypes = resolveAcceptedMimeTypes(accept);
        intent.setType(resolvePickerIntentType(mimeTypes));
        if (mimeTypes.length > 1) {
            intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
        }

        try {
            startActivityForResult(intent, ANDROID_FILE_PICKER_REQUEST_CODE);
        } catch (ActivityNotFoundException error) {
            clearPendingAndroidFilePicker();
            sendAndroidFilePickerError(requestId, "No file picker is available.");
        }
    }

    private void handleAndroidFilePickerActivityResult(
        int resultCode,
        Intent data
    ) {
        String requestId = pendingAndroidFilePickerRequestId;
        boolean multiple = pendingAndroidFilePickerMultiple;
        clearPendingAndroidFilePicker();

        if (requestId == null) {
            return;
        }

        try {
            JSONObject result = new JSONObject();
            result.put("requestId", requestId);

            if (resultCode != RESULT_OK || data == null) {
                result.put("files", new JSONArray());
                sendAndroidFilePickerResult(result);
                return;
            }

            JSONArray files = new JSONArray();
            JSONArray uris = collectPickedUris(data, multiple);
            for (int index = 0; index < uris.length(); index += 1) {
                files.put(
                    createPickerFileResult(
                        requestId,
                        Uri.parse(uris.getString(index)),
                        index
                    )
                );
            }

            result.put("files", files);
            sendAndroidFilePickerResult(result);
        } catch (Exception error) {
            try {
                deletePickerRequestFiles(requestId);
            } catch (Exception cleanupError) {
                Log.w(
                    TAG,
                    "Failed to clean picker files after picker error.",
                    cleanupError
                );
            }
            sendAndroidFilePickerError(
                requestId,
                error.getMessage() == null
                    ? "Failed to read selected file."
                    : error.getMessage()
            );
        }
    }

    private void clearPendingAndroidFilePicker() {
        pendingAndroidFilePickerRequestId = null;
        pendingAndroidFilePickerMultiple = false;
    }

    private void launchAndroidSaveFilePicker(
        String requestId,
        String filename,
        String mimeType
    ) {
        if (pendingAndroidSaveFilePickerRequestId != null) {
            sendAndroidSaveFilePickerError(
                requestId,
                "Another save dialog is already open."
            );
            return;
        }

        pendingAndroidSaveFilePickerRequestId = requestId;

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.setType(normalizeMimeType(mimeType));
        intent.putExtra(Intent.EXTRA_TITLE, sanitizeDownloadFilename(filename));

        try {
            startActivityForResult(intent, ANDROID_SAVE_FILE_PICKER_REQUEST_CODE);
        } catch (ActivityNotFoundException error) {
            clearPendingAndroidSaveFilePicker();
            sendAndroidSaveFilePickerError(
                requestId,
                "No save location picker is available."
            );
        }
    }

    private void handleAndroidSaveFilePickerActivityResult(
        int resultCode,
        Intent data
    ) {
        String requestId = pendingAndroidSaveFilePickerRequestId;
        clearPendingAndroidSaveFilePicker();

        if (requestId == null) {
            return;
        }

        try {
            JSONObject result = new JSONObject();
            result.put("requestId", requestId);

            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                result.put("uri", JSONObject.NULL);
                sendAndroidSaveFilePickerResult(result);
                return;
            }

            result.put("uri", data.getData().toString());
            sendAndroidSaveFilePickerResult(result);
        } catch (Exception error) {
            sendAndroidSaveFilePickerError(
                requestId,
                error.getMessage() == null
                    ? "Failed to select save location."
                    : error.getMessage()
            );
        }
    }

    private void clearPendingAndroidSaveFilePicker() {
        pendingAndroidSaveFilePickerRequestId = null;
    }

    private void launchAndroidFolderPicker(String requestId, boolean writable) {
        if (pendingAndroidFolderPickerRequestId != null) {
            sendAndroidFolderPickerError(
                requestId,
                "Another folder picker is already open."
            );
            return;
        }

        pendingAndroidFolderPickerRequestId = requestId;

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (writable) {
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        }
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);

        try {
            startActivityForResult(intent, ANDROID_FOLDER_PICKER_REQUEST_CODE);
        } catch (ActivityNotFoundException error) {
            clearPendingAndroidFolderPicker();
            sendAndroidFolderPickerError(
                requestId,
                "No folder picker is available."
            );
        }
    }

    private void handleAndroidFolderPickerActivityResult(
        int resultCode,
        Intent data
    ) {
        String requestId = pendingAndroidFolderPickerRequestId;
        clearPendingAndroidFolderPicker();

        if (requestId == null) {
            return;
        }

        try {
            JSONObject result = new JSONObject();
            result.put("requestId", requestId);

            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                result.put("folder", JSONObject.NULL);
                sendAndroidFolderPickerResult(result);
                return;
            }

            Uri treeUri = data.getData();
            persistTreePermission(treeUri, data.getFlags());
            Uri rootDocumentUri = getTreeRootDocumentUri(treeUri);
            JSONObject folder = new JSONObject();
            folder.put("uri", treeUri.toString());
            folder.put(
                "name",
                resolveDocumentDisplayName(rootDocumentUri, "Selected Folder")
            );
            result.put("folder", folder);
            sendAndroidFolderPickerResult(result);
        } catch (Exception error) {
            sendAndroidFolderPickerError(
                requestId,
                error.getMessage() == null
                    ? "Failed to select folder."
                    : error.getMessage()
            );
        }
    }

    private void clearPendingAndroidFolderPicker() {
        pendingAndroidFolderPickerRequestId = null;
    }

    private void persistTreePermission(Uri treeUri, int flags) {
        if (treeUri == null) {
            return;
        }

        int persistableFlags =
            flags &
            (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        if (persistableFlags == 0) {
            return;
        }

        try {
            getContentResolver()
                .takePersistableUriPermission(treeUri, persistableFlags);
        } catch (Exception error) {
            Log.w(TAG, "Failed to persist folder permission.", error);
        }
    }

    private JSONArray collectPickedUris(Intent data, boolean multiple)
        throws Exception {
        JSONArray uris = new JSONArray();
        ClipData clipData = data.getClipData();
        if (multiple && clipData != null) {
            for (int index = 0; index < clipData.getItemCount(); index += 1) {
                Uri uri = clipData.getItemAt(index).getUri();
                if (uri != null) {
                    uris.put(uri.toString());
                }
            }
            return uris;
        }

        Uri uri = data.getData();
        if (uri != null) {
            uris.put(uri.toString());
        }
        return uris;
    }

    private Uri getTreeRootDocumentUri(Uri treeUri) {
        return DocumentsContract.buildDocumentUriUsingTree(
            treeUri,
            DocumentsContract.getTreeDocumentId(treeUri)
        );
    }

    private Uri getChildDocumentsUri(Uri directoryUri) {
        return DocumentsContract.buildChildDocumentsUriUsingTree(
            directoryUri,
            DocumentsContract.getDocumentId(directoryUri)
        );
    }

    private Uri findChildDocument(
        Uri parentDocumentUri,
        String childName,
        boolean shouldBeDirectory
    ) throws Exception {
        String[] projection = new String[] {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
        };
        Uri childrenUri = getChildDocumentsUri(parentDocumentUri);

        try (
            Cursor cursor = getContentResolver()
                .query(childrenUri, projection, null, null, null)
        ) {
            if (cursor == null) {
                return null;
            }

            while (cursor.moveToNext()) {
                String displayName = cursor.getString(1);
                if (!childName.equals(displayName)) {
                    continue;
                }

                String mimeType = cursor.getString(2);
                boolean isDirectory = DocumentsContract.Document.MIME_TYPE_DIR.equals(
                    mimeType
                );
                if (shouldBeDirectory != isDirectory) {
                    return null;
                }

                return DocumentsContract.buildDocumentUriUsingTree(
                    parentDocumentUri,
                    cursor.getString(0)
                );
            }
        }

        return null;
    }

    private Uri requireChildDocument(
        Uri parentDocumentUri,
        String childName,
        boolean shouldBeDirectory
    ) throws Exception {
        Uri childUri = findChildDocument(
            parentDocumentUri,
            childName,
            shouldBeDirectory
        );
        if (childUri == null) {
            throw new IllegalArgumentException(
                "Selected folder is missing " + childName + "."
            );
        }
        return childUri;
    }

    private Uri createChildDirectory(Uri parentDocumentUri, String directoryName)
        throws Exception {
        if (
            findChildDocument(parentDocumentUri, directoryName, true) != null ||
            findChildDocument(parentDocumentUri, directoryName, false) != null
        ) {
            throw new IllegalStateException(
                "A file or folder named " + directoryName + " already exists."
            );
        }

        Uri childUri = DocumentsContract.createDocument(
            getContentResolver(),
            parentDocumentUri,
            DocumentsContract.Document.MIME_TYPE_DIR,
            directoryName
        );
        if (childUri == null) {
            throw new IllegalStateException("Failed to create export folder.");
        }
        return childUri;
    }

    private Uri createChildFile(
        Uri parentDocumentUri,
        String filename,
        String mimeType
    ) throws Exception {
        if (
            findChildDocument(parentDocumentUri, filename, false) != null ||
            findChildDocument(parentDocumentUri, filename, true) != null
        ) {
            throw new IllegalStateException(
                "A file named " + filename + " already exists."
            );
        }

        Uri childUri = DocumentsContract.createDocument(
            getContentResolver(),
            parentDocumentUri,
            normalizeMimeType(mimeType),
            filename
        );
        if (childUri == null) {
            throw new IllegalStateException("Failed to create export file.");
        }
        return childUri;
    }

    private String resolveDocumentDisplayName(Uri documentUri, String fallback) {
        String[] projection = new String[] {
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        };

        try (
            Cursor cursor = getContentResolver()
                .query(documentUri, projection, null, null, null)
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                String displayName = cursor.getString(0);
                if (displayName != null && !displayName.trim().isEmpty()) {
                    return displayName;
                }
            }
        } catch (Exception ignored) {
            // Keep the fallback if the provider cannot return a display name.
        }

        return fallback;
    }

    private void copyFileDirectoryContentsToDocumentDirectory(
        File sourceDirectory,
        Uri outputDirectoryUri
    ) throws Exception {
        File[] children = sourceDirectory.listFiles();
        if (children == null) {
            return;
        }

        for (File child : children) {
            String childName = sanitizeExportFilename(child.getName());
            if (child.isDirectory()) {
                Uri childDirectoryUri = createChildDirectory(
                    outputDirectoryUri,
                    childName
                );
                copyFileDirectoryContentsToDocumentDirectory(
                    child,
                    childDirectoryUri
                );
                continue;
            }

            if (child.isFile()) {
                copyFileToDocumentDirectory(
                    child,
                    outputDirectoryUri,
                    childName,
                    URLConnection.guessContentTypeFromName(childName)
                );
            }
        }
    }

    private void copyFileToDocumentDirectory(
        File sourceFile,
        Uri outputDirectoryUri,
        String filename,
        String mimeType
    ) throws Exception {
        Uri outputFileUri = createChildFile(
            outputDirectoryUri,
            sanitizeExportFilename(filename),
            mimeType
        );
        try (
            FileInputStream input = new FileInputStream(sourceFile);
            OutputStream output = getContentResolver()
                .openOutputStream(outputFileUri, "wt")
        ) {
            if (output == null) {
                throw new IllegalStateException("Failed to open export file.");
            }
            writeOutputStream(output, input);
        }
    }

    private void copyDocumentDirectoryContents(Uri directoryUri, File outputDirectory)
        throws Exception {
        if (!outputDirectory.exists() && !outputDirectory.mkdirs()) {
            throw new IllegalStateException("Failed to create import directory.");
        }

        String[] projection = new String[] {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
        };
        Uri childrenUri = getChildDocumentsUri(directoryUri);

        try (
            Cursor cursor = getContentResolver()
                .query(childrenUri, projection, null, null, null)
        ) {
            if (cursor == null) {
                return;
            }

            while (cursor.moveToNext()) {
                String childDocumentId = cursor.getString(0);
                String displayName = sanitizeImportedFilename(cursor.getString(1));
                String mimeType = cursor.getString(2);
                Uri childUri = DocumentsContract.buildDocumentUriUsingTree(
                    directoryUri,
                    childDocumentId
                );
                File outputFile = resolveSafeRelativeFile(
                    outputDirectory,
                    displayName
                );

                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mimeType)) {
                    copyDocumentDirectoryContents(childUri, outputFile);
                } else {
                    copyDocumentToFile(childUri, outputFile);
                }
            }
        }
    }

    private void copyDocumentToFile(Uri documentUri, File outputFile)
        throws Exception {
        try (InputStream input = getContentResolver().openInputStream(documentUri)) {
            if (input == null) {
                throw new IllegalStateException("Failed to read selected project.");
            }
            writeStream(outputFile, input);
        }
    }

    private void copyFile(File sourceFile, File outputFile) throws Exception {
        try (FileInputStream input = new FileInputStream(sourceFile)) {
            writeStream(outputFile, input);
        }
    }

    private JSONObject readProjectInfoFromDatabaseFile(File databaseFile)
        throws Exception {
        SQLiteDatabase database = SQLiteDatabase.openDatabase(
            databaseFile.getAbsolutePath(),
            null,
            SQLiteDatabase.OPEN_READONLY
        );

        try {
            String rawProjectInfo = readAppStateValue(database, "projectInfo");
            if (rawProjectInfo == null || rawProjectInfo.trim().isEmpty()) {
                throw new IllegalArgumentException(
                    "Selected folder is not a RouteVN project."
                );
            }

            JSONObject projectInfo = new JSONObject(rawProjectInfo);
            if (projectInfo.optString("id", "").trim().isEmpty()) {
                throw new IllegalArgumentException(
                    "Selected project is missing an id."
                );
            }
            return projectInfo;
        } finally {
            database.close();
        }
    }

    private String readAppStateValue(SQLiteDatabase database, String key)
        throws Exception {
        if (hasTable(database, "app_state")) {
            String value = readKeyValueTableValue(database, "app_state", key);
            if (value != null) {
                return value;
            }
        }

        if (hasTable(database, "kv")) {
            return readKeyValueTableValue(database, "kv", key);
        }

        return null;
    }

    private boolean hasTable(SQLiteDatabase database, String tableName)
        throws Exception {
        try (
            Cursor cursor = database.rawQuery(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
                new String[] { tableName }
            )
        ) {
            return cursor.moveToFirst();
        }
    }

    private String readKeyValueTableValue(
        SQLiteDatabase database,
        String tableName,
        String key
    ) throws Exception {
        try (
            Cursor cursor = database.rawQuery(
                "SELECT value FROM " + tableName + " WHERE key = ?",
                new String[] { key }
            )
        ) {
            if (!cursor.moveToFirst()) {
                return null;
            }

            return cursor.getString(0);
        }
    }

    private String sanitizeImportedFilename(String filename) {
        String resolvedFilename = filename == null ? "" : filename.trim();
        if (resolvedFilename.isEmpty()) {
            resolvedFilename = "file";
        }
        return resolvedFilename.replaceAll("[\\\\/]+", "-");
    }

    private String sanitizeExportFilename(String filename) {
        String resolvedFilename = filename == null ? "" : filename.trim();
        if (resolvedFilename.isEmpty()) {
            resolvedFilename = "file";
        }
        return resolvedFilename.replaceAll("[\\\\/]+", "-");
    }

    private String sanitizeExportFolderTitle(String title) {
        String resolvedTitle = title == null ? "" : title.trim();
        if (resolvedTitle.isEmpty()) {
            resolvedTitle = "RouteVN Project";
        }

        resolvedTitle = resolvedTitle.replaceAll("[\\\\/:*?\"<>|\\r\\n\\t]+", " ");
        resolvedTitle = resolvedTitle.replaceAll("\\s+", " ").trim();
        resolvedTitle = resolvedTitle.replaceAll("^\\.+", "");
        resolvedTitle = resolvedTitle.replaceAll("\\.+$", "").trim();
        if (resolvedTitle.isEmpty()) {
            resolvedTitle = "RouteVN Project";
        }
        if (resolvedTitle.length() > 80) {
            resolvedTitle = resolvedTitle.substring(0, 80).trim();
        }
        return resolvedTitle;
    }

    private JSONObject createPickerFileResult(
        String requestId,
        Uri uri,
        int index
    ) throws Exception {
        String fileId = safePathSegment("file-" + index);
        String displayName = resolveContentDisplayName(uri, fileId);
        String mimeType = resolveContentMimeType(uri, displayName);
        long size = writePickerFileBytes(requestId, fileId, uri, mimeType);

        JSONObject file = new JSONObject();
        file.put("requestId", requestId);
        file.put("fileId", fileId);
        file.put("name", displayName);
        file.put("type", mimeType);
        file.put("size", size);
        file.put(
            "url",
            "https://" +
            APP_ASSET_HOST +
            "/android-files/picker/" +
            requestId +
            "/files/" +
            fileId
        );
        return file;
    }

    private long writePickerFileBytes(
        String requestId,
        String fileId,
        Uri uri,
        String mimeType
    ) throws Exception {
        File pickerRoot = getPickerRoot(requestId);
        File file = resolveSafeRelativeFile(new File(pickerRoot, "files"), fileId);
        File metadataFile = resolveSafeRelativeFile(
            new File(pickerRoot, "file-metadata"),
            fileId + ".mime"
        );

        long size;
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            if (input == null) {
                throw new IllegalStateException("Failed to read selected file.");
            }
            size = writeStream(file, input);
        }

        writeBytes(
            metadataFile,
            normalizeMimeType(mimeType).getBytes(StandardCharsets.UTF_8)
        );
        return size;
    }

    private String resolveContentDisplayName(Uri uri, String fallbackName) {
        try (
            Cursor cursor = getContentResolver()
                .query(uri, null, null, null, null)
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIndex >= 0) {
                    String displayName = cursor.getString(nameIndex);
                    if (displayName != null && !displayName.trim().isEmpty()) {
                        return displayName.trim();
                    }
                }
            }
        } catch (Exception error) {
            // Fall back to a generated file name below.
        }

        return fallbackName;
    }

    private String resolveContentMimeType(Uri uri, String displayName) {
        String mimeType = getContentResolver().getType(uri);
        if (!isUnreliableMimeType(mimeType)) {
            return mimeType;
        }

        String guessedMimeType = URLConnection.guessContentTypeFromName(displayName);
        return normalizeMimeType(guessedMimeType);
    }

    private String[] resolveAcceptedMimeTypes(String accept) {
        String normalizedAccept = accept == null ? "" : accept;
        String[] tokens = normalizedAccept.split(",");
        JSONArray mimeTypes = new JSONArray();

        for (String token : tokens) {
            String value = token.trim().toLowerCase();
            if (value.isEmpty()) {
                continue;
            }

            String mimeType = mapAcceptedValueToMimeType(value);
            if (mimeType == null) {
                continue;
            }

            boolean exists = false;
            for (int index = 0; index < mimeTypes.length(); index += 1) {
                if (mimeType.equals(mimeTypes.optString(index))) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                mimeTypes.put(mimeType);
            }
        }

        if (mimeTypes.length() == 0) {
            return new String[0];
        }

        String[] result = new String[mimeTypes.length()];
        for (int index = 0; index < mimeTypes.length(); index += 1) {
            result[index] = mimeTypes.optString(index);
        }
        return result;
    }

    private String mapAcceptedValueToMimeType(String value) {
        if (value.contains("/")) {
            return value;
        }

        switch (value) {
            case ".jpg":
            case ".jpeg":
                return "image/jpeg";
            case ".png":
                return "image/png";
            case ".webp":
                return "image/webp";
            case ".mp3":
                return "audio/mpeg";
            case ".wav":
                return "audio/wav";
            case ".ogg":
                return "audio/ogg";
            case ".mp4":
                return "video/mp4";
            case ".ttf":
                return "font/ttf";
            case ".otf":
                return "font/otf";
            case ".woff":
                return "font/woff";
            case ".woff2":
                return "font/woff2";
            default:
                return null;
        }
    }

    private String resolvePickerIntentType(String[] mimeTypes) {
        if (mimeTypes.length == 0) {
            return "*/*";
        }

        if (mimeTypes.length == 1) {
            return mimeTypes[0];
        }

        String prefix = mimeTypes[0].split("/", 2)[0];
        for (String mimeType : mimeTypes) {
            String currentPrefix = mimeType.split("/", 2)[0];
            if (!prefix.equals(currentPrefix)) {
                return "*/*";
            }
        }

        return prefix + "/*";
    }

    private void sendAndroidFilePickerError(String requestId, String message) {
        try {
            JSONObject result = new JSONObject();
            JSONObject error = new JSONObject();
            result.put("requestId", requestId);
            error.put("message", message);
            result.put("error", error);
            sendAndroidFilePickerResult(result);
        } catch (Exception ignored) {
            // Nothing useful to report if JSON construction fails.
        }
    }

    private void sendAndroidFilePickerResult(JSONObject result) {
        if (webView == null) {
            return;
        }

        webView.evaluateJavascript(
            "(function(result){if(window.__routeVNAndroidFilePickerResult){window.__routeVNAndroidFilePickerResult(result);}})(" +
            result.toString() +
            ");",
            null
        );
    }

    private void sendAndroidSaveFilePickerError(String requestId, String message) {
        try {
            JSONObject result = new JSONObject();
            JSONObject error = new JSONObject();
            result.put("requestId", requestId);
            error.put("message", message);
            result.put("error", error);
            sendAndroidSaveFilePickerResult(result);
        } catch (Exception ignored) {
            // Nothing useful to report if JSON construction fails.
        }
    }

    private void sendAndroidSaveFilePickerResult(JSONObject result) {
        if (webView == null) {
            return;
        }

        webView.evaluateJavascript(
            "(function(result){if(window.__routeVNAndroidSaveFileResult){window.__routeVNAndroidSaveFileResult(result);}})(" +
            result.toString() +
            ");",
            null
        );
    }

    private void sendAndroidFolderPickerError(String requestId, String message) {
        try {
            JSONObject result = new JSONObject();
            JSONObject error = new JSONObject();
            result.put("requestId", requestId);
            error.put("message", message);
            result.put("error", error);
            sendAndroidFolderPickerResult(result);
        } catch (Exception ignored) {
            // Nothing useful to report if JSON construction fails.
        }
    }

    private void sendAndroidFolderPickerResult(JSONObject result) {
        if (webView == null) {
            return;
        }

        webView.evaluateJavascript(
            "(function(result){if(window.__routeVNAndroidFolderPickerResult){window.__routeVNAndroidFolderPickerResult(result);}})(" +
            result.toString() +
            ");",
            null
        );
    }

    private void sendAndroidProjectExportError(
        String requestId,
        String message,
        Exception error
    ) {
        Log.e(TAG, "Failed to export Android project.", error);
        try {
            JSONObject result = new JSONObject();
            JSONObject errorBody = new JSONObject();
            result.put("requestId", requestId);
            errorBody.put("message", message);
            result.put("error", errorBody);
            sendAndroidProjectExportResult(result);
        } catch (Exception ignored) {
            // Nothing useful to report if JSON construction fails.
        }
    }

    private void sendAndroidProjectExportResult(JSONObject result) {
        if (webView == null) {
            return;
        }

        mainHandler.post(() -> {
            if (webView == null) {
                return;
            }
            webView.evaluateJavascript(
                "(function(result){if(window.__routeVNAndroidProjectExportResult){window.__routeVNAndroidProjectExportResult(result);}})(" +
                result.toString() +
                ");",
                null
            );
        });
    }

    private File resolveSafeRelativeFile(File root, String relativePath)
        throws Exception {
        String normalizedRelativePath = normalizeInternalStoragePath(relativePath);
        if (normalizedRelativePath.length() == 0) {
            throw new IllegalArgumentException("Relative path is required.");
        }

        File rootFile = root.getCanonicalFile();
        File targetFile = new File(rootFile, normalizedRelativePath).getCanonicalFile();
        String rootPath = rootFile.getPath();
        String targetPath = targetFile.getPath();
        if (
            !targetPath.equals(rootPath) &&
            !targetPath.startsWith(rootPath + File.separator)
        ) {
            throw new SecurityException("Path escapes app storage.");
        }
        return targetFile;
    }

    private String safePathSegment(String value) {
        String segment = value == null ? "" : value.trim();
        if (!segment.matches("[A-Za-z0-9_-]{1,128}")) {
            throw new IllegalArgumentException("Invalid app storage path segment.");
        }
        return segment;
    }

    private String sanitizeDownloadFilename(String filename) {
        String resolvedFilename = filename == null ? "" : filename.trim();
        if (resolvedFilename.isEmpty()) {
            resolvedFilename = "download";
        }
        resolvedFilename = resolvedFilename.replaceAll("[\\\\/]+", "-");
        resolvedFilename = resolvedFilename.replaceAll("[\\r\\n\\t]+", " ");
        if (resolvedFilename.length() > 160) {
            resolvedFilename = resolvedFilename.substring(0, 160);
        }
        return resolvedFilename;
    }

    private void writeBytes(File file, byte[] bytes) throws Exception {
        File parentFile = file.getParentFile();
        if (parentFile != null && !parentFile.exists() && !parentFile.mkdirs()) {
            throw new IllegalStateException("Failed to create output directory.");
        }

        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(bytes);
        }
    }

    private long writeStream(File file, InputStream input) throws Exception {
        File parentFile = file.getParentFile();
        if (parentFile != null && !parentFile.exists() && !parentFile.mkdirs()) {
            throw new IllegalStateException("Failed to create output directory.");
        }

        try (FileOutputStream output = new FileOutputStream(file)) {
            return writeOutputStream(output, input);
        }
    }

    private long writeOutputStream(OutputStream output, InputStream input)
        throws Exception {
        long totalBytes = 0;
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
            totalBytes += read;
        }
        return totalBytes;
    }

    private byte[] readBytes(File file) throws Exception {
        try (
            FileInputStream input = new FileInputStream(file);
            ByteArrayOutputStream output = new ByteArrayOutputStream()
        ) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private byte[] readFileHeader(File file, int maxBytes) {
        if (file == null || !file.isFile() || maxBytes <= 0) {
            return new byte[0];
        }

        byte[] header = new byte[maxBytes];
        try (FileInputStream input = new FileInputStream(file)) {
            int read = input.read(header);
            if (read <= 0) {
                return new byte[0];
            }

            if (read == maxBytes) {
                return header;
            }

            byte[] trimmedHeader = new byte[read];
            System.arraycopy(header, 0, trimmedHeader, 0, read);
            return trimmedHeader;
        } catch (Exception error) {
            return new byte[0];
        }
    }
}
