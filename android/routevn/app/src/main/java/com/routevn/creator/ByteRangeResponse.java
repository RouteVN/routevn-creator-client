package com.routevn.creator;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.channels.FileChannel;
import java.util.HashMap;
import java.util.Map;

// Responses for range requests to files served through
// WebViewClient.shouldInterceptRequest.
//
// The WebView handles part of a range request itself: it reads the stream's
// available() as the resource size, skips to the first requested byte with
// InputStream.skip(), adds Content-Length for what is left, and passes our
// status and headers through. So a 206 body starts at byte 0 of the file and
// ends after the last requested byte, and the WebView's skip leaves exactly the
// requested range. An unsatisfiable range fails in the WebView before our 416
// is used.
final class ByteRangeResponse {
    final int status;
    final String reason;
    final Map<String, String> headers;
    final InputStream body;

    private ByteRangeResponse(int status, String reason, Map<String, String> headers, InputStream body) {
        this.status = status;
        this.reason = reason;
        this.headers = headers;
        this.body = body;
    }

    static ByteRangeResponse open(File file, String header) throws IOException {
        FileInputStream input = new FileInputStream(file);
        try {
            long size = input.getChannel().size();
            Map<String, String> headers = new HashMap<>();
            // The WebView reads sizes through available(), an int, so it computes
            // wrong ranges for larger files. Serve those whole, as before.
            if (size > Integer.MAX_VALUE) {
                return new ByteRangeResponse(200, "OK", headers, input);
            }
            long[] range = parseRange(header, size);
            if (range == null) {
                headers.put("Accept-Ranges", "bytes");
                return new ByteRangeResponse(200, "OK", headers, input);
            }
            if (range.length == 0) {
                input.close();
                headers.put("Content-Range", "bytes */" + size);
                return new ByteRangeResponse(416, "Range Not Satisfiable", headers, new ByteArrayInputStream(new byte[0]));
            }
            long start = range[0];
            long end = range[1];
            headers.put("Accept-Ranges", "bytes");
            headers.put("Content-Range", "bytes " + start + "-" + end + "/" + size);
            return new ByteRangeResponse(206, "Partial Content", headers, new LimitedInputStream(input, end + 1));
        } catch (IOException | RuntimeException error) {
            try {
                input.close();
            } catch (IOException closeError) {
                error.addSuppressed(closeError);
            }
            throw error;
        }
    }

    // null means ignore the header; an empty array means an unsatisfiable range.
    // Mirrors Chromium's HttpUtil::ParseRangeHeader, which decides whether the
    // WebView skips, so that our status always matches the bytes it delivers.
    private static long[] parseRange(String header, long size) {
        if (header == null) {
            return null;
        }
        int equals = header.indexOf('=');
        if (equals < 0 || !trimLws(header.substring(0, equals)).equalsIgnoreCase("bytes")) {
            return null;
        }
        String spec = null;
        for (String part : header.substring(equals + 1).split(",", -1)) {
            String value = trimLws(part);
            if (value.isEmpty()) {
                continue;
            }
            if (spec != null) {
                return null;
            }
            spec = value;
        }
        if (spec == null) {
            return null;
        }
        int dash = spec.indexOf('-');
        if (dash < 0) {
            return null;
        }
        String first = trimLws(spec.substring(0, dash));
        String last = trimLws(spec.substring(dash + 1));
        Long start;
        Long end;
        try {
            start = first.isEmpty() ? null : parseNumber(first);
            end = last.isEmpty() ? null : parseNumber(last);
        } catch (NumberFormatException error) {
            return null;
        }
        if (start == null) {
            if (end == null || end <= 0) {
                return null;
            }
            if (size == 0) {
                return new long[0];
            }
            return new long[] {size - Math.min(size, end), size - 1};
        }
        if (start < 0 || (end != null && end < start)) {
            return null;
        }
        if (start >= size) {
            return new long[0];
        }
        return new long[] {start, end == null ? size - 1 : Math.min(end, size - 1)};
    }

    private static String trimLws(String value) {
        int begin = 0;
        int end = value.length();
        while (begin < end && (value.charAt(begin) == ' ' || value.charAt(begin) == '\t')) {
            begin++;
        }
        while (end > begin && (value.charAt(end - 1) == ' ' || value.charAt(end - 1) == '\t')) {
            end--;
        }
        return value.substring(begin, end);
    }

    // An optional sign, then ASCII digits only, like base::StringToInt64.
    private static long parseNumber(String value) {
        int digits = value.startsWith("+") || value.startsWith("-") ? 1 : 0;
        if (digits == value.length()) {
            throw new NumberFormatException();
        }
        for (int i = digits; i < value.length(); i++) {
            if (value.charAt(i) < '0' || value.charAt(i) > '9') {
                throw new NumberFormatException();
            }
        }
        return Long.parseLong(value);
    }

    private static final class LimitedInputStream extends InputStream {
        private final FileInputStream input;
        private long remaining;

        LimitedInputStream(FileInputStream input, long remaining) {
            this.input = input;
            this.remaining = remaining;
        }

        @Override public int read() throws IOException {
            if (remaining == 0) return -1;
            int value = input.read();
            if (value != -1) remaining--;
            return value;
        }

        @Override public int read(byte[] buffer, int offset, int length) throws IOException {
            if (offset < 0 || length < 0 || length > buffer.length - offset) {
                throw new IndexOutOfBoundsException();
            }
            if (length == 0) return 0;
            if (remaining == 0) return -1;
            int count = input.read(buffer, offset, (int) Math.min(remaining, length));
            if (count != -1) remaining -= count;
            return count;
        }

        // Seeks instead of reading, so the WebView's skip to the range start is cheap.
        @Override public long skip(long count) throws IOException {
            if (count <= 0) return 0;
            long skipped = Math.min(count, remaining);
            FileChannel channel = input.getChannel();
            channel.position(channel.position() + skipped);
            remaining -= skipped;
            return skipped;
        }

        @Override public int available() {
            return (int) Math.min(Integer.MAX_VALUE, remaining);
        }

        @Override public void close() throws IOException {
            input.close();
        }
    }
}
