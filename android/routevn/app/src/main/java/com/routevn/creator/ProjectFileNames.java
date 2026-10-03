package com.routevn.creator;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Rule A import file-name normalization. Project file ids never contain a
 * dot, so every regular file directly inside a project's files/ directory
 * must have an on-disk name equal to its file id (the part before the first
 * dot). Names starting with "." and sub-directories are ignored; every other
 * name must map to an id matching [A-Za-z0-9_-]{1,128}. The plan is fully
 * validated before any rename is applied, and applied renames are rolled
 * back best-effort in reverse order if a rename fails.
 *
 * Pure java.io so it is unit-testable on the JVM without Android.
 */
class ProjectFileNames {
    static final String FILE_ID_PATTERN = "[A-Za-z0-9_-]{1,128}";

    private ProjectFileNames() {}

    static final class Rename {
        final File source;
        final File target;
        final String fileId;

        Rename(File source, File target, String fileId) {
            this.source = source;
            this.target = target;
            this.fileId = fileId;
        }
    }

    /**
     * Returns the file id for a direct child name: null when the name starts
     * with "." (ignored), the name itself when it has no dot (already the
     * id), or the part before the first dot.
     */
    static String fileIdOf(String name) {
        int dotIndex = name.indexOf('.');
        if (dotIndex == 0) {
            return null;
        }
        if (dotIndex < 0) {
            return name;
        }
        return name.substring(0, dotIndex);
    }

    /**
     * Plans and applies normalization in place, returning how many files
     * were renamed. Idempotent.
     */
    static int normalize(File filesDirectory) throws ProjectImportException {
        return apply(plan(filesDirectory), new RenameOperation() {
            @Override
            public boolean rename(File source, File target) {
                return source.renameTo(target);
            }
        });
    }

    /** Injectable rename step so tests can simulate partial failures. */
    interface RenameOperation {
        boolean rename(File source, File target);
    }

    static int apply(List<Rename> renames, RenameOperation operation)
        throws ProjectImportException {
        List<Rename> applied = new ArrayList<>(renames.size());
        for (Rename rename : renames) {
            if (!operation.rename(rename.source, rename.target)) {
                // Every remaining reversal is attempted even if an earlier
                // one fails; failures are collected and reported.
                List<String> rollbackFailures = rollback(applied, operation);
                String detail = "Failed to rename " + rename.source.getName() + ".";
                if (!rollbackFailures.isEmpty()) {
                    detail += " Rollback failed for: " + String.join(", ", rollbackFailures);
                }
                throw new ProjectImportException("importFailed", detail);
            }
            applied.add(rename);
        }
        return applied.size();
    }

    private static List<String> rollback(List<Rename> applied, RenameOperation operation) {
        List<String> failures = new ArrayList<>();
        for (int index = applied.size() - 1; index >= 0; index -= 1) {
            Rename appliedRename = applied.get(index);
            if (!operation.rename(appliedRename.target, appliedRename.source)) {
                failures.add(appliedRename.source.getName());
            }
        }
        return failures;
    }

    static List<Rename> plan(File filesDirectory) throws ProjectImportException {
        List<Rename> renames = new ArrayList<>();
        // Case-insensitive id map: macOS and Windows file systems (where
        // these folders usually come from) treat ABC.png and abc.png as the
        // same file, so their ids must not both exist.
        Map<String, String> ids = new HashMap<>();

        File[] children = filesDirectory.listFiles();
        if (children == null) {
            throw new ProjectImportException(
                "importFailed",
                "Cannot read files directory."
            );
        }

        for (File child : children) {
            if (child.isDirectory()) {
                continue;
            }
            String name = child.getName();
            if (name.startsWith(".")) {
                continue;
            }
            String fileId = fileIdOf(name);
            if (!fileId.matches(FILE_ID_PATTERN)) {
                throw new ProjectImportException("invalidFileName", name);
            }
            String key = fileId.toLowerCase(Locale.ROOT);
            String existingName = ids.putIfAbsent(key, name);
            if (existingName != null) {
                throw new ProjectImportException(
                    "fileNameConflict",
                    existingName + " and " + name + " both map to " + fileId
                );
            }
            if (!fileId.equals(name)) {
                renames.add(new Rename(child, new File(filesDirectory, fileId), fileId));
            }
        }

        // The target must not already exist as a different entry (for
        // example a directory named abc next to abc.png).
        for (Rename rename : renames) {
            if (rename.target.exists()) {
                throw new ProjectImportException(
                    "fileNameConflict",
                    rename.source.getName() + " maps to existing " + rename.fileId
                );
            }
        }

        return renames;
    }
}
