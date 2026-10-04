package com.routevn.creator;

import java.io.File;
import java.util.List;

/**
 * The two filesystem steps of importing a project folder that JavaScript
 * prepared in a staging folder: move the project payload into the work
 * directory, and apply the file renames JavaScript decided on.
 */
final class ImportProject {
    private ImportProject() {}

    /**
     * Moves project.db (with its sidecars), files/ and file-metadata/ from
     * {@code source} into the new {@code workDir}; a missing files/ or
     * file-metadata/ becomes an empty folder. Nothing else in the source moves.
     */
    static void moveProject(File source, File workDir) throws CodedException {
        if (!new File(source, "project.db").isFile()) {
            throw new CodedException("invalidArchive", "Project folder has no project.db.");
        }
        if (!workDir.mkdirs()) {
            throw new CodedException("importFailed", "Cannot create the import work folder.");
        }
        for (String suffix : new String[] { "", "-wal", "-shm", "-journal" }) {
            File sidecar = new File(source, "project.db" + suffix);
            if (sidecar.isFile()) {
                move(sidecar, new File(workDir, sidecar.getName()));
            }
        }
        for (String name : new String[] { "files", "file-metadata" }) {
            File folder = new File(source, name);
            File target = new File(workDir, name);
            if (folder.isDirectory()) {
                move(folder, target);
            } else if (folder.exists()) {
                throw new CodedException("invalidArchive", name + " is not a folder.");
            } else if (!target.mkdir()) {
                throw new CodedException("importFailed", "Cannot create " + name + ".");
            }
        }
    }

    /**
     * Renames entries directly inside {@code filesDirectory}, in order. Each
     * {@code from} must exist and each {@code to} must not; nothing is overwritten.
     */
    static void applyRenames(File filesDirectory, List<String[]> renames)
        throws CodedException {
        for (String[] rename : renames) {
            File from = plainChild(filesDirectory, rename[0]);
            File to = plainChild(filesDirectory, rename[1]);
            if (!from.exists()) {
                throw new CodedException("importFailed", "Cannot rename " + rename[0] + ": it does not exist.");
            }
            if (to.exists() || TempFolders.isSymlink(to)) {
                throw new CodedException("importFailed", "Cannot rename to " + rename[1] + ": it already exists.");
            }
            move(from, to);
        }
    }

    private static File plainChild(File directory, String name) throws CodedException {
        if (name == null || name.indexOf('/') >= 0 || !TempFolders.isSafePath(name)) {
            throw new CodedException("importFailed", "Invalid file name: " + name);
        }
        return new File(directory, name);
    }

    private static void move(File from, File to) throws CodedException {
        if (!from.renameTo(to)) {
            throw new CodedException("importFailed", "Cannot move " + from.getName() + ".");
        }
    }
}
