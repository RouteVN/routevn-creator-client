package com.routevn.creator;

import java.util.function.LongSupplier;

/**
 * Throttles import progress to one event per {@link #MIN_INTERVAL_MS}
 * within a stage. The first report of a stage and every finish are always
 * delivered. A failing sink never affects the import.
 */
final class ProjectImportProgressReporter implements ProjectImportProgress {
    interface Sink {
        void emit(String stage, long current, long total) throws Exception;
    }

    static final long MIN_INTERVAL_MS = 100;

    private final Sink sink;
    private final LongSupplier clockMillis;
    private String lastStage;
    private long lastEmitMillis;

    ProjectImportProgressReporter(Sink sink) {
        this(sink, () -> System.nanoTime() / 1_000_000L);
    }

    ProjectImportProgressReporter(Sink sink, LongSupplier clockMillis) {
        this.sink = sink;
        this.clockMillis = clockMillis;
    }

    @Override
    public synchronized void report(String stage, long current, long total) {
        long now = clockMillis.getAsLong();
        if (stage.equals(lastStage) && now - lastEmitMillis < MIN_INTERVAL_MS) {
            return;
        }
        emit(stage, current, total, now);
    }

    @Override
    public synchronized void finish(String stage, long current, long total) {
        emit(stage, current, total, clockMillis.getAsLong());
    }

    private void emit(String stage, long current, long total, long now) {
        lastStage = stage;
        lastEmitMillis = now;
        try {
            sink.emit(stage, current, total);
        } catch (Exception ignored) {
            // Progress is best effort and must not fail the import.
        }
    }
}
