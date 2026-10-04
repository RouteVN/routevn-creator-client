package com.routevn.creator;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/**
 * Streams one URL to a new file; it knows nothing about what is downloaded.
 * Only https is allowed (http for loopback hosts), without credentials;
 * redirects are followed by hand so every hop passes the same check, at most
 * five times. The bytes are saved as the server sends them, the body is never
 * held in memory and the partial file is removed on any failure. Errors are
 * invalidUrl, downloadFailed, tooLarge and writeFailed.
 */
final class FileDownloader {
    static final class Result {
        final String finalUrl;
        /** Raw Content-Disposition header, or undefined; JavaScript parses it. */
        final String contentDisposition;
        final long bytes;

        Result(String finalUrl, String contentDisposition, long bytes) {
            this.finalUrl = finalUrl;
            this.contentDisposition = contentDisposition;
            this.bytes = bytes;
        }
    }

    private static final int MAX_REDIRECTS = 5;

    private final int connectTimeoutMs;
    private final int readTimeoutMs;

    FileDownloader() {
        this(15_000, 30_000);
    }

    FileDownloader(int connectTimeoutMs, int readTimeoutMs) {
        this.connectTimeoutMs = connectTimeoutMs;
        this.readTimeoutMs = readTimeoutMs;
    }

    /** Downloads to {@code destination}, which must not exist yet. */
    Result download(String url, File destination, long maxBytes, TransferProgress progress)
        throws CodedException {
        URI uri = validateUrl(url);
        TempFolders.createNewFile(destination);
        try {
            return fetch(uri, destination, maxBytes, progress);
        } catch (Throwable error) {
            destination.delete();
            throw error;
        }
    }

    private Result fetch(URI start, File destination, long maxBytes, TransferProgress progress)
        throws CodedException {
        URI uri = start;
        for (int redirects = 0; ; redirects += 1) {
            HttpURLConnection connection;
            try {
                connection = (HttpURLConnection) uri.toURL().openConnection();
            } catch (IOException error) {
                throw new CodedException("downloadFailed", "Cannot open the URL.");
            }
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(connectTimeoutMs);
            connection.setReadTimeout(readTimeoutMs);
            connection.setRequestProperty("Accept-Encoding", "identity");
            try {
                int status = connection.getResponseCode();
                if (status >= 200 && status < 300) {
                    return save(connection, uri, destination, maxBytes, progress);
                }
                if (status < 300 || status >= 400) {
                    throw new CodedException(
                        "downloadFailed",
                        "HTTP " + status + " from " + uri.getHost()
                    );
                }
                String location = connection.getHeaderField("Location");
                if (location == null || location.trim().isEmpty()) {
                    throw new CodedException(
                        "downloadFailed",
                        "HTTP " + status + " redirect has no Location."
                    );
                }
                if (redirects == MAX_REDIRECTS) {
                    throw new CodedException(
                        "downloadFailed",
                        "Too many redirects (HTTP " + status + ")."
                    );
                }
                try {
                    uri = validateUrl(uri.resolve(location.trim()).toString());
                } catch (IllegalArgumentException error) {
                    throw new CodedException("downloadFailed", "Invalid redirect target.");
                }
            } catch (IOException error) {
                throw new CodedException(
                    "downloadFailed",
                    "Download failed: " + error.getClass().getSimpleName()
                );
            } finally {
                connection.disconnect();
            }
        }
    }

    private static Result save(
        HttpURLConnection connection,
        URI uri,
        File destination,
        long maxBytes,
        TransferProgress progress
    ) throws IOException, CodedException {
        long total = Math.max(0, connection.getContentLengthLong());
        if (total > maxBytes) {
            throw tooLarge(maxBytes);
        }
        // The headers have arrived, so the first event can carry the total.
        progress.report(0, total);
        long bytes = 0;
        try (InputStream input = connection.getInputStream()) {
            byte[] buffer = new byte[64 * 1024];
            // Failing to read the response is a download failure, so it
            // escapes as an IOException; failing to write the file is not.
            try (OutputStream output = new FileOutputStream(destination)) {
                int read;
                while ((read = input.read(buffer)) != -1) {
                    bytes += read;
                    if (bytes > maxBytes) {
                        throw tooLarge(maxBytes);
                    }
                    try {
                        output.write(buffer, 0, read);
                    } catch (IOException error) {
                        throw writeFailed(error);
                    }
                    progress.report(bytes, total);
                }
            } catch (FileNotFoundException error) {
                throw writeFailed(error);
            }
        }
        progress.finish(bytes, total);
        return new Result(uri.toString(), connection.getHeaderField("Content-Disposition"), bytes);
    }

    private static CodedException writeFailed(IOException error) {
        return new CodedException(
            "writeFailed",
            "Cannot write the download: " + error.getClass().getSimpleName()
        );
    }

    private static CodedException tooLarge(long maxBytes) {
        return new CodedException("tooLarge", "Download exceeds " + maxBytes + " bytes.");
    }

    /** Returns the parsed URI, or throws invalidUrl for anything but https or loopback http. */
    static URI validateUrl(String url) throws CodedException {
        URI uri;
        try {
            uri = new URI(url == null ? "" : url.trim());
        } catch (URISyntaxException error) {
            throw new CodedException("invalidUrl", "URL cannot be parsed.");
        }
        if (uri.getRawUserInfo() != null) {
            throw new CodedException("invalidUrl", "URL must not contain credentials.");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (host.startsWith("[") && host.endsWith("]")) {
            host = host.substring(1, host.length() - 1);
        }
        boolean loopback = host.equals("localhost") || host.equals("127.0.0.1") || host.equals("::1");
        if (!scheme.equals("https") && !(scheme.equals("http") && loopback)) {
            throw new CodedException(
                "invalidUrl",
                "Only https URLs or loopback http URLs are allowed."
            );
        }
        if (host.isEmpty()) {
            throw new CodedException("invalidUrl", "URL is missing a host.");
        }
        if (uri.getPort() != -1 && (uri.getPort() < 1 || uri.getPort() > 65535)) {
            throw new CodedException("invalidUrl", "URL port is invalid.");
        }
        return uri;
    }
}
