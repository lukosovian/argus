package com.argus.mobil;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

// Arayüzün (src/lib/mobile) telefonun kendisinden istediği işler: PC'nin adresini/anahtarını kaydetme,
// aynı Wi-Fi'daki ARGUS'u bulma, PC'ye istek (Wi-Fi üzerinden), afişleri önceden indirme, görsel deposunun
// boyutu, ana ekran kutusu, arka plan eşitlemesi, paylaş menüsü / kısayollar, parmak izi, kare kod okuma.
@CapacitorPlugin(name = "ArgusNative")
public class ArgusPlugin extends Plugin {
    private final ExecutorService prefetcher = Executors.newSingleThreadExecutor();
    private final ExecutorService requests = Executors.newCachedThreadPool();
    private volatile int prefetchGeneration = 0;

    static final String LOCAL_NETWORK = "android.permission.ACCESS_LOCAL_NETWORK";

    // Paylaş menüsünden / kısayoldan / ana ekran kutusundan gelen istekler: arayüz hazır olunca takeIntents ile alır.
    private static final List<JSObject> pendingIntents = new ArrayList<>();
    private static ArgusPlugin instance;

    @Override
    public void load() {
        instance = this;
        WifiAg.watch(getContext());
    }

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
        EsitlemeWorker.cancel(getContext());
        SiradakiWidget.updateAll(getContext());
        prefetchGeneration++;
        call.resolve();
    }

    // Bağlantı geri geldi: görseller yeniden denensin.
    @PluginMethod
    public void markReachable(PluginCall call) {
        Medya.unreachableUntil = 0;
        call.resolve();
    }

    // Önce verilen adresler (kayıtlı IP, elle yazılan), sonra telefonun bulunduğu ağdaki (x.y.z.1-254) bütün
    // adresler denenir. { servers: [{ host, serverId, pcName, version }] }
    @PluginMethod
    public void findServers(PluginCall call) {
        final JSArray hintsArr = call.getArray("hints", new JSArray());
        final boolean scan = call.getBoolean("scan", true);
        final Context ctx = getContext();
        new Thread(() -> {
            List<String> hints = new ArrayList<>();
            try {
                for (int i = 0; i < hintsArr.length(); i++) hints.add(hintsArr.getString(i));
            } catch (Exception ignored) {
            }
            JSONArray arr = new JSONArray();
            for (JSONObject j : PcBul.find(ctx, hints, scan, null)) arr.put(j);
            JSObject ret = new JSObject();
            ret.put("servers", arr);
            ret.put("ips", new JSONArray(PcBul.localIps(ctx)));
            call.resolve(ret);
        }).start();
    }

    // PC'ye tek bir istek (H3: Wi-Fi'a bağlı). { status, headers, data (metin) }; ağ hatası → reject("NETWORK")
    @PluginMethod
    public void request(PluginCall call) {
        final String host = call.getString("host");
        final String path = call.getString("path", "/");
        final String method = call.getString("method", "GET");
        final String body = call.getString("body");
        final int connectMs = call.getInt("connectTimeout", 4000);
        final int readMs = call.getInt("readTimeout", 15000);
        final JSObject h = call.getObject("headers", new JSObject());
        if (host == null) {
            call.reject("no host", "NETWORK");
            return;
        }
        final Map<String, String> headers = new LinkedHashMap<>();
        Iterator<String> keys = h.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            headers.put(k, h.optString(k));
        }
        final Context ctx = getContext();
        requests.execute(() -> {
            try {
                PcBul.Cevap r = PcBul.istek(ctx, host, path, method, headers, body, connectMs, readMs);
                JSObject rh = new JSObject();
                if (r.headers != null) {
                    for (Map.Entry<String, List<String>> e : r.headers.entrySet()) {
                        if (e.getKey() == null || e.getValue() == null) continue;
                        rh.put(e.getKey(), android.text.TextUtils.join(", ", e.getValue()));
                    }
                }
                call.resolve(new JSObject().put("status", r.status).put("headers", rh).put("data", r.body));
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()), "NETWORK");
            }
        });
    }

    // H18: Android 17'den itibaren (uygulama o sürümü hedefleyince) ev ağına erişim ayrı bir izin. Uygulama henüz
    // Android 16'yı (API 36) hedeflediği için Android bu izni kendiliğinden veriyor; hedef yükseltilince ilk açılışta sorulur.
    @PluginMethod
    public void localNetworkPermission(PluginCall call) {
        Context ctx = getContext();
        boolean needed = Build.VERSION.SDK_INT >= 37 && ctx.getApplicationInfo().targetSdkVersion >= 37;
        if (!needed) {
            call.resolve(new JSObject().put("state", "granted").put("needed", false));
            return;
        }
        boolean granted = ContextCompat.checkSelfPermission(ctx, LOCAL_NETWORK) == PackageManager.PERMISSION_GRANTED;
        if (!granted && call.getBoolean("request", false) && getActivity() != null) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { LOCAL_NETWORK }, 4711);
        }
        call.resolve(new JSObject().put("state", granted ? "granted" : "prompt").put("needed", true));
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
                c = WifiAg.open(ctx, new URL("http://" + host + ":" + Medya.PORT + "/api/mobile/apk"));
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
                // Bağlantı yarıda kesilip dosya eksik indiyse kurulum penceresi "paket ayrıştırılamadı" diyordu
                if (total > 0 && done != total) throw new Exception("eksik indi (" + done + "/" + total + ")");
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

    // ---- Y11: ana ekran kutusu "Sıradaki bölüm" ----
    // items: [{ title, sub, poster ("/medya/..." ya da https://...), yol (uygulamada açılacak sayfa) }]
    @PluginMethod
    public void setWidget(PluginCall call) {
        final JSArray items = call.getArray("items", new JSArray());
        final String empty = call.getString("empty", "");
        final Context ctx = getContext();
        requests.execute(() -> {
            JSONArray out = new JSONArray();
            try {
                for (int i = 0; i < items.length() && i < 3; i++) {
                    JSONObject it = items.getJSONObject(i);
                    File img = widgetImage(ctx, it.optString("poster", ""));
                    JSONObject o = new JSONObject();
                    o.put("title", it.optString("title"));
                    o.put("sub", it.optString("sub"));
                    o.put("yol", it.optString("yol", "/"));
                    if (img != null) o.put("img", img.getAbsolutePath());
                    out.put(o);
                }
                Medya.prefs(ctx).edit().putString("widget", new JSONObject().put("items", out).put("empty", empty).put("at", System.currentTimeMillis()).toString()).apply();
            } catch (Exception ignored) {
            }
            SiradakiWidget.updateAll(ctx);
            call.resolve();
        });
    }

    private static File widgetImage(Context ctx, String src) {
        if (src == null || src.isEmpty()) return null;
        String name = Medya.nameOf(src);
        if (name != null) {
            File f = Medya.file(ctx, name);
            return f.exists() ? f : Medya.download(ctx, name, 4000);
        }
        if (!src.startsWith("https://")) return null;
        File f = new File(new File(ctx.getCacheDir(), "kutu"), Integer.toHexString(src.hashCode()) + ".jpg");
        if (f.exists()) return f;
        f.getParentFile().mkdirs();
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(src).openConnection();
            c.setConnectTimeout(5000);
            c.setReadTimeout(10000);
            if (c.getResponseCode() != 200) return null;
            File tmp = new File(f.getPath() + ".part");
            try (InputStream in = c.getInputStream(); FileOutputStream o = new FileOutputStream(tmp)) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
            }
            return tmp.renameTo(f) ? f : null;
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    // ---- G4: arka planda eşitleme ----
    // Arayüz, PC'ye gitmeyi bekleyen değişikliklerin bir kopyasını buraya yazar; Android arada bir (Wi-Fi'dayken)
    // EsitlemeWorker'ı çalıştırır, PC bulunursa bunlar gönderilir (sunucu aynı değişikliği iki kez uygulamaz).
    @PluginMethod
    public void setBackgroundSync(PluginCall call) {
        Context ctx = getContext();
        boolean enabled = call.getBoolean("enabled", true);
        SharedPreferences.Editor e = Medya.prefs(ctx).edit().putBoolean("bg_enabled", enabled);
        String serverId = call.getString("serverId");
        if (serverId != null) e.putString("serverId", serverId);
        JSArray ops = call.getArray("ops");
        if (ops != null) e.putString("bg_ops", ops.toString());
        e.apply();
        if (enabled && Medya.host(ctx) != null) EsitlemeWorker.schedule(ctx);
        else EsitlemeWorker.cancel(ctx);
        call.resolve();
    }

    @PluginMethod
    public void backgroundInfo(PluginCall call) {
        SharedPreferences p = Medya.prefs(getContext());
        int pending = 0;
        try {
            pending = new JSONArray(p.getString("bg_ops", "[]")).length();
        } catch (Exception ignored) {
        }
        call.resolve(
            new JSObject()
                .put("host", p.getString("host", null))
                .put("serverId", p.getString("serverId", null))
                .put("lastRun", p.getLong("bg_lastRun", 0))
                .put("lastReach", p.getLong("bg_lastReach", 0))
                .put("sent", p.getInt("bg_sent", 0))
                .put("sentAt", p.getLong("bg_sentAt", 0))
                .put("pending", pending)
        );
    }

    // ---- Y13 / Y15 / bildirim / kutu: dışarıdan gelen istekler ----
    static void deliver(Intent intent) {
        if (intent == null) return;
        JSObject o = null;
        String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action) && "text/plain".equals(intent.getType())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            if (text != null || subject != null) o = new JSObject().put("kind", "share").put("text", text == null ? "" : text).put("subject", subject == null ? "" : subject);
        } else if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null && "argus".equals(intent.getData().getScheme())) {
            o = new JSObject().put("kind", "url").put("url", intent.getData().toString());
        }
        if (o == null) return;
        // Aynı isteğin iki kez işlenmemesi için (ör. ekran dönünce aynı intent yeniden gelirse)
        intent.setAction("com.argus.mobil.ISLENDI");
        synchronized (pendingIntents) {
            pendingIntents.add(o);
        }
        ArgusPlugin p = instance;
        if (p != null) p.notifyListeners("intent", new JSObject());
    }

    @PluginMethod
    public void takeIntents(PluginCall call) {
        JSONArray arr = new JSONArray();
        synchronized (pendingIntents) {
            for (JSObject o : pendingIntents) arr.put(o);
            pendingIntents.clear();
        }
        call.resolve(new JSObject().put("items", arr));
    }

    // ---- Y24: parmak izi / yüz ----
    private static final int BIO = BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void biometricAvailable(PluginCall call) {
        int r = BiometricManager.from(getContext()).canAuthenticate(BIO);
        call.resolve(new JSObject().put("available", r == BiometricManager.BIOMETRIC_SUCCESS));
    }

    @PluginMethod
    public void biometricAuth(PluginCall call) {
        final String title = call.getString("title", "ARGUS");
        final String subtitle = call.getString("subtitle", "");
        final String cancel = call.getString("cancel", "PIN");
        if (!(getActivity() instanceof FragmentActivity)) {
            call.resolve(new JSObject().put("ok", false).put("error", "no-activity"));
            return;
        }
        final FragmentActivity act = (FragmentActivity) getActivity();
        final AtomicBoolean done = new AtomicBoolean(false);
        act.runOnUiThread(() -> {
            try {
                BiometricPrompt prompt = new BiometricPrompt(act, ContextCompat.getMainExecutor(act), new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        if (done.compareAndSet(false, true)) call.resolve(new JSObject().put("ok", true));
                    }

                    @Override
                    public void onAuthenticationError(int code, CharSequence msg) {
                        if (done.compareAndSet(false, true)) call.resolve(new JSObject().put("ok", false).put("code", code).put("error", String.valueOf(msg)));
                    }
                });
                BiometricPrompt.PromptInfo.Builder b = new BiometricPrompt.PromptInfo.Builder().setTitle(title).setNegativeButtonText(cancel).setAllowedAuthenticators(BIO);
                if (!subtitle.isEmpty()) b.setSubtitle(subtitle);
                prompt.authenticate(b.build());
            } catch (Exception e) {
                if (done.compareAndSet(false, true)) call.resolve(new JSObject().put("ok", false).put("error", String.valueOf(e.getMessage())));
            }
        });
    }

    // ---- T2 (v1.27): yazı boyutu — WebView'in yazı yakınlaştırması (%90 / %100 / %110 / %125). Düzen (genişlikler,
    // ekran yüksekliği) bozulmasın diye sayfa değil sadece yazılar büyür. Telefonda kalıcı; açılışta MainActivity uygular.
    static SharedPreferences ayarlar(Context ctx) {
        return ctx.getSharedPreferences("argus_ayar", Context.MODE_PRIVATE);
    }

    static int textZoom(Context ctx) {
        int z = ayarlar(ctx).getInt("textZoom", 100);
        return z >= 50 && z <= 200 ? z : 100;
    }

    @PluginMethod
    public void setTextZoom(PluginCall call) {
        int z = call.getInt("percent", 100);
        if (z < 50 || z > 200) z = 100;
        ayarlar(getContext()).edit().putInt("textZoom", z).apply();
        final int zz = z;
        getActivity().runOnUiThread(() -> {
            try {
                getBridge().getWebView().getSettings().setTextZoom(zz);
            } catch (Exception ignored) {
            }
            call.resolve(new JSObject().put("percent", zz));
        });
    }

    @PluginMethod
    public void getTextZoom(PluginCall call) {
        call.resolve(new JSObject().put("percent", textZoom(getContext())));
    }

    // ---- T3 (v1.27): sesle arama — telefonun kendi ses tanıma penceresi (Google). Mikrofon iznini o uygulama ister,
    // ARGUS'un RECORD_AUDIO iznine gerek yok. Ses tanıma yoksa (ör. Google uygulaması kapalı) düğme hiç görünmez.
    private Intent voiceIntent(String lang, String prompt) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_WEB_SEARCH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        if (prompt != null && !prompt.isEmpty()) i.putExtra(RecognizerIntent.EXTRA_PROMPT, prompt);
        return i;
    }

    @PluginMethod
    public void voiceAvailable(PluginCall call) {
        boolean ok = false;
        try {
            ok = !getContext().getPackageManager().queryIntentActivities(voiceIntent("tr-TR", null), 0).isEmpty();
        } catch (Exception ignored) {
        }
        call.resolve(new JSObject().put("available", ok));
    }

    @PluginMethod
    public void voiceSearch(PluginCall call) {
        Intent i = voiceIntent(call.getString("lang", "tr-TR"), call.getString("prompt", ""));
        try {
            startActivityForResult(call, i, "voiceResult");
        } catch (Exception e) {
            call.reject("unavailable");
        }
    }

    @ActivityCallback
    private void voiceResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        String text = "";
        if (result.getResultCode() == android.app.Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> list = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (list != null && !list.isEmpty() && list.get(0) != null) text = list.get(0);
        }
        if (text.isEmpty()) call.resolve(new JSObject().put("cancelled", true));
        else call.resolve(new JSObject().put("text", text));
    }

    // ---- A8: kare kod okuma (Google Play Hizmetleri'nin tarayıcısı; uygulamanın kamera izni gerekmez) ----
    @PluginMethod
    public void scanQr(PluginCall call) {
        if (getActivity() == null) {
            call.reject("no-activity");
            return;
        }
        try {
            GmsBarcodeScannerOptions o = new GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).enableAutoZoom().build();
            GmsBarcodeScanning.getClient(getActivity(), o)
                .startScan()
                .addOnSuccessListener((b) -> call.resolve(new JSObject().put("text", b.getRawValue())))
                .addOnCanceledListener(() -> call.resolve(new JSObject().put("cancelled", true)))
                .addOnFailureListener((e) -> call.reject(String.valueOf(e.getMessage())));
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
