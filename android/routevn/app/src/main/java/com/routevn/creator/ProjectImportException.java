package com.routevn.creator;

/**
 * Import failure whose message is always "<code>: <detail>". The code is one
 * of invalidUrl, downloadFailed, archiveTooLarge, invalidArchive,
 * unsafeArchiveEntry or importFailed; JavaScript maps it to the text shown.
 */
class ProjectImportException extends Exception {
    final String code;

    ProjectImportException(String code, String detail) {
        super(code + ": " + (detail == null || detail.isEmpty() ? "failed" : detail));
        this.code = code;
    }

    /** Keeps an import exception as it is; anything else becomes importFailed. */
    static ProjectImportException of(Throwable error) {
        if (error instanceof ProjectImportException) {
            return (ProjectImportException) error;
        }
        String message = error.getMessage();
        return new ProjectImportException(
            "importFailed",
            message == null || message.trim().isEmpty()
                ? error.getClass().getSimpleName()
                : message
        );
    }
}
