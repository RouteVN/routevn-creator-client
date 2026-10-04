package com.routevn.creator;

/**
 * Native failure whose message is always "<code>: <detail>". The code is one
 * of invalidUrl, downloadFailed, tooLarge, writeFailed, invalidArchive,
 * unsafeArchiveEntry or importFailed; JavaScript maps it to the text shown.
 */
class CodedException extends Exception {
    final String code;

    CodedException(String code, String detail) {
        super(code + ": " + (detail == null || detail.isEmpty() ? "failed" : detail));
        this.code = code;
    }

    /** Keeps a coded exception as it is; anything else becomes importFailed. */
    static CodedException of(Throwable error) {
        if (error instanceof CodedException) {
            return (CodedException) error;
        }
        String message = error.getMessage();
        return new CodedException(
            "importFailed",
            message == null || message.trim().isEmpty()
                ? error.getClass().getSimpleName()
                : message
        );
    }
}
