package com.routevn.creator;

import static org.junit.Assert.*;

import org.junit.Test;

public class CodedExceptionFormatTest {
    @Test public void anEmptyDetailFallsBackToFailed() {
        assertEquals("invalidArchive: failed", new CodedException("invalidArchive", null).getMessage());
        assertEquals("importFailed: failed", new CodedException("importFailed", "").getMessage());
    }

    @Test public void unexpectedErrorsBecomeImportFailedAndImportErrorsKeepTheirCode() {
        assertEquals("importFailed: disk full", CodedException.of(new IllegalStateException("disk full")).getMessage());
        CodedException wrapped = CodedException.of(new OutOfMemoryError());
        assertEquals("importFailed", wrapped.code);
        assertEquals("importFailed: OutOfMemoryError", wrapped.getMessage());
        CodedException original = new CodedException("downloadFailed", "HTTP 404");
        assertSame(original, CodedException.of(original));
    }
}
