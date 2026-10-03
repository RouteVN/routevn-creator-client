package com.routevn.creator;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.CRC32;
import java.util.zip.Deflater;

/**
 * Minimal hand-rolled zip writer for tests. Unlike java.util.zip
 * ZipOutputStream it can set unix external attributes (symlinks, directory
 * modes) and declare an arbitrary uncompressed size, which the safety tests
 * need. Entries use the STORED method unless a deflate variant is requested.
 */
final class TestZipArchive {
    private final ByteArrayOutputStream out = new ByteArrayOutputStream();
    private final List<byte[]> centralRecords = new ArrayList<>();

    TestZipArchive addStored(String name, byte[] data, int unixMode) throws IOException {
        return addEntry(name, data, unixMode, false, data.length, crcOf(data));
    }

    TestZipArchive addDeflated(String name, byte[] data, int unixMode) throws IOException {
        return addEntry(name, data, unixMode, true, data.length, crcOf(data));
    }

    /** Deflated entry whose headers declare a CRC that does not match the payload. */
    TestZipArchive addDeflatedWithWrongCrc(String name, byte[] data, int unixMode)
        throws IOException {
        return addEntry(name, data, unixMode, true, data.length, crcOf(data) ^ 0x5A5A5A5AL);
    }

    /**
     * STORED entry whose local and central headers saturate both size fields
     * at 0xFFFFFFFF and carry a zip64 extra in specification order
     * (uncompressed size, then compressed size).
     */
    TestZipArchive addZip64(
        String name,
        byte[] data,
        int unixMode,
        long uncompressedSize,
        long compressedSize
    ) throws IOException {
        byte[] nameBytes = name.getBytes(StandardCharsets.UTF_8);
        long crcValue = crcOf(data);

        int localOffset = out.size();
        le32(out, 0x04034b50);
        le16(out, 45);
        le16(out, 0);
        le16(out, 0);
        le16(out, 0);
        le16(out, 0);
        le32(out, (int) crcValue);
        le32(out, 0xFFFFFFFF);
        le32(out, 0xFFFFFFFF);
        le16(out, nameBytes.length);
        le16(out, 20);
        out.write(nameBytes);
        le16(out, 0x0001);
        le16(out, 16);
        le64(out, uncompressedSize);
        le64(out, compressedSize);
        out.write(data);

        int unixPlatform = unixMode == 0 ? 0 : 3;
        ByteArrayOutputStream central = new ByteArrayOutputStream();
        le32(central, 0x02014b50);
        le16(central, (unixPlatform << 8) | 45);
        le16(central, 45);
        le16(central, 0);
        le16(central, 0);
        le16(central, 0);
        le16(central, 0);
        le32(central, (int) crcValue);
        le32(central, 0xFFFFFFFF);
        le32(central, 0xFFFFFFFF);
        le16(central, nameBytes.length);
        le16(central, 20);
        le16(central, 0);
        le16(central, 0);
        le16(central, 0);
        le32(central, unixMode << 16);
        le32(central, localOffset);
        central.write(nameBytes);
        le16(central, 0x0001);
        le16(central, 16);
        le64(central, uncompressedSize);
        le64(central, compressedSize);
        centralRecords.add(central.toByteArray());
        return this;
    }

    /** Deflated entry whose central directory declares a different uncompressed size. */
    TestZipArchive addDeflatedWithDeclaredSize(
        String name,
        byte[] data,
        int unixMode,
        long declaredUncompressedSize
    ) throws IOException {
        return addEntry(name, data, unixMode, true, declaredUncompressedSize, crcOf(data));
    }

    TestZipArchive addDirectory(String name) throws IOException {
        String dirName = name.endsWith("/") ? name : name + "/";
        return addEntry(dirName, new byte[0], 040755, false, 0, crcOf(new byte[0]));
    }

    /**
     * MS-DOS-host directory entry without a trailing slash: the directory
     * marker lives in the low external-attribute byte (0x10), not in a
     * unix mode or the name.
     */
    TestZipArchive addDosDirectory(String name) throws IOException {
        byte[] nameBytes = name.getBytes(StandardCharsets.UTF_8);
        int localOffset = out.size();
        le32(out, 0x04034b50);
        le16(out, 20);
        le16(out, 0);
        le16(out, 0);
        le16(out, 0);
        le16(out, 0);
        le32(out, (int) crcOf(new byte[0]));
        le32(out, 0);
        le32(out, 0);
        le16(out, nameBytes.length);
        le16(out, 0);
        out.write(nameBytes);

        ByteArrayOutputStream central = new ByteArrayOutputStream();
        le32(central, 0x02014b50);
        le16(central, 20);
        le16(central, 20);
        le16(central, 0);
        le16(central, 0);
        le16(central, 0);
        le16(central, 0);
        le32(central, (int) crcOf(new byte[0]));
        le32(central, 0);
        le32(central, 0);
        le16(central, nameBytes.length);
        le16(central, 0);
        le16(central, 0);
        le16(central, 0);
        le16(central, 0);
        le32(central, 0x10);
        le32(central, localOffset);
        central.write(nameBytes);
        centralRecords.add(central.toByteArray());
        return this;
    }

    /**
     * STORED entry with raw (undecoded) name bytes, explicit
     * general-purpose flags, and central extra/comment fields, for the
     * charset and per-entry limit tests.
     */
    TestZipArchive addStoredRawName(
        byte[] nameBytes,
        byte[] data,
        int unixMode,
        int flags,
        byte[] centralExtra,
        byte[] comment
    ) throws IOException {
        long crcValue = crcOf(data);
        int localOffset = out.size();
        le32(out, 0x04034b50);
        le16(out, 10);
        le16(out, flags);
        le16(out, 0);
        le16(out, 0);
        le16(out, 0);
        le32(out, (int) crcValue);
        le32(out, data.length);
        le32(out, data.length);
        le16(out, nameBytes.length);
        le16(out, 0);
        out.write(nameBytes);
        out.write(data);

        int unixPlatform = unixMode == 0 ? 0 : 3;
        ByteArrayOutputStream central = new ByteArrayOutputStream();
        le32(central, 0x02014b50);
        le16(central, (unixPlatform << 8) | 20);
        le16(central, 20);
        le16(central, flags);
        le16(central, 0);
        le16(central, 0);
        le16(central, 0);
        le32(central, (int) crcValue);
        le32(central, data.length);
        le32(central, data.length);
        le16(central, nameBytes.length);
        le16(central, centralExtra.length);
        le16(central, comment.length);
        le16(central, 0);
        le16(central, 0);
        le32(central, unixMode << 16);
        le32(central, localOffset);
        central.write(nameBytes);
        central.write(centralExtra);
        central.write(comment);
        centralRecords.add(central.toByteArray());
        return this;
    }

    private static long crcOf(byte[] data) {
        CRC32 crc = new CRC32();
        crc.update(data);
        return crc.getValue();
    }

    private TestZipArchive addEntry(
        String name,
        byte[] data,
        int unixMode,
        boolean deflate,
        long declaredUncompressedSize,
        long crcValue
    ) throws IOException {
        byte[] nameBytes = name.getBytes(StandardCharsets.UTF_8);
        byte[] payload = deflate ? deflate(data) : data;

        int localOffset = out.size();
        le32(out, 0x04034b50);
        le16(out, deflate ? 20 : 10);
        le16(out, 0);
        le16(out, deflate ? Deflater.DEFLATED : 0);
        le16(out, 0);
        le16(out, 0);
        le32(out, (int) crcValue);
        le32(out, payload.length);
        le32(out, (int) declaredUncompressedSize);
        le16(out, nameBytes.length);
        le16(out, 0);
        out.write(nameBytes);
        out.write(payload);

        int unixPlatform = unixMode == 0 ? 0 : 3;
        ByteArrayOutputStream central = new ByteArrayOutputStream();
        le32(central, 0x02014b50);
        le16(central, (unixPlatform << 8) | 20);
        le16(central, 20);
        le16(central, 0);
        le16(central, deflate ? Deflater.DEFLATED : 0);
        le16(central, 0);
        le16(central, 0);
        le32(central, (int) crcValue);
        le32(central, payload.length);
        le32(central, (int) declaredUncompressedSize);
        le16(central, nameBytes.length);
        le16(central, 0);
        le16(central, 0);
        le16(central, 0);
        le16(central, 0);
        le32(central, unixMode << 16);
        le32(central, localOffset);
        central.write(nameBytes);
        centralRecords.add(central.toByteArray());
        return this;
    }

    byte[] toBytes() throws IOException {
        int centralOffset = out.size();
        int centralSize = 0;
        for (byte[] record : centralRecords) {
            out.write(record);
            centralSize += record.length;
        }
        le32(out, 0x06054b50);
        le16(out, 0);
        le16(out, 0);
        le16(out, centralRecords.size());
        le16(out, centralRecords.size());
        le32(out, centralSize);
        le32(out, centralOffset);
        le16(out, 0);
        return out.toByteArray();
    }

    private static byte[] deflate(byte[] data) {
        // nowrap = true: zip entries store raw deflate streams.
        Deflater deflater = new Deflater(Deflater.DEFAULT_COMPRESSION, true);
        deflater.setInput(data);
        deflater.finish();
        ByteArrayOutputStream compressed = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        while (!deflater.finished()) {
            int count = deflater.deflate(buffer);
            compressed.write(buffer, 0, count);
        }
        deflater.end();
        return compressed.toByteArray();
    }

    private static void le16(OutputStream target, int value) throws IOException {
        target.write(value & 0xFF);
        target.write((value >> 8) & 0xFF);
    }

    private static void le32(OutputStream target, int value) throws IOException {
        target.write(value & 0xFF);
        target.write((value >> 8) & 0xFF);
        target.write((value >> 16) & 0xFF);
        target.write((value >> 24) & 0xFF);
    }

    private static void le64(OutputStream target, long value) throws IOException {
        for (int index = 0; index < 8; index += 1) {
            target.write((int) ((value >> (8 * index)) & 0xFF));
        }
    }
}
