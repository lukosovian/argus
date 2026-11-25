package com.argus.mobil;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

// G4: uygulama kapalıyken arada bir (Android'in uygun gördüğü zamanda, en sık ~30 dakikada bir, sadece Wi-Fi'dayken
// ve pil azalmamışken) çalışır:
//   1. Kayıtlı adreste PC'yi arar; yoksa ağı tarayıp aynı ARGUS'u (serverId) bulur ve yeni adresi kaydeder
//      (şarjdayken ya da 3 saatte bir — tarama 254 adresi denediği için). Uygulama açılınca beklemeden bağlanır.
//   2. PC bulunursa, arayüzün buraya yazdığı bekleyen değişiklikleri sırayla gönderir. Sunucu aynı değişikliği
//      (X-Argus-Op-Id) iki kez uygulamaz; uygulama açılınca kendi sırasını yine gönderir, PC "zaten var" der.
//   3. PC'de telefon uygulamasının yeni sürümü varsa (bir kez) bildirim gösterir.
// PC'deki yeni verileri telefona ÇEKMEZ: telefondaki kopya arayüzün (WebView) veritabanında, o ancak uygulama
// açıkken güncellenebilir.
public class EsitlemeWorker extends Worker {
    private static final String NAME = "argus-arka-plan-esitleme";
    static final String CHANNEL = "argus-genel";

    public EsitlemeWorker(@NonNull Context ctx, @NonNull WorkerParameters params) {
        super(ctx, params);
    }

    static void schedule(Context ctx) {
        Constraints c = new Constraints.Builder().setRequiredNetworkType(NetworkType.UNMETERED).setRequiresBatteryNotLow(true).build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(EsitlemeWorker.class, 30, TimeUnit.MINUTES).setConstraints(c).build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req);
    }

    static void cancel(Context ctx) {
        WorkManager.getInstance(ctx).cancelUniqueWork(NAME);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences p = Medya.prefs(ctx);
        p.edit().putLong("bg_lastRun", System.currentTimeMillis()).apply();
        // Uygulama açıkken eşitlemeyi arayüz yapıyor
        if (MainActivity.visible) return Result.success();
        String host = p.getString("host", null);
        String token = p.getString("token", null);
        String serverId = p.getString("serverId", null);
        if (!p.getBoolean("bg_enabled", true) || host == null || token == null) return Result.success();

        JSONObject h = PcBul.hello(ctx, host, 2000);
        if (h == null || (serverId != null && !serverId.equals(h.optString("serverId")))) {
            h = null;
            long lastScan = p.getLong("bg_lastScan", 0);
            if (serverId != null && (charging(ctx) || System.currentTimeMillis() - lastScan > 3 * 3600_000L)) {
                p.edit().putLong("bg_lastScan", System.currentTimeMillis()).apply();
                for (JSONObject j : PcBul.find(ctx, new ArrayList<>(), true, serverId)) {
                    if (serverId.equals(j.optString("serverId"))) {
                        h = j;
                        host = j.optString("host");
                        p.edit().putString("host", host).apply();
                        break;
                    }
                }
            }
        }
        if (h == null) return Result.success();
        p.edit().putLong("bg_lastReach", System.currentTimeMillis()).apply();
        Medya.unreachableUntil = 0;

        sendOps(ctx, p, host, token);
        checkUpdate(ctx, p, host, token);
        return Result.success();
    }

    private static void sendOps(Context ctx, SharedPreferences p, String host, String token) {
        JSONArray ops;
        try {
            ops = new JSONArray(p.getString("bg_ops", "[]"));
        } catch (Exception e) {
            return;
        }
        if (ops.length() == 0) return;
        int sent = 0;
        JSONArray left = new JSONArray();
        boolean stop = false;
        for (int i = 0; i < ops.length(); i++) {
            JSONObject op = ops.optJSONObject(i);
            if (op == null) continue;
            if (stop) {
                left.put(op);
                continue;
            }
            Map<String, String> headers = new HashMap<>();
            headers.put("X-Argus-Token", token);
            headers.put("X-Argus-Op-Id", op.optString("id"));
            headers.put("X-Argus-Op-At", String.valueOf(op.optLong("at")));
            String body = op.has("body") && !op.isNull("body") ? op.optString("body") : null;
            if (body != null) headers.put("Content-Type", "application/json");
            try {
                PcBul.Cevap r = PcBul.istek(ctx, host, op.optString("path"), op.optString("method", "POST"), headers, body, 4000, 20000);
                // PC şu an kabul etmiyor (eşleşme kalkmış, yoğun, geçici hata): sıradakiler uygulamaya kalsın
                if (r.status == 401 || r.status == 403 || r.status == 429 || r.status >= 500) {
                    stop = true;
                    left.put(op);
                    continue;
                }
                // Diğer hatalar (ör. kayıt PC'de silinmiş): uygulama açılınca kendi listesinde "gönderilemedi" der
                sent++;
            } catch (Exception e) {
                stop = true;
                left.put(op);
            }
        }
        SharedPreferences.Editor e = p.edit().putString("bg_ops", left.toString());
        if (sent > 0) e.putInt("bg_sent", p.getInt("bg_sent", 0) + sent).putLong("bg_sentAt", System.currentTimeMillis());
        e.apply();
    }

    private static void checkUpdate(Context ctx, SharedPreferences p, String host, String token) {
        try {
            Map<String, String> headers = new HashMap<>();
            headers.put("X-Argus-Token", token);
            PcBul.Cevap r = PcBul.istek(ctx, host, "/api/mobile/info", "GET", headers, null, 4000, 8000);
            if (r.status != 200) return;
            JSONObject info = new JSONObject(r.body);
            int code = info.optInt("code", 0);
            int own = (int) androidx.core.content.pm.PackageInfoCompat.getLongVersionCode(ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0));
            if (!info.optBoolean("available") || code <= own || p.getInt("bg_updateNotified", 0) == code) return;
            p.edit().putInt("bg_updateNotified", code).apply();
            notify(ctx, 9001, "ARGUS güncellemesi hazır", "Telefon uygulamasının yeni sürümü (" + info.optString("version") + ") PC'de hazır. Açıp üstteki “Güncelle”ye bas.", "argus://git?yol=%2F");
        } catch (Exception ignored) {
        }
    }

    static void notify(Context ctx, int id, String title, String text, String url) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL, "ARGUS", NotificationManager.IMPORTANCE_DEFAULT));
            }
        }
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url), ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_argus).setColor(0xFF00C0FA)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pi)
            .setAutoCancel(true);
        try {
            NotificationManagerCompat.from(ctx).notify(id, b.build());
        } catch (SecurityException ignored) {
        }
    }

    private static boolean charging(Context ctx) {
        try {
            BatteryManager bm = (BatteryManager) ctx.getSystemService(Context.BATTERY_SERVICE);
            return bm != null && bm.isCharging();
        } catch (Exception e) {
            return false;
        }
    }
}
