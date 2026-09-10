package com.warriorsgymnastics.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

public class TokenRefreshWorker extends Worker {
    static final String WORK_NAME = "warriors-fcm-token-refresh";

    public TokenRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void schedule(Context context) {
        if (NativePushSessionPlugin.preferences(context).getString("authToken", "").isEmpty()) return;
        OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(TokenRefreshWorker.class)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build();
        WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, work);
    }

    @NonNull
    @Override
    public Result doWork() {
        SharedPreferences prefs = NativePushSessionPlugin.preferences(getApplicationContext());
        String auth = prefs.getString("authToken", "");
        String session = prefs.getString("sessionId", "");
        String device = prefs.getString("deviceId", "");
        if (auth.isEmpty() || session.isEmpty() || device.isEmpty()) return Result.success();
        HttpURLConnection connection = null;
        try {
            URI origin = new URI(prefs.getString("apiOrigin", ""));
            if (!"https".equals(origin.getScheme()) || origin.getHost() == null) return Result.failure();
            String token = Tasks.await(FirebaseMessaging.getInstance().getToken(), 30, TimeUnit.SECONDS);
            if (isStopped() || !session.equals(prefs.getString("sessionId", ""))) return Result.success();
            JSONObject body = new JSONObject().put("token", token).put("deviceId", device)
                .put("sessionId", session).put("transportVersion", 2).put("platform", "android")
                .put("appVersion", getApplicationContext().getPackageManager()
                    .getPackageInfo(getApplicationContext().getPackageName(), 0).versionName);
            connection = (HttpURLConnection) origin.resolve("/api/push/native/subscribe").toURL().openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Authorization", "Bearer " + auth);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setDoOutput(true);
            try (java.io.OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            if (status >= 200 && status < 300) return Result.success();
            if (status == 401 || status == 403 || (status >= 400 && status < 500 && status != 429)) return Result.failure();
            return Result.retry();
        } catch (Exception error) {
            return Result.retry();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
