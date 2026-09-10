package com.warriorsgymnastics.app;

final class PushSessionGate {
    static boolean allows(String user, String session, String recipient, String messageSession) {
        return user != null && !user.isEmpty() && session != null && !session.isEmpty()
            && user.equals(recipient) && session.equals(messageSession);
    }
}
