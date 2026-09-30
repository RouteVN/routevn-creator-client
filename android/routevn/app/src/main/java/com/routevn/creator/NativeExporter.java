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

    private static native String nativeSelfTest();

    private static native void nativeTestCrash(int kind);

    private static native String nativeCreateDistributionZipStreamed(
        String payloadJson
    );
}
