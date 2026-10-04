package com.routevn.creator;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;
import java.util.zip.Deflater;
import java.util.zip.DeflaterOutputStream;

/**
 * Minimal hand-rolled zip writer for tests. Unlike java.util.zip
 * ZipOutputStream it can record a wrong CRC32 or a wrong uncompressed size,
 * which the extraction tests need. A name ending in "/" is a directory entry.
 */
final class TestZipArchive {
    private final ByteArrayOutputStream entries = new ByteArrayOutputStream();
    private final ByteArrayOutputStream central = new ByteArrayOutputStream();
    private int count;

    TestZipArchive addStored(String name, byte[] data) throws IOException {
        return add(name, data, false, data.length, crcOf(data));
    }

    TestZipArchive addDeflated(String name, byte[] data) throws IOException {
        return add(name, data, true, data.length, crcOf(data));
    }

    /** Deflated entry whose headers record a CRC32 that does not match the data. */
    TestZipArchive addDeflatedWithWrongCrc(String name, byte[] data) throws IOException {
        return add(name, data, true, data.length, crcOf(data) ^ 0x5A5A5A5AL);
    }

    /** Deflated entry whose headers record a different uncompressed size. */
    TestZipArchive addDeflatedWithDeclaredSize(String name, byte[] data, long size) throws IOException {
        return add(name, data, true, size, crcOf(data));
    }

    byte[] toBytes() throws IOException {
        ByteArrayOutputStream zip = new ByteArrayOutputStream();
        entries.writeTo(zip);
        central.writeTo(zip);
        // End of central directory: disk numbers, entry counts, size, offset, comment length.
        zip.write(le(22).putInt(0x06054b50).putInt(0).putShort((short) count).putShort((short) count)
            .putInt(central.size()).putInt(entries.size()).array());
        return zip.toByteArray();
    }

    private TestZipArchive add(String name, byte[] data, boolean deflate, long size, long crc)
        throws IOException {
        byte[] nameBytes = name.getBytes(StandardCharsets.UTF_8);
        byte[] payload = deflate ? deflate(data) : data;
        // Shared by both headers: version needed, flags, method, time and date,
        // CRC32, compressed and uncompressed size, name and extra length.
        byte[] fields = le(26).putShort((short) 20).putShort((short) 0)
            .putShort((short) (deflate ? Deflater.DEFLATED : 0)).putInt(0).putInt((int) crc)
            .putInt(payload.length).putInt((int) size).putShort((short) nameBytes.length).array();
        int offset = entries.size();
        entries.write(le(4).putInt(0x04034b50).array());
        entries.write(fields);
        entries.write(nameBytes);
        entries.write(payload);
        // Signature and version made by, the shared fields, then comment length,
        // disk number, internal and external attributes and the local header offset.
        central.write(le(6).putInt(0x02014b50).putShort((short) 20).array());
        central.write(fields);
        central.write(le(14).putInt(10, offset).array());
        central.write(nameBytes);
        count += 1;
        return this;
    }

    private static ByteBuffer le(int capacity) {
        return ByteBuffer.allocate(capacity).order(ByteOrder.LITTLE_ENDIAN);
    }

    private static long crcOf(byte[] data) {
        CRC32 crc = new CRC32();
        crc.update(data);
        return crc.getValue();
    }

    private static byte[] deflate(byte[] data) throws IOException {
        // nowrap = true: zip entries store raw deflate streams.
        ByteArrayOutputStream compressed = new ByteArrayOutputStream();
        try (OutputStream output = new DeflaterOutputStream(compressed, new Deflater(Deflater.DEFAULT_COMPRESSION, true))) {
            output.write(data);
        }
        return compressed.toByteArray();
    }
}
