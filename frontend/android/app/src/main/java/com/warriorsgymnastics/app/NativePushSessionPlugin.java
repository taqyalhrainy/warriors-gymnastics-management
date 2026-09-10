package com.warriorsgymnastics.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.UUID;

@CapacitorPlugin(name = "NativePushSession")
public class NativePushSessionPlugin extends Plugin {
    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("warriors_push_session", Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void setSession(PluginCall call) {
        String userId = call.getString("userId", "");
        String sessionId = call.getString("sessionId", "");
        String authToken = call.getString("authToken", "");
        SharedPreferences prefs = preferences(getContext());
        if (!userId.equals(prefs.getString("userId", "")) || userId.isEmpty()) {
            getContext().getSystemService(NotificationManager.class).cancelAll();
        }
        // Commit before returning: the FCM service checks this even with the WebView closed.
        prefs.edit().putString("userId", userId).putString("sessionId", sessionId)
            .putString("authToken", authToken)
            .putString("apiOrigin", getConfig().getString("apiOrigin", "")).commit();
        if (userId.isEmpty()) {
            androidx.work.WorkManager.getInstance(getContext()).cancelUniqueWork(TokenRefreshWorker.WORK_NAME);
        }
        call.resolve();
    }

    @PluginMethod
    public void getDevice(PluginCall call) {
        SharedPreferences prefs = preferences(getContext());
        String id = prefs.getString("deviceId", "");
        if (id.isEmpty()) {
            id = UUID.randomUUID().toString();
            prefs.edit().putString("deviceId", id).commit();
        }
        JSObject result = new JSObject();
        result.put("deviceId", id);
        boolean enabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            android.app.NotificationChannel channel = getContext().getSystemService(NotificationManager.class)
                .getNotificationChannel(WarriorsApplication.CHANNEL);
            enabled = enabled && channel != null && channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        result.put("notificationsEnabled", enabled);
        call.resolve(result);
    }

    @PluginMethod
    public void getOtaConfig(PluginCall call) {
        com.getcapacitor.PluginConfig config = getBridge().getConfig().getPluginConfiguration("LiveUpdate");
        JSObject result = new JSObject();
        result.put("contract", config.getString("defaultChannel", ""));
        result.put("publicKey", config.getString("publicKey", ""));
        result.put("origin", getConfig().getString("otaOrigin", ""));
        call.resolve(result);
    }

    @PluginMethod
    public void deleteToken(PluginCall call) {
        FirebaseMessaging messaging = FirebaseMessaging.getInstance();
        messaging.setAutoInitEnabled(false);
        messaging.deleteToken().addOnCompleteListener(task -> {
            if (task.isSuccessful()) call.resolve();
            else call.reject("Unable to delete the device token.", task.getException());
        });
    }
}
