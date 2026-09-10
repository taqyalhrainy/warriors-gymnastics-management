package com.warriorsgymnastics.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class PushSessionGateTest {
    @Test public void currentAccountAndSessionCanDisplay() {
        assertTrue(PushSessionGate.allows("parent", "session", "parent", "session"));
    }
    @Test public void logoutSuppressesDelayedMessages() {
        assertFalse(PushSessionGate.allows("", "", "parent", "session"));
    }
    @Test public void accountSwitchSuppressesPreviousAccount() {
        assertFalse(PushSessionGate.allows("other", "new", "parent", "old"));
    }
    @Test public void previousLoginAndMissingRecipientAreRejected() {
        assertFalse(PushSessionGate.allows("parent", "new", "parent", "old"));
        assertFalse(PushSessionGate.allows("parent", "new", null, null));
    }
}
