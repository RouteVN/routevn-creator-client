package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ImportDownloaderTest {
    private static final long LIMIT = 1_000_000;

    private TestHttpServer server;

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    @Before
    public void startServer() throws IOException {
        server = new TestHttpServer();
    }

    @After
    public void stopServer() {
        server.close();
    }

    private static byte[] bytes(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private File destination() throws IOException {
        return new File(folder.newFolder(), "archive.zip");
    }

    private static void assertCode(String code, String detailPart, ProjectImportException error) {
        assertEquals(code, error.code);
        assertTrue(error.getMessage(), error.getMessage().startsWith(code + ": "));
        if (detailPart != null) {
            assertTrue(error.getMessage(), error.getMessage().contains(detailPart));
        }
    }

    /** Expects the download to fail with {@code code} and leave no file behind. */
    private void assertDownloadFails(String code, String detailPart, String url, long maxBytes) throws IOException {
        File destination = destination();
        assertCode(code, detailPart, assertThrows(
            ProjectImportException.class,
            () -> new ImportDownloader().download(url, destination, maxBytes, ImportProgress.NONE)
        ));
        assertFalse(destination.exists());
    }

    @Test public void validatesUrls() throws Exception {
        for (String url : new String[] {
            "https://example.com/one.zip", "http://localhost:3001/one.zip", "http://[::1]:8080/one.zip",
        }) {
            assertEquals(url, ImportDownloader.validateUrl(url).toString());
        }
        for (String url : new String[] { "http://example.com/one.zip", "file:///tmp/one.zip", "https://", "not a url" }) {
            assertCode("invalidUrl", null, assertThrows(
                "url accepted: " + url,
                ProjectImportException.class,
                () -> ImportDownloader.validateUrl(url)
            ));
        }
    }

    @Test public void followsRedirectsToANewFileAndReturnsTheFinalUrlAndContentDisposition() throws Exception {
        byte[] body = bytes("Project One archive bytes");
        String header = "attachment; filename*=UTF-8''Project%20One.zip; filename=\"Project One.zip\"";
        server.setHandler(requestLine -> requestLine.contains("/redirect")
            ? TestHttpServer.Response.redirect("/final.zip")
            : new TestHttpServer.Response(200, body, "Content-Disposition: " + header));
        File destination = destination();

        ImportDownloader.Result result = new ImportDownloader()
            .download(server.url("/redirect"), destination, LIMIT, ImportProgress.NONE);

        assertArrayEquals(body, Files.readAllBytes(destination.toPath()));
        assertEquals(body.length, result.bytes);
        assertEquals(server.url("/final.zip"), result.finalUrl);
        assertEquals(header, result.contentDisposition);
    }

    @Test public void everyRedirectHopIsRevalidated() throws Exception {
        for (String target : new String[] { "ftp://example.com/one.zip", "http://example.com/one.zip" }) {
            server.setHandler(requestLine -> TestHttpServer.Response.redirect(target));
            assertDownloadFails("invalidUrl", null, server.url("/hop"), LIMIT);
        }
    }

    @Test public void followsAtMostFiveRedirects() throws Exception {
        byte[] body = bytes("done");
        // /hop/N redirects to /hop/N+1 until /hop/5 answers.
        server.setHandler(requestLine -> {
            int hop = Integer.parseInt(requestLine.split(" ")[1].replace("/hop/", ""));
            return hop < 5 ? TestHttpServer.Response.redirect("/hop/" + (hop + 1)) : TestHttpServer.Response.ok(body);
        });
        File destination = destination();

        new ImportDownloader().download(server.url("/hop/0"), destination, LIMIT, ImportProgress.NONE);

        assertArrayEquals(body, Files.readAllBytes(destination.toPath()));
        assertDownloadFails("invalidUrl", "redirects", server.url("/hop/-1"), LIMIT);
    }

    @Test public void urlsWithCredentialsFailBeforeAnythingIsCreated() throws Exception {
        assertDownloadFails("invalidUrl", "credentials", "http://user:pass@127.0.0.1:" + server.port() + "/a.zip", LIMIT);
    }

    @Test public void aFailingStatusFailsWithoutProgressAndRemovesTheFile() throws Exception {
        server.setHandler(requestLine -> new TestHttpServer.Response(404, new byte[0]));
        File destination = destination();
        List<long[]> events = new ArrayList<>();
        ImportProgress progress = new ImportProgress((current, total) -> events.add(new long[] { current, total }));

        assertCode("downloadFailed", "HTTP 404", assertThrows(
            ProjectImportException.class,
            () -> new ImportDownloader().download(server.url("/missing.zip"), destination, LIMIT, progress)
        ));

        assertFalse(destination.exists());
        assertTrue(events.isEmpty());
    }

    @Test public void tooLargeADownloadFailsAndRemovesThePartialFile() throws Exception {
        server.setHandler(requestLine -> TestHttpServer.Response.ok(new byte[4096]));
        assertDownloadFails("archiveTooLarge", null, server.url("/big.zip"), 1024);
    }

    @Test public void reportsProgressFromZeroToTheFinalByteCount() throws Exception {
        byte[] body = new byte[200_000];
        server.setHandler(requestLine -> TestHttpServer.Response.ok(body));
        AtomicLong clock = new AtomicLong();
        List<long[]> events = new ArrayList<>();
        // Every call is 100 ms after the last one, so nothing is throttled.
        ImportProgress progress = new ImportProgress(
            (current, total) -> events.add(new long[] { current, total }),
            () -> clock.addAndGet(ImportProgress.MIN_INTERVAL_MS)
        );

        new ImportDownloader().download(server.url("/big.zip"), destination(), LIMIT, progress);

        assertEquals(0, events.get(0)[0]);
        long previous = -1;
        for (long[] event : events) {
            assertEquals(body.length, event[1]);
            assertTrue(event[0] >= previous);
            previous = event[0];
        }
        assertEquals(body.length, events.get(events.size() - 1)[0]);
        assertTrue("several chunks were reported", events.size() > 3);
    }
}
