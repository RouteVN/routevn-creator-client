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

    private static ProjectImportException assertFails(String code, String detailPart, ProjectImportException error) {
        assertEquals(code, error.code);
        assertTrue(error.getMessage(), error.getMessage().startsWith(code + ": "));
        if (detailPart != null) {
            assertTrue(error.getMessage(), error.getMessage().contains(detailPart));
        }
        return error;
    }

    private ProjectImportException downloadFailure(String url, File destination) {
        return assertThrows(
            ProjectImportException.class,
            () -> new ImportDownloader().download(url, destination, LIMIT, ImportProgress.NONE)
        );
    }

    @Test public void validatesUrls() throws Exception {
        assertEquals("example.com", ImportDownloader.validateUrl("https://example.com/one.zip").getHost());
        ImportDownloader.validateUrl("http://localhost:3001/one.zip");
        ImportDownloader.validateUrl("http://127.0.0.1:8080/one.zip");
        ImportDownloader.validateUrl("http://[::1]:8080/one.zip");
        for (String url : new String[] {
            "http://example.com/one.zip", "ftp://example.com/one.zip", "file:///tmp/one.zip",
            "javascript:alert(1)", "https://user:pass@example.com/one.zip", "https://", "",
            "not a url", "example.com/one.zip", "https://example.com:99999/one.zip",
        }) {
            assertFails("invalidUrl", null, assertThrows(
                "url accepted: " + url,
                ProjectImportException.class,
                () -> ImportDownloader.validateUrl(url)
            ));
        }
    }

    @Test public void downloadsToANewFile() throws Exception {
        byte[] body = bytes("Project One archive bytes");
        server.setHandler(requestLine -> TestHttpServer.Response.ok(body));
        File destination = destination();

        ImportDownloader.Result result = new ImportDownloader()
            .download(server.url("/ok.zip"), destination, LIMIT, ImportProgress.NONE);

        assertArrayEquals(body, Files.readAllBytes(destination.toPath()));
        assertEquals(body.length, result.bytes);
        assertEquals(server.url("/ok.zip"), result.finalUrl);
        assertNull(result.contentDisposition);
    }

    @Test public void passesTheRawContentDispositionHeaderThrough() throws Exception {
        String header = "attachment; filename*=UTF-8''Project%20One.zip; filename=\"Project One.zip\"";
        server.setHandler(requestLine -> {
            TestHttpServer.Response response = TestHttpServer.Response.ok(bytes("zip"));
            response.headers.put("Content-Disposition", header);
            return response;
        });

        ImportDownloader.Result result = new ImportDownloader()
            .download(server.url("/ok.zip"), destination(), LIMIT, ImportProgress.NONE);

        assertEquals(header, result.contentDisposition);
    }

    @Test public void followsRedirectsAndReportsTheFinalUrl() throws Exception {
        byte[] body = bytes("redirected");
        server.setHandler(requestLine ->
            requestLine.contains("/redirect")
                ? TestHttpServer.Response.redirect("/final.zip")
                : TestHttpServer.Response.ok(body));
        File destination = destination();

        ImportDownloader.Result result = new ImportDownloader()
            .download(server.url("/redirect"), destination, LIMIT, ImportProgress.NONE);

        assertEquals(server.url("/final.zip"), result.finalUrl);
        assertArrayEquals(body, Files.readAllBytes(destination.toPath()));
    }

    @Test public void everyRedirectHopIsRevalidated() throws Exception {
        for (String target : new String[] { "ftp://example.com/one.zip", "http://example.com/one.zip" }) {
            server.setHandler(requestLine -> TestHttpServer.Response.redirect(target));
            File destination = destination();
            assertFails("invalidUrl", null, downloadFailure(server.url("/hop"), destination));
            assertFalse(destination.exists());
        }
    }

    @Test public void followsAtMostFiveRedirects() throws Exception {
        byte[] body = bytes("done");
        for (int redirects : new int[] { 5, 6 }) {
            server.setHandler(requestLine -> {
                int hop = Integer.parseInt(requestLine.split(" ")[1].replace("/hop/", ""));
                return hop < redirects
                    ? TestHttpServer.Response.redirect("/hop/" + (hop + 1))
                    : TestHttpServer.Response.ok(body);
            });
            File destination = destination();
            if (redirects == 5) {
                new ImportDownloader().download(server.url("/hop/0"), destination, LIMIT, ImportProgress.NONE);
                assertArrayEquals(body, Files.readAllBytes(destination.toPath()));
            } else {
                assertFails("invalidUrl", "redirects", downloadFailure(server.url("/hop/0"), destination));
                assertFalse(destination.exists());
            }
        }
    }

    @Test public void urlsWithCredentialsFailBeforeAnythingIsCreated() throws Exception {
        File destination = destination();
        assertFails(
            "invalidUrl",
            "credentials",
            downloadFailure("http://user:pass@127.0.0.1:" + server.port() + "/a.zip", destination)
        );
        assertFalse(destination.exists());
    }

    @Test public void nonSuccessStatusFailsWithTheStatusAndRemovesTheFile() throws Exception {
        server.setHandler(requestLine -> TestHttpServer.Response.status(404, null));
        File destination = destination();
        assertFails("downloadFailed", "HTTP 404", downloadFailure(server.url("/missing.zip"), destination));
        assertFalse(destination.exists());

        server.setHandler(requestLine -> TestHttpServer.Response.status(503, bytes("busy")));
        assertFails("downloadFailed", "HTTP 503", downloadFailure(server.url("/busy.zip"), destination()));
    }

    @Test public void noProgressIsSentUntilTheResponseHeadersArrive() throws Exception {
        server.setHandler(requestLine -> TestHttpServer.Response.status(404, null));
        List<long[]> events = new ArrayList<>();
        ImportProgress progress = new ImportProgress((current, total) -> events.add(new long[] { current, total }));

        assertThrows(
            ProjectImportException.class,
            () -> new ImportDownloader().download(server.url("/missing.zip"), destination(), LIMIT, progress)
        );

        assertTrue(events.isEmpty());
    }

    @Test public void tooLargeADownloadFailsAndRemovesThePartialFile() throws Exception {
        server.setHandler(requestLine -> TestHttpServer.Response.ok(new byte[4096]));
        File destination = destination();
        ProjectImportException error = assertThrows(
            ProjectImportException.class,
            () -> new ImportDownloader().download(server.url("/big.zip"), destination, 1024, ImportProgress.NONE)
        );
        assertFails("archiveTooLarge", null, error);
        assertFalse(destination.exists());
    }

    @Test public void anExistingDestinationIsAnErrorAndStaysUntouched() throws Exception {
        server.setHandler(requestLine -> TestHttpServer.Response.ok(bytes("new")));
        File destination = destination();
        Files.write(destination.toPath(), bytes("old"));

        assertFails("importFailed", "exists", downloadFailure(server.url("/ok.zip"), destination));

        assertArrayEquals(bytes("old"), Files.readAllBytes(destination.toPath()));
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

    @Test public void aStalledResponseTimesOut() throws Exception {
        server.setHandler(requestLine -> TestHttpServer.Response.ok(bytes("late")).delayed(1500));
        File destination = destination();
        ProjectImportException error = assertThrows(
            ProjectImportException.class,
            () -> new ImportDownloader(1000, 300)
                .download(server.url("/stall.zip"), destination, LIMIT, ImportProgress.NONE)
        );
        assertFails("downloadFailed", null, error);
        assertFalse(destination.exists());
    }

    @Test public void aRefusedConnectionFailsCleanly() throws Exception {
        File destination = destination();
        assertFails("downloadFailed", null, downloadFailure("http://127.0.0.1:1/one.zip", destination));
        assertFalse(destination.exists());
    }
}
