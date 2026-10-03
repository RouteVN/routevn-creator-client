package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ProjectArchiveDownloaderTest {
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

    private static byte[] bodyOf(String text) {
        return text.getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    private File downloadFile() throws IOException {
        return new File(folder.newFolder("download"), "archive.zip");
    }

    private void assertCode(ProjectImportException error, String code, String detailPart) {
        assertEquals(code, error.code);
        assertTrue(
            "message should start with the code: " + error.getMessage(),
            error.getMessage().startsWith(code + ": ")
        );
        if (detailPart != null) {
            assertTrue(
                "message should contain " + detailPart + ": " + error.getMessage(),
                error.getMessage().contains(detailPart)
            );
        }
    }

    @Test public void acceptsHttpsUrls() throws Exception {
        assertEquals(
            "example.com",
            ProjectArchiveDownloader.validateUrl("https://example.com/projects/one.zip").getHost()
        );
    }

    @Test public void acceptsLoopbackHttpUrls() throws Exception {
        ProjectArchiveDownloader.validateUrl("http://localhost/one.zip");
        ProjectArchiveDownloader.validateUrl("http://localhost:3001/one.zip");
        ProjectArchiveDownloader.validateUrl("http://127.0.0.1:8080/one.zip");
        ProjectArchiveDownloader.validateUrl("http://[::1]:8080/one.zip");
    }

    @Test public void rejectsNonLoopbackHttp() throws Exception {
        try {
            ProjectArchiveDownloader.validateUrl("http://example.com/one.zip");
            fail("non-loopback http accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "invalidUrl", null);
        }
    }

    @Test public void rejectsNonHttpSchemes() throws Exception {
        for (String url : new String[] {
            "ftp://example.com/one.zip",
            "file:///tmp/one.zip",
            "javascript:alert(1)",
        }) {
            try {
                ProjectArchiveDownloader.validateUrl(url);
                fail("scheme accepted: " + url);
            } catch (ProjectImportException error) {
                assertCode(error, "invalidUrl", null);
            }
        }
    }

    @Test public void rejectsUrlsWithCredentials() throws Exception {
        try {
            ProjectArchiveDownloader.validateUrl("https://user:pass@example.com/one.zip");
            fail("credentials accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "invalidUrl", "credentials");
        }
    }

    @Test public void rejectsUnparsableAndSchemelessUrls() throws Exception {
        for (String url : new String[] { "", "   ", "not a url", "example.com/one.zip" }) {
            try {
                ProjectArchiveDownloader.validateUrl(url);
                fail("url accepted: " + url);
            } catch (ProjectImportException error) {
                assertCode(error, "invalidUrl", null);
            }
        }
    }

    @Test public void downloadsAZipToDisk() throws Exception {
        byte[] archive = bodyOf("fake zip bytes");
        server.setHandler(requestLine -> TestHttpServer.Response.ok(archive));
        File output = downloadFile();
        new ProjectArchiveDownloader().download(server.url("/ok.zip"), output);
        assertArrayEquals(archive, Files.readAllBytes(output.toPath()));
    }

    @Test public void reportsDownloadProgressAgainstContentLength() throws Exception {
        byte[] archive = new byte[200_000];
        for (int index = 0; index < archive.length; index += 1) {
            archive[index] = (byte) (index % 251);
        }
        server.setHandler(requestLine -> TestHttpServer.Response.ok(archive));
        java.util.List<long[]> events = new java.util.ArrayList<>();
        java.util.List<Boolean> finishes = new java.util.ArrayList<>();
        ProjectImportProgress progress = new ProjectImportProgress() {
            @Override public void report(String stage, long current, long total) {
                assertEquals("downloading", stage);
                events.add(new long[] { current, total });
                finishes.add(false);
            }

            @Override public void finish(String stage, long current, long total) {
                assertEquals("downloading", stage);
                events.add(new long[] { current, total });
                finishes.add(true);
            }
        };

        new ProjectArchiveDownloader().download(server.url("/big.zip"), downloadFile(), progress);

        assertEquals(0, events.get(0)[0]);
        long previous = -1;
        for (long[] event : events) {
            assertEquals(archive.length, event[1]);
            assertTrue(event[0] >= previous);
            previous = event[0];
        }
        int last = events.size() - 1;
        assertEquals(archive.length, events.get(last)[0]);
        assertTrue(finishes.get(last));
        assertTrue("several chunks were reported", events.size() > 3);
    }

    @Test public void nonSuccessStatusFailsWithStatusCode() throws Exception {
        server.setHandler(requestLine -> TestHttpServer.Response.status(404, null));
        try {
            new ProjectArchiveDownloader().download(server.url("/missing.zip"), downloadFile());
            fail("404 accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "downloadFailed", "404");
        }
    }

    @Test public void followsLoopbackRedirectsAndDownloads() throws Exception {
        byte[] archive = bodyOf("redirected zip");
        server.setHandler(requestLine ->
            requestLine.contains("/redirect")
                ? TestHttpServer.Response.redirect(server.url("/final.zip"))
                : TestHttpServer.Response.ok(archive));
        File output = downloadFile();
        new ProjectArchiveDownloader().download(server.url("/redirect"), output);
        assertArrayEquals(archive, Files.readAllBytes(output.toPath()));
    }

    @Test public void everyRedirectHopIsRevalidated() throws Exception {
        server.setHandler(requestLine ->
            TestHttpServer.Response.redirect("http://example.com/one.zip"));
        try {
            new ProjectArchiveDownloader().download(server.url("/hop"), downloadFile());
            fail("unsafe redirect accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "invalidUrl", null);
        }
    }

    @Test public void redirectLoopStopsAfterFiveHops() throws Exception {
        server.setHandler(requestLine -> TestHttpServer.Response.redirect(server.url("/loop")));
        try {
            new ProjectArchiveDownloader().download(server.url("/loop"), downloadFile());
            fail("redirect loop accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "invalidUrl", "redirects");
        }
    }

    @Test public void oversizedDownloadsAbortAndDeleteThePartialFile() throws Exception {
        byte[] body = new byte[4096];
        server.setHandler(requestLine -> TestHttpServer.Response.ok(body));
        File output = downloadFile();
        try {
            new ProjectArchiveDownloader(1024, 5000, 5000)
                .download(server.url("/big.zip"), output);
            fail("oversize accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "archiveTooLarge", null);
        }
        assertFalse(output.exists());
    }

    @Test public void stalledResponseTimesOut() throws Exception {
        server.setHandler(requestLine ->
            TestHttpServer.Response.ok(bodyOf("late")).delayed(1500));
        try {
            new ProjectArchiveDownloader(65536, 1000, 300)
                .download(server.url("/stall.zip"), downloadFile());
            fail("stalled download accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "downloadFailed", null);
        }
    }

    @Test public void suggestArchiveNameUsesTheLastPathSegment() {
        assertEquals(
            "one.zip",
            ProjectArchiveDownloader.suggestArchiveName("https://example.com/a/one.zip")
        );
        assertEquals(
            "one.zip",
            ProjectArchiveDownloader.suggestArchiveName("https://example.com/one.zip?token=1")
        );
        assertNull(ProjectArchiveDownloader.suggestArchiveName("https://example.com/"));
        assertNull(ProjectArchiveDownloader.suggestArchiveName("not a url"));
    }

    @Test public void networkFailureFailsCleanly() throws Exception {
        // Connection refused: nothing listens on this port.
        try {
            new ProjectArchiveDownloader().download("http://127.0.0.1:1/one.zip", downloadFile());
            fail("connection failure accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "downloadFailed", null);
        }
    }
}
