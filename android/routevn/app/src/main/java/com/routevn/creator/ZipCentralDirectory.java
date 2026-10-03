package com.routevn.creator;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * The single trusted parser for project archive central directories: the
 * same records validate and drive extraction, so no second parser can
 * disagree about which entries exist. The end record must be the only
 * exact-length EOCD candidate in the last 65,557 bytes, the central
 * directory must end exactly at the EOCD (or at the zip64 end record when
 * zip64 is used), the parsed record count and byte consumption must match
 * the declared values, and the directory is read through a bounded 64 KiB
 * chunked reader instead of one allocation.
 */
final class ZipCentralDirectory {
    static final int MAX_CENTRAL_DIRECTORY_BYTES = 64 * 1024 * 1024;
    static final int MAX_ENTRY_NAME_BYTES = 4096;

    private static final int MAX_EOCD_SEARCH_BYTES = 65_557;
    private static final int EOCD_SIGNATURE = 0x06054b50;
    private static final int ZIP64_EOCD_LOCATOR_SIGNATURE = 0x07064b50;
    private static final int ZIP64_EOCD_SIGNATURE = 0x06064b50;
    private static final long ZIP64_EOCD_MINIMUM_SIZE = 44;
    private static final long CENTRAL_SIGNATURE = 0x02014b50L;
    private static final int ZIP64_EXTRA_HEADER_ID = 0x0001;
    private static final int UNIX_FILE_TYPE_MASK = 0170000;
    private static final int UNIX_DIRECTORY_TYPE = 040000;
    private static final int FLAG_UTF8_NAME = 0x0800;
    private static final int DOS_HOST = 0;
    private static final int NTFS_HOST = 10;
    private static final int DOS_DIRECTORY_ATTRIBUTE = 0x10;

    /** Compact central-directory record used for validation and extraction. */
    static final class Entry {
        final String name;
        final byte[] nameBytes;
        final int flags;
        final int method;
        final long crc;
        final long compressedSize;
        final long uncompressedSize;
        final long localHeaderOffset;
        final int unixMode;
        final boolean directory;

        Entry(
            String name,
            byte[] nameBytes,
            int flags,
            int method,
            long crc,
            long compressedSize,
            long uncompressedSize,
            long localHeaderOffset,
            int unixMode,
            boolean dosDirectory
        ) {
            this.name = name;
            this.nameBytes = nameBytes;
            this.flags = flags;
            this.method = method;
            this.crc = crc;
            this.compressedSize = compressedSize;
            this.uncompressedSize = uncompressedSize;
            this.localHeaderOffset = localHeaderOffset;
            this.unixMode = unixMode;
            this.directory = name.endsWith("/") ||
                (unixMode & UNIX_FILE_TYPE_MASK) == UNIX_DIRECTORY_TYPE ||
                dosDirectory;
        }
    }

    private ZipCentralDirectory() {}

    static List<Entry> parse(File archiveFile, int maxEntries)
        throws IOException, ProjectImportException {
        long fileLength = archiveFile.length();
        try (RandomAccessFile file = new RandomAccessFile(archiveFile, "r")) {
            EndRecord end = findEndRecord(file, fileLength);
            long entryCount = le16(end.bytes, 10);
            long centralSize = le32u(end.bytes, 12);
            long centralOffset = le32u(end.bytes, 16);
            long centralEnd = end.position;
            if (
                entryCount == 0xFFFF ||
                centralSize == 0xFFFFFFFFL ||
                centralOffset == 0xFFFFFFFFL
            ) {
                Zip64EndRecord zip64 = readZip64EndRecord(file, end.position, fileLength);
                if (entryCount == 0xFFFF) entryCount = zip64.entryCount;
                if (centralSize == 0xFFFFFFFFL) centralSize = zip64.centralSize;
                if (centralOffset == 0xFFFFFFFFL) centralOffset = zip64.centralOffset;
                centralEnd = zip64.position;
            }
            if (entryCount > maxEntries) {
                throw new ProjectImportException(
                    "archiveTooLarge",
                    "Archive has too many entries: " + entryCount + "."
                );
            }
            if (centralSize > MAX_CENTRAL_DIRECTORY_BYTES) {
                throw new ProjectImportException(
                    "archiveTooLarge",
                    "Central directory is larger than " + MAX_CENTRAL_DIRECTORY_BYTES + " bytes."
                );
            }
            if (centralOffset < 0 || centralEnd - centralOffset != centralSize) {
                throw new ProjectImportException(
                    "invalidArchive",
                    "Central directory is out of bounds."
                );
            }
            return readEntries(file, centralOffset, centralSize, entryCount);
        }
    }

    private static final class EndRecord {
        final byte[] bytes = new byte[22];
        final long position;

        EndRecord(long position) {
            this.position = position;
        }
    }

    /**
     * Scans the last 65,557 bytes and requires exactly one EOCD candidate
     * whose comment ends exactly at the end of the file: a fake EOCD
     * hidden inside a comment of another exact-length candidate is a
     * rejection, not a tiebreak.
     */
    private static EndRecord findEndRecord(RandomAccessFile file, long fileLength)
        throws IOException, ProjectImportException {
        int tailLength = (int) Math.min(fileLength, MAX_EOCD_SEARCH_BYTES);
        byte[] tail = new byte[tailLength];
        file.seek(fileLength - tailLength);
        file.readFully(tail);
        EndRecord match = null;
        for (int index = 0; index + 22 <= tailLength; index += 1) {
            if (le32(tail, index) != EOCD_SIGNATURE) {
                continue;
            }
            int commentLength = le16(tail, index + 20);
            if ((long) index + 22 + commentLength != tailLength) {
                continue;
            }
            if (match != null) {
                throw new ProjectImportException(
                    "invalidArchive",
                    "Archive has multiple end-of-central-directory records."
                );
            }
            match = new EndRecord(fileLength - tailLength + index);
        }
        if (match == null) {
            throw new ProjectImportException(
                "invalidArchive",
                "End of central directory record not found."
            );
        }
        file.seek(match.position);
        file.readFully(match.bytes);
        return match;
    }

    private static final class Zip64EndRecord {
        final long position;
        final long entryCount;
        final long centralSize;
        final long centralOffset;

        Zip64EndRecord(long position, long entryCount, long centralSize, long centralOffset) {
            this.position = position;
            this.entryCount = entryCount;
            this.centralSize = centralSize;
            this.centralOffset = centralOffset;
        }
    }

    /**
     * Reads the zip64 EOCD locator with a positioned read directly before
     * the EOCD (it is never inside the comment tail), then the record it
     * points to.
     */
    private static Zip64EndRecord readZip64EndRecord(
        RandomAccessFile file,
        long eocdPosition,
        long fileLength
    ) throws IOException, ProjectImportException {
        if (eocdPosition < 20) {
            throw new ProjectImportException("invalidArchive", "Invalid zip64 end record locator.");
        }
        byte[] locator = new byte[20];
        file.seek(eocdPosition - 20);
        file.readFully(locator);
        if (le32(locator, 0) != ZIP64_EOCD_LOCATOR_SIGNATURE) {
            throw new ProjectImportException("invalidArchive", "Invalid zip64 end record locator.");
        }
        // Single-disk archives only: a locator pointing at another disk is
        // not a layout this reader can verify.
        if (le32u(locator, 4) != 0 || le32u(locator, 16) != 1) {
            throw new ProjectImportException("invalidArchive", "Invalid zip64 end record locator.");
        }
        long recordPosition = le64u(locator, 8);
        if (recordPosition < 0 || recordPosition + 56 > fileLength) {
            throw new ProjectImportException("invalidArchive", "Invalid zip64 end record.");
        }
        byte[] record = new byte[56];
        file.seek(recordPosition);
        file.readFully(record);
        if (le32(record, 0) != ZIP64_EOCD_SIGNATURE) {
            throw new ProjectImportException("invalidArchive", "Invalid zip64 end record.");
        }
        if (
            le64u(record, 4) < ZIP64_EOCD_MINIMUM_SIZE ||
            le32u(record, 16) != 0 ||
            le32u(record, 20) != 0 ||
            le64u(record, 24) != le64u(record, 32)
        ) {
            throw new ProjectImportException("invalidArchive", "Invalid zip64 end record.");
        }
        return new Zip64EndRecord(
            recordPosition,
            le64u(record, 32),
            le64u(record, 40),
            le64u(record, 48)
        );
    }

    private static List<Entry> readEntries(
        RandomAccessFile file,
        long centralOffset,
        long centralSize,
        long entryCount
    ) throws IOException, ProjectImportException {
        file.seek(centralOffset);
        ChunkedReader reader = new ChunkedReader(file, centralSize);
        List<Entry> entries = new ArrayList<>();
        for (long index = 0; index < entryCount; index += 1) {
            if (reader.u32() != CENTRAL_SIGNATURE) {
                throw new ProjectImportException(
                    "invalidArchive",
                    "Central directory record is corrupt."
                );
            }
            int versionMadeBy = reader.u16();
            reader.skip(2);
            int flags = reader.u16();
            int method = reader.u16();
            reader.skip(4);
            long crc = reader.u32();
            long compressedSize = reader.u32();
            long uncompressedSize = reader.u32();
            int nameLength = reader.u16();
            int extraLength = reader.u16();
            int commentLength = reader.u16();
            reader.skip(4);
            long externalAttributes = reader.u32();
            long localHeaderOffset = reader.u32();
            if (nameLength > MAX_ENTRY_NAME_BYTES) {
                throw new ProjectImportException(
                    "invalidArchive",
                    "Central directory record exceeds length limits."
                );
            }
            byte[] nameBytes = reader.readBytes(nameLength);
            byte[] extraBytes = reader.readBytes(extraLength);
            reader.skip(commentLength);
            if (
                compressedSize == 0xFFFFFFFFL ||
                uncompressedSize == 0xFFFFFFFFL ||
                localHeaderOffset == 0xFFFFFFFFL
            ) {
                long[] zip64Fields = parseZip64Extra(
                    extraBytes,
                    uncompressedSize == 0xFFFFFFFFL,
                    compressedSize == 0xFFFFFFFFL,
                    localHeaderOffset == 0xFFFFFFFFL
                );
                if (uncompressedSize == 0xFFFFFFFFL) uncompressedSize = zip64Fields[0];
                if (compressedSize == 0xFFFFFFFFL) compressedSize = zip64Fields[1];
                if (localHeaderOffset == 0xFFFFFFFFL) localHeaderOffset = zip64Fields[2];
            }
            int hostPlatform = versionMadeBy >>> 8;
            boolean dosDirectory = (hostPlatform == DOS_HOST || hostPlatform == NTFS_HOST) &&
                (externalAttributes & DOS_DIRECTORY_ATTRIBUTE) != 0;
            entries.add(new Entry(
                (flags & FLAG_UTF8_NAME) != 0
                    ? new String(nameBytes, StandardCharsets.UTF_8)
                    : new String(nameBytes, StandardCharsets.ISO_8859_1),
                nameBytes,
                flags,
                method,
                crc,
                compressedSize,
                uncompressedSize,
                localHeaderOffset,
                (int) (externalAttributes >>> 16),
                dosDirectory
            ));
        }
        if (reader.consumed() != centralSize) {
            throw new ProjectImportException(
                "invalidArchive",
                "Central directory size mismatch."
            );
        }
        return entries;
    }

    /**
     * Walks the extra field as (headerId, dataSize) blocks and reads only
     * the saturated fields from the zip64 block, in specification order
     * (uncompressed size, compressed size, local header offset); a block
     * too short for the required fields is invalid.
     */
    private static long[] parseZip64Extra(
        byte[] extra,
        boolean needUncompressed,
        boolean needCompressed,
        boolean needLocalOffset
    ) throws ProjectImportException {
        long uncompressedSize = -1;
        long compressedSize = -1;
        long localHeaderOffset = -1;
        int offset = 0;
        while (offset + 4 <= extra.length) {
            int headerId = le16(extra, offset);
            int dataSize = le16(extra, offset + 2);
            int dataOffset = offset + 4;
            if (dataOffset + dataSize > extra.length) {
                throw new ProjectImportException("invalidArchive", "Invalid zip64 extra field.");
            }
            if (headerId == ZIP64_EXTRA_HEADER_ID) {
                int fieldOffset = dataOffset;
                int dataEnd = dataOffset + dataSize;
                if (needUncompressed) {
                    if (fieldOffset + 8 > dataEnd) {
                        throw new ProjectImportException("invalidArchive", "Invalid zip64 extra field.");
                    }
                    uncompressedSize = le64u(extra, fieldOffset);
                    fieldOffset += 8;
                }
                if (needCompressed) {
                    if (fieldOffset + 8 > dataEnd) {
                        throw new ProjectImportException("invalidArchive", "Invalid zip64 extra field.");
                    }
                    compressedSize = le64u(extra, fieldOffset);
                    fieldOffset += 8;
                }
                if (needLocalOffset) {
                    if (fieldOffset + 8 > dataEnd) {
                        throw new ProjectImportException("invalidArchive", "Invalid zip64 extra field.");
                    }
                    localHeaderOffset = le64u(extra, fieldOffset);
                }
                break;
            }
            offset = dataOffset + dataSize;
        }
        if (
            (needUncompressed && uncompressedSize < 0) ||
            (needCompressed && compressedSize < 0) ||
            (needLocalOffset && localHeaderOffset < 0)
        ) {
            throw new ProjectImportException("invalidArchive", "Invalid zip64 extra field.");
        }
        return new long[] { uncompressedSize, compressedSize, localHeaderOffset };
    }

    /** Bounded buffered reader over exactly {@code limit} central bytes. */
    private static final class ChunkedReader {
        private final RandomAccessFile file;
        private final byte[] buffer = new byte[64 * 1024];
        private long remaining;
        private int position;
        private int buffered;
        private long consumedBytes;

        ChunkedReader(RandomAccessFile file, long limit) {
            this.file = file;
            this.remaining = limit;
        }

        long consumed() {
            return consumedBytes;
        }

        private void ensure(int count) throws IOException, ProjectImportException {
            if (position + count <= buffered) {
                return;
            }
            int leftover = buffered - position;
            System.arraycopy(buffer, position, buffer, 0, leftover);
            position = 0;
            buffered = leftover;
            while (buffered < count) {
                if (remaining <= 0) {
                    throw new ProjectImportException(
                        "invalidArchive",
                        "Central directory record is truncated."
                    );
                }
                int read = file.read(buffer, buffered, (int) Math.min(buffer.length - buffered, remaining));
                if (read < 0) {
                    throw new ProjectImportException(
                        "invalidArchive",
                        "Central directory record is truncated."
                    );
                }
                remaining -= read;
                buffered += read;
            }
        }

        int u16() throws IOException, ProjectImportException {
            ensure(2);
            int value = le16(buffer, position);
            position += 2;
            consumedBytes += 2;
            return value;
        }

        long u32() throws IOException, ProjectImportException {
            ensure(4);
            long value = le32u(buffer, position);
            position += 4;
            consumedBytes += 4;
            return value;
        }

        byte[] readBytes(int count) throws IOException, ProjectImportException {
            if (count == 0) {
                return new byte[0];
            }
            ensure(count);
            byte[] value = Arrays.copyOfRange(buffer, position, position + count);
            position += count;
            consumedBytes += count;
            return value;
        }

        void skip(int count) throws IOException, ProjectImportException {
            if (count > 0) {
                ensure(count);
                position += count;
                consumedBytes += count;
            }
        }
    }

    private static int le16(byte[] data, int offset) {
        return (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
    }

    private static int le32(byte[] data, int offset) {
        return (data[offset] & 0xFF) |
            ((data[offset + 1] & 0xFF) << 8) |
            ((data[offset + 2] & 0xFF) << 16) |
            ((data[offset + 3] & 0xFF) << 24);
    }

    private static long le32u(byte[] data, int offset) {
        return le32(data, offset) & 0xFFFFFFFFL;
    }

    private static long le64u(byte[] data, int offset) {
        return le32u(data, offset) | (le32u(data, offset + 4) << 32);
    }
}
