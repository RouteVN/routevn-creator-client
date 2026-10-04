package com.routevn.creator;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.Test;

public class ImportProgressTest {
    @Test public void deliversTheFirstReportThrottlesTheRestAndAlwaysTheFinish() {
        List<String> events = new ArrayList<>();
        AtomicLong clock = new AtomicLong(1_000);
        ImportProgress progress = new ImportProgress((current, total) -> events.add(current + "/" + total), clock::get);

        progress.report(0, 100);
        clock.addAndGet(ImportProgress.MIN_INTERVAL_MS - 1);
        progress.report(10, 100);
        clock.addAndGet(1);
        progress.report(40, 100);
        progress.report(50, 100);
        progress.finish(100, 100);

        assertEquals(List.of("0/100", "40/100", "100/100"), events);
    }

    @Test public void aFailingSinkNeverEscapes() {
        ImportProgress progress = new ImportProgress((current, total) -> {
            throw new IllegalStateException("sink down");
        });
        progress.report(0, 1);
        progress.finish(1, 1);
    }
}
