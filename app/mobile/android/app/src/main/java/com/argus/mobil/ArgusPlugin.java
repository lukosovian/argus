package com.argus.mobil;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

// Arayüzün (src/lib/mobile) telefonun kendisinden istediği işler: PC'nin adresini/anahtarını kaydetme,
// aynı Wi-Fi'daki ARGUS'u bulma, afişleri önceden indirme, görsel deposunun boyutu.
@CapacitorPlugin(name = "ArgusNative")
public class ArgusPlugin extends Plugin {
    private final ExecutorService prefetcher = Executors.newSingleThreadExecutor();
    private volatile int prefetchGeneration = 0;

    @PluginMethod
    public void setServer(PluginCall call) {
        Medya.prefs(getContext())
            .edit()
            .putString("host", call.getString("host"))
            .putString("token", call.getString("token"))
            .apply();
        Medya.unreachableUntil = 0;
        call.resolve();
    }

    @PluginMethod
    public void clearServer(PluginCall call) {
        Medya.prefs(getContext()).edit().clear().apply();
        prefetchGeneration++;
        call.resolve();
    }

    // Bağlantı geri geldi: görseller yeniden denensin.
    @PluginMethod
    public void markReachable(PluginCall call) {
        Medya.unreachableUntil = 0;
        call.resolve();
    }

    private static List<String> localIps() {
        List<String> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) out.add(a.getHostAddress());
                }
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private static JSONObject hello(String host, int timeoutMs) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL("http://" + host + ":" + Medya.PORT + "/api/sync/hello").openConnection();
            c.setConnectTimeout(timeoutMs);
            c.setReadTimeout(timeoutMs);
            if (c.getResponseCode() != 200) return null;
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            try (InputStream in = c.getInputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            }
            JSONObject j = new JSONObject(bo.toString("UTF-8"));
            if (!"ARGUS".equals(j.optString("app"))) return null;
            j.put("host", host);
            return j;
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static boolean portOpen(String host, int timeoutMs) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, Medya.PORT), timeoutMs);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // Önce verilen adresler (kayıtlı IP, elle yazılan), sonra telefonun bulunduğu ağdaki (x.y.z.1-254) bütün
    // adresler denenir. { servers: [{ host, serverId, pcName, version }] }
    @PluginMethod
    public void findServers(PluginCall call) {
        final JSArray hintsArr = call.getArray("hints", new JSArray());
        final boolean scan = call.getBoolean("scan", true);
        new Thread(() -> {
            Set<String> hosts = new LinkedHashSet<>();
            try {
                for (int i = 0; i < hintsArr.length(); i++) hosts.add(hintsArr.getString(i));
            } catch (Exception ignored) {
            }
            final List<JSONObject> found = Collections.synchronizedList(new ArrayList<>());
            for (String h : hosts) {
                JSONObject j = hello(h, 1500);
                if (j != null) found.add(j);
            }
            if (found.isEmpty() && scan) {
                ExecutorService pool = Executors.newFixedThreadPool(48);
                Set<String> seen = new LinkedHashSet<>(hosts);
                for (String ip : localIps()) {
                    String base = ip.substring(0, ip.lastIndexOf('.') + 1);
                    for (int i = 1; i < 255; i++) {
                        final String h = base + i;
                        if (h.equals(ip) || !seen.add(h)) continue;
                        pool.execute(() -> {
                            if (!portOpen(h, 350)) return;
                            JSONObject j = hello(h, 1500);
                            if (j != null) found.add(j);
                        });
                    }
                }
                pool.shutdown();
                try {
                    pool.awaitTermination(20, TimeUnit.SECONDS);
                } catch (InterruptedException ignored) {
                }
            }
            JSObject ret = new JSObject();
            JSONArray arr = new JSONArray();
            synchronized (found) {
                for (JSONObject j : found) arr.put(j);
            }
            ret.put("servers", arr);
            ret.put("ips", new JSONArray(localIps()));
            call.resolve(ret);
        }).start();
    }

    // Verilen görselleri (ör. bütün afişler) arka planda indirir. İlerleme "prefetch" olayıyla bildirilir.
    @PluginMethod
    public void prefetch(PluginCall call) {
        JSArray paths = call.getArray("paths", new JSArray());
        final List<String> names = new ArrayList<>();
        try {
            for (int i = 0; i < paths.length(); i++) {
                String n = Medya.nameOf(paths.getString(i));
                if (n != null && !Medya.file(getContext(), n).exists()) names.add(n);
            }
        } catch (Exception ignored) {
        }
        final int gen = ++prefetchGeneration;
        call.resolve(new JSObject().put("missing", names.size()));
        prefetcher.execute(() -> {
            int done = 0;
            for (String n : names) {
                if (gen != prefetchGeneration) return;
                if (!Medya.file(getContext(), n).exists() && Medya.download(getContext(), n, 4000) == null && System.currentTimeMillis() < Medya.unreachableUntil) {
                    break;
                }
                done++;
                if (done % 10 == 0 || done == names.size()) {
                    notifyListeners("prefetch", new JSObject().put("done", done).put("total", names.size()));
                }
            }
        });
    }

    // Uygulamanın kendi sürümü (build.gradle: ARGUS sürümünden)
    @PluginMethod
    public void appVersion(PluginCall call) {
        try {
            android.content.pm.PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            call.resolve(new JSObject().put("version", pi.versionName).put("code", pi.versionCode));
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    // Güncelleme: yeni APK PC'deki ARGUS'tan indirilir ve Android'in kendi kurulum penceresi açılır (tarayıcı yok).
    // İlk seferde Android "bilinmeyen uygulama yükleme" izni ister: o zaman ayar sayfası açılır, izin verilince
    // tekrar "Güncelle"ye basılır. İlerleme "update" olayıyla bildirilir.
    @PluginMethod
    public void installUpdate(PluginCall call) {
        android.content.Context ctx = getContext();
        if (android.os.Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
            android.content.Intent i = new android.content.Intent(
                android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                android.net.Uri.parse("package:" + ctx.getPackageName())
            );
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            call.resolve(new JSObject().put("needsPermission", true));
            return;
        }
        final String host = Medya.host(ctx);
        final String token = Medya.token(ctx);
        if (host == null || token == null) {
            call.reject("PC bağlantısı yok");
            return;
        }
        new Thread(() -> {
            File out = new File(ctx.getCacheDir(), "argus-guncelleme.apk");
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL("http://" + host + ":" + Medya.PORT + "/api/mobile/apk").openConnection();
                c.setConnectTimeout(5000);
                c.setReadTimeout(30000);
                c.setRequestProperty("X-Argus-Token", token);
                if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                long total = c.getContentLengthLong();
                long done = 0;
                int lastPct = -1;
                try (InputStream in = c.getInputStream(); java.io.FileOutputStream fo = new java.io.FileOutputStream(out)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        fo.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != lastPct && pct % 5 == 0) {
                            lastPct = pct;
                            notifyListeners("update", new JSObject().put("percent", pct));
                        }
                    }
                }
                android.net.Uri uri = androidx.core.content.FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", out);
                android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION | android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                call.resolve(new JSObject().put("started", true));
            } catch (Exception e) {
                call.reject("Güncelleme indirilemedi: " + e.getMessage());
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void mediaInfo(PluginCall call) {
        File[] files = Medya.dir(getContext()).listFiles();
        long bytes = 0;
        int count = 0;
        if (files != null) {
            for (File f : files) {
                if (f.getName().endsWith(".part")) continue;
                bytes += f.length();
                count++;
            }
        }
        call.resolve(new JSObject().put("count", count).put("bytes", bytes));
    }

    @PluginMethod
    public void clearMedia(PluginCall call) {
        prefetchGeneration++;
        File[] files = Medya.dir(getContext()).listFiles();
        if (files != null) for (File f : files) f.delete();
        call.resolve();
    }
}
