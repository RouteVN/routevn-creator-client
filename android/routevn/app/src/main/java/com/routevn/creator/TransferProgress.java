package com.routevn.creator;

import java.util.function.LongSupplier;

/**
 * Byte progress for one native import call. The first report is always
 * delivered, later ones at most once per {@link #MIN_INTERVAL_MS}, and
 * {@link #finish} always. A failing sink never affects the call.
 */
final class TransferProgress {
    interface Sink {
        void emit(long current, long total) throws Exception;
    }

    static final long MIN_INTERVAL_MS = 100;
    static final TransferProgress NONE = new TransferProgress((current, total) -> {});

    private final Sink sink;
    private final LongSupplier clockMillis;
    private boolean sentAny;
    private long lastEmitMillis;

    TransferProgress(Sink sink) {
        this(sink, () -> System.nanoTime() / 1_000_000L);
    }

    TransferProgress(Sink sink, LongSupplier clockMillis) {
        this.sink = sink;
        this.clockMillis = clockMillis;
    }

    synchronized void report(long current, long total) {
        long now = clockMillis.getAsLong();
        if (!sentAny || now - lastEmitMillis >= MIN_INTERVAL_MS) {
            emit(current, total, now);
        }
    }

    synchronized void finish(long current, long total) {
        emit(current, total, clockMillis.getAsLong());
    }

    private void emit(long current, long total, long now) {
        sentAny = true;
        lastEmitMillis = now;
        try {
            sink.emit(current, total);
        } catch (Exception ignored) {
            // Progress is best effort and must not fail the import.
        }
    }
}
