package com.routevn.creator;

import io.sentry.SentryEvent;
import io.sentry.protocol.Contexts;
import io.sentry.protocol.DebugImage;
import io.sentry.protocol.DebugMeta;
import io.sentry.protocol.Device;
import io.sentry.protocol.Mechanism;
import io.sentry.protocol.OperatingSystem;
import io.sentry.protocol.SentryException;
import io.sentry.protocol.SentryStackFrame;
import io.sentry.protocol.SentryStackTrace;
import io.sentry.protocol.SentryThread;
import io.sentry.protocol.User;
import java.util.ArrayList;
import java.util.List;

/**
 * Keeps a crash report to the crash type, stack locations, the debug images
 * those frames point into, app version, device model, OS version and the
 * install crash ID as user.id. Message text, other user data, paths,
 * variables and other context are dropped.
 */
final class NativeCrashScrubber {
    static final String MESSAGE = "App crash";

    private NativeCrashScrubber() {}

    static SentryEvent scrub(SentryEvent event, String crashId) {
        event.setMessage(null);
        event.setUser(keptUser(crashId));
        event.setRequest(null);
        event.setBreadcrumbs(null);
        event.setServerName(null);
        event.setTransaction(null);
        event.setModules(null);
        event.setTags(null);
        event.setExtras(null);
        event.setUnknown(null);
        scrubContexts(event.getContexts());

        List<Long> addresses = new ArrayList<>();
        List<SentryException> exceptions = event.getExceptions();
        if (exceptions != null) {
            for (SentryException exception : exceptions) {
                exception.setValue(MESSAGE);
                exception.setUnknown(null);
                scrubMechanism(exception.getMechanism());
                scrubStacktrace(exception.getStacktrace(), addresses);
            }
        }
        List<SentryThread> threads = event.getThreads();
        if (threads != null) {
            for (SentryThread thread : threads) {
                thread.setHeldLocks(null);
                thread.setUnknown(null);
                scrubStacktrace(thread.getStacktrace(), addresses);
            }
        }
        scrubDebugMeta(event.getDebugMeta(), addresses);
        return event;
    }

    // Keep only the install crash ID as user.id; any other user data on the
    // incoming event is dropped.
    private static User keptUser(String crashId) {
        if (!NativeCrashIdStore.isCrashId(crashId)) return null;
        User user = new User();
        user.setId(crashId);
        return user;
    }

    // Contexts is a map owned by the event, so rebuild it in place.
    private static void scrubContexts(Contexts contexts) {
        Device device = contexts.getDevice();
        OperatingSystem os = contexts.getOperatingSystem();
        contexts.clear();
        if (device != null) {
            Device kept = new Device();
            kept.setModel(device.getModel());
            kept.setManufacturer(device.getManufacturer());
            kept.setArchs(device.getArchs());
            contexts.setDevice(kept);
        }
        if (os != null) {
            OperatingSystem kept = new OperatingSystem();
            kept.setName(os.getName());
            kept.setVersion(os.getVersion());
            contexts.setOperatingSystem(kept);
        }
    }

    // Keep the mechanism type, handled flag and signal/errno metadata only.
    private static void scrubMechanism(Mechanism mechanism) {
        if (mechanism == null) return;
        mechanism.setDescription(null);
        mechanism.setHelpLink(null);
        mechanism.setData(null);
        mechanism.setUnknown(null);
    }

    private static void scrubStacktrace(SentryStackTrace stacktrace, List<Long> addresses) {
        if (stacktrace == null) return;
        stacktrace.setRegisters(null);
        stacktrace.setUnknown(null);
        if (stacktrace.getFrames() == null) return;
        for (SentryStackFrame frame : stacktrace.getFrames()) {
            frame.setAbsPath(null);
            frame.setVars(null);
            frame.setContextLine(null);
            frame.setPreContext(null);
            frame.setPostContext(null);
            frame.setUnknown(null);
            frame.setFilename(basename(frame.getFilename()));
            frame.setPackage(basename(frame.getPackage()));
            Long address = parseAddress(frame.getInstructionAddr());
            if (address != null) addresses.add(address);
        }
    }

    // Native reports list every loaded library. Keep only the images the
    // frames point into, which is enough to decode them and keeps the event
    // under the collector's size limit.
    private static void scrubDebugMeta(DebugMeta debugMeta, List<Long> addresses) {
        if (debugMeta == null) return;
        debugMeta.setUnknown(null);
        if (debugMeta.getImages() == null) return;
        List<DebugImage> kept = new ArrayList<>();
        for (DebugImage image : debugMeta.getImages()) {
            Long start = parseAddress(image.getImageAddr());
            if (start != null && !containsAny(start, image.getImageSize(), addresses)) {
                continue;
            }
            image.setCodeFile(basename(image.getCodeFile()));
            image.setDebugFile(basename(image.getDebugFile()));
            image.setUnknown(null);
            kept.add(image);
        }
        debugMeta.setImages(kept);
    }

    private static boolean containsAny(long start, Long size, List<Long> addresses) {
        if (size == null) return false;
        for (long address : addresses) {
            if (Long.compareUnsigned(address, start) >= 0
                && Long.compareUnsigned(address - start, size) < 0) {
                return true;
            }
        }
        return false;
    }

    private static Long parseAddress(String value) {
        if (value == null || !value.startsWith("0x")) return null;
        try {
            return Long.parseUnsignedLong(value.substring(2), 16);
        } catch (NumberFormatException error) {
            return null;
        }
    }

    private static String basename(String path) {
        if (path == null) return null;
        int slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        return slash < 0 ? path : path.substring(slash + 1);
    }
}
