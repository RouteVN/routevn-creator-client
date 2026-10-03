package com.routevn.creator;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Native-owned temporary folders for imports, addressed by an opaque
 * stagingId under the cache directory. Only the stagingId and a validated
 * relative path ever cross the bridge, so JavaScript cannot leave a staging
 * folder.
 */
final class ImportStaging {
    static final long MAX_AGE_MS = 24L * 60 * 60 * 1000;
    private static final Pattern ID = Pattern.compile(
        "[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"
    );

    /** One directory entry; kind is file, directory, symlink or other. */
    static final class Child {
        final String name;
        final String kind;
        final long size;

        Child(String name, String kind, long size) {
            this.name = name;
            this.kind = kind;
            this.size = size;
        }
    }

    private final File root;

    ImportStaging(File root) {
        this.root = root;
    }

    /** Creates a staging folder after removing the ones older than 24 hours. */
    String create() throws ProjectImportException {
        sweep(root, System.currentTimeMillis() - MAX_AGE_MS);
        String stagingId = UUID.randomUUID().toString();
        if (!new File(root, stagingId).mkdirs()) {
            throw new ProjectImportException("importFailed", "Cannot create the staging folder.");
        }
        return stagingId;
    }

    /** Removes a staging folder; unknown ids are fine. */
    void remove(String stagingId) throws ProjectImportException {
        deleteRecursively(new File(root, validId(stagingId)));
    }

    /** A new or existing file path inside the staging folder; the path must be safe. */
    File resolve(String stagingId, String path) throws ProjectImportException {
        if (!isSafePath(path)) {
            throw new ProjectImportException("importFailed", "Invalid staging path.");
        }
        return new File(resolveDirectory(stagingId, ""), path);
    }

    /** An existing folder inside the staging folder; an empty path is the staging folder. */
    File resolveDirectory(String stagingId, String path) throws ProjectImportException {
        File directory = new File(root, validId(stagingId));
        if (!directory.isDirectory()) {
            throw new ProjectImportException("importFailed", "Staging folder not found.");
        }
        if (path == null || path.isEmpty()) {
            return directory;
        }
        return resolve(stagingId, path);
    }

    /**
     * True for a relative path made only of plain segments: not absolute,
     * no empty, "." or ".." segment, and no backslash, colon or NUL.
     */
    static boolean isSafePath(String path) {
        if (
            path == null ||
            path.isEmpty() ||
            path.indexOf('\\') >= 0 ||
            path.indexOf(':') >= 0 ||
            path.indexOf('\0') >= 0
        ) {
            return false;
        }
        for (String segment : path.split("/", -1)) {
            if (segment.isEmpty() || segment.equals(".") || segment.equals("..")) {
                return false;
            }
        }
        return true;
    }

    /** The entries of a folder sorted by name, without following symlinks. */
    static List<Child> list(File directory) throws ProjectImportException {
        File[] files = directory.isDirectory() ? directory.listFiles() : null;
        if (files == null) {
            throw new ProjectImportException("importFailed", "Folder not found.");
        }
        List<Child> children = new ArrayList<>();
        for (File file : files) {
            String kind = isSymlink(file)
                ? "symlink"
                : file.isDirectory() ? "directory" : file.isFile() ? "file" : "other";
            children.add(new Child(file.getName(), kind, kind.equals("file") ? file.length() : 0));
        }
        children.sort((a, b) -> a.name.compareTo(b.name));
        return children;
    }

    /** Creates {@code destination}, and its parent folder, as a new file; an existing file is an error. */
    static void createNewFile(File destination) throws ProjectImportException {
        File parent = destination.getParentFile();
        if (parent != null) {
            parent.mkdirs();
        }
        try {
            if (!destination.createNewFile()) {
                throw new ProjectImportException("importFailed", "Destination already exists.");
            }
        } catch (IOException error) {
            throw new ProjectImportException("importFailed", "Cannot create the destination file.");
        }
    }

    /** Copies a stream into a new file, at most maxBytes; the file is removed when this fails. */
    static long copy(InputStream input, File destination, long maxBytes)
        throws ProjectImportException {
        createNewFile(destination);
        boolean done = false;
        try (OutputStream output = new FileOutputStream(destination)) {
            byte[] buffer = new byte[64 * 1024];
            long bytes = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                bytes += read;
                if (bytes > maxBytes) {
                    throw new ProjectImportException(
                        "archiveTooLarge",
                        "File exceeds " + maxBytes + " bytes."
                    );
                }
                output.write(buffer, 0, read);
            }
            done = true;
            return bytes;
        } catch (IOException error) {
            throw new ProjectImportException(
                "importFailed",
                "Cannot copy the file: " + error.getClass().getSimpleName()
            );
        } finally {
            if (!done) {
                destination.delete();
            }
        }
    }

    static void sweep(File root, long cutoffMillis) {
        File[] children = root.listFiles();
        if (children == null) {
            return;
        }
        for (File child : children) {
            if (child.isDirectory() && child.lastModified() < cutoffMillis) {
                deleteRecursively(child);
            }
        }
    }

    /** Best-effort delete that never follows a symlink out of the tree. */
    static void deleteRecursively(File file) {
        File[] children = isSymlink(file) ? null : file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursively(child);
            }
        }
        file.delete();
    }

    /** Detects a symlink at the last path component with plain java.io (minSdk 24). */
    static boolean isSymlink(File file) {
        try {
            File parent = file.getParentFile();
            File candidate = parent == null
                ? file
                : new File(parent.getCanonicalFile(), file.getName());
            return !candidate.getCanonicalFile().equals(candidate.getAbsoluteFile());
        } catch (IOException error) {
            return true;
        }
    }

    private static String validId(String stagingId) throws ProjectImportException {
        if (stagingId == null || !ID.matcher(stagingId).matches()) {
            throw new ProjectImportException("importFailed", "Invalid staging id.");
        }
        return stagingId;
    }
}
