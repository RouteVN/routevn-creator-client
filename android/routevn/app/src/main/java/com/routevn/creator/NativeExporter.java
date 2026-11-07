package com.routevn.creator;

import org.json.JSONObject;

final class NativeExporter {
    static {
        System.loadLibrary("routevn_exporter_jni");
    }

    private NativeExporter() {}

    static String selfTest() {
        return nativeSelfTest();
    }

    // Crashes the process inside the native library: a Rust panic for kind 0,
    // otherwise an invalid memory write. Only test crash projects call it.
    static void testCrash(int kind) {
        nativeTestCrash(kind);
    }

    static JSONObject createDistributionZipStreamed(JSONObject payload)
        throws Exception {
        String rawResult = nativeCreateDistributionZipStreamed(payload.toString());
        JSONObject result = new JSONObject(rawResult);
        if (!result.optBoolean("ok", false)) {
            String message = result.optString(
                "error",
                "Native distribution ZIP export failed."
            );
            throw new IllegalStateException(message);
        }
        return result.getJSONObject("stats");
    }

    /** Receives Android APK export progress. Called from exporter threads. */
    interface ProgressListener {
        void onProgress(String phase, long current, long total);
    }

    static JSONObject androidExportCapabilities(
        String templatePath,
        String descriptorPath
    ) throws Exception {
        return new JSONObject(
            nativeAndroidExportCapabilities(templatePath, descriptorPath)
        );
    }

    static JSONObject exportAndroidApk(
        JSONObject payload,
        ProgressListener listener
    ) throws Exception {
        JSONObject response = new JSONObject(
            nativeExportAndroidApk(payload.toString(), listener)
        );
        if (!response.optBoolean("ok", false)) {
            JSONObject error = response.optJSONObject("error");
            String message = error == null
                ? "Native Android APK export failed."
                : error.optString("message", "Native Android APK export failed.");
            throw new IllegalStateException(message);
        }
        return response.getJSONObject("result");
    }

    private static native String nativeSelfTest();

    private static native String nativeAndroidExportCapabilities(
        String templatePath,
        String descriptorPath
    );

    private static native String nativeExportAndroidApk(
        String payloadJson,
        ProgressListener listener
    );

    private static native void nativeTestCrash(int kind);

    private static native String nativeCreateDistributionZipStreamed(
        String payloadJson
    );
}
