package vn.routevn.androidplayer;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class PackageResponder implements Closeable {
    private static final int CHUNK_SIZE = 1024 * 1024;
    private static final long MAX_SAFE_INTEGER = 9007199254740991L;
    private static final Pattern RANGE = Pattern.compile("^bytes=(\\d*)-(\\d*)$");
    private final long total;
    private long handle;

    PackageResponder(Context context) throws IOException {
        try (AssetFileDescriptor asset = context.getAssets().openFd("routevn-package.bin")) {
            handle = NativePackage.open(context.getApplicationInfo().sourceDir,
                    asset.getStartOffset(), asset.getLength());
        }
        total = NativePackage.plaintextLength(handle);
        if (total < 0 || total > MAX_SAFE_INTEGER) {
            close();
            throw new IOException("Invalid package plaintext length");
        }
    }

    WebResourceResponse respond(Map<String, String> requestHeaders) {
        String rangeHeader = null;
        for (Map.Entry<String, String> header : requestHeaders.entrySet()) {
            if ("range".equalsIgnoreCase(header.getKey())) {
                rangeHeader = header.getValue();
                break;
            }
        }
        long[] range = parseRange(rangeHeader, total);
        Map<String, String> headers = new HashMap<>();
        headers.put("Accept-Ranges", "bytes");
        headers.put("Content-Type", "application/octet-stream");
        headers.put("Cache-Control", "no-store");
        if (range == null) {
            headers.put("Content-Range", "bytes */" + total);
            headers.put("Content-Length", "0");
            return new WebResourceResponse("application/octet-stream", null, 416,
                    "Range Not Satisfiable", headers, new ByteArrayInputStream(new byte[0]));
        }
        headers.put("Content-Range", "bytes " + range[0] + "-" + range[1] + "/" + total);
        headers.put("Content-Length", Long.toString(range[1] - range[0] + 1));
        return new WebResourceResponse("application/octet-stream", null, 206,
                "Partial Content", headers, new PackageStream(range[0], range[1]));
    }

    // Matches the desktop package fetch shim: one range, inclusive end, clamped to EOF.
    static long[] parseRange(String header, long total) {
        if (header == null || total == 0) return null;
        Matcher match = RANGE.matcher(header.trim());
        if (!match.matches()) return null;
        try {
            long start;
            long end;
            if (match.group(1).isEmpty()) {
                if (match.group(2).isEmpty()) return null;
                // Desktop accepts suffixes larger than the package, returning its entire content.
                double suffix = Double.parseDouble(match.group(2));
                if (!Double.isFinite(suffix) || suffix <= 0) return null;
                start = suffix >= total ? 0 : total - (long) suffix;
                end = total - 1;
            } else {
                start = Long.parseLong(match.group(1));
                end = match.group(2).isEmpty() ? total - 1 : Long.parseLong(match.group(2));
            }
            if (start < 0 || start > MAX_SAFE_INTEGER || end > MAX_SAFE_INTEGER
                    || end < start || start >= total) return null;
            return new long[] {start, Math.min(end, total - 1)};
        } catch (NumberFormatException error) {
            return null;
        }
    }

    private synchronized int read(long position, byte[] buffer, int length) throws IOException {
        if (handle == 0) throw new IOException("Package is closed");
        int count = NativePackage.read(handle, position, buffer, 0, length);
        if (count <= 0 || count > length) throw new IOException("Incomplete package range");
        return count;
    }

    @Override
    public synchronized void close() {
        if (handle != 0) {
            NativePackage.close(handle);
            handle = 0;
        }
    }

    private final class PackageStream extends InputStream {
        private final long end;
        private long position;
        private byte[] buffer;
        private int cursor;
        private int available;
        private boolean closed;

        PackageStream(long start, long end) {
            this.position = start;
            this.end = end;
        }

        @Override
        public int read() throws IOException {
            if (!fill()) return -1;
            return buffer[cursor++] & 0xff;
        }

        @Override
        public int read(byte[] destination, int offset, int length) throws IOException {
            if (offset < 0 || length < 0 || length > destination.length - offset) {
                throw new IndexOutOfBoundsException();
            }
            if (closed) throw new IOException("Stream is closed");
            if (length == 0) return 0;
            if (!fill()) return -1;
            int count = Math.min(length, available - cursor);
            System.arraycopy(buffer, cursor, destination, offset, count);
            cursor += count;
            return count;
        }

        private boolean fill() throws IOException {
            if (closed) throw new IOException("Stream is closed");
            if (cursor < available) return true;
            if (position > end) return false;
            if (buffer == null) buffer = new byte[CHUNK_SIZE];
            int length = (int) Math.min(CHUNK_SIZE, end - position + 1);
            available = PackageResponder.this.read(position, buffer, length);
            position += available;
            cursor = 0;
            return true;
        }

        @Override
        public void close() {
            closed = true;
            buffer = null;
        }
    }
}
