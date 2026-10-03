package com.routevn.creator;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLConnection;

/**
 * Rule C project archive download. Only https URLs are accepted; plain http
 * is allowed for loopback hosts (localhost, 127.0.0.1, [::1]) so local dev
 * servers keep working. Redirects are followed manually with
 * setInstanceFollowRedirects(false) so every hop is re-validated against the
 * same scheme rule, at most five times. The archive is streamed straight to
 * a temp file (never buffered in memory) and aborted once it exceeds the
 * size cap.
 */
class ProjectArchiveDownloader {
    static final long DEFAULT_MAX_ARCHIVE_BYTES = 4L * 1024 * 1024 * 1024;
    private static final int MAX_REDIRECTS = 5;
    private static final int DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
    private static final int DEFAULT_READ_TIMEOUT_MS = 30_000;

    private final long maxArchiveBytes;
    private final int connectTimeoutMs;
    private final int readTimeoutMs;

    ProjectArchiveDownloader() {
        this(DEFAULT_MAX_ARCHIVE_BYTES, DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_READ_TIMEOUT_MS);
    }

    ProjectArchiveDownloader(long maxArchiveBytes, int connectTimeoutMs, int readTimeoutMs) {
        this.maxArchiveBytes = maxArchiveBytes;
        this.connectTimeoutMs = connectTimeoutMs;
        this.readTimeoutMs = readTimeoutMs;
    }

    /**
     * Validates the URL against Rule C and returns the parsed URI. Throws
     * invalidUrl for non-http(s) schemes, non-loopback http, credentials in
     * the URL, or unparsable input.
     */
    static URI validateUrl(String urlSpec) throws ProjectImportException {
        String normalizedUrl = urlSpec == null ? "" : urlSpec.trim();
        URI uri;
        try {
            uri = new URI(normalizedUrl);
        } catch (URISyntaxException error) {
            throw new ProjectImportException("invalidUrl", "URL cannot be parsed.");
        }

        if (uri.getRawUserInfo() != null) {
            throw new ProjectImportException("invalidUrl", "URL must not contain credentials.");
        }

        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(java.util.Locale.ROOT);
        String host = uri.getHost();
        if (host != null) {
            host = host.toLowerCase(java.util.Locale.ROOT);
        }
        if ("https".equals(scheme)) {
            if (host == null || host.isEmpty()) {
                throw new ProjectImportException("invalidUrl", "URL is missing a host.");
            }
        } else if ("http".equals(scheme)) {
            if (!isLoopbackHost(host)) {
                throw new ProjectImportException(
                    "invalidUrl",
                    "Only https URLs or loopback http URLs are allowed."
                );
            }
        } else {
            throw new ProjectImportException(
                "invalidUrl",
                "URL scheme must be https" + (scheme.isEmpty() ? "" : ", not " + scheme) + "."
            );
        }

        if (uri.getPort() != -1 && (uri.getPort() < 1 || uri.getPort() > 65535)) {
            throw new ProjectImportException("invalidUrl", "URL port is invalid.");
        }

        return uri;
    }

    private static boolean isLoopbackHost(String host) {
        if (host == null || host.isEmpty()) {
            return false;
        }
        String bareHost = host.startsWith("[") && host.endsWith("]")
            ? host.substring(1, host.length() - 1)
            : host;
        return "localhost".equals(bareHost) ||
            "127.0.0.1".equals(bareHost) ||
            "::1".equals(bareHost);
    }

    /**
     * Suggests a display name for the downloaded archive from the last URL
     * path segment, or null when the URL has none.
     */
    static String suggestArchiveName(String urlSpec) {
        try {
            URI uri = new URI(urlSpec == null ? "" : urlSpec.trim());
            String path = uri.getPath();
            if (path == null) {
                return null;
            }
            String lastSegment = path.substring(path.lastIndexOf('/') + 1);
            return lastSegment.isEmpty() ? null : lastSegment;
        } catch (URISyntaxException error) {
            return null;
        }
    }

    /**
     * Downloads the archive to {@code outputFile}, which must not exist yet.
     * Partial output is deleted on every failure path.
     */
    void download(String urlSpec, File outputFile) throws ProjectImportException {
        download(urlSpec, outputFile, ProjectImportProgress.NONE);
    }

    /** Same as {@link #download(String, File)}, reporting "downloading" progress. */
    void download(String urlSpec, File outputFile, ProjectImportProgress progress)
        throws ProjectImportException {
        URI currentUri = validateUrl(urlSpec);
        int redirects = 0;
        while (true) {
            URLConnection connection;
            try {
                connection = currentUri.toURL().openConnection();
            } catch (IOException | IllegalArgumentException error) {
                throw new ProjectImportException("downloadFailed", "Cannot open the URL.");
            }
            if (!(connection instanceof HttpURLConnection)) {
                throw new ProjectImportException("invalidUrl", "URL scheme must be https.");
            }
            HttpURLConnection httpConnection = (HttpURLConnection) connection;
            httpConnection.setInstanceFollowRedirects(false);
            httpConnection.setConnectTimeout(connectTimeoutMs);
            httpConnection.setReadTimeout(readTimeoutMs);

            try {
                int status = httpConnection.getResponseCode();
                if (status >= 200 && status < 300) {
                    streamToArchiveFile(httpConnection, outputFile, progress);
                    return;
                }
                if (status >= 300 && status < 400) {
                    String location = httpConnection.getHeaderField("Location");
                    if (location == null || location.trim().isEmpty()) {
                        throw new ProjectImportException(
                            "downloadFailed",
                            "HTTP " + status + " redirect has no Location."
                        );
                    }
                    redirects += 1;
                    if (redirects > MAX_REDIRECTS) {
                        throw new ProjectImportException(
                            "invalidUrl",
                            "URL redirects more than " + MAX_REDIRECTS + " times."
                        );
                    }
                    URI nextUri;
                    try {
                        nextUri = currentUri.resolve(location.trim());
                    } catch (IllegalArgumentException error) {
                        throw new ProjectImportException("downloadFailed", "Invalid redirect target.");
                    }
                    // Every hop is re-validated against the same scheme rule.
                    currentUri = validateUrl(nextUri.toString());
                    continue;
                }
                throw new ProjectImportException(
                    "downloadFailed",
                    "HTTP " + status + " from " + describeTarget(currentUri)
                );
            } catch (ProjectImportException error) {
                deletePartialDownload(outputFile);
                throw error;
            } catch (IOException error) {
                deletePartialDownload(outputFile);
                throw new ProjectImportException(
                    "downloadFailed",
                    "Network error: " + error.getClass().getSimpleName()
                );
            } finally {
                httpConnection.disconnect();
            }
        }
    }

    private void streamToArchiveFile(
        HttpURLConnection connection,
        File outputFile,
        ProjectImportProgress progress
    ) throws ProjectImportException {
        File parentFile = outputFile.getParentFile();
        if (parentFile != null && !parentFile.exists() && !parentFile.mkdirs()) {
            throw new ProjectImportException("importFailed", "Cannot create download directory.");
        }

        try (
            InputStream input = connection.getInputStream();
            OutputStream output = new FileOutputStream(outputFile)
        ) {
            byte[] buffer = new byte[64 * 1024];
            long contentLength = Math.max(0, connection.getContentLengthLong());
            long totalBytes = 0;
            int read;
            progress.report("downloading", 0, contentLength);
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
                totalBytes += read;
                if (totalBytes > maxArchiveBytes) {
                    throw new ProjectImportException(
                        "archiveTooLarge",
                        "Download exceeds " + maxArchiveBytes + " bytes."
                    );
                }
                progress.report("downloading", totalBytes, contentLength);
            }
            progress.finish("downloading", totalBytes, contentLength);
        } catch (IOException error) {
            deletePartialDownload(outputFile);
            throw new ProjectImportException(
                "downloadFailed",
                "Network error: " + error.getClass().getSimpleName()
            );
        } catch (ProjectImportException error) {
            deletePartialDownload(outputFile);
            throw error;
        }
    }

    private static void deletePartialDownload(File outputFile) {
        if (outputFile.exists() && !outputFile.delete()) {
            outputFile.deleteOnExit();
        }
    }

    private static String describeTarget(URI uri) {
        String host = uri.getHost();
        return host == null ? uri.toString() : host;
    }
}
