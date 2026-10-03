package com.routevn.creator;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipFile;

/**
 * Basic zip operations for imports: list the entry table and extract the
 * entries JavaScript asked for. It never decides what an archive layout
 * should be; it only keeps the filesystem and the byte counts honest.
 */
final class ImportArchive {
    static final class Entry {
        final String name;
        final long size;
        final boolean isDirectory;

        Entry(String name, long size, boolean isDirectory) {
            this.name = name;
            this.size = size;
            this.isDirectory = isDirectory;
        }
    }

    /** One requested entry and the relative path to write it to. */
    static final class Item {
        final String entry;
        final String path;

        Item(String entry, String path) {
            this.entry = entry;
            this.path = path;
        }
    }

    private ImportArchive() {}

    /** Raw entry names; invalidArchive when it is not a readable zip or has too many entries. */
    static List<Entry> list(File zip, int maxEntries) throws ProjectImportException {
        try (ZipFile archive = new ZipFile(zip)) {
            if (archive.size() > maxEntries) {
                throw invalid("Archive has more than " + maxEntries + " entries.");
            }
            List<Entry> entries = new ArrayList<>();
            for (ZipEntry entry : Collections.list(archive.entries())) {
                entries.add(new Entry(entry.getName(), entry.getSize(), entry.isDirectory()));
            }
            return entries;
        } catch (IOException | RuntimeException error) {
            throw invalid("Cannot read the archive: " + error.getMessage());
        }
    }

    /**
     * Writes only the requested entries to destinationRoot/path and returns
     * the number of bytes written. Everything this call created is removed
     * when it fails.
     */
    static long extract(
        File zip,
        File destinationRoot,
        List<Item> items,
        long maxBytes,
        ImportProgress progress
    ) throws ProjectImportException {
        Set<String> destinations = new HashSet<>();
        for (Item item : items) {
            if (!ImportStaging.isSafePath(item.path)) {
                throw new ProjectImportException(
                    "unsafeArchiveEntry",
                    "Unsafe destination path: " + item.path
                );
            }
            if (!destinations.add(item.path.toLowerCase(Locale.ROOT))) {
                throw invalid("Two entries use the destination " + item.path + ".");
            }
        }

        List<File> created = new ArrayList<>();
        boolean done = false;
        try (ZipFile archive = new ZipFile(zip)) {
            List<ZipEntry> entries = new ArrayList<>();
            long total = 0;
            for (Item item : items) {
                ZipEntry entry = archive.getEntry(item.entry);
                if (entry == null) {
                    throw invalid("Archive has no entry " + item.entry + ".");
                }
                entries.add(entry);
                total += Math.max(0, entry.getSize());
            }

            File root = makeDirectories(destinationRoot, created);
            progress.report(0, total);
            long written = 0;
            for (int index = 0; index < items.size(); index += 1) {
                written = extractEntry(
                    archive,
                    entries.get(index),
                    root,
                    items.get(index).path,
                    written,
                    total,
                    maxBytes,
                    progress,
                    created
                );
            }
            progress.finish(written, total);
            done = true;
            return written;
        } catch (ZipException error) {
            throw invalid("Cannot read the archive: " + error.getMessage());
        } catch (IOException | RuntimeException error) {
            throw ProjectImportException.of(error);
        } finally {
            if (!done) {
                removeCreated(created);
            }
        }
    }

    private static long extractEntry(
        ZipFile archive,
        ZipEntry entry,
        File root,
        String path,
        long written,
        long total,
        long maxBytes,
        ImportProgress progress,
        List<File> created
    ) throws IOException, ProjectImportException {
        String[] segments = path.split("/");
        File parent = root;
        for (int index = 0; index < segments.length - 1; index += 1) {
            parent = childDirectory(parent, segments[index], created);
        }
        String name = segments[segments.length - 1];
        if (entry.isDirectory()) {
            childDirectory(parent, name, created);
            return written;
        }

        File target = new File(parent, name);
        if (!target.createNewFile()) {
            throw new ProjectImportException("importFailed", "Destination already exists: " + path);
        }
        created.add(target);
        CRC32 crc = new CRC32();
        long count = 0;
        try (
            InputStream input = archive.getInputStream(entry);
            OutputStream output = new FileOutputStream(target)
        ) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (written + count + read > maxBytes) {
                    throw new ProjectImportException(
                        "archiveTooLarge",
                        "Archive expands past " + maxBytes + " bytes."
                    );
                }
                crc.update(buffer, 0, read);
                output.write(buffer, 0, read);
                count += read;
                progress.report(written + count, total);
            }
        }
        // ZipFile does not verify the CRC32, so check it and the size here.
        if (count != entry.getSize() || crc.getValue() != entry.getCrc()) {
            throw invalid("Entry " + entry.getName() + " does not match its recorded size or CRC32.");
        }
        return written + count;
    }

    /** Creates {@code root} and any missing parents, returning its canonical file. */
    private static File makeDirectories(File root, List<File> created) throws ProjectImportException, IOException {
        List<File> missing = new ArrayList<>();
        for (File file = root; !file.exists(); file = file.getParentFile()) {
            missing.add(0, file);
        }
        for (File directory : missing) {
            if (!directory.mkdir()) {
                throw new ProjectImportException("importFailed", "Cannot create the destination folder.");
            }
            created.add(directory);
        }
        return root.getCanonicalFile();
    }

    /** Returns parent/name as a real folder, creating it; a symlink or a file in the way fails. */
    private static File childDirectory(File parent, String name, List<File> created)
        throws ProjectImportException {
        File directory = new File(parent, name);
        if (ImportStaging.isSymlink(directory)) {
            throw new ProjectImportException(
                "unsafeArchiveEntry",
                "Destination folder is a symlink: " + name
            );
        }
        if (!directory.exists()) {
            if (!directory.mkdir()) {
                throw new ProjectImportException("importFailed", "Cannot create the folder " + name + ".");
            }
            created.add(directory);
        } else if (!directory.isDirectory()) {
            throw invalid("A file is in the way of the folder " + name + ".");
        }
        return directory;
    }

    private static void removeCreated(List<File> created) {
        for (int index = created.size() - 1; index >= 0; index -= 1) {
            created.get(index).delete();
        }
    }

    private static ProjectImportException invalid(String detail) {
        return new ProjectImportException("invalidArchive", detail);
    }
}
