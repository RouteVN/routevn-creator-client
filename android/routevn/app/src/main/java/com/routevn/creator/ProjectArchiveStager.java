package com.routevn.creator;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Archive import staging. The archive bytes never live inside the directory
 * that is promoted into project storage: they are staged in a sibling temp
 * directory (<projectId>.archive/archive.zip next to the <projectId> work
 * dir, both under project-import/), and the archive is deleted as soon as
 * extraction finishes. After extraction the to-be-promoted work dir is
 * verified to contain only the project payload: project.db (+ -wal/-shm/
 * -journal sidecars), files/ and file-metadata/.
 */
final class ProjectArchiveStager {
    static final long DEFAULT_MAX_ARCHIVE_BYTES = ProjectArchiveExtractor.DEFAULT_MAX_ARCHIVE_BYTES;

    private static final Set<String> STAGED_FILE_NAMES = new HashSet<>(Arrays.asList(
        "project.db",
        "project.db-wal",
        "project.db-shm",
        "project.db-journal"
    ));
    private static final Set<String> STAGED_DIRECTORY_NAMES = new HashSet<>(Arrays.asList(
        "files",
        "file-metadata"
    ));

    private final File workDir;
    private final File archiveDir;
    private final File archiveFile;

    ProjectArchiveStager(File importRoot, String projectId) {
        this.workDir = new File(importRoot, projectId);
        this.archiveDir = new File(importRoot, projectId + ".archive");
        this.archiveFile = new File(archiveDir, "archive.zip");
    }

    /** The directory that will be promoted into permanent project storage. */
    File promotableDirectory() {
        return workDir;
    }

    File archiveDirectory() {
        return archiveDir;
    }

    File archiveFile() {
        return archiveFile;
    }

    /**
     * Clears both staging directories and recreates them empty. A stale
     * staging directory that cannot be fully deleted is an error: an
     * existing non-empty directory must never be reused, and cleanup() in
     * the caller still runs for whatever remains.
     */
    void prepare() throws ProjectImportException {
        deleteRecursively(workDir);
        deleteRecursively(archiveDir);
        if (workDir.exists()) {
            throw new ProjectImportException(
                "importFailed",
                "Cannot clear the import staging directory."
            );
        }
        if (archiveDir.exists()) {
            throw new ProjectImportException(
                "importFailed",
                "Cannot clear the archive staging directory."
            );
        }
        if (!workDir.mkdirs()) {
            throw new ProjectImportException(
                "importFailed",
                "Cannot create import staging directory."
            );
        }
        if (!archiveDir.mkdirs()) {
            throw new ProjectImportException(
                "importFailed",
                "Cannot create archive staging directory."
            );
        }
    }

    /**
     * Copies the archive stream into the sibling archive directory through a
     * bounded write that aborts with archiveTooLarge once maxArchiveBytes is
     * exceeded; the partial file is deleted on every failure path.
     */
    void copyArchive(InputStream input, long maxArchiveBytes) throws ProjectImportException {
        File parent = archiveFile.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new ProjectImportException(
                "importFailed",
                "Cannot create archive staging directory."
            );
        }
        try (OutputStream output = new FileOutputStream(archiveFile)) {
            byte[] buffer = new byte[64 * 1024];
            long totalBytes = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
                totalBytes += read;
                if (totalBytes > maxArchiveBytes) {
                    throw new ProjectImportException(
                        "archiveTooLarge",
                        "Archive is larger than " + maxArchiveBytes + " bytes."
                    );
                }
            }
        } catch (IOException error) {
            deletePartialArchive();
            throw new ProjectImportException("importFailed", "Cannot copy the project archive.");
        } catch (ProjectImportException error) {
            deletePartialArchive();
            throw error;
        }
    }

    /**
     * Extracts the staged archive into the work dir, verifies the work dir
     * holds only the expected project payload, and deletes the archive
     * immediately afterwards to free disk.
     */
    void extractArchive(String incompleteMarkerName) throws ProjectImportException {
        extractArchive(incompleteMarkerName, ProjectImportProgress.NONE);
    }

    void extractArchive(String incompleteMarkerName, ProjectImportProgress progress)
        throws ProjectImportException {
        try {
            new ProjectArchiveExtractor().extract(
                archiveFile,
                workDir,
                incompleteMarkerName,
                progress
            );
            verifyStagedContents();
        } finally {
            deleteRecursively(archiveDir);
        }
    }

    /** Deletes both the work dir and the sibling archive dir. */
    void cleanup() {
        deleteRecursively(workDir);
        deleteRecursively(archiveDir);
    }

    private void verifyStagedContents() throws ProjectImportException {
        String[] children = workDir.list();
        if (children == null) {
            throw new ProjectImportException(
                "importFailed",
                "Cannot read the import staging directory."
            );
        }
        for (String name : children) {
            File child = new File(workDir, name);
            boolean allowed = child.isDirectory()
                ? STAGED_DIRECTORY_NAMES.contains(name)
                : STAGED_FILE_NAMES.contains(name);
            if (!allowed) {
                throw new ProjectImportException(
                    "invalidArchive",
                    "Unexpected staged entry: " + name
                );
            }
        }
    }

    private void deletePartialArchive() {
        if (archiveFile.exists() && !archiveFile.delete()) {
            archiveFile.deleteOnExit();
        }
    }

    static void deleteRecursively(File file) {
        if (file == null || !file.exists()) {
            return;
        }
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursively(child);
            }
        }
        if (!file.delete() && file.exists()) {
            file.deleteOnExit();
        }
    }
}
