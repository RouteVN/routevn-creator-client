package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ProjectArchiveExtractorTest {
    private static final String MARKER = "ROUTEVN_EXPORT_INCOMPLETE.txt";
    private static final int UNIX_REGULAR = 0100644;

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private File archive(TestZipArchive zip) throws IOException {
        File file = folder.newFile("archive.zip");
        Files.write(file.toPath(), zip.toBytes());
        return file;
    }

    private File extract(TestZipArchive zip) throws Exception {
        return extract(zip, new ProjectArchiveExtractor());
    }

    private File extract(TestZipArchive zip, ProjectArchiveExtractor extractor) throws Exception {
        File staging = folder.newFolder("staging");
        extractor.extract(archive(zip), staging, MARKER);
        return staging;
    }

    private void assertCode(ProjectImportException error, String code) {
        assertEquals(code, error.code);
        assertTrue(
            "message should start with the code: " + error.getMessage(),
            error.getMessage().startsWith(code + ": ")
        );
    }

    private ProjectImportException extractFailing(TestZipArchive zip) throws Exception {
        try {
            extract(zip);
            fail("extraction accepted an invalid archive");
            return null;
        } catch (ProjectImportException error) {
            return error;
        }
    }

    @Test public void zip64DeclaredTotalOverflowIsRejectedUpFront() throws Exception {
        File file = archive(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addZip64("files/one", new byte[] { 2 }, UNIX_REGULAR, 1L << 62, 1)
            .addZip64("files/two", new byte[] { 3 }, UNIX_REGULAR, 1L << 62, 1));
        File staging = folder.newFolder("staging-overflow");
        try {
            new ProjectArchiveExtractor().extract(file, staging, MARKER);
            fail("overflowing declared total accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "archiveTooLarge");
        }
        assertFalse(staging.toPath().resolve("files").toFile().exists());
    }

    @Test public void largeExtraFieldAndCommentAreAccepted() throws Exception {
        byte[] extra = new byte[3000];
        Arrays.fill(extra, (byte) 'x');
        byte[] comment = new byte[5000];
        Arrays.fill(comment, (byte) 'c');
        File staging = extract(new TestZipArchive()
            .addStoredRawName(
                "project.db".getBytes(StandardCharsets.UTF_8),
                new byte[] { 9 },
                UNIX_REGULAR,
                0x800,
                extra,
                comment
            ));
        assertArrayEquals(
            new byte[] { 9 },
            Files.readAllBytes(staging.toPath().resolve("project.db"))
        );
    }

    @Test public void legacyByteNamesStayDistinctAndUtf8FlagRoundTrips() throws Exception {
        // Bit 11 clear: bytes 0x84 and 0x94 decode bijectively under
        // ISO-8859-1, so the two names must not collapse into duplicates.
        File staging = extract(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStoredRawName(
                new byte[] { 'j', 'u', 'n', 'k', (byte) 0x84 },
                new byte[] { 2 },
                UNIX_REGULAR,
                0,
                new byte[0],
                new byte[0]
            )
            .addStoredRawName(
                new byte[] { 'j', 'u', 'n', 'k', (byte) 0x94 },
                new byte[] { 3 },
                UNIX_REGULAR,
                0,
                new byte[0],
                new byte[0]
            ));
        assertTrue(staging.toPath().resolve("project.db").toFile().isFile());

        TestZipArchive utf8 = new TestZipArchive()
            .addStored("project.db", new byte[] { 4 }, UNIX_REGULAR)
            .addStoredRawName(
                "files/ünï.png".getBytes(StandardCharsets.UTF_8),
                new byte[] { 5 },
                UNIX_REGULAR,
                0x800,
                new byte[0],
                new byte[0]
            );
        File archiveUtf8 = folder.newFile("archive-utf8.zip");
        Files.write(archiveUtf8.toPath(), utf8.toBytes());
        File stagingUtf8 = folder.newFolder("staging-utf8");
        new ProjectArchiveExtractor().extract(archiveUtf8, stagingUtf8, MARKER);
        assertArrayEquals(
            new byte[] { 5 },
            Files.readAllBytes(stagingUtf8.toPath().resolve("files/ünï.png"))
        );
    }

    @Test public void corruptedLocalHeaderLeavesNoStagedFile() throws Exception {
        byte[] data = new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files/abc", new byte[] { 2 }, UNIX_REGULAR)
            .toBytes();
        int localName = indexOf(data, "files/abc".getBytes(StandardCharsets.UTF_8));
        assertTrue(localName >= 0);
        writeLe32(data, localName - 30, 0x1B1C1D1EL);
        File archive = folder.newFile("archive-local.zip");
        Files.write(archive.toPath(), data);
        File staging = folder.newFolder("staging-local");
        try {
            new ProjectArchiveExtractor().extract(archive, staging, MARKER);
            fail("corrupted local header accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "invalidArchive");
        }
        assertTrue(staging.toPath().resolve("project.db").toFile().isFile());
        assertFalse(staging.toPath().resolve("files/abc").toFile().exists());
    }

    @Test public void extractsEmptyDeflatedEntries() throws Exception {
        // ZipOutputStream and Python's zipfile write a two-byte deflate stream
        // for an empty entry; the inflater finishes without producing output.
        File staging = extract(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addDeflated("project.db-wal", new byte[0], UNIX_REGULAR)
            .addDeflated("files/empty", new byte[0], UNIX_REGULAR));

        assertEquals(0, staging.toPath().resolve("project.db-wal").toFile().length());
        assertTrue(staging.toPath().resolve("files/empty").toFile().isFile());
        assertEquals(0, staging.toPath().resolve("files/empty").toFile().length());
    }

    @Test public void extractsProjectAtZipRoot() throws Exception {
        byte[] database = new byte[] { 1, 2, 3 };
        File staging = extract(new TestZipArchive()
            .addStored("project.db", database, UNIX_REGULAR)
            .addStored("files/abc.png", new byte[] { 4 }, UNIX_REGULAR)
            .addStored("file-metadata/abc.png.mime", "image/png".getBytes(), UNIX_REGULAR)
            .addStored("readme.txt", new byte[] { 5 }, UNIX_REGULAR));

        assertArrayEquals(database, Files.readAllBytes(staging.toPath().resolve("project.db")));
        assertTrue(staging.toPath().resolve("files/abc.png").toFile().isFile());
        assertEquals(
            "image/png",
            new String(Files.readAllBytes(staging.toPath().resolve("file-metadata/abc.png.mime")))
        );
        assertFalse(staging.toPath().resolve("readme.txt").toFile().exists());
    }

    @Test public void extractsDatabaseSidecars() throws Exception {
        File staging = extract(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("project.db-wal", new byte[] { 2 }, UNIX_REGULAR)
            .addStored("project.db-shm", new byte[] { 3 }, UNIX_REGULAR)
            .addStored("project.db-journal", new byte[] { 4 }, UNIX_REGULAR));

        assertTrue(staging.toPath().resolve("project.db-wal").toFile().isFile());
        assertTrue(staging.toPath().resolve("project.db-shm").toFile().isFile());
        assertTrue(staging.toPath().resolve("project.db-journal").toFile().isFile());
    }

    @Test public void extractsSingleNestedProjectRoot() throws Exception {
        File staging = extract(new TestZipArchive()
            .addDirectory("Project One")
            .addStored("Project One/project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("Project One/files/abc", new byte[] { 2 }, UNIX_REGULAR)
            .addStored("notes.txt", new byte[] { 3 }, UNIX_REGULAR));

        assertTrue(staging.toPath().resolve("project.db").toFile().isFile());
        assertTrue(staging.toPath().resolve("files/abc").toFile().isFile());
        assertFalse(staging.toPath().resolve("notes.txt").toFile().exists());
    }

    @Test public void missingFilesDirectoryIsCreatedEmpty() throws Exception {
        File staging = extract(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR));

        assertTrue(staging.toPath().resolve("files").toFile().isDirectory());
        assertTrue(staging.toPath().resolve("file-metadata").toFile().isDirectory());
        assertEquals(0, staging.toPath().resolve("files").toFile().list().length);
    }

    @Test public void skipsMacOsAndDotEntries() throws Exception {
        File staging = extract(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addDirectory("__MACOSX")
            .addStored("__MACOSX/project.db", new byte[] { 2 }, UNIX_REGULAR)
            .addStored(".DS_Store", new byte[] { 3 }, UNIX_REGULAR)
            .addStored("files/.DS_Store", new byte[] { 4 }, UNIX_REGULAR)
            .addStored("files/._abc.png", new byte[] { 5 }, UNIX_REGULAR)
            .addStored("files/abc.png", new byte[] { 6 }, UNIX_REGULAR));

        assertTrue(staging.toPath().resolve("files/abc.png").toFile().isFile());
        assertFalse(staging.toPath().resolve("files/.DS_Store").toFile().exists());
        assertFalse(staging.toPath().resolve("files/._abc.png").toFile().exists());
        assertFalse(staging.toPath().resolve("__MACOSX").toFile().exists());
        assertFalse(staging.toPath().resolve(".DS_Store").toFile().exists());
    }

    @Test public void skipsEntriesNestedUnderFilesSubDirectories() throws Exception {
        File staging = extract(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files/keep.png", new byte[] { 2 }, UNIX_REGULAR)
            .addDirectory("files/nested")
            .addStored("files/nested/drop.png", new byte[] { 3 }, UNIX_REGULAR));

        assertTrue(staging.toPath().resolve("files/keep.png").toFile().isFile());
        assertFalse(staging.toPath().resolve("files/nested").toFile().exists());
    }

    @Test public void multipleRootDirectoriesAreRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addDirectory("one")
            .addStored("one/project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addDirectory("two")
            .addStored("two/other.txt", new byte[] { 2 }, UNIX_REGULAR)), "invalidArchive");
    }

    @Test public void missingProjectDatabaseIsRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("files/abc", new byte[] { 1 }, UNIX_REGULAR)), "invalidArchive");
    }

    @Test public void nestedRootWithoutDatabaseIsRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addDirectory("Project One")
            .addStored("Project One/files/abc", new byte[] { 1 }, UNIX_REGULAR)), "invalidArchive");
    }

    @Test public void incompleteExportMarkerIsRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored(MARKER, new byte[] { 2 }, UNIX_REGULAR)), "invalidArchive");
    }

    @Test public void nonZipDataIsRejected() throws Exception {
        File staging = folder.newFolder("staging-flat");
        File file = folder.newFile("archive.zip");
        Files.write(file.toPath(), new byte[] { 1, 2, 3, 4, 5 });
        try {
            new ProjectArchiveExtractor().extract(file, staging, MARKER);
            fail("non-zip accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "invalidArchive");
        }
    }

    @Test public void zipSlipParentSegmentIsRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files/../../evil", new byte[] { 2 }, UNIX_REGULAR)), "unsafeArchiveEntry");
    }

    @Test public void zipSlipLeadingParentIsRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("../evil", new byte[] { 2 }, UNIX_REGULAR)), "unsafeArchiveEntry");
    }

    @Test public void absoluteEntryNameIsRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("/etc/passwd", new byte[] { 2 }, UNIX_REGULAR)), "unsafeArchiveEntry");
    }

    @Test public void backslashEscapeIsRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("..\\..\\evil", new byte[] { 2 }, UNIX_REGULAR)), "unsafeArchiveEntry");
    }

    @Test public void drivePrefixEntryNameIsRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("C:/evil", new byte[] { 2 }, UNIX_REGULAR)), "unsafeArchiveEntry");
    }

    @Test public void symlinkEntriesAreRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files/link", new byte[] { 2 }, 0120777)), "unsafeArchiveEntry");
    }

    @Test public void fifoEntriesAreRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files/pipe", new byte[] { 2 }, 0010644)), "unsafeArchiveEntry");
    }

    @Test public void filesEntryAsRegularFileIsRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files", new byte[] { 2 }, UNIX_REGULAR)), "invalidArchive");
    }

    @Test public void entryCountLimitRejectsTooManyEntries() throws Exception {
        TestZipArchive zip = new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR);
        for (int index = 0; index < 5; index += 1) {
            zip.addStored("files/f" + index, new byte[] { 2 }, UNIX_REGULAR);
        }
        ProjectArchiveExtractor extractor = new ProjectArchiveExtractor(5, 8192, 65536);
        try {
            extract(zip, extractor);
            fail("too many entries accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "archiveTooLarge");
        }
    }

    @Test public void declaredUncompressedTotalIsRejectedUpFront() throws Exception {
        TestZipArchive zip = new TestZipArchive()
            .addStored("project.db", new byte[600], UNIX_REGULAR)
            .addStored("files/big", new byte[600], UNIX_REGULAR);
        ProjectArchiveExtractor extractor = new ProjectArchiveExtractor(50, 1024, 65536);
        try {
            extract(zip, extractor);
            fail("declared oversize accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "archiveTooLarge");
        }
    }

    @Test public void actualWrittenBytesEnforceTheLimitBeyondDeclaredSizes() throws Exception {
        // The central directory declares 10 bytes, but the deflated stream
        // expands to 4 KB; the limit is 1 KB.
        byte[] bomb = new byte[4096];
        TestZipArchive zip = new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addDeflatedWithDeclaredSize("files/bomb", bomb, UNIX_REGULAR, 10);
        ProjectArchiveExtractor extractor = new ProjectArchiveExtractor(50, 1024, 65536);
        try {
            extract(zip, extractor);
            fail("zip bomb accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "archiveTooLarge");
        }
    }

    @Test public void oversizedArchiveFileIsRejected() throws Exception {
        File staging = folder.newFolder("staging-big");
        File file = folder.newFile("big.zip");
        byte[] padding = new byte[2048];
        Files.write(file.toPath(), padding);
        ProjectArchiveExtractor extractor = new ProjectArchiveExtractor(50, 8192, 1024);
        try {
            extractor.extract(file, staging, MARKER);
            fail("oversized archive accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "archiveTooLarge");
        }
    }

    @Test public void corruptedCentralDirectoryIsRejected() throws Exception {
        File file = archive(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR));
        byte[] data = Files.readAllBytes(file.toPath());
        data[data.length - 3] ^= 0x5A;
        Files.write(file.toPath(), data);
        File staging = folder.newFolder("staging-corrupt");
        try {
            new ProjectArchiveExtractor().extract(file, staging, MARKER);
            fail("corrupt archive accepted");
        } catch (ProjectImportException error) {
            assertTrue(
                error.code.equals("invalidArchive") || error.code.equals("importFailed")
            );
        }
    }

    @Test public void defaultLimitsMatchTheSharedContract() {
        assertEquals(50_000, ProjectArchiveExtractor.DEFAULT_MAX_ENTRIES);
        assertEquals(8L * 1024 * 1024 * 1024, ProjectArchiveExtractor.DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES);
        assertEquals(4L * 1024 * 1024 * 1024, ProjectArchiveExtractor.DEFAULT_MAX_ARCHIVE_BYTES);
    }

    @Test public void extractionKeepsExtensionedNamesForLaterNormalization() throws Exception {
        // Rule A stripping happens in the shared import tail, not during
        // extraction, so the staged name keeps its extension here.
        File staging = extract(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files/abc.png", new byte[] { 2 }, UNIX_REGULAR));
        assertEquals(
            1,
            ProjectFileNames.normalize(staging.toPath().resolve("files").toFile())
        );
        assertTrue(staging.toPath().resolve("files/abc").toFile().isFile());
    }

    @Test public void storedEntryWithFlippedPayloadByteIsRejected() throws Exception {
        byte[] payload = new byte[] { 7, 11, 13, 17, 19 };
        File file = archive(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files/abc", payload, UNIX_REGULAR));
        byte[] data = Files.readAllBytes(file.toPath());
        int payloadOffset = indexOf(data, payload);
        assertTrue("payload not found in archive", payloadOffset >= 0);
        data[payloadOffset] ^= 0x01;
        Files.write(file.toPath(), data);

        File staging = folder.newFolder("staging-flip");
        try {
            new ProjectArchiveExtractor().extract(file, staging, MARKER);
            fail("stored entry with flipped payload byte accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "invalidArchive");
        }
    }

    @Test public void deflatedEntryWithWrongCrcIsRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addDeflatedWithWrongCrc("files/abc", new byte[] { 2, 3, 4 }, UNIX_REGULAR)),
            "invalidArchive");
    }

    @Test public void zip64SizesAreReadInSpecificationOrder() throws Exception {
        // The zip64 extra stores uncompressed before compressed size; a 9
        // GiB declared uncompressed size must be rejected up front, before
        // any bytes are written, by the declared-total limit (8 GiB).
        File file = archive(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addZip64("files/big", new byte[] { 2 }, UNIX_REGULAR, 9L * 1024 * 1024 * 1024, 1));
        File staging = folder.newFolder("staging-z64");
        try {
            new ProjectArchiveExtractor().extract(file, staging, MARKER);
            fail("9 GiB declared zip64 entry accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "archiveTooLarge");
        }
        assertFalse(staging.toPath().resolve("files").toFile().exists());
    }

    @Test public void hugeDeclaredCentralDirectoryIsRejectedBeforeAllocation() throws Exception {
        File file = archive(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR));
        byte[] data = Files.readAllBytes(file.toPath());
        int eocdOffset = data.length - 22;
        writeLe32(data, eocdOffset + 12, 0x7F000000L);
        Files.write(file.toPath(), data);

        File staging = folder.newFolder("staging-huge-cd");
        try {
            new ProjectArchiveExtractor().extract(file, staging, MARKER);
            fail("huge declared central directory accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "archiveTooLarge");
        }
    }

    @Test public void overlyLongEntryNameIsRejected() throws Exception {
        char[] nameCharacters = new char[5000];
        Arrays.fill(nameCharacters, 'a');
        String longName = new String(nameCharacters);
        assertCode(extractFailing(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored(longName, new byte[] { 2 }, UNIX_REGULAR)), "invalidArchive");
    }

    @Test public void emptyPathSegmentIsRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files//a", new byte[] { 2 }, UNIX_REGULAR)), "unsafeArchiveEntry");
    }

    @Test public void duplicateNormalizedEntryPathsAreRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files/a", new byte[] { 2 }, UNIX_REGULAR)
            .addStored("files/A", new byte[] { 3 }, UNIX_REGULAR)), "invalidArchive");
    }

    @Test public void exactDuplicateEntryNamesAreRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files/a", new byte[] { 2 }, UNIX_REGULAR)
            .addStored("files/a", new byte[] { 3 }, UNIX_REGULAR)), "invalidArchive");
    }

    @Test public void markerHiddenByDuplicateDirectoryEntryIsRejected() throws Exception {
        // The directory entry listed after the marker file used to hide the
        // marker from last-match detection; every entry is now scanned.
        assertCode(extractFailing(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored(MARKER, new byte[] { 2 }, UNIX_REGULAR)
            .addDirectory(MARKER)), "invalidArchive");
    }

    @Test public void colonInsideAnySegmentIsRejected() throws Exception {
        assertCode(extractFailing(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("C:foo/project.db", new byte[] { 2 }, UNIX_REGULAR)),
            "unsafeArchiveEntry");
    }

    private static int indexOf(byte[] data, byte[] pattern) {
        for (int index = 0; index + pattern.length <= data.length; index += 1) {
            boolean matches = true;
            for (int offset = 0; offset < pattern.length; offset += 1) {
                if (data[index + offset] != pattern[offset]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                return index;
            }
        }
        return -1;
    }

    private static void writeLe32(byte[] data, int offset, long value) {
        data[offset] = (byte) (value & 0xFF);
        data[offset + 1] = (byte) ((value >> 8) & 0xFF);
        data[offset + 2] = (byte) ((value >> 16) & 0xFF);
        data[offset + 3] = (byte) ((value >> 24) & 0xFF);
    }
}
