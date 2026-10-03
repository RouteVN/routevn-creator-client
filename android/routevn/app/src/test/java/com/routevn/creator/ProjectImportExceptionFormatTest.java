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

    @Test public void outOfMemoryErrorIsWrappedAsImportFailed() {
        ProjectImportException wrapped = ProjectArchiveImports.wrapUnexpected(new OutOfMemoryError());
        assertEquals("importFailed", wrapped.code);
        assertTrue(wrapped.getMessage().startsWith("importFailed: "));
    }

    @Test public void outOfMemoryErrorWithMessageKeepsDetail() {
        ProjectImportException wrapped = ProjectArchiveImports.wrapUnexpected(new OutOfMemoryError("heap"));
        assertEquals("importFailed: heap", wrapped.getMessage());
    }

    @Test public void projectImportExceptionPassesThroughWrapUnexpected() {
        ProjectImportException original = new ProjectImportException("projectExists", "p1");
        assertSame(original, ProjectArchiveImports.wrapUnexpected(original));
    }
}
