package com.argus.mobil;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;

// Telefondaki görsel deposu: PC'deki ARGUS'un medya/ klasöründen gelen dosyalar uygulamanın kendi
// klasörüne (files/medya) kaydedilir. PC'nin adresi ve eşleştirme anahtarı da burada (SharedPreferences)
// tutulur — arayüz ArgusPlugin.setServer ile bildirir.
final class Medya {
    static final int PORT = 4000;
    private static final String PREFS = "argus";

    // PC'ye ulaşılamadıysa bir süre her görsel için tekrar denenmesin (sayfa takılmasın)
    static volatile long unreachableUntil = 0;

    private Medya() {}

    static File dir(Context ctx) {
        File d = new File(ctx.getFilesDir(), "medya");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String host(Context ctx) {
        return prefs(ctx).getString("host", null);
    }

    static String token(Context ctx) {
        return prefs(ctx).getString("token", null);
    }

    // "/medya/tmdb_poster_x.jpg" → "tmdb_poster_x.jpg"; klasör dışına çıkan adlar reddedilir.
    static String nameOf(String path) {
        if (path == null || !path.startsWith("/medya/")) return null;
        String name;
        try {
            name = URLDecoder.decode(path.substring(7), "UTF-8");
        } catch (Exception e) {
            return null;
        }
        if (name.isEmpty() || name.contains("/") || name.contains("\\") || name.contains("..")) return null;
        return name;
    }

    static File file(Context ctx, String name) {
        return new File(dir(ctx), name);
    }

    // PC'den indirip kaydeder; başarılıysa dosya, değilse null.
    static File download(Context ctx, String name, int timeoutMs) {
        String host = host(ctx);
        String token = token(ctx);
        if (host == null || token == null) return null;
        if (System.currentTimeMillis() < unreachableUntil) return null;
        File target = file(ctx, name);
        File tmp = new File(target.getPath() + ".part");
        HttpURLConnection c = null;
        try {
            URL url = new URL("http://" + host + ":" + PORT + "/medya/" + java.net.URLEncoder.encode(name, "UTF-8").replace("+", "%20"));
            c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(timeoutMs);
            c.setReadTimeout(timeoutMs * 3);
            c.setRequestProperty("X-Argus-Token", token);
            if (c.getResponseCode() != 200) return null;
            try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            if (!tmp.renameTo(target)) return null;
            return target;
        } catch (java.io.IOException e) {
            tmp.delete();
            unreachableUntil = System.currentTimeMillis() + 20000;
            return null;
        } catch (Exception e) {
            tmp.delete();
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    static String mime(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".mp4")) return "video/mp4";
        return "image/jpeg";
    }
}
