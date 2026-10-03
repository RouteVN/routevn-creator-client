package com.routevn.creator;

/**
 * Progress events for archive imports. {@code stage} is "downloading"
 * (bytes received of the content length, 0 when unknown), "extracting"
 * (uncompressed bytes written of the declared total) or "finishing"
 * (current and total are 0).
 */
interface ProjectImportProgress {
    ProjectImportProgress NONE = new ProjectImportProgress() {
        @Override
        public void report(String stage, long current, long total) {}

        @Override
        public void finish(String stage, long current, long total) {}
    };

    /** Throttled progress; the first report of a stage is always delivered. */
    void report(String stage, long current, long total);

    /** The last event of a stage; always delivered. */
    void finish(String stage, long current, long total);
}
