package com.routevn.creator;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.util.HashMap;
import java.util.Map;

final class ProjectAcceptanceLocks implements AutoCloseable {
    private static final class Owner {
        final ProjectAcceptanceLocks scope;
        final String id;
        final RandomAccessFile file;
        final FileLock lock;
        Owner(ProjectAcceptanceLocks scope, String id, RandomAccessFile file, FileLock lock) {
            this.scope = scope; this.id = id; this.file = file; this.lock = lock;
        }
        void close() throws IOException {
            try { lock.release(); } finally { file.close(); }
        }
    }
    // POSIX record locks are process-wide: closing another channel for the
    // same inode can release the first channel's lock. Share this registry
    // across activities so this process never opens a competing channel.
    private static final Map<String, Owner> owners = new HashMap<>();

    boolean acquire(File directory, String ownerId) throws IOException {
        String path = directory.getCanonicalPath();
        synchronized (owners) {
            Owner current = owners.get(path);
            if (current != null) return current.scope == this && current.id.equals(ownerId);
            RandomAccessFile file = new RandomAccessFile(new File(path, "project.acceptance.lock"), "rw");
            FileLock lock;
            try { lock = file.getChannel().tryLock(); }
            catch (OverlappingFileLockException conflict) { file.close(); return false; }
            catch (IOException error) { file.close(); throw error; }
            if (lock == null) { file.close(); return false; }
            owners.put(path, new Owner(this, ownerId, file, lock));
            return true;
        }
    }

    void release(File directory, String ownerId) throws IOException {
        String path = directory.getCanonicalPath();
        synchronized (owners) {
            Owner current = owners.get(path);
            if (current != null && current.scope == this && current.id.equals(ownerId)) {
                try { current.close(); } finally { owners.remove(path); }
            }
        }
    }

    @Override public void close() {
        synchronized (owners) {
            var entries = owners.entrySet().iterator();
            while (entries.hasNext()) {
                Owner owner = entries.next().getValue();
                if (owner.scope != this) continue;
                try { owner.close(); } catch (IOException ignored) { }
                entries.remove();
            }
        }
    }
}
