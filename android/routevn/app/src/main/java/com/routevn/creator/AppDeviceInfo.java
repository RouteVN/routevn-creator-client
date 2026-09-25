package com.routevn.creator;

import android.os.Build;
import org.json.JSONObject;

/** Device and installation facts exposed to the JavaScript updater. */
final class AppDeviceInfo {
    private AppDeviceInfo() {}

    static String architecture(String abi) {
        switch (abi) {
            case "arm64-v8a": return "aarch64";
            case "armeabi-v7a": return "armv7";
            case "x86_64": return "x86_64";
            case "x86": return "i686";
            default: throw new IllegalArgumentException("Unsupported Android architecture.");
        }
    }

    static JSONObject read() throws Exception {
        return create(BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE,
            (android.os.Process.is64Bit() ? Build.SUPPORTED_64_BIT_ABIS : Build.SUPPORTED_32_BIT_ABIS)[0],
            BuildConfig.UPDATE_DISTRIBUTION, Build.MODEL, Build.VERSION.RELEASE);
    }

    static JSONObject create(String version, int build, String abi, String distribution,
                             String model, String osVersion) throws Exception {
        return new JSONObject()
            .put("version", version)
            .put("build", Integer.toString(build))
            .put("arch", architecture(abi))
            .put("distribution", distribution)
            .put("model", model == null ? JSONObject.NULL : model)
            .put("osVersion", osVersion == null ? JSONObject.NULL : osVersion);
    }
}
