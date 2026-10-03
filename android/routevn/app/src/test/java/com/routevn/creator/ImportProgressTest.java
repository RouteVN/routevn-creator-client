package com.routevn.creator;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.Test;

public class ImportProgressTest {
    private final List<String> events = new ArrayList<>();
    private final AtomicLong clock = new AtomicLong(1_000);

    private ImportProgress progress() {
        return new ImportProgress(
            (current, total) -> events.add(current + "/" + total),
            clock::get
        );
    }

    @Test public void theFirstReportIsAlwaysDelivered() {
        progress().report(0, 100);
        assertEquals(List.of("0/100"), events);
    }

    @Test public void reportsInsideTheIntervalAreDropped() {
        ImportProgress progress = progress();
        progress.report(0, 100);
        clock.addAndGet(ImportProgress.MIN_INTERVAL_MS - 1);
        progress.report(10, 100);
        assertEquals(List.of("0/100"), events);
    }

    @Test public void reportsAfterTheIntervalAreDelivered() {
        ImportProgress progress = progress();
        progress.report(0, 100);
        clock.addAndGet(ImportProgress.MIN_INTERVAL_MS);
        progress.report(40, 100);
        assertEquals(List.of("0/100", "40/100"), events);
    }

    @Test public void finishIsAlwaysDelivered() {
        ImportProgress progress = progress();
        progress.report(0, 100);
        progress.report(50, 100);
        progress.finish(100, 100);
        assertEquals(List.of("0/100", "100/100"), events);
    }

    @Test public void aFailingSinkNeverEscapes() {
        ImportProgress progress = new ImportProgress(
            (current, total) -> {
                throw new IllegalStateException("sink down");
            },
            clock::get
        );
        progress.report(0, 1);
        progress.finish(1, 1);
    }

    @Test public void noneDiscardsEverything() {
        ImportProgress.NONE.report(0, 0);
        ImportProgress.NONE.finish(1, 1);
    }
}
