package com.routevn.creator;

import java.io.File;
import org.json.JSONObject;

/**
 * Error-contract mapping for the archive and URL import paths. Every failure
 * thrown by these paths must be a ProjectImportException whose message
 * starts with "code: detail": failures reading or rewriting the staged
 * project database map to invalidArchive, and any other unexpected exception
 * maps to importFailed with the original message as detail. The legacy
 * folder import keeps its own messages and must not use this mapping.
 */
final class ProjectArchiveImports {
    private ProjectArchiveImports() {}

    @FunctionalInterface
    interface ProjectInfoReader {
        JSONObject read(File databaseFile) throws Exception;
    }

    @FunctionalInterface
    interface IdentityRewriter {
        void rewrite(File databaseFile, String sourceProjectId, String targetProjectId)
            throws Exception;
    }

    static JSONObject readProjectInfo(File databaseFile, ProjectInfoReader reader)
        throws ProjectImportException {
        try {
            return reader.read(databaseFile);
        } catch (Exception error) {
            throw new ProjectImportException("invalidArchive", detailOf(error));
        }
    }

    static void rewriteIdentity(
        File databaseFile,
        String sourceProjectId,
        String targetProjectId,
        IdentityRewriter rewriter
    ) throws ProjectImportException {
        try {
            rewriter.rewrite(databaseFile, sourceProjectId, targetProjectId);
        } catch (Exception error) {
            throw new ProjectImportException("invalidArchive", detailOf(error));
        }
    }

    /** Keeps a ProjectImportException as-is; anything else becomes importFailed. */
    static ProjectImportException wrapUnexpected(Throwable error) {
        if (error instanceof ProjectImportException) {
            return (ProjectImportException) error;
        }
        return new ProjectImportException("importFailed", detailOf(error));
    }

    static String detailOf(Throwable error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return error.getClass().getSimpleName();
        }
        return message;
    }
}
