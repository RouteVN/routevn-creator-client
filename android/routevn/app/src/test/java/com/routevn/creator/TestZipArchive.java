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
 * ZipOutputStream it can record a wrong CRC32 or a wrong uncompressed size,
 * which the extraction tests need. Entries use the STORED method unless a
 * deflate variant is requested.
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
}
