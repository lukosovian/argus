package com.argus.mobil;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.Socket;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

// PC'ye giden bütün istekler (eşitleme, görseller, güncelleme, ağ taraması) Wi-Fi üzerinden gitsin (H3).
// Android'in "Wi-Fi zayıfsa mobil veriye geç" ayarı açıkken telefon, evdeki PC'nin adresine (192.168.x.x) giden
// istekleri de mobil veriden yollamaya çalışıyordu: bağlantı düşüyor, telefon "Çevrimdışı" kalıyordu. Burada
// telefonun Wi-Fi ağı izlenir, PC'ye açılan her bağlantı o ağa bağlanır. Wi-Fi yoksa (ör. telefonun kendi hotspot'u,
// kablolu bağlantı) eskisi gibi sistemin seçtiği yoldan gidilir.
final class WifiAg {
    private static volatile Network wifi = null;
    private static volatile boolean watching = false;

    private WifiAg() {}

    // Uygulama açılınca bir kez: Wi-Fi gelip gidince haberdar ol
    static synchronized void watch(Context ctx) {
        if (watching) return;
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getApplicationContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return;
            NetworkRequest req = new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build();
            cm.registerNetworkCallback(req, new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    wifi = network;
                }

                @Override
                public void onLost(Network network) {
                    if (network.equals(wifi)) wifi = null;
                }
            });
            watching = true;
        } catch (Exception ignored) {
            // izin yok / eski sürüm: aşağıdaki tarama yine çalışır
        }
    }

    // Şu anki Wi-Fi ağı (yoksa null)
    static Network wifi(Context ctx) {
        watch(ctx);
        Network n = wifi;
        if (n != null) return n;
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getApplicationContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return null;
            for (Network x : cm.getAllNetworks()) {
                NetworkCapabilities c = cm.getNetworkCapabilities(x);
                if (c != null && c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    wifi = x;
                    return x;
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    // Ev ağındaki bir adres mi (sadece bunlar Wi-Fi'a bağlanır; başka adreslere sistem karar versin)
    static boolean isLocal(String host) {
        if (host == null) return false;
        try {
            if (!host.matches("^[0-9.]+$")) return false;
            InetAddress a = InetAddress.getByName(host);
            return a.isSiteLocalAddress() || a.isLinkLocalAddress();
        } catch (Exception e) {
            return false;
        }
    }

    static HttpURLConnection open(Context ctx, URL url) throws IOException {
        Network n = isLocal(url.getHost()) ? wifi(ctx) : null;
        if (n != null) {
            try {
                return (HttpURLConnection) n.openConnection(url);
            } catch (Exception ignored) {
                // ağ az önce kaybolduysa sistemin yolundan dene
            }
        }
        return (HttpURLConnection) url.openConnection();
    }

    static Socket socket(Context ctx) {
        Network n = wifi(ctx);
        if (n != null) {
            try {
                Socket s = new Socket();
                n.bindSocket(s);
                return s;
            } catch (Exception ignored) {
            }
        }
        return new Socket();
    }

    // Wi-Fi ağındaki kendi IPv4 adreslerimiz (ağ taraması için). Wi-Fi yoksa boş.
    static List<String> wifiIps(Context ctx) {
        List<String> out = new ArrayList<>();
        Network n = wifi(ctx);
        if (n == null) return out;
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getApplicationContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            LinkProperties lp = cm == null ? null : cm.getLinkProperties(n);
            if (lp == null) return out;
            for (LinkAddress la : lp.getLinkAddresses()) {
                InetAddress a = la.getAddress();
                if (a instanceof Inet4Address && a.isSiteLocalAddress()) out.add(a.getHostAddress());
            }
        } catch (Exception ignored) {
        }
        return out;
    }
}
