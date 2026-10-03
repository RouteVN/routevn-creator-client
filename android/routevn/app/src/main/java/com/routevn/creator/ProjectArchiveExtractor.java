package com.routevn.creator;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Rule B archive extraction. Stages a project archive (zip) into the same
 * layout the folder importer stages: project.db (+ -wal/-shm/-journal
 * sidecars), files/ and file-metadata/. The project root is the zip root
 * when it directly contains project.db, otherwise the single top-level
 * directory that contains it; anything else is not a RouteVN archive.
 *
 * ZipCentralDirectory is the only parser: the records it validates are the
 * records ZipEntryReader extracts, so the safety checks and the extracted
 * data can never disagree. Only the entries listed above are extracted;
 * __MACOSX trees, dot-prefixed basenames, and entries nested under
 * sub-directories of files/ are skipped. Every entry name is validated
 * against zip-slip (absolute paths, "..", ".", backslashes, empty
 * segments, drive prefixes, NUL), normalized paths must be unique
 * (case-insensitively) and never used as both a file and a directory, and
 * symlink entries are rejected. Every output file is created exclusively.
 * Limits (entry count, total uncompressed bytes, archive size) are
 * enforced against declared sizes and against the actual bytes written.
 *
 * The caller owns the staging directory and its cleanup.
 */
class ProjectArchiveExtractor {
    static final int DEFAULT_MAX_ENTRIES = 50_000;
    static final long DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 8L * 1024 * 1024 * 1024;
    static final long DEFAULT_MAX_ARCHIVE_BYTES = 4L * 1024 * 1024 * 1024;

    static final int MAX_ENTRY_SEGMENTS = 32;
    static final int MAX_RETAINED_PATH_CHARS = 8 * 1024 * 1024;

    private static final int UNIX_SYMLINK_TYPE = 0120000;
    private static final int UNIX_FILE_TYPE_MASK = 0170000;
    private static final int UNIX_REGULAR_TYPE = 0100000;
    private static final int UNIX_DIRECTORY_TYPE = 040000;

    private final int maxEntries;
    private final long maxTotalUncompressedBytes;
    private final long maxArchiveBytes;

    ProjectArchiveExtractor() {
        this(DEFAULT_MAX_ENTRIES, DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES, DEFAULT_MAX_ARCHIVE_BYTES);
    }

    ProjectArchiveExtractor(
        int maxEntries,
        long maxTotalUncompressedBytes,
        long maxArchiveBytes
    ) {
        this.maxEntries = maxEntries;
        this.maxTotalUncompressedBytes = maxTotalUncompressedBytes;
        this.maxArchiveBytes = maxArchiveBytes;
    }

    private static final class ArchiveEntry {
        ZipCentralDirectory.Entry central;
        List<String> segments;
        boolean directory;

        String name() {
            return central.name;
        }
    }

    /**
     * Extracts the project payload of {@code archiveFile} into
     * {@code stagingDirectory}, which must already exist. The files/ and
     * file-metadata/ directories are always present afterwards (empty when
     * the archive has no such payload).
     */
    void extract(File archiveFile, File stagingDirectory, String incompleteMarkerName)
        throws ProjectImportException {
        extract(archiveFile, stagingDirectory, incompleteMarkerName, ProjectImportProgress.NONE);
    }

    /**
     * Same as {@link #extract(File, File, String)}, reporting "extracting"
     * progress as uncompressed bytes written of the declared total.
     */
    void extract(
        File archiveFile,
        File stagingDirectory,
        String incompleteMarkerName,
        ProjectImportProgress progress
    ) throws ProjectImportException {
        if (archiveFile.length() > maxArchiveBytes) {
            throw new ProjectImportException(
                "archiveTooLarge",
                "Archive is larger than " + maxArchiveBytes + " bytes."
            );
        }

        List<ZipCentralDirectory.Entry> centralEntries;
        try {
            centralEntries = ZipCentralDirectory.parse(archiveFile, maxEntries);
        } catch (IOException error) {
            throw new ProjectImportException("invalidArchive", "Cannot read the archive.");
        }
        List<ArchiveEntry> entries = normalizeEntries(centralEntries);
        buildPathTree(entries);
        List<String> rootSegments = resolveProjectRoot(entries, incompleteMarkerName);

        List<ArchiveEntry> extractable = new ArrayList<>();
        long declaredTotal = 0;
        for (ArchiveEntry entry : entries) {
            if (relativeProjectPath(entry, rootSegments) == null) {
                continue;
            }
            extractable.add(entry);
            try {
                declaredTotal = Math.addExact(declaredTotal, entry.central.uncompressedSize);
            } catch (ArithmeticException overflow) {
                throw new ProjectImportException(
                    "archiveTooLarge",
                    "Archive declares an uncompressed total beyond the supported range."
                );
            }
        }
        if (declaredTotal > maxTotalUncompressedBytes) {
            throw new ProjectImportException(
                "archiveTooLarge",
                "Archive declares more than " + maxTotalUncompressedBytes + " uncompressed bytes."
            );
        }

        String stagingPath = canonicalDirectoryPath(stagingDirectory);
        long writtenTotal = 0;
        final long declared = declaredTotal;
        final long[] entryBytes = new long[1];
        progress.report("extracting", 0, declared);
        try (ZipEntryReader reader = new ZipEntryReader(archiveFile)) {
            long[] writtenBeforeEntry = new long[1];
            reader.setBytesWrittenListener(count -> {
                entryBytes[0] += count;
                progress.report("extracting", writtenBeforeEntry[0] + entryBytes[0], declared);
            });
            for (ArchiveEntry entry : extractable) {
                writtenBeforeEntry[0] = writtenTotal;
                entryBytes[0] = 0;
                File outputFile = new File(
                    stagingDirectory,
                    relativeProjectPath(entry, rootSegments)
                );
                prepareOutputFile(outputFile, stagingDirectory, stagingPath, entry.name());
                writtenTotal += reader.extract(
                    entry.central,
                    outputFile,
                    maxTotalUncompressedBytes - writtenTotal
                );
            }
        } catch (IOException error) {
            throw new ProjectImportException("importFailed", "Cannot extract the archive.");
        }
        progress.finish("extracting", writtenTotal, declared);
        ensureDirectory(new File(stagingDirectory, "files"));
        ensureDirectory(new File(stagingDirectory, "file-metadata"));
    }

    private String canonicalDirectoryPath(File directory) throws ProjectImportException {
        try {
            return directory.getCanonicalPath() + File.separator;
        } catch (IOException error) {
            throw new ProjectImportException(
                "importFailed",
                "Cannot resolve the staging directory."
            );
        }
    }

    private List<ArchiveEntry> normalizeEntries(List<ZipCentralDirectory.Entry> centralEntries)
        throws ProjectImportException {
        List<ArchiveEntry> entries = new ArrayList<>(centralEntries.size());
        int retainedPathChars = 0;
        for (ZipCentralDirectory.Entry central : centralEntries) {
            validateEntryType(central);
            ArchiveEntry entry = new ArchiveEntry();
            entry.central = central;
            entry.directory = central.directory;
            entry.segments = segmentsOf(central.name);
            entries.add(entry);
            // The path model retains each entry name (segments plus the
            // normalized lookup paths); cap the total so a central
            // directory of maximal names cannot amplify into heap abuse.
            retainedPathChars += central.name.length();
            if (retainedPathChars > MAX_RETAINED_PATH_CHARS) {
                throw new ProjectImportException(
                    "archiveTooLarge",
                    "Archive entry names exceed the retained path limit."
                );
            }
        }
        return entries;
    }

    private List<String> segmentsOf(String name) throws ProjectImportException {
        if (name.indexOf('\0') >= 0) {
            throw new ProjectImportException("unsafeArchiveEntry", "Entry name contains NUL.");
        }
        if (name.indexOf('\\') >= 0) {
            throw new ProjectImportException(
                "unsafeArchiveEntry",
                "Entry name contains a backslash: " + name
            );
        }
        if (name.startsWith("/")) {
            throw new ProjectImportException("unsafeArchiveEntry", "Absolute entry name: " + name);
        }
        List<String> segments = new ArrayList<>();
        String[] parts = name.split("/", -1);
        for (int index = 0; index < parts.length; index += 1) {
            String segment = parts[index];
            if (segment.isEmpty()) {
                // Only a single trailing slash of a directory entry may be
                // empty; anything else collapses distinct raw names onto one
                // staged path.
                if (index == parts.length - 1 && name.endsWith("/")) {
                    continue;
                }
                throw new ProjectImportException(
                    "unsafeArchiveEntry",
                    "Entry name has an empty path segment: " + name
                );
            }
            if ("..".equals(segment)) {
                throw new ProjectImportException(
                    "unsafeArchiveEntry",
                    "Entry name escapes the archive: " + name
                );
            }
            if (".".equals(segment)) {
                throw new ProjectImportException(
                    "unsafeArchiveEntry",
                    "Entry name has a '.' path segment: " + name
                );
            }
            if (segment.indexOf(':') >= 0) {
                throw new ProjectImportException(
                    "unsafeArchiveEntry",
                    "Entry name segment contains ':': " + name
                );
            }
            segments.add(segment);
        }
        if (segments.size() > MAX_ENTRY_SEGMENTS) {
            throw new ProjectImportException(
                "unsafeArchiveEntry",
                "Entry name has more than " + MAX_ENTRY_SEGMENTS + " path segments: " + name
            );
        }
        return segments;
    }

    private void validateEntryType(ZipCentralDirectory.Entry central)
        throws ProjectImportException {
        int fileType = central.unixMode & UNIX_FILE_TYPE_MASK;
        if (fileType == 0 || fileType == UNIX_REGULAR_TYPE || fileType == UNIX_DIRECTORY_TYPE) {
            return;
        }
        if (fileType == UNIX_SYMLINK_TYPE) {
            throw new ProjectImportException(
                "unsafeArchiveEntry",
                "Entry is a symlink: " + central.name
            );
        }
        throw new ProjectImportException(
            "unsafeArchiveEntry",
            "Entry is not a regular file: " + central.name
        );
    }

    /**
     * Rejects any normalized path that appears twice (case-insensitively)
     * or that is used as both a file and a directory. Only full entry
     * names are retained: ancestor paths are validated transiently against
     * the retained file paths (a file must never sit where an entry needs
     * a directory) and then discarded, so deep archives of ignored entries
     * cannot amplify into retained ancestor strings. This also means an
     * implicit directory implied only by a child entry does not conflict
     * with a later file entry at that path; skipped entries never reach
     * the staging directory, so that relaxation is safe.
     */
    private void buildPathTree(List<ArchiveEntry> entries) throws ProjectImportException {
        Set<String> filePaths = new HashSet<>();
        Set<String> directoryPaths = new HashSet<>();
        for (ArchiveEntry entry : entries) {
            if (entry.segments.isEmpty()) {
                continue;
            }
            String path = normalizedPath(entry.segments, entry.segments.size());
            if (entry.directory) {
                if (filePaths.contains(path)) {
                    throw pathConflict(entry.name(), path);
                }
                if (!directoryPaths.add(path)) {
                    throw duplicatePath(entry.name(), path);
                }
            } else {
                if (directoryPaths.contains(path)) {
                    throw pathConflict(entry.name(), path);
                }
                if (!filePaths.add(path)) {
                    throw duplicatePath(entry.name(), path);
                }
            }
            for (int depth = 1; depth < entry.segments.size(); depth += 1) {
                String parent = normalizedPath(entry.segments, depth);
                if (filePaths.contains(parent)) {
                    throw pathConflict(entry.name(), parent);
                }
            }
        }
    }

    private ProjectImportException duplicatePath(String name, String path) {
        return new ProjectImportException(
            "invalidArchive",
            "Archive contains duplicate entry: " + path + " (" + name + ")"
        );
    }

    private ProjectImportException pathConflict(String name, String path) {
        return new ProjectImportException(
            "invalidArchive",
            "Archive path is used as both a file and a directory: " + path + " (" + name + ")"
        );
    }

    private String normalizedPath(List<String> segments, int depth) {
        StringBuilder path = new StringBuilder();
        for (int index = 0; index < depth; index += 1) {
            if (index > 0) {
                path.append('/');
            }
            path.append(segments.get(index));
        }
        return path.toString().toLowerCase(Locale.ROOT);
    }

    /**
     * Creates every parent directory, verifies each existing parent under
     * the staging root is a real directory inside the staging root, and
     * creates the output file exclusively: an existing file or a planted
     * symlink is an error and is never written through.
     */
    private void prepareOutputFile(
        File outputFile,
        File stagingDirectory,
        String stagingPath,
        String entryName
    ) throws ProjectImportException {
        File outputParent = outputFile.getParentFile();
        if (outputParent == null || (!outputParent.exists() && !outputParent.mkdirs())) {
            throw new ProjectImportException(
                "importFailed",
                "Cannot create staging directory for " + entryName
            );
        }
        if (!canonicalDirectoryPath(outputFile).startsWith(stagingPath)) {
            throw new ProjectImportException(
                "unsafeArchiveEntry",
                "Entry resolves outside the staging directory: " + entryName
            );
        }
        File current = outputParent;
        while (!current.equals(stagingDirectory)) {
            if (!current.isDirectory()) {
                throw new ProjectImportException(
                    "importFailed",
                    "Staging path is not a directory for " + entryName
                );
            }
            current = current.getParentFile();
            if (current == null) {
                throw new ProjectImportException(
                    "importFailed",
                    "Staging path escapes the staging directory for " + entryName
                );
            }
        }
        try {
            if (!outputFile.createNewFile()) {
                throw new ProjectImportException(
                    "importFailed",
                    "Cannot exclusively create the staging file for " + entryName
                );
            }
        } catch (IOException error) {
            throw new ProjectImportException(
                "importFailed",
                "Cannot create the staging file for " + entryName
            );
        }
    }

    /**
     * Finds the project root segments (empty for the zip root) and rejects
     * incomplete-export markers and non-directory files/ file-metadata/.
     */
    private List<String> resolveProjectRoot(
        List<ArchiveEntry> entries,
        String incompleteMarkerName
    ) throws ProjectImportException {
        List<String> rootSegments = new ArrayList<>();
        if (!hasFile(entries, rootSegments, "project.db")) {
            rootSegments = findSingleNestedRoot(entries);
        }
        rejectIncompleteMarker(entries, rootSegments, incompleteMarkerName);
        requireDirectoryEntry(entries, rootSegments, "files");
        requireDirectoryEntry(entries, rootSegments, "file-metadata");
        return rootSegments;
    }

    private List<String> findSingleNestedRoot(List<ArchiveEntry> entries)
        throws ProjectImportException {
        Set<String> rootDirectories = new HashSet<>();
        List<String> orderedRoots = new ArrayList<>();
        for (ArchiveEntry entry : entries) {
            if (entry.segments.isEmpty()) {
                continue;
            }
            String firstSegment = entry.segments.get(0);
            if (firstSegment.startsWith(".") || "__MACOSX".equals(firstSegment)) {
                continue;
            }
            if (entry.segments.size() > 1 || entry.directory) {
                if (rootDirectories.add(firstSegment)) {
                    orderedRoots.add(firstSegment);
                }
            }
        }
        if (rootDirectories.size() != 1) {
            throw new ProjectImportException(
                "invalidArchive",
                "Archive does not contain a single project root."
            );
        }
        List<String> rootSegments = new ArrayList<>();
        rootSegments.add(orderedRoots.get(0));
        if (!hasFile(entries, rootSegments, "project.db")) {
            throw new ProjectImportException(
                "invalidArchive",
                "Archive does not contain a project database."
            );
        }
        return rootSegments;
    }

    private void rejectIncompleteMarker(
        List<ArchiveEntry> entries,
        List<String> rootSegments,
        String incompleteMarkerName
    ) throws ProjectImportException {
        // Scan every entry (files and directories): the path tree already
        // rejects duplicates, so a marker cannot be hidden anywhere.
        for (ArchiveEntry entry : entries) {
            if (isChildOf(entry, rootSegments, incompleteMarkerName)) {
                throw new ProjectImportException(
                    "invalidArchive",
                    "Archive is an incomplete export (" + incompleteMarkerName + ")."
                );
            }
        }
    }

    private void requireDirectoryEntry(
        List<ArchiveEntry> entries,
        List<String> rootSegments,
        String name
    ) throws ProjectImportException {
        ArchiveEntry entry = findEntry(entries, rootSegments, name);
        if (entry != null && !entry.directory) {
            throw new ProjectImportException(
                "invalidArchive",
                "Archive " + name + " entry is not a directory."
            );
        }
    }

    private ArchiveEntry findEntry(
        List<ArchiveEntry> entries,
        List<String> parentSegments,
        String fileName
    ) {
        ArchiveEntry match = null;
        for (ArchiveEntry entry : entries) {
            if (!isChildOf(entry, parentSegments, fileName)) {
                continue;
            }
            match = entry;
        }
        return match;
    }

    private boolean hasFile(
        List<ArchiveEntry> entries,
        List<String> parentSegments,
        String fileName
    ) {
        ArchiveEntry entry = findEntry(entries, parentSegments, fileName);
        return entry != null && !entry.directory;
    }

    private boolean isChildOf(
        ArchiveEntry entry,
        List<String> parentSegments,
        String fileName
    ) {
        if (entry.segments.size() != parentSegments.size() + 1) {
            return false;
        }
        for (int index = 0; index < parentSegments.size(); index += 1) {
            if (!entry.segments.get(index).equals(parentSegments.get(index))) {
                return false;
            }
        }
        return entry.segments.get(parentSegments.size()).equals(fileName);
    }

    /**
     * Returns the staging-relative path of the entry when it is part of the
     * project payload (project.db + sidecars, direct children of files/ and
     * file-metadata/), else null.
     */
    private String relativeProjectPath(ArchiveEntry entry, List<String> rootSegments) {
        if (entry.directory || entry.segments.size() <= rootSegments.size()) {
            return null;
        }
        for (int index = 0; index < rootSegments.size(); index += 1) {
            if (!entry.segments.get(index).equals(rootSegments.get(index))) {
                return null;
            }
        }

        String fileName = entry.segments.get(entry.segments.size() - 1);
        if (fileName.startsWith(".")) {
            return null;
        }

        int depth = entry.segments.size() - rootSegments.size();
        if (depth == 1) {
            return fileName.equals("project.db") ||
                fileName.equals("project.db-wal") ||
                fileName.equals("project.db-shm") ||
                fileName.equals("project.db-journal")
                ? fileName
                : null;
        }
        if (depth != 2) {
            return null;
        }
        String container = entry.segments.get(rootSegments.size());
        if ("files".equals(container)) {
            return "files/" + fileName;
        }
        if ("file-metadata".equals(container)) {
            return "file-metadata/" + fileName;
        }
        return null;
    }

    private void ensureDirectory(File directory) throws ProjectImportException {
        if (!directory.exists() && !directory.mkdirs()) {
            throw new ProjectImportException(
                "importFailed",
                "Cannot create staging directory " + directory.getName()
            );
        }
    }
}
