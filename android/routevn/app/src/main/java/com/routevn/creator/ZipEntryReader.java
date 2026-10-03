package com.routevn.creator;

import java.io.Closeable;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.util.Arrays;
import java.util.function.LongConsumer;
import java.util.zip.CRC32;
import java.util.zip.Inflater;

/**
 * Extracts single central-directory records through a RandomAccessFile.
 * The local header must match the central record (signature and entry
 * name bytes), the central sizes and CRC are authoritative regardless of
 * the data-descriptor flag, STORED data is copied for exactly the
 * declared byte count and DEFLATED data is inflated with a raw
 * java.util.zip.Inflater that must consume and produce exactly the
 * declared byte counts. Every output file is created exclusively by the
 * caller and deleted again when extraction of the entry fails.
 */
final class ZipEntryReader implements Closeable {
    private static final long LOCAL_SIGNATURE = 0x04034b50L;
    private static final int BUFFER_SIZE = 64 * 1024;
    private static final int METHOD_STORED = 0;
    private static final int METHOD_DEFLATED = 8;
    private static final int FLAG_ENCRYPTED = 0x0001;
    private static final int FLAG_STRONG_ENCRYPTION = 0x0040;

    private final RandomAccessFile file;
    private LongConsumer bytesWrittenListener;

    ZipEntryReader(File archiveFile) throws IOException {
        this.file = new RandomAccessFile(archiveFile, "r");
    }

    /** Called with the size of every chunk written to an output file. */
    void setBytesWrittenListener(LongConsumer listener) {
        this.bytesWrittenListener = listener;
    }

    private void notifyBytesWritten(int count) {
        if (bytesWrittenListener != null) {
            bytesWrittenListener.accept(count);
        }
    }

    /**
     * Extracts {@code entry} into the exclusively created, still empty
     * {@code outputFile} and returns the number of bytes written; the
     * shared budget {@code remainingUncompressedBytes} bounds the actual
     * bytes written and the partial file is deleted on every failure.
     */
    long extract(
        ZipCentralDirectory.Entry entry,
        File outputFile,
        long remainingUncompressedBytes
    ) throws IOException, ProjectImportException {
        boolean completed = false;
        try {
            if ((entry.flags & FLAG_ENCRYPTED) != 0) {
                throw new ProjectImportException("invalidArchive", "Entry is encrypted: " + entry.name);
            }
            if ((entry.flags & FLAG_STRONG_ENCRYPTION) != 0) {
                throw new ProjectImportException(
                    "invalidArchive",
                    "Entry uses strong encryption: " + entry.name
                );
            }
            long dataOffset = locateData(entry);
            if (dataOffset + entry.compressedSize > file.length()) {
                throw new ProjectImportException(
                    "invalidArchive",
                    "Entry data is out of bounds: " + entry.name
                );
            }
            CRC32 crc = new CRC32();
            try (OutputStream output = new FileOutputStream(outputFile)) {
                if (entry.method == METHOD_STORED) {
                    copyStored(entry, dataOffset, output, crc, remainingUncompressedBytes);
                } else if (entry.method == METHOD_DEFLATED) {
                    inflateEntry(entry, dataOffset, output, crc, remainingUncompressedBytes);
                } else {
                    throw new ProjectImportException(
                        "invalidArchive",
                        "Unsupported compression method " + entry.method + ": " + entry.name
                    );
                }
                if (crc.getValue() != entry.crc) {
                    throw new ProjectImportException(
                        "invalidArchive",
                        "Entry CRC mismatch: " + entry.name
                    );
                }
            }
            completed = true;
        } finally {
            if (!completed) {
                outputFile.delete();
            }
        }
        return entry.uncompressedSize;
    }

    /**
     * Seeks to the local header, requires the signature and a local entry
     * name identical to the central name bytes, and returns the offset of
     * the entry data.
     */
    private long locateData(ZipCentralDirectory.Entry entry)
        throws IOException, ProjectImportException {
        byte[] header = new byte[30];
        readFully(entry.localHeaderOffset, header, "Local header is truncated: " + entry.name);
        if (le32u(header, 0) != LOCAL_SIGNATURE) {
            throw new ProjectImportException(
                "invalidArchive",
                "Local header signature mismatch: " + entry.name
            );
        }
        int nameLength = le16(header, 26);
        int extraLength = le16(header, 28);
        byte[] localName = new byte[nameLength];
        readFully(
            entry.localHeaderOffset + 30,
            localName,
            "Local header name is truncated: " + entry.name
        );
        if (!Arrays.equals(localName, entry.nameBytes)) {
            throw new ProjectImportException(
                "invalidArchive",
                "Local entry name does not match the central directory: " + entry.name
            );
        }
        return entry.localHeaderOffset + 30 + nameLength + extraLength;
    }

    private void copyStored(
        ZipCentralDirectory.Entry entry,
        long dataOffset,
        OutputStream output,
        CRC32 crc,
        long remainingUncompressedBytes
    ) throws IOException, ProjectImportException {
        if (entry.compressedSize != entry.uncompressedSize) {
            throw new ProjectImportException(
                "invalidArchive",
                "Stored entry size mismatch: " + entry.name
            );
        }
        file.seek(dataOffset);
        byte[] buffer = new byte[BUFFER_SIZE];
        long remaining = entry.compressedSize;
        while (remaining > 0) {
            int count = file.read(buffer, 0, (int) Math.min(buffer.length, remaining));
            if (count < 0) {
                throw new ProjectImportException(
                    "invalidArchive",
                    "Entry data is truncated: " + entry.name
                );
            }
            checkBudget(entry, remainingUncompressedBytes, count);
            output.write(buffer, 0, count);
            notifyBytesWritten(count);
            crc.update(buffer, 0, count);
            remaining -= count;
            remainingUncompressedBytes -= count;
        }
    }

    private void inflateEntry(
        ZipCentralDirectory.Entry entry,
        long dataOffset,
        OutputStream output,
        CRC32 crc,
        long remainingUncompressedBytes
    ) throws IOException, ProjectImportException {
        file.seek(dataOffset);
        Inflater inflater = new Inflater(true);
        byte[] input = new byte[BUFFER_SIZE];
        byte[] outputBuffer = new byte[BUFFER_SIZE];
        long inputRemaining = entry.compressedSize;
        long produced = 0;
        try {
            while (!inflater.finished()) {
                if (inflater.needsInput() && inputRemaining > 0) {
                    int count = file.read(input, 0, (int) Math.min(input.length, inputRemaining));
                    if (count < 0) {
                        throw new ProjectImportException(
                            "invalidArchive",
                            "Entry data is truncated: " + entry.name
                        );
                    }
                    inflater.setInput(input, 0, count);
                    inputRemaining -= count;
                }
                int count;
                try {
                    count = inflater.inflate(outputBuffer);
                } catch (java.util.zip.DataFormatException error) {
                    throw new ProjectImportException(
                        "invalidArchive",
                        "Deflate stream is corrupt: " + entry.name
                    );
                }
                if (count > 0) {
                    checkBudget(entry, remainingUncompressedBytes, count);
                    output.write(outputBuffer, 0, count);
                    notifyBytesWritten(count);
                    crc.update(outputBuffer, 0, count);
                    remainingUncompressedBytes -= count;
                    produced += count;
                    if (produced > entry.uncompressedSize) {
                        throw new ProjectImportException(
                            "invalidArchive",
                            "Entry expands beyond its declared size: " + entry.name
                        );
                    }
                } else if (inflater.needsDictionary()) {
                    throw new ProjectImportException(
                        "invalidArchive",
                        "Entry needs a preset dictionary: " + entry.name
                    );
                } else if (inflater.needsInput() && inputRemaining == 0) {
                    throw new ProjectImportException(
                        "invalidArchive",
                        "Deflate stream is truncated: " + entry.name
                    );
                }
            }
            if (inflater.getBytesRead() != entry.compressedSize) {
                throw new ProjectImportException(
                    "invalidArchive",
                    "Entry compressed size mismatch: " + entry.name
                );
            }
            if (produced != entry.uncompressedSize) {
                throw new ProjectImportException(
                    "invalidArchive",
                    "Entry size mismatch: " + entry.name
                );
            }
        } finally {
            inflater.end();
        }
    }

    private void checkBudget(
        ZipCentralDirectory.Entry entry,
        long remainingUncompressedBytes,
        int nextChunk
    ) throws ProjectImportException {
        if (nextChunk > remainingUncompressedBytes) {
            throw new ProjectImportException(
                "archiveTooLarge",
                "Archive expands beyond the uncompressed byte limit at: " + entry.name
            );
        }
    }

    private void readFully(long offset, byte[] target, String failure)
        throws IOException, ProjectImportException {
        file.seek(offset);
        try {
            file.readFully(target);
        } catch (IOException error) {
            throw new ProjectImportException("invalidArchive", failure);
        }
    }

    private static int le16(byte[] data, int offset) {
        return (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
    }

    private static long le32u(byte[] data, int offset) {
        return ((data[offset] & 0xFF) |
            ((data[offset + 1] & 0xFF) << 8) |
            ((data[offset + 2] & 0xFF) << 16) |
            ((data[offset + 3] & 0xFF) << 24)) & 0xFFFFFFFFL;
    }

    @Override
    public void close() throws IOException {
        file.close();
    }
}
