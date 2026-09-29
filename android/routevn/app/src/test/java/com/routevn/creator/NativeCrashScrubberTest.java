package com.routevn.creator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import io.sentry.SentryEvent;
import io.sentry.protocol.DebugImage;
import io.sentry.protocol.DebugMeta;
import io.sentry.protocol.Device;
import io.sentry.protocol.Mechanism;
import io.sentry.protocol.Message;
import io.sentry.protocol.OperatingSystem;
import io.sentry.protocol.SentryException;
import io.sentry.protocol.SentryStackFrame;
import io.sentry.protocol.SentryStackTrace;
import io.sentry.protocol.User;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

public class NativeCrashScrubberTest {
    @Test
    public void keepsOnlyCrashTypeStackDeviceAndOsFacts() {
        SentryEvent event = new SentryEvent();
        Message message = new Message();
        message.setFormatted("user@example.com token=secret");
        event.setMessage(message);
        User user = new User();
        user.setEmail("user@example.com");
        event.setUser(user);
        event.setTag("email", "user@example.com");
        event.setExtra("response", "secret");
        Device device = new Device();
        device.setModel("Pixel One");
        device.setName("User's phone");
        event.getContexts().setDevice(device);
        OperatingSystem os = new OperatingSystem();
        os.setName("Android");
        os.setVersion("15");
        os.setKernelVersion("secret-kernel");
        event.getContexts().setOperatingSystem(os);

        SentryStackFrame frame = new SentryStackFrame();
        frame.setFunction("load");
        frame.setModule("com.routevn.creator.Project");
        frame.setFilename("/Users/user@example.com/Project.java");
        frame.setAbsPath("/Users/user@example.com/Project.java");
        frame.setVars(Collections.singletonMap("password", "secret"));
        SentryStackTrace stacktrace = new SentryStackTrace();
        stacktrace.setFrames(Collections.singletonList(frame));
        Mechanism mechanism = new Mechanism();
        mechanism.setType("UncaughtExceptionHandler");
        mechanism.setHandled(false);
        mechanism.setData(Collections.singletonMap("path", "/Users/user@example.com"));
        SentryException exception = new SentryException();
        exception.setType("IllegalStateException");
        exception.setValue("user@example.com token=secret");
        exception.setStacktrace(stacktrace);
        exception.setMechanism(mechanism);
        event.setExceptions(Collections.singletonList(exception));

        NativeCrashScrubber.scrub(event);

        assertNull(event.getMessage());
        assertNull(event.getUser());
        assertNull(event.getTags());
        assertNull(event.getExtras());
        assertEquals("Pixel One", event.getContexts().getDevice().getModel());
        assertNull(event.getContexts().getDevice().getName());
        assertEquals("15", event.getContexts().getOperatingSystem().getVersion());
        assertNull(event.getContexts().getOperatingSystem().getKernelVersion());
        SentryException kept = event.getExceptions().get(0);
        assertEquals("IllegalStateException", kept.getType());
        assertEquals(NativeCrashScrubber.MESSAGE, kept.getValue());
        assertEquals("UncaughtExceptionHandler", kept.getMechanism().getType());
        assertNull(kept.getMechanism().getData());
        SentryStackFrame keptFrame = kept.getStacktrace().getFrames().get(0);
        assertEquals("Project.java", keptFrame.getFilename());
        assertEquals("load", keptFrame.getFunction());
        assertNull(keptFrame.getAbsPath());
        assertNull(keptFrame.getVars());
    }

    @Test
    public void keepsOnlyDebugImagesThatFramesPointInto() {
        SentryStackFrame frame = new SentryStackFrame();
        frame.setInstructionAddr("0x7000001234");
        frame.setPackage("/data/app/~~abc==/com.routevn.creator-1/lib/arm64/libroutevn.so");
        SentryStackTrace stacktrace = new SentryStackTrace();
        stacktrace.setFrames(Collections.singletonList(frame));
        SentryException exception = new SentryException();
        exception.setType("SIGSEGV");
        exception.setStacktrace(stacktrace);
        Map<String, Object> signal = new HashMap<>();
        signal.put("number", 11);
        Mechanism mechanism = new Mechanism();
        mechanism.setType("signalhandler");
        mechanism.setMeta(Collections.singletonMap("signal", signal));
        exception.setMechanism(mechanism);

        DebugImage used = image("0x7000000000", 0x10000L,
            "/data/app/~~abc==/com.routevn.creator-1/lib/arm64/libroutevn.so");
        DebugImage unused = image("0x7100000000", 0x10000L, "/system/lib64/libother.so");
        DebugMeta debugMeta = new DebugMeta();
        debugMeta.setImages(Arrays.asList(used, unused));

        SentryEvent event = new SentryEvent();
        event.setExceptions(Collections.singletonList(exception));
        event.setDebugMeta(debugMeta);

        NativeCrashScrubber.scrub(event);

        assertEquals(1, event.getDebugMeta().getImages().size());
        DebugImage kept = event.getDebugMeta().getImages().get(0);
        assertEquals("libroutevn.so", kept.getCodeFile());
        assertEquals("debug-one", kept.getDebugId());
        assertEquals("0x7000000000", kept.getImageAddr());
        SentryStackFrame keptFrame = event.getExceptions().get(0).getStacktrace().getFrames().get(0);
        assertEquals("libroutevn.so", keptFrame.getPackage());
        assertEquals("0x7000001234", keptFrame.getInstructionAddr());
        assertEquals(signal, event.getExceptions().get(0).getMechanism().getMeta().get("signal"));
    }

    private static DebugImage image(String address, long size, String path) {
        DebugImage image = new DebugImage();
        image.setType("elf");
        image.setImageAddr(address);
        image.setImageSize(size);
        image.setCodeFile(path);
        image.setDebugId("debug-one");
        return image;
    }
}
