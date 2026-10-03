package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.List;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ZipCentralDirectoryTest {
    private static final int UNIX_REGULAR = 0100644;

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private byte[] simpleArchive() throws IOException {
        return new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addStored("files/abc", new byte[] { 2, 3 }, UNIX_REGULAR)
            .toBytes();
    }

    private File archiveOf(byte[] data) throws IOException {
        File file = folder.newFile("archive.zip");
        Files.write(file.toPath(), data);
        return file;
    }

    private List<ZipCentralDirectory.Entry> parse(byte[] data) throws Exception {
        return ZipCentralDirectory.parse(archiveOf(data), 50_000);
    }

    private String parseFailing(byte[] data) throws Exception {
        try {
            parse(data);
            fail("archive accepted");
            return null;
        } catch (ProjectImportException error) {
            return error.code;
        }
    }

    private static int eocdOffset(byte[] data) {
        for (int index = data.length - 22; index >= 0; index -= 1) {
            if (le32(data, index) == 0x06054b50) {
                return index;
            }
        }
        throw new AssertionError("EOCD not found");
    }

    private static void writeLe16(byte[] data, int offset, int value) {
        data[offset] = (byte) (value & 0xFF);
        data[offset + 1] = (byte) ((value >> 8) & 0xFF);
    }

    private static void writeLe32(byte[] data, int offset, long value) {
        for (int index = 0; index < 4; index += 1) {
            data[offset + index] = (byte) ((value >> (8 * index)) & 0xFF);
        }
    }

    private static int le32(byte[] data, int offset) {
        return (data[offset] & 0xFF) |
            ((data[offset + 1] & 0xFF) << 8) |
            ((data[offset + 2] & 0xFF) << 16) |
            ((data[offset + 3] & 0xFF) << 24);
    }

    private static int indexOf(byte[] data, byte[] pattern, int from) {
        outer:
        for (int index = Math.max(0, from); index + pattern.length <= data.length; index += 1) {
            for (int offset = 0; offset < pattern.length; offset += 1) {
                if (data[index + offset] != pattern[offset]) {
                    continue outer;
                }
            }
            return index;
        }
        return -1;
    }

    @Test public void forgedCdOffsetIsRejected() throws Exception {
        byte[] data = simpleArchive();
        int eocd = eocdOffset(data);
        writeLe32(data, eocd + 16, (le32(data, eocd + 16) & 0xFFFFFFFFL) + 1);
        assertEquals("invalidArchive", parseFailing(data));
    }

    @Test public void underreportedEntryCountIsRejected() throws Exception {
        byte[] data = simpleArchive();
        int eocd = eocdOffset(data);
        writeLe16(data, eocd + 10, 1);
        assertEquals("invalidArchive", parseFailing(data));
    }

    @Test public void overreportedEntryCountIsRejected() throws Exception {
        byte[] data = simpleArchive();
        int eocd = eocdOffset(data);
        writeLe16(data, eocd + 10, 3);
        writeLe16(data, eocd + 8, 3);
        assertEquals("invalidArchive", parseFailing(data));
    }

    @Test public void trailingBytesBeforeEocdAreRejected() throws Exception {
        byte[] base = simpleArchive();
        int eocd = eocdOffset(base);
        byte[] data = new byte[base.length + 5];
        System.arraycopy(base, 0, data, 0, eocd);
        System.arraycopy(base, eocd, data, eocd + 5, 22);
        for (int index = 0; index < 5; index += 1) {
            data[eocd + index] = 0x7F;
        }
        assertEquals("invalidArchive", parseFailing(data));
    }

    @Test public void fakeEocdInsideCommentIsRejected() throws Exception {
        byte[] base = simpleArchive();
        int eocd = eocdOffset(base);
        // A fake EOCD placed inside the comment of the real EOCD whose own
        // comment also ends exactly at the file end: two exact-length
        // candidates must be rejected instead of tiebroken.
        int fakeInnerOffset = 3;
        int fakeCommentLength = 5;
        int commentLength = fakeInnerOffset + 22 + fakeCommentLength;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(base, 0, eocd);
        out.write(0x50);
        out.write(0x4B);
        out.write(0x05);
        out.write(0x06);
        for (int index = 4; index < 20; index += 1) {
            out.write(0);
        }
        writeLe16Stream(out, fakeCommentLength);
        for (int index = 0; index < fakeInnerOffset; index += 1) {
            out.write(0x41);
        }
        out.write(0x50);
        out.write(0x4B);
        out.write(0x05);
        out.write(0x06);
        for (int index = 4; index < 20; index += 1) {
            out.write(0);
        }
        writeLe16Stream(out, commentLength - fakeInnerOffset - 22);
        for (int index = 0; index < fakeCommentLength; index += 1) {
            out.write(0x42);
        }
        assertEquals("invalidArchive", parseFailing(out.toByteArray()));
    }

    private static void writeLe16Stream(ByteArrayOutputStream out, int value) {
        out.write(value & 0xFF);
        out.write((value >> 8) & 0xFF);
    }

    @Test public void zip64ExtraShorterThanSaturatedFieldsIsRejected() throws Exception {
        byte[] data = new TestZipArchive()
            .addStored("project.db", new byte[] { 1 }, UNIX_REGULAR)
            .addZip64("files/big", new byte[] { 2 }, UNIX_REGULAR, 9L * 1024 * 1024 * 1024, 1)
            .toBytes();
        // The extra header pattern (id 0x0001, dataSize 16) appears in the
        // local header first and the central record second; shrinking the
        // central block below the saturated fields must be rejected.
        byte[] pattern = new byte[] { 0x01, 0x00, 0x10, 0x00 };
        int localExtra = indexOf(data, pattern, 0);
        assertTrue(localExtra >= 0);
        int centralExtra = indexOf(data, pattern, localExtra + 1);
        assertTrue(centralExtra >= 0);
        writeLe16(data, centralExtra + 2, 8);
        assertEquals("invalidArchive", parseFailing(data));
    }

    @Test public void zip64LocatorBehindMaximumCommentIsHonored() throws Exception {
        byte[] base = new TestZipArchive()
            .addStored("project.db", new byte[] { 7, 8 }, UNIX_REGULAR)
            .toBytes();
        int eocd = eocdOffset(base);
        long cdSize = le32(base, eocd + 12) & 0xFFFFFFFFL;
        long cdOffset = le32(base, eocd + 16) & 0xFFFFFFFFL;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(base, 0, eocd);
        long zip64Position = eocd;
        // zip64 EOCD record: signature, size (44), versions, disks, counts,
        // central size, central offset.
        out.write(0x50); out.write(0x4B); out.write(0x06); out.write(0x06);
        writeLe64Stream(out, 44);
        writeLe16Stream(out, 45);
        writeLe16Stream(out, 45);
        writeLe32Stream(out, 0);
        writeLe32Stream(out, 0);
        writeLe64Stream(out, 1);
        writeLe64Stream(out, 1);
        writeLe64Stream(out, cdSize);
        writeLe64Stream(out, cdOffset);
        // zip64 EOCD locator directly before the EOCD (20 bytes).
        out.write(0x50); out.write(0x4B); out.write(0x06); out.write(0x07);
        writeLe32Stream(out, 0);
        writeLe64Stream(out, zip64Position);
        writeLe32Stream(out, 1);
        // EOCD with saturated fields behind a maximum-length comment.
        out.write(0x50); out.write(0x4B); out.write(0x05); out.write(0x06);
        // disk number and disk with central directory.
        writeLe16Stream(out, 0);
        writeLe16Stream(out, 0);
        writeLe16Stream(out, 0xFFFF);
        writeLe16Stream(out, 0xFFFF);
        writeLe32Stream(out, 0xFFFFFFFFL);
        writeLe32Stream(out, 0xFFFFFFFFL);
        writeLe16Stream(out, 65535);
        for (int index = 0; index < 65535; index += 1) {
            out.write(0x63);
        }
        List<ZipCentralDirectory.Entry> entries = parse(out.toByteArray());
        assertEquals(1, entries.size());
        assertEquals("project.db", entries.get(0).name);
        assertEquals(2, entries.get(0).uncompressedSize);
    }

    private static void writeLe32Stream(ByteArrayOutputStream out, long value) {
        for (int index = 0; index < 4; index += 1) {
            out.write((int) ((value >> (8 * index)) & 0xFF));
        }
    }

    /** Valid single-entry archive whose EOCD defers to a zip64 end record. */
    private byte[] zip64Archive() throws IOException {
        byte[] base = new TestZipArchive()
            .addStored("project.db", new byte[] { 7, 8 }, UNIX_REGULAR)
            .toBytes();
        int eocd = eocdOffset(base);
        long cdSize = le32(base, eocd + 12) & 0xFFFFFFFFL;
        long cdOffset = le32(base, eocd + 16) & 0xFFFFFFFFL;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(base, 0, eocd);
        out.write(0x50); out.write(0x4B); out.write(0x06); out.write(0x06);
        writeLe64Stream(out, 44);
        writeLe16Stream(out, 45);
        writeLe16Stream(out, 45);
        writeLe32Stream(out, 0);
        writeLe32Stream(out, 0);
        writeLe64Stream(out, 1);
        writeLe64Stream(out, 1);
        writeLe64Stream(out, cdSize);
        writeLe64Stream(out, cdOffset);
        out.write(0x50); out.write(0x4B); out.write(0x06); out.write(0x07);
        writeLe32Stream(out, 0);
        writeLe64Stream(out, eocd);
        writeLe32Stream(out, 1);
        out.write(0x50); out.write(0x4B); out.write(0x05); out.write(0x06);
        writeLe16Stream(out, 0);
        writeLe16Stream(out, 0);
        writeLe16Stream(out, 0xFFFF);
        writeLe16Stream(out, 0xFFFF);
        writeLe32Stream(out, 0xFFFFFFFFL);
        writeLe32Stream(out, 0xFFFFFFFFL);
        writeLe16Stream(out, 0);
        return out.toByteArray();
    }

    private static int indexOfSignature(byte[] data, int signature) {
        for (int index = 0; index + 4 <= data.length; index += 1) {
            if (le32(data, index) == signature) {
                return index;
            }
        }
        return -1;
    }

    @Test public void zip64LocatorAndRecordMetadataAreValidated() throws Exception {
        byte[] badLocatorDisks = zip64Archive();
        int locator = indexOfSignature(badLocatorDisks, 0x07064b50);
        assertTrue(locator >= 0);
        writeLe32(badLocatorDisks, locator + 16, 2);
        assertEquals("invalidArchive", parseFailing(badLocatorDisks));
        Files.delete(folder.getRoot().toPath().resolve("archive.zip"));

        byte[] badRecordSize = zip64Archive();
        int record = indexOfSignature(badRecordSize, 0x06064b50);
        assertTrue(record >= 0);
        writeLe32(badRecordSize, record + 4, 0);
        assertEquals("invalidArchive", parseFailing(badRecordSize));
    }

    private static void writeLe64Stream(ByteArrayOutputStream out, long value) {
        for (int index = 0; index < 8; index += 1) {
            out.write((int) ((value >> (8 * index)) & 0xFF));
        }
    }
}
