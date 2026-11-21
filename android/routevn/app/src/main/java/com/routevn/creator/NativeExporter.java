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

    /**
     * An Android export or signing-key failure with the exporter's stable
     * error code, such as "keystore-password-incorrect", which the bridge
     * passes to JavaScript.
     */
    static final class ExportFailure extends IllegalStateException {
        final String code;

        ExportFailure(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    /** Receives Android export progress. Called from exporter threads. */
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

    static JSONObject androidBundleExportCapabilities(
        String templatePath,
        String descriptorPath
    ) throws Exception {
        return new JSONObject(
            nativeAndroidBundleExportCapabilities(templatePath, descriptorPath)
        );
    }

    /** The result of an exporter call, or its failure with the error code. */
    private static JSONObject exporterResult(String rawResponse) throws Exception {
        JSONObject response = new JSONObject(rawResponse);
        if (!response.optBoolean("ok", false)) {
            JSONObject error = response.optJSONObject("error");
            String fallback = "The Android exporter failed.";
            throw new ExportFailure(
                error == null ? "write-failed" : error.optString("code", "write-failed"),
                error == null ? fallback : error.optString("message", fallback)
            );
        }
        return response.getJSONObject("result");
    }

    /** Exports an APK, signed when the payload has a signingKey. */
    static JSONObject exportAndroidApk(
        JSONObject payload,
        ProgressListener listener
    ) throws Exception {
        return exporterResult(nativeExportAndroidApk(payload.toString(), listener));
    }

    /** Exports an App Bundle signed with the payload's signingKey. */
    static JSONObject exportAndroidBundle(
        JSONObject payload,
        ProgressListener listener
    ) throws Exception {
        return exporterResult(
            nativeExportAndroidBundle(payload.toString(), listener)
        );
    }

    /** Makes a signing key for {applicationName, applicationId}. */
    static JSONObject createAndroidSigningKey(JSONObject payload) throws Exception {
        return exporterResult(nativeCreateAndroidSigningKey(payload.toString()));
    }

    /** Reads the key in {keystore (PKCS #12, base64), password, alias?}. */
    static JSONObject readAndroidKeystore(JSONObject payload) throws Exception {
        return exporterResult(nativeReadAndroidKeystore(payload.toString()));
    }

    /** Encodes {key, password, alias} as {keystore (PKCS #12, base64)}. */
    static JSONObject encodeAndroidKeystore(JSONObject payload) throws Exception {
        return exporterResult(nativeEncodeAndroidKeystore(payload.toString()));
    }

    private static native String nativeSelfTest();

    private static native String nativeAndroidExportCapabilities(
        String templatePath,
        String descriptorPath
    );

    private static native String nativeAndroidBundleExportCapabilities(
        String templatePath,
        String descriptorPath
    );

    private static native String nativeExportAndroidApk(
        String payloadJson,
        ProgressListener listener
    );

    private static native String nativeExportAndroidBundle(
        String payloadJson,
        ProgressListener listener
    );

    private static native String nativeCreateAndroidSigningKey(String payloadJson);

    private static native String nativeReadAndroidKeystore(String payloadJson);

    private static native String nativeEncodeAndroidKeystore(String payloadJson);

    private static native void nativeTestCrash(int kind);

    private static native String nativeCreateDistributionZipStreamed(
        String payloadJson
    );
}
