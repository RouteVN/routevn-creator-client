package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.File;
import org.junit.Test;

public class ProjectArchiveImportsTest {
    @Test public void projectInfoReadFailureBecomesInvalidArchive() throws Exception {
        try {
            ProjectArchiveImports.readProjectInfo(
                new File("project.db"),
                file -> {
                    throw new IllegalArgumentException(
                        "Selected folder is not a RouteVN project."
                    );
                }
            );
            fail("read failure accepted");
        } catch (ProjectImportException error) {
            assertEquals("invalidArchive", error.code);
            assertTrue(error.getMessage().startsWith("invalidArchive: "));
            assertTrue(error.getMessage().contains("not a RouteVN project"));
        }
    }

    @Test public void identityRewriteFailureBecomesInvalidArchive() throws Exception {
        try {
            ProjectArchiveImports.rewriteIdentity(
                new File("project.db"),
                "source",
                "target",
                (file, sourceId, targetId) -> {
                    throw new IllegalStateException("database is locked");
                }
            );
            fail("rewrite failure accepted");
        } catch (ProjectImportException error) {
            assertEquals("invalidArchive", error.code);
            assertTrue(error.getMessage().contains("database is locked"));
        }
    }

    @Test public void projectImportExceptionPassesThroughWrapUnchanged() {
        ProjectImportException original = new ProjectImportException("projectExists", "p1");
        assertSame(original, ProjectArchiveImports.wrapUnexpected(original));
    }

    @Test public void unexpectedErrorBecomesImportFailedWithOriginalDetail() {
        ProjectImportException wrapped = ProjectArchiveImports.wrapUnexpected(
            new IllegalStateException("rename failed")
        );
        assertEquals("importFailed", wrapped.code);
        assertEquals("importFailed: rename failed", wrapped.getMessage());
    }

    @Test public void missingDetailFallsBackToTheExceptionClass() {
        ProjectImportException wrapped = ProjectArchiveImports.wrapUnexpected(
            new RuntimeException()
        );
        assertEquals("importFailed: RuntimeException", wrapped.getMessage());
    }
}
