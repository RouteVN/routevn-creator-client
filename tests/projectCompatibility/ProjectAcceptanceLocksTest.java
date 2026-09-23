package com.routevn.creator;

import java.io.File;
import java.nio.file.Files;

// Standalone JVM test of the same FileChannel lease used by the Android bridge.
public final class ProjectAcceptanceLocksTest {
    public static void main(String[] args) throws Exception {
        if (args.length > 0) {
            try (ProjectAcceptanceLocks other = new ProjectAcceptanceLocks()) {
                if (other.acquire(new File(args[0]), "child")) {
                    throw new AssertionError("another process acquired the owned project");
                }
            }
            return;
        }
        File directory = Files.createTempDirectory("project-one-").toFile();
        try (ProjectAcceptanceLocks first = new ProjectAcceptanceLocks();
             ProjectAcceptanceLocks second = new ProjectAcceptanceLocks()) {
            check(first.acquire(directory, "one"));
            check(first.acquire(new File(directory, "."), "one"));
            check(!first.acquire(directory, "two"));
            check(!second.acquire(directory, "two"));
            first.release(directory, "wrong");
            check(!second.acquire(directory, "two"));
            Process child = new ProcessBuilder(
                System.getProperty("java.home") + "/bin/java", "-cp",
                System.getProperty("java.class.path"),
                ProjectAcceptanceLocksTest.class.getName(), directory.getPath()
            ).inheritIO().start();
            check(child.waitFor() == 0);
            first.release(directory, "one");
            check(second.acquire(directory, "two"));
            second.close();
            check(first.acquire(directory, "one"));
            first.release(directory, "one");
            check(new File(directory, "project.acceptance.lock").exists());
        } finally {
            Files.deleteIfExists(new File(directory, "project.acceptance.lock").toPath());
            Files.delete(directory.toPath());
        }
        System.out.println("Android project lease: PASS (including a second process)");
    }

    private static void check(boolean value) {
        if (!value) throw new AssertionError("project ownership invariant failed");
    }
}
