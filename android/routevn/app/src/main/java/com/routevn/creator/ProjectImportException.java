package com.routevn.creator;

/**
 * Import pipeline failure whose message always starts with a stable error
 * code followed by ": " and a short technical detail. The JS layer maps the
 * text before the first colon to a localized message and appends the detail.
 *
 * Codes: invalidUrl, downloadFailed, archiveTooLarge, invalidArchive,
 * unsafeArchiveEntry, invalidFileName, fileNameConflict, projectExists,
 * importFailed.
 */
class ProjectImportException extends Exception {
    final String code;

    ProjectImportException(String code, String detail) {
        super(code + ": " + (detail == null || detail.isEmpty() ? "failed" : detail));
        this.code = code;
    }
}
