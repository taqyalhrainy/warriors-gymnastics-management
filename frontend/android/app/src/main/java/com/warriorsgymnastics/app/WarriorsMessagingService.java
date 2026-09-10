package com.warriorsgymnastics.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class WarriorsMessagingService extends MessagingService {
    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        TokenRefreshWorker.schedule(this);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        SharedPreferences prefs = NativePushSessionPlugin.preferences(this);
        String userId = prefs.getString("userId", "");
        String sessionId = prefs.getString("sessionId", "");
        if (!PushSessionGate.allows(userId, sessionId, data.get("userId"), data.get("sessionId"))) return;

        String id = data.getOrDefault("notificationId", message.getMessageId());
        if (id == null || id.isEmpty()) id = String.valueOf(System.currentTimeMillis());
        Intent intent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("google.message_id", message.getMessageId() == null ? id : message.getMessageId());
        for (Map.Entry<String, String> entry : data.entrySet()) intent.putExtra(entry.getKey(), entry.getValue());
        PendingIntent tap = PendingIntent.getActivity(this, id.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, WarriorsApplication.CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(data.getOrDefault("title", "Warriors Gymnastics"))
            .setContentText(data.getOrDefault("body", ""))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(data.getOrDefault("body", "")))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true).setContentIntent(tap);
        try {
            NotificationManagerCompat.from(this).notify(id, id.hashCode(), notification.build());
        } catch (SecurityException ignored) {
            // Permission was revoked between receiving and displaying the message.
        }
    }
}
