package com.routevn.creator;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.util.Arrays;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ByteRangeResponseTest {
    @Rule public TemporaryFolder temporaryFolder = new TemporaryFolder();
    private byte[] contents;
    private File file;

    @Before public void setUp() throws Exception {
        contents = new byte[3 * 1024 * 1024 + 37];
        for (int i = 0; i < contents.length; i++) {
            contents[i] = (byte) (i * 31 + (i >>> 8));
        }
        file = temporaryFolder.newFile();
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(contents);
        }
    }

    private byte[] readAll(InputStream input) throws IOException {
        try (InputStream body = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = body.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toByteArray();
        }
    }

    private void assertWhole(String header) throws Exception {
        ByteRangeResponse response = ByteRangeResponse.open(file, header);
        assertEquals(200, response.status);
        assertEquals("OK", response.reason);
        assertEquals("bytes", response.headers.get("Accept-Ranges"));
        assertEquals(null, response.headers.get("Content-Length"));
        assertEquals(null, response.headers.get("Content-Range"));
        assertArrayEquals(contents, readAll(response.body));
    }

    private void assertRange(String header, int start, int end) throws Exception {
        ByteRangeResponse response = ByteRangeResponse.open(file, header);
        assertEquals(206, response.status);
        assertEquals("Partial Content", response.reason);
        assertEquals("bytes", response.headers.get("Accept-Ranges"));
        assertEquals("bytes " + start + "-" + end + "/" + contents.length, response.headers.get("Content-Range"));
        assertEquals(null, response.headers.get("Content-Length"));
        assertArrayEquals(Arrays.copyOfRange(contents, start, end + 1), readAsWebView(response.body, start));
    }

    // What the WebView does with an intercepted response to a range request:
    // check available() as the size, skip to the range start, read the rest.
    private byte[] readAsWebView(InputStream body, long start) throws IOException {
        int available = body.available();
        assertEquals(true, available > start);
        long toSkip = start;
        while (toSkip > 0) {
            long skipped = body.skip(toSkip);
            assertEquals(true, skipped > 0);
            toSkip -= skipped;
        }
        return readAll(body);
    }

    private void assertUnsatisfiable(File source, String header, int size) throws Exception {
        ByteRangeResponse response = ByteRangeResponse.open(source, header);
        assertEquals(416, response.status);
        assertEquals("Range Not Satisfiable", response.reason);
        assertEquals("bytes */" + size, response.headers.get("Content-Range"));
        assertEquals(null, response.headers.get("Content-Length"));
        assertArrayEquals(new byte[0], readAll(response.body));
    }

    @Test public void wholeFileAndIgnoredHeaders() throws Exception {
        assertWhole(null);
        for (String header : new String[] {"bytes=abc", "items=0-1", "bytes=0-1,4-5", "bytes=5-4", "bytes=-", "bytes=-0", "bytes=--5", "bytes=5--1", "bytes=1 2-3", "bytes=\u0661-2", "bytes=99999999999999999999-", "bytes=", "bytes=,"}) {
            assertWhole(header);
        }
    }

    @Test public void servesExactRangesWithoutSizeCap() throws Exception {
        assertRange("bytes=0-1", 0, 1);
        assertRange("bytes=10-", 10, contents.length - 1);
        assertRange("bytes=-8", contents.length - 8, contents.length - 1);
        assertRange("bytes=10-999999999", 10, contents.length - 1);
        assertRange("bytes=-999999999", 0, contents.length - 1);
    }

    // Spellings Chromium's Range parser accepts; the WebView skips for these.
    @Test public void acceptsTheSameSpellingsAsChromium() throws Exception {
        assertRange("Bytes=100-199", 100, 199);
        assertRange(" bytes \t= 100 - 199 ", 100, 199);
        assertRange("bytes=100-199,", 100, 199);
        assertRange("bytes=, 100-199", 100, 199);
        assertRange("bytes=+100-+199", 100, 199);
        assertRange("bytes=-+8", contents.length - 8, contents.length - 1);
    }

    @Test public void servesFilesOver2GiBWholeAsBefore() throws Exception {
        File large = temporaryFolder.newFile();
        try (RandomAccessFile output = new RandomAccessFile(large, "rw")) {
            output.setLength(3L * 1024 * 1024 * 1024);
        }
        ByteRangeResponse response = ByteRangeResponse.open(large, "bytes=-8");
        assertEquals(200, response.status);
        assertEquals(null, response.headers.get("Content-Range"));
        assertEquals(null, response.headers.get("Accept-Ranges"));
        response.body.close();
    }

    @Test public void unsatisfiableRanges() throws Exception {
        assertUnsatisfiable(file, "bytes=" + contents.length + "-", contents.length);
        assertUnsatisfiable(temporaryFolder.newFile(), "bytes=0-1", 0);
    }

    @Test public void rangeBodyStartsAtFileStartAndEndsAfterRange() throws Exception {
        ByteRangeResponse response = ByteRangeResponse.open(file, "bytes=10-12");
        assertEquals(13, response.body.available());
        assertArrayEquals(Arrays.copyOfRange(contents, 0, 13), readAll(response.body));

        ByteRangeResponse suffix = ByteRangeResponse.open(file, "bytes=-8");
        assertEquals(contents.length, suffix.body.available());
        suffix.body.close();
    }

    @Test public void skipSeeksWithinTheBody() throws Exception {
        ByteRangeResponse response = ByteRangeResponse.open(file, "bytes=100-199");
        assertEquals(0, response.body.skip(0));
        assertEquals(150, response.body.skip(150));
        assertEquals(50, response.body.available());
        assertEquals(contents[150], (byte) response.body.read());
        assertEquals(49, response.body.skip(1000));
        assertEquals(0, response.body.available());
        assertEquals(-1, response.body.read());
        response.body.close();
    }

    @Test public void limitedStreamRespectsBoundsAndClosesFile() throws Exception {
        ByteRangeResponse response = ByteRangeResponse.open(file, "bytes=10-12");
        assertEquals(10, response.body.skip(10));
        byte[] buffer = new byte[12];
        assertEquals(3, response.body.read(buffer, 2, 8));
        assertArrayEquals(Arrays.copyOfRange(contents, 10, 13), Arrays.copyOfRange(buffer, 2, 5));
        assertEquals(-1, response.body.read());
        assertEquals(-1, response.body.read(buffer, 0, buffer.length));
        assertEquals(0, response.body.read(buffer, 0, 0));
        response.body.close();

        ByteRangeResponse another = ByteRangeResponse.open(file, "bytes=0-1");
        another.body.close();
        assertThrows(IOException.class, () -> another.body.read());
    }
}
