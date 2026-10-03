package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ProjectArchiveExtractorPathTreeTest {
    private static final String MARKER = "ROUTEVN_EXPORT_INCOMPLETE.txt";
    private static final int UNIX_REGULAR = 0100644;

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private File extract(TestZipArchive zip) throws Exception {
        File archive = folder.newFile("archive.zip");
        Files.write(archive.toPath(), zip.toBytes());
        File staging = folder.newFolder("staging");
        new ProjectArchiveExtractor().extract(archive, staging, MARKER);
        return staging;
    }

    private String extractFailingCode(TestZipArchive zip) throws Exception {
        try {
            extract(zip);
            fail("archive accepted");
            return null;
        } catch (ProjectImportException error) {
            return error.code;
        }
    }

    @Test public void deepIgnoredEntriesAreRejectedWhileShallowIgnoredEntriesImport() throws Exception {
        TestZipArchive deep = new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR);
        StringBuilder name = new StringBuilder();
        for (int entry = 0; entry < 200; entry += 1) {
            name.setLength(0);
            name.append(String.format("%04d", entry));
            for (int depth = 1; depth < 40; depth += 1) {
                name.append("/a");
            }
            deep.addStored(name.toString(), new byte[0], UNIX_REGULAR);
        }
        assertEquals("unsafeArchiveEntry", extractFailingCode(deep));

        TestZipArchive shallow = new TestZipArchive()
            .addStored("project.db", new byte[] { 2 }, UNIX_REGULAR);
        for (int entry = 0; entry < 200; entry += 1) {
            shallow.addStored("junk" + entry, new byte[0], UNIX_REGULAR);
        }
        File archive = folder.newFile("archive-shallow.zip");
        Files.write(archive.toPath(), shallow.toBytes());
        File staging = folder.newFolder("staging-shallow");
        new ProjectArchiveExtractor().extract(archive, staging, MARKER);
        assertTrue(staging.toPath().resolve("project.db").toFile().isFile());
        assertTrue(staging.toPath().resolve("files").toFile().isDirectory());
    }

    @Test public void retainedPathTotalIsCapped() throws Exception {
        TestZipArchive zip = new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR);
        char[] characters = new char[1400];
        Arrays.fill(characters, 'a');
        String name = new String(characters);
        // 6000 * 1400 = 8.4M characters, above the 8 MiB retained limit.
        for (int entry = 0; entry < 6000; entry += 1) {
            zip.addStored(name, new byte[0], UNIX_REGULAR);
        }
        assertEquals("archiveTooLarge", extractFailingCode(zip));
    }

    @Test public void dosHostDirectoryAttributeIsHonored() throws Exception {
        File staging = extract(new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addDosDirectory("files")
            .addStored("files/a", new byte[] { 2 }, UNIX_REGULAR));
        assertTrue(staging.toPath().resolve("files/a").toFile().isFile());
    }

    @Test public void plainBackslashNameIsRejected() throws Exception {
        assertEquals(
            "unsafeArchiveEntry",
            extractFailingCode(new TestZipArchive()
                .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
                .addStored("files\\a", new byte[] { 2 }, UNIX_REGULAR))
        );
    }

    @Test public void dotSegmentIsRejected() throws Exception {
        assertEquals(
            "unsafeArchiveEntry",
            extractFailingCode(new TestZipArchive()
                .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
                .addStored("files/./a", new byte[] { 2 }, UNIX_REGULAR))
        );
    }

    @Test public void regularFilesEntryBeforeDirectoryFilesSlashIsRejected() throws Exception {
        assertEquals(
            "invalidArchive",
            extractFailingCode(new TestZipArchive()
                .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
                .addStored("files", new byte[] { 2 }, UNIX_REGULAR)
                .addDirectory("files")
                .addStored("files/a", new byte[] { 3 }, UNIX_REGULAR))
        );
    }

    @Test public void directoryFilesSlashBeforeRegularFilesEntryIsRejected() throws Exception {
        assertEquals(
            "invalidArchive",
            extractFailingCode(new TestZipArchive()
                .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
                .addDirectory("files")
                .addStored("files", new byte[] { 2 }, UNIX_REGULAR))
        );
    }

    @Test public void fileWhoseParentPathIsAFileIsRejected() throws Exception {
        assertEquals(
            "invalidArchive",
            extractFailingCode(new TestZipArchive()
                .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
                .addStored("weird", new byte[] { 2 }, UNIX_REGULAR)
                .addStored("weird/child", new byte[] { 3 }, UNIX_REGULAR))
        );
    }

    @Test public void exclusiveCreationFailsOnPreExistingFile() throws Exception {
        TestZipArchive zip = new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files/abc", new byte[] { 2 }, UNIX_REGULAR);
        File archive = folder.newFile("archive.zip");
        Files.write(archive.toPath(), zip.toBytes());
        File staging = folder.newFolder("staging");
        Path files = staging.toPath().resolve("files");
        Files.createDirectories(files);
        Files.write(files.resolve("abc"), new byte[] { 99 });
        try {
            new ProjectArchiveExtractor().extract(archive, staging, MARKER);
            fail("pre-existing target accepted");
        } catch (ProjectImportException error) {
            assertEquals("importFailed", error.code);
        }
        // The planted file is never written through.
        assertArrayEquals(
            new byte[] { 99 },
            Files.readAllBytes(files.resolve("abc"))
        );
    }

    @Test public void exclusiveCreationFailsOnSymlinkAtTarget() throws Exception {
        Path outsideLink;
        try {
            outsideLink = java.nio.file.Files.createSymbolicLink(
                folder.newFolder("outside").toPath().resolve("target"),
                folder.newFile("planted").toPath()
            );
        } catch (IOException | UnsupportedOperationException error) {
            // Symlinks cannot be created in this environment.
            return;
        }
        TestZipArchive zip = new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files/abc", new byte[] { 2 }, UNIX_REGULAR);
        File archive = folder.newFile("archive.zip");
        Files.write(archive.toPath(), zip.toBytes());
        File staging = folder.newFolder("staging");
        Path files = staging.toPath().resolve("files");
        Files.createDirectories(files);
        Files.createSymbolicLink(files.resolve("abc"), outsideLink);
        try {
            new ProjectArchiveExtractor().extract(archive, staging, MARKER);
            fail("symlink target accepted");
        } catch (ProjectImportException error) {
            assertTrue(
                error.code.equals("importFailed") || error.code.equals("unsafeArchiveEntry")
            );
        }
        // The planted file behind the symlink is never written through.
        assertArrayEquals(new byte[0], Files.readAllBytes(outsideLink));
    }

    @Test public void symlinkedParentOutsideStagingIsRejected() throws Exception {
        File outsideDir;
        try {
            outsideDir = folder.newFolder("outside-dir");
        } catch (IOException error) {
            return;
        }
        TestZipArchive zip = new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files/abc", new byte[] { 2 }, UNIX_REGULAR);
        File archive = folder.newFile("archive.zip");
        Files.write(archive.toPath(), zip.toBytes());
        File staging = folder.newFolder("staging");
        try {
            Files.createSymbolicLink(staging.toPath().resolve("files"), outsideDir.toPath());
        } catch (IOException | UnsupportedOperationException error) {
            // Symlinks cannot be created in this environment.
            return;
        }
        try {
            new ProjectArchiveExtractor().extract(archive, staging, MARKER);
            fail("symlinked parent accepted");
        } catch (ProjectImportException error) {
            assertEquals("unsafeArchiveEntry", error.code);
        }
        assertEquals(0, outsideDir.list().length);
    }
}
