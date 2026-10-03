package com.routevn.creator;

import static org.junit.Assert.*;

import org.junit.Test;

public class ProjectImportExceptionFormatTest {
    @Test public void emptyDetailFallsBackToFailed() {
        ProjectImportException error = new ProjectImportException("importFailed", "");
        assertEquals("importFailed", error.code);
        assertEquals("importFailed: failed", error.getMessage());
    }

    @Test public void nullDetailFallsBackToFailed() {
        assertEquals("invalidArchive: failed", new ProjectImportException("invalidArchive", null).getMessage());
    }

    @Test public void detailKeepsCodePrefix() {
        assertEquals("unsafeArchiveEntry: boom", new ProjectImportException("unsafeArchiveEntry", "boom").getMessage());
    }

    @Test public void unexpectedErrorsBecomeImportFailedWithTheirMessage() {
        assertEquals("importFailed: heap", ProjectImportException.of(new OutOfMemoryError("heap")).getMessage());
        assertEquals("importFailed: disk full", ProjectImportException.of(new IllegalStateException("disk full")).getMessage());
    }

    @Test public void unexpectedErrorsWithoutAMessageUseTheirClassName() {
        ProjectImportException wrapped = ProjectImportException.of(new OutOfMemoryError());
        assertEquals("importFailed", wrapped.code);
        assertEquals("importFailed: OutOfMemoryError", wrapped.getMessage());
    }

    @Test public void importExceptionsPassThroughUnchanged() {
        ProjectImportException original = new ProjectImportException("downloadFailed", "HTTP 404");
        assertSame(original, ProjectImportException.of(original));
    }
}
