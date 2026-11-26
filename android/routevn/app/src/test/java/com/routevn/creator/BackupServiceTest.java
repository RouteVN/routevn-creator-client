package com.routevn.creator;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ServiceController;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class BackupServiceTest {
    // The scheduler decides to stop on its own thread. If the app left the
    // screen and started the service again meanwhile, the stop must name the
    // last start it saw, so Android refuses it for the newer start.
    @Test public void stoppingNamesTheLastStartSoANewerStartIsKept() {
        ServiceController<BackupService> controller = Robolectric.buildService(BackupService.class).create();
        controller.startCommand(0, 1);
        controller.startCommand(0, 2);
        BackupService.stopRunning();
        assertEquals(2, shadowOf(controller.get()).getStopSelfResultId());
        controller.destroy();
    }
}
