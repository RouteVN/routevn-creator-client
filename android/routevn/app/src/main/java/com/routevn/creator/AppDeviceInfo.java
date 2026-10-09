package com.routevn.creator;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Resources;
import android.os.Build;
import android.os.LocaleList;
import android.webkit.WebSettings;
import android.webkit.WebView;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

/** Device and installation facts exposed to the JavaScript updater. */
final class AppDeviceInfo {
    private static final Pattern CHROME_UA_VERSION =
        Pattern.compile("Chrome/([0-9]{1,4})");

    private AppDeviceInfo() {}

    static String architecture(String abi) {
        if (abi == null) return "unknown";
        switch (abi) {
            case "arm64-v8a": return "aarch64";
            case "armeabi-v7a": return "armv7";
            case "x86_64": return "x86_64";
            case "x86": return "i686";
            default: return "unknown";
        }
    }

    static String primaryAbi(String[] abis) {
        return abis == null || abis.length == 0 ? null : abis[0];
    }

    /** ChromeOS is a desktop form factor; otherwise the sw600dp tablet boundary decides. */
    static String formFactor(boolean desktopLike, int smallestDisplayWidthDp) {
        if (desktopLike) return "desktop";
        return smallestDisplayWidthDp >= MainActivity.TABLET_MIN_SMALLEST_WIDTH_DP
            ? "tablet"
            : "phone";
    }

    /**
     * Isolated usage-field read: FEATURE_PC and the display metrics feed only
     * the form factor, so a failed read nulls that field alone and the bridge
     * response still succeeds.
     */
    static String formFactor(Context context) {
        try {
            return formFactor(
                context.getPackageManager().hasSystemFeature(
                    PackageManager.FEATURE_PC),
                MainActivity.smallestDisplayWidthDp(context));
        } catch (RuntimeException error) {
            return null;
        }
    }

    /** The device's first preferred language as a raw BCP-47-ish tag; shared JavaScript normalizes it. */
    static String systemLanguageTag() {
        try {
            return systemLanguageTag(
                Resources.getSystem().getConfiguration().getLocales());
        } catch (RuntimeException error) {
            return null;
        }
    }

    /** An empty or missing locale list yields null; get(0) would throw. */
    static String systemLanguageTag(LocaleList locales) {
        if (locales == null || locales.isEmpty()) return null;
        String tag = locales.get(0).toLanguageTag();
        return tag.isEmpty() ? null : tag;
    }

    /** The WebView's Chromium major from the package version name, e.g. "128.0.6613.84" -> "128". */
    static String webViewVersionFromVersionName(String versionName) {
        if (versionName == null) return null;
        String major = versionName.split("\\.")[0];
        return major.matches("[0-9]{1,4}") ? major : null;
    }

    /** Fallback before API 26: the Chromium major from "Chrome/<major>" in the WebView user agent. */
    static String webViewVersionFromUserAgent(String userAgent) {
        if (userAgent == null) return null;
        Matcher match = CHROME_UA_VERSION.matcher(userAgent);
        return match.find() ? match.group(1) : null;
    }

    static String webViewVersion(Context context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                PackageInfo webViewPackage = WebView.getCurrentWebViewPackage();
                return webViewPackage == null
                    ? null
                    : webViewVersionFromVersionName(webViewPackage.versionName);
            }
            return webViewVersionFromUserAgent(
                WebSettings.getDefaultUserAgent(context));
        } catch (RuntimeException error) {
            return null;
        }
    }

    /** Every usage-field read is isolated: a failure nulls that field only. */
    static JSONObject read(Context context) throws Exception {
        return create(
            BuildConfig.VERSION_NAME,
            BuildConfig.VERSION_CODE,
            primaryAbi(
                android.os.Process.is64Bit()
                    ? Build.SUPPORTED_64_BIT_ABIS
                    : Build.SUPPORTED_32_BIT_ABIS),
            BuildConfig.UPDATE_DISTRIBUTION,
            Build.MODEL,
            Build.VERSION.RELEASE,
            formFactor(context),
            systemLanguageTag(),
            webViewVersion(context));
    }

    static JSONObject create(
        String version,
        int build,
        String abi,
        String distribution,
        String model,
        String osVersion,
        String formFactor,
        String language,
        String webViewVersion
    ) throws Exception {
        return new JSONObject()
            .put("version", version)
            .put("build", Integer.toString(build))
            .put("arch", architecture(abi))
            .put("distribution", distribution)
            .put("model", model == null ? JSONObject.NULL : model)
            .put("osVersion", osVersion == null ? JSONObject.NULL : osVersion)
            .put("formFactor", formFactor == null ? JSONObject.NULL : formFactor)
            .put("language", language == null ? JSONObject.NULL : language)
            .put("webViewVersion", webViewVersion == null ? JSONObject.NULL : webViewVersion);
    }
}
