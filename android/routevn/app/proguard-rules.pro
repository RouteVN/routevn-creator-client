# Keep line numbers so crash stacks can be decoded with the archived mapping.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Keep the reported exception type readable in crash reports.
-keepnames class com.routevn.creator.MainActivity$WebViewRenderer*Exception
-keepnames class com.routevn.creator.MainActivity$TestCrashException
