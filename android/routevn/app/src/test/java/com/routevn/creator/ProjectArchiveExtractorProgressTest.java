package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.File;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ProjectArchiveExtractorProgressTest {
    private static final String MARKER = "ROUTEVN_EXPORT_INCOMPLETE.txt";
    private static final int UNIX_REGULAR = 0100644;

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private static final class Recorder implements ProjectImportProgress {
        final List<String> stages = new ArrayList<>();
        final List<long[]> events = new ArrayList<>();
        final List<Boolean> finishes = new ArrayList<>();

        @Override
        public void report(String stage, long current, long total) {
            record(stage, current, total, false);
        }

        @Override
        public void finish(String stage, long current, long total) {
            record(stage, current, total, true);
        }

        private void record(String stage, long current, long total, boolean finish) {
            stages.add(stage);
            events.add(new long[] { current, total });
            finishes.add(finish);
        }
    }

    private Recorder extract(TestZipArchive zip) throws Exception {
        File archive = folder.newFile("archive.zip");
        Files.write(archive.toPath(), zip.toBytes());
        Recorder recorder = new Recorder();
        new ProjectArchiveExtractor().extract(
            archive,
            folder.newFolder("staging"),
            MARKER,
            recorder
        );
        return recorder;
    }

    private static byte[] filled(int size) {
        byte[] data = new byte[size];
        for (int index = 0; index < size; index += 1) {
            data[index] = (byte) (index % 251);
        }
        return data;
    }

    @Test public void reportsBytesWrittenOfTheDeclaredTotal() throws Exception {
        Recorder recorder = extract(new TestZipArchive()
            .addStored("project.db", new byte[] { 1, 2, 3 }, UNIX_REGULAR)
            .addDeflated("files/one", filled(10_000), UNIX_REGULAR)
            .addStored("files/two", filled(5), UNIX_REGULAR));

        long total = 3 + 10_000 + 5;
        assertFalse(recorder.events.isEmpty());
        assertEquals(0, recorder.events.get(0)[0]);
        long previous = -1;
        for (long[] event : recorder.events) {
            assertEquals(total, event[1]);
            assertTrue("never beyond the total", event[0] <= total);
            assertTrue("never goes backwards", event[0] >= previous);
            previous = event[0];
        }
        int last = recorder.events.size() - 1;
        assertEquals(total, recorder.events.get(last)[0]);
        assertTrue(recorder.finishes.get(last));
        for (String stage : recorder.stages) {
            assertEquals("extracting", stage);
        }
    }

    @Test public void largeEntriesAdvanceInChunks() throws Exception {
        Recorder recorder = extract(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files/big", filled(300_000), UNIX_REGULAR));

        long intermediate = 0;
        for (int index = 0; index < recorder.events.size(); index += 1) {
            long current = recorder.events.get(index)[0];
            if (current > 1 && current < 300_001) {
                intermediate += 1;
            }
        }
        assertTrue("expected several chunk events, saw " + intermediate, intermediate >= 3);
    }

    @Test public void skippedEntriesDoNotCountTowardTheTotal() throws Exception {
        Recorder recorder = extract(new TestZipArchive()
            .addStored("project.db", new byte[] { 1, 2 }, UNIX_REGULAR)
            .addStored("readme.txt", filled(5_000), UNIX_REGULAR));

        assertEquals(2, recorder.events.get(0)[1]);
    }

    @Test public void staysSilentWithoutAProgressSink() throws Exception {
        File archive = folder.newFile("plain.zip");
        Files.write(
            archive.toPath(),
            new TestZipArchive()
                .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
                .toBytes()
        );
        File staging = folder.newFolder("plain-staging");
        new ProjectArchiveExtractor().extract(archive, staging, MARKER);
        assertTrue(new File(staging, "project.db").isFile());
    }
}
