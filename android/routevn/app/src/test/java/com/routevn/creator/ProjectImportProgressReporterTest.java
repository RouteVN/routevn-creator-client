package com.routevn.creator;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.Test;

public class ProjectImportProgressReporterTest {
    private final List<String> events = new ArrayList<>();
    private final AtomicLong clock = new AtomicLong(1_000);

    private ProjectImportProgressReporter reporter() {
        return new ProjectImportProgressReporter(
            (stage, current, total) -> events.add(stage + ":" + current + "/" + total),
            clock::get
        );
    }

    @Test public void firstReportOfEachStageIsDelivered() {
        ProjectImportProgressReporter reporter = reporter();
        reporter.report("downloading", 0, 100);
        reporter.report("extracting", 0, 50);
        reporter.report("finishing", 0, 0);
        assertEquals(
            List.of("downloading:0/100", "extracting:0/50", "finishing:0/0"),
            events
        );
    }

    @Test public void reportsInsideTheIntervalAreDropped() {
        ProjectImportProgressReporter reporter = reporter();
        reporter.report("downloading", 0, 100);
        clock.addAndGet(ProjectImportProgressReporter.MIN_INTERVAL_MS - 1);
        reporter.report("downloading", 10, 100);
        assertEquals(List.of("downloading:0/100"), events);
    }

    @Test public void reportsAfterTheIntervalAreDelivered() {
        ProjectImportProgressReporter reporter = reporter();
        reporter.report("downloading", 0, 100);
        clock.addAndGet(ProjectImportProgressReporter.MIN_INTERVAL_MS);
        reporter.report("downloading", 40, 100);
        assertEquals(List.of("downloading:0/100", "downloading:40/100"), events);
    }

    @Test public void finishIsAlwaysDelivered() {
        ProjectImportProgressReporter reporter = reporter();
        reporter.report("extracting", 0, 100);
        reporter.report("extracting", 50, 100);
        reporter.finish("extracting", 100, 100);
        assertEquals(List.of("extracting:0/100", "extracting:100/100"), events);
    }

    @Test public void throttleRestartsAfterAFinish() {
        ProjectImportProgressReporter reporter = reporter();
        reporter.finish("downloading", 100, 100);
        reporter.report("downloading", 5, 100);
        assertEquals(List.of("downloading:100/100"), events);
    }

    @Test public void sinkFailuresNeverEscape() {
        ProjectImportProgressReporter reporter = new ProjectImportProgressReporter(
            (stage, current, total) -> {
                throw new IllegalStateException("sink down");
            },
            clock::get
        );
        reporter.report("downloading", 0, 1);
        reporter.finish("downloading", 1, 1);
    }

    @Test public void noneDiscardsEverything() {
        ProjectImportProgress.NONE.report("downloading", 1, 2);
        ProjectImportProgress.NONE.finish("downloading", 2, 2);
    }
}
