package com.argus.mobil;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ProtocolException;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

// PC'deki ARGUS'u bulma ve ona istek atma — hem arayüz (ArgusPlugin) hem arka plan eşitlemesi (EsitlemeWorker)
// kullanır. Bütün bağlantılar Wi-Fi'a bağlanır (bkz. WifiAg).
final class PcBul {
    private PcBul() {}

    static final class Cevap {
        int status;
        Map<String, List<String>> headers;
        String body;
    }

    // Tek bir HTTP isteği. Ağ hatasında IOException fırlatır.
    static Cevap istek(Context ctx, String host, String path, String method, Map<String, String> headers, String body, int connectMs, int readMs) throws java.io.IOException {
        HttpURLConnection c = WifiAg.open(ctx, new URL("http://" + host + ":" + Medya.PORT + path));
        try {
            c.setConnectTimeout(connectMs);
            c.setReadTimeout(readMs);
            c.setUseCaches(false);
            setMethod(c, method == null ? "GET" : method.toUpperCase());
            if (headers != null) for (Map.Entry<String, String> h : headers.entrySet()) c.setRequestProperty(h.getKey(), h.getValue());
            if (body != null && !"GET".equalsIgnoreCase(method)) {
                byte[] b = body.getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setFixedLengthStreamingMode(b.length);
                try (OutputStream o = c.getOutputStream()) {
                    o.write(b);
                }
            }
            Cevap r = new Cevap();
            r.status = c.getResponseCode();
            r.headers = c.getHeaderFields();
            InputStream in = r.status >= 400 ? c.getErrorStream() : c.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            if (in != null) {
                try (InputStream i = in) {
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = i.read(buf)) > 0) bo.write(buf, 0, n);
                }
            }
            r.body = bo.toString("UTF-8");
            return r;
        } finally {
            c.disconnect();
        }
    }

    // HttpURLConnection PATCH'i tanımıyor (arşiv ayarı değişikliği PATCH ile gidiyor)
    private static void setMethod(HttpURLConnection c, String method) throws ProtocolException {
        try {
            c.setRequestMethod(method);
        } catch (ProtocolException e) {
            try {
                Field f = HttpURLConnection.class.getDeclaredField("method");
                f.setAccessible(true);
                f.set(c, method);
                // Network.openConnection bazı sürümlerde sarmalayıcı döndürüyor: içteki bağlantıya da yaz
                for (Field df : c.getClass().getDeclaredFields()) {
                    if (HttpURLConnection.class.isAssignableFrom(df.getType())) {
                        df.setAccessible(true);
                        Object inner = df.get(c);
                        if (inner != null) f.set(inner, method);
                    }
                }
            } catch (Exception ignored) {
                c.setRequestMethod("POST");
                c.setRequestProperty("X-HTTP-Method-Override", method);
            }
        }
    }

    static JSONObject hello(Context ctx, String host, int timeoutMs) {
        try {
            Cevap r = istek(ctx, host, "/api/sync/hello", "GET", null, null, timeoutMs, timeoutMs);
            if (r.status != 200) return null;
            JSONObject j = new JSONObject(r.body);
            if (!"ARGUS".equals(j.optString("app"))) return null;
            j.put("host", host);
            return j;
        } catch (Exception e) {
            return null;
        }
    }

    static boolean portOpen(Context ctx, String host, int timeoutMs) {
        try (Socket s = WifiAg.socket(ctx)) {
            s.connect(new InetSocketAddress(host, Medya.PORT), timeoutMs);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // Telefonun bulunduğu ağ(lar)daki kendi adresleri. Önce Wi-Fi ağı; bulunamazsa ağ arayüzleri (mobil veri / VPN hariç).
    static List<String> localIps(Context ctx) {
        List<String> out = new ArrayList<>(WifiAg.wifiIps(ctx));
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                // Mobil veri / VPN arayüzleri taranmasın: eskiden PC yokken her dakika operatörün ağında 254 adres deneniyordu
                if (isCellularOrVpn(ni.getName())) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress() && !out.contains(a.getHostAddress())) out.add(a.getHostAddress());
                }
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private static boolean isCellularOrVpn(String name) {
        if (name == null) return false;
        String n = name.toLowerCase();
        return n.startsWith("rmnet") || n.startsWith("ccmni") || n.startsWith("v4-") || n.startsWith("clat") || n.startsWith("tun") || n.startsWith("ppp") || n.startsWith("pdp") || n.startsWith("dummy");
    }

    // Verilen adresler, olmazsa (scan) ağdaki x.y.z.1-254. stopAtServerId doluysa o ARGUS bulununca durur.
    static List<JSONObject> find(Context ctx, List<String> hints, boolean scan, String stopAtServerId) {
        Set<String> hosts = new LinkedHashSet<>(hints);
        final List<JSONObject> found = Collections.synchronizedList(new ArrayList<>());
        for (String h : hosts) {
            JSONObject j = hello(ctx, h, 1500);
            if (j != null) found.add(j);
        }
        if (found.isEmpty() && scan) {
            ExecutorService pool = Executors.newFixedThreadPool(48);
            Set<String> seen = new LinkedHashSet<>(hosts);
            for (String ip : localIps(ctx)) {
                String base = ip.substring(0, ip.lastIndexOf('.') + 1);
                for (int i = 1; i < 255; i++) {
                    final String h = base + i;
                    if (h.equals(ip) || !seen.add(h)) continue;
                    pool.execute(() -> {
                        if (stopAtServerId != null && hasServer(found, stopAtServerId)) return;
                        if (!portOpen(ctx, h, 350)) return;
                        JSONObject j = hello(ctx, h, 1500);
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
        synchronized (found) {
            return new ArrayList<>(found);
        }
    }

    private static boolean hasServer(List<JSONObject> list, String serverId) {
        synchronized (list) {
            for (JSONObject j : list) if (serverId.equals(j.optString("serverId"))) return true;
        }
        return false;
    }
}
