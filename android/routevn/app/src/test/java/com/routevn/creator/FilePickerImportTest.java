package com.routevn.creator;

import static org.junit.Assert.*;

import android.content.Intent;
import android.net.Uri;
import android.os.Looper;
import android.webkit.WebView;
import android.webkit.ValueCallback;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.util.ReflectionHelpers;
import org.robolectric.util.ReflectionHelpers.ClassParameter;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {33, 36}, manifest = Config.NONE)
public class FilePickerImportTest {
    private MainActivity activity;
    private RecordingWebView webView;
    private ExecutorService executor;

    @Before public void setUp() {
        activity = Robolectric.buildActivity(MainActivity.class).get();
        executor = ReflectionHelpers.getField(activity, "bridgeExecutor");
        webView = new RecordingWebView(activity);
        ReflectionHelpers.setField(activity, "webView", webView);
        ReflectionHelpers.setField(activity, "pendingAndroidFilePickerRequestId", "picker-test");
    }

    @After public void tearDown() {
        executor.shutdownNow();
        webView.destroy();
    }

    @Test public void slowImportLeavesMainThreadAvailableAndReturnsCopiedFile() throws Exception {
        CountDownLatch reading = new CountDownLatch(1);
        CountDownLatch resume = new CountDownLatch(1);
        boolean[] readOnMain = {false};
        InputStream input = new InputStream() {
            private boolean finished;
            @Override public int read() throws IOException {
                if (finished) return -1;
                finished = true;
                readOnMain[0] = Looper.myLooper() == Looper.getMainLooper();
                reading.countDown();
                try {
                    if (!resume.await(2, TimeUnit.SECONDS)) throw new IOException("Read timed out");
                } catch (InterruptedException error) {
                    throw new IOException(error);
                }
                return 42;
            }
        };
        try {
            select(input);
            assertTrue(reading.await(2, TimeUnit.SECONDS));
            assertFalse("Selected files must not be read on the UI thread", readOnMain[0]);
            assertNull(webView.script);
        } finally {
            resume.countDown();
        }
        finishImport();
        assertTrue(webView.script.contains("\"size\":1"));
        assertTrue(webView.callbackOnMain);
        assertArrayEquals(new byte[]{42}, Files.readAllBytes(new File(pickerRoot(), "files/file-0").toPath()));
    }

    @Test public void failedImportCleansFilesAndReportsErrorOnMainThread() throws Exception {
        select(new InputStream() {
            @Override public int read() throws IOException { throw new IOException("Read failed"); }
        });
        finishImport();
        assertTrue(webView.script.contains("\"error\":{\"message\":\"Read failed\"}"));
        assertTrue(webView.callbackOnMain);
        assertFalse(pickerRoot().exists());
    }

    private void select(InputStream input) {
        Uri uri = Uri.parse("content://picker-test/file");
        Shadows.shadowOf(activity.getContentResolver()).registerInputStream(uri, input);
        ReflectionHelpers.callInstanceMethod(activity, "handleAndroidFilePickerActivityResult",
            ClassParameter.from(int.class, MainActivity.RESULT_OK),
            ClassParameter.from(Intent.class, new Intent().setData(uri)));
    }

    private void finishImport() throws Exception {
        executor.submit(() -> {}).get(5, TimeUnit.SECONDS);
        Shadows.shadowOf(Looper.getMainLooper()).idle();
    }

    private File pickerRoot() {
        return ReflectionHelpers.callInstanceMethod(activity, "getPickerRoot",
            ClassParameter.from(String.class, "picker-test"));
    }

    private static class RecordingWebView extends WebView {
        String script;
        boolean callbackOnMain;
        RecordingWebView(MainActivity activity) { super(activity); }
        @Override public void evaluateJavascript(String script, ValueCallback<String> callback) {
            this.script = script;
            callbackOnMain = Looper.myLooper() == Looper.getMainLooper();
        }
    }
}
