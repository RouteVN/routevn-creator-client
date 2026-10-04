package com.routevn.creator;

import static org.junit.Assert.*;

import org.junit.Test;

public class ProjectImportExceptionFormatTest {
    @Test public void anEmptyDetailFallsBackToFailed() {
        assertEquals("invalidArchive: failed", new ProjectImportException("invalidArchive", null).getMessage());
        assertEquals("importFailed: failed", new ProjectImportException("importFailed", "").getMessage());
    }

    @Test public void unexpectedErrorsBecomeImportFailedAndImportErrorsKeepTheirCode() {
        assertEquals("importFailed: disk full", ProjectImportException.of(new IllegalStateException("disk full")).getMessage());
        ProjectImportException wrapped = ProjectImportException.of(new OutOfMemoryError());
        assertEquals("importFailed", wrapped.code);
        assertEquals("importFailed: OutOfMemoryError", wrapped.getMessage());
        ProjectImportException original = new ProjectImportException("downloadFailed", "HTTP 404");
        assertSame(original, ProjectImportException.of(original));
    }
}
