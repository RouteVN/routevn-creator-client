import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const readRepoFile = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Android WebView security boundary", () => {
  it("exposes native messaging only to exact trusted main-frame origins", async () => {
    const activity = await readRepoFile(
      "android/routevn/app/src/main/java/com/routevn/creator/MainActivity.java",
    );

    expect(activity).toContain("WebViewCompat.addWebMessageListener(");
    expect(activity).toContain("if (!isMainFrame || !isAllowedBridgeOrigin");
    expect(activity).toContain("allowedOriginRules.add(APP_ORIGIN)");
    expect(activity).toContain("allowedOriginRules.add(DEV_SERVER_ORIGIN)");
    expect(activity).not.toContain("addJavascriptInterface(");
    expect(activity).not.toContain("@JavascriptInterface");
    expect(activity).not.toContain('allowedOriginRules.add("*")');
    expect(activity).toContain("isTrustedAppDocumentUrl(uri)");
    expect(activity.match(/openExternalUri\(uri\);\s+return true;/g)).toHaveLength(
      2,
    );
    expect(activity).toContain(
      'headers.put("Content-Security-Policy", "default-src \'none\'; sandbox")',
    );
  });

  it("keeps CORS and cookies scoped to the app", async () => {
    const activity = await readRepoFile(
      "android/routevn/app/src/main/java/com/routevn/creator/MainActivity.java",
    );

    expect(activity).toContain(
      "cookieManager.setAcceptThirdPartyCookies(webView, false)",
    );
    expect(activity).toContain("settings.setAllowContentAccess(false)");
    expect(activity).not.toContain(
      'headers.put("Access-Control-Allow-Origin", "*")',
    );
    expect(activity).toContain(
      "BuildConfig.DEBUG ? DEV_SERVER_ORIGIN : APP_ORIGIN",
    );
  });

  it("limits raw SQLite to project databases and stores auth secrets with Android Keystore", async () => {
    const activity = await readRepoFile(
      "android/routevn/app/src/main/java/com/routevn/creator/MainActivity.java",
    );
    const androidDb = await readRepoFile("src/deps/clients/android/db.js");

    expect(activity).toContain(
      '"The SQLite bridge only supports project databases."',
    );
    expect(activity).toContain("validateBridgeQuerySql(sql)");
    expect(activity).toContain("validateBridgeExecuteSql(sql)");
    expect(activity).toContain('KeyStore.getInstance("AndroidKeyStore")');
    expect(activity).toContain('Cipher.getInstance("AES/GCM/NoPadding")');
    expect(activity).toContain("auth.remove(AUTH_SESSION_CONFIG_KEY)");
    expect(androidDb).toContain('callAndroidBridge("appDbSet"');
  });

  it("uses a restrictive Android document policy without inline scripts or frames", async () => {
    const html = await readRepoFile("static/android/index.html");

    expect(html).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(html).toContain("frame-src 'none'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain('src="/public/android-env.js"');
    expect(html).not.toMatch(/<script(?:\s[^>]*)?>\s*[^<\s]/);
  });
});
