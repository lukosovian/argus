package com.argus.mobil;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.util.HashMap;
import java.util.Map;

// Arayüzdeki "/medya/..." görselleri: telefonda kayıtlıysa dosyadan, değilse PC'den çekilip kaydedilerek
// verilir. PC'ye ulaşılamıyorsa boş cevap döner (arayüz yer tutucu gösterir). Arayüz kodunda değişiklik
// gerekmesin diye istek burada, WebView seviyesinde yakalanıyor.
public class ArgusWebViewClient extends BridgeWebViewClient {
    private final Bridge bridge;

    public ArgusWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if ("localhost".equals(url.getHost()) && url.getPath() != null && url.getPath().startsWith("/medya/")) {
            String name = Medya.nameOf(url.getPath());
            if (name == null) return empty(404);
            File f = Medya.file(bridge.getContext(), name);
            if (!f.exists()) f = Medya.download(bridge.getContext(), name, 2500);
            if (f == null) return empty(404);
            try {
                WebResourceResponse r = new WebResourceResponse(Medya.mime(name), null, new FileInputStream(f));
                Map<String, String> h = new HashMap<>();
                h.put("Cache-Control", "max-age=86400");
                r.setResponseHeaders(h);
                return r;
            } catch (Exception e) {
                return empty(404);
            }
        }
        return super.shouldInterceptRequest(view, request);
    }

    private static WebResourceResponse empty(int status) {
        return new WebResourceResponse("text/plain", "utf-8", status, "Not Found", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }
}
