package com.warriorsgymnastics.app;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;

public class WarriorsApplication extends Application {
    public static final String CHANNEL = "warriors_messages";

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL,
                "Warriors Messages", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Parent messages from Warriors Gymnastics");
            channel.enableVibration(true);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }
}
