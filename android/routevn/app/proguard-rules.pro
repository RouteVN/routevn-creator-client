# Keep line numbers so crash stacks can be decoded with the archived mapping.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Keep the reported exception type readable in crash reports.
-keepnames class com.routevn.creator.MainActivity$WebViewRenderer*Exception
-keepnames class com.routevn.creator.MainActivity$TestCrashException

# Native code calls the APK export progress listener by name.
-keep interface com.routevn.creator.NativeExporter$ProgressListener { *; }
-keepclassmembers class * implements com.routevn.creator.NativeExporter$ProgressListener {
    void onProgress(java.lang.String, long, long);
}
