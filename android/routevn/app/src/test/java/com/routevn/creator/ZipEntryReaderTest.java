package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ZipEntryReaderTest {
    private static final String MARKER = "ROUTEVN_EXPORT_INCOMPLETE.txt";
    private static final int UNIX_REGULAR = 0100644;

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private File archiveOf(TestZipArchive zip) throws IOException {
        return archiveOf(zip.toBytes());
    }

    private File archiveOf(byte[] data) throws IOException {
        File file = folder.newFile("archive.zip");
        Files.write(file.toPath(), data);
        return file;
    }

    private ZipCentralDirectory.Entry entryNamed(File archive, String name)
        throws Exception {
        for (ZipCentralDirectory.Entry entry : ZipCentralDirectory.parse(archive, 50_000)) {
            if (entry.name.equals(name)) {
                return entry;
            }
        }
        throw new AssertionError("entry not found: " + name);
    }

    private File extractEntry(File archive, String name, long budget) throws Exception {
        File output = folder.newFile("output.bin");
        assertTrue(output.delete());
        try (ZipEntryReader reader = new ZipEntryReader(archive)) {
            reader.extract(entryNamed(archive, name), output, budget);
        }
        return output;
    }

    private String extractFailingCode(File archive, String name, long budget) throws Exception {
        File output = folder.newFile("output.bin");
        assertTrue(output.delete());
        try (ZipEntryReader reader = new ZipEntryReader(archive)) {
            try {
                reader.extract(entryNamed(archive, name), output, budget);
                fail("entry accepted");
            } catch (ProjectImportException error) {
                assertFalse("partial output must be deleted", output.exists());
                return error.code;
            }
        }
        return null;
    }

    @Test public void storedEntryExtractsWithExactBytes() throws Exception {
        byte[] payload = { 9, 8, 7, 6 };
        File archive = archiveOf(new TestZipArchive()
            .addStored("files/abc", payload, UNIX_REGULAR));
        assertArrayEquals(payload, Files.readAllBytes(extractEntry(archive, "files/abc", 8192).toPath()));
    }

    @Test public void deflatedEntryExtractsWithExactBytes() throws Exception {
        byte[] payload = "deflate me, deflate me, deflate me".getBytes(StandardCharsets.UTF_8);
        File archive = archiveOf(new TestZipArchive()
            .addDeflated("files/abc", payload, UNIX_REGULAR));
        assertArrayEquals(payload, Files.readAllBytes(extractEntry(archive, "files/abc", 8192).toPath()));
    }

    @Test public void zip64EntryExtractsWithDeclaredSizes() throws Exception {
        byte[] payload = { 4, 5 };
        File archive = archiveOf(new TestZipArchive()
            .addZip64("files/big", payload, UNIX_REGULAR, payload.length, payload.length));
        assertArrayEquals(payload, Files.readAllBytes(extractEntry(archive, "files/big", 8192).toPath()));
    }

    @Test public void unsupportedCompressionMethodIsRejected() throws Exception {
        byte[] data = new TestZipArchive()
            .addStored("files/abc", new byte[] { 1 }, UNIX_REGULAR)
            .toBytes();
        patchNameOffsets(data, "files/abc", 8, 10, 12);
        assertEquals(
            "invalidArchive",
            extractFailingCode(archiveOf(data), "files/abc", 8192)
        );
    }

    @Test public void encryptedEntryIsRejected() throws Exception {
        byte[] data = new TestZipArchive()
            .addStored("files/abc", new byte[] { 1 }, UNIX_REGULAR)
            .toBytes();
        patchNameOffsets(data, "files/abc", 6, 8, 1);
        assertEquals(
            "invalidArchive",
            extractFailingCode(archiveOf(data), "files/abc", 8192)
        );
    }

    @Test public void localNameMismatchIsRejected() throws Exception {
        byte[] data = new TestZipArchive()
            .addStored("files/abc", new byte[] { 1 }, UNIX_REGULAR)
            .toBytes();
        int localName = indexOfName(data, "files/abc", 0);
        assertTrue(localName >= 0);
        data[localName] = 'F';
        assertEquals(
            "invalidArchive",
            extractFailingCode(archiveOf(data), "files/abc", 8192)
        );
    }

    @Test public void deflatedEntryWithOverreportedCompressedSizeIsRejected() throws Exception {
        byte[] data = new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addDeflated("files/abc", new byte[] { 2, 3, 4, 5 }, UNIX_REGULAR)
            .toBytes();
        int[] nameOffsets = bothNameOffsets(data, "files/abc");
        // The central and local headers declare one byte more than the
        // deflate stream actually consumes.
        bumpU16(data, nameOffsets[0] - 30 + 18, 1);
        bumpU16(data, nameOffsets[1] - 46 + 20, 1);
        int eocd = data.length - 22;
        int centralDirectory = le32Int(data, eocd + 16);
        // One junk byte becomes part of the declared entry data; the whole
        // central directory (and the EOCD behind it) shifts by one byte.
        byte[] shifted = new byte[data.length + 1];
        System.arraycopy(data, 0, shifted, 0, centralDirectory);
        shifted[centralDirectory] = 0x7F;
        System.arraycopy(data, centralDirectory, shifted, centralDirectory + 1, data.length - centralDirectory);
        data = shifted;
        eocd = data.length - 22;
        writeLe32(data, eocd + 16, centralDirectory + 1);
        assertEquals(
            "invalidArchive",
            extractFailingCode(archiveOf(data), "files/abc", 8192)
        );
    }

    @Test public void storedEntryWithInconsistentSizesIsRejected() throws Exception {
        byte[] data = new TestZipArchive()
            .addStored("files/abc", new byte[] { 1, 2 }, UNIX_REGULAR)
            .toBytes();
        int[] nameOffsets = bothNameOffsets(data, "files/abc");
        bumpU16(data, nameOffsets[0] - 30 + 22, 1);
        bumpU16(data, nameOffsets[1] - 46 + 24, 1);
        assertEquals(
            "invalidArchive",
            extractFailingCode(archiveOf(data), "files/abc", 8192)
        );
    }

    @Test public void zipOutputStreamArchivesExtractEndToEnd() throws Exception {
        // ZipOutputStream output exercises data descriptors, directory
        // entries and both methods; central sizes and CRC are authoritative.
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] database = { 1, 2, 3 };
        byte[] stored = { 4, 5 };
        byte[] deflated = "hello hello hello hello".getBytes(StandardCharsets.UTF_8);
        byte[] metadata = "image/png".getBytes(StandardCharsets.UTF_8);
        try (ZipOutputStream zip = new ZipOutputStream(buffer)) {
            ZipEntry directory = new ZipEntry("files/");
            zip.putNextEntry(directory);
            zip.closeEntry();
            ZipEntry db = new ZipEntry("project.db");
            db.setMethod(ZipEntry.STORED);
            db.setSize(database.length);
            db.setCrc(crcOf(database));
            zip.putNextEntry(db);
            zip.write(database);
            zip.closeEntry();
            ZipEntry storedEntry = new ZipEntry("files/stored.bin");
            storedEntry.setMethod(ZipEntry.STORED);
            storedEntry.setSize(stored.length);
            storedEntry.setCrc(crcOf(stored));
            zip.putNextEntry(storedEntry);
            zip.write(stored);
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("file-metadata/stored.bin.mime"));
            zip.write(metadata);
            zip.closeEntry();
        }
        File archive = folder.newFile("stream.zip");
        Files.write(archive.toPath(), buffer.toByteArray());
        File staging = folder.newFolder("staging");
        new ProjectArchiveExtractor().extract(archive, staging, MARKER);
        assertArrayEquals(database, Files.readAllBytes(staging.toPath().resolve("project.db")));
        assertArrayEquals(stored, Files.readAllBytes(staging.toPath().resolve("files/stored.bin")));
        assertArrayEquals(
            metadata,
            Files.readAllBytes(staging.toPath().resolve("file-metadata/stored.bin.mime"))
        );
    }

    private static long crcOf(byte[] data) {
        CRC32 crc = new CRC32();
        crc.update(data);
        return crc.getValue();
    }

    private static int indexOfName(byte[] data, String name, int from) {
        byte[] target = name.getBytes(StandardCharsets.UTF_8);
        outer:
        for (int index = Math.max(0, from); index + target.length <= data.length; index += 1) {
            for (int offset = 0; offset < target.length; offset += 1) {
                if (data[index + offset] != target[offset]) {
                    continue outer;
                }
            }
            return index;
        }
        return -1;
    }

    private static int[] bothNameOffsets(byte[] data, String name) {
        int local = indexOfName(data, name, 0);
        int central = indexOfName(data, name, local + 1);
        assertTrue(local >= 0 && central >= 0);
        return new int[] { local, central };
    }

    private static void patchNameOffsets(
        byte[] data, String name, int localField, int centralField, int value
    ) {
        int[] offsets = bothNameOffsets(data, name);
        writeU16(data, offsets[0] - 30 + localField, value);
        writeU16(data, offsets[1] - 46 + centralField, value);
    }

    private static void bumpU16(byte[] data, int offset, int delta) {
        writeU16(data, offset, ((data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8)) + delta);
    }

    private static void writeU16(byte[] data, int offset, int value) {
        data[offset] = (byte) (value & 0xFF);
        data[offset + 1] = (byte) ((value >> 8) & 0xFF);
    }

    private static void writeLe32(byte[] data, int offset, long value) {
        for (int index = 0; index < 4; index += 1) {
            data[offset + index] = (byte) ((value >> (8 * index)) & 0xFF);
        }
    }

    private static int le32Int(byte[] data, int offset) {
        return (data[offset] & 0xFF) |
            ((data[offset + 1] & 0xFF) << 8) |
            ((data[offset + 2] & 0xFF) << 16) |
            ((data[offset + 3] & 0xFF) << 24);
    }
}
