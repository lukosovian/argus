package com.argus.mobil;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Arka plan eşitlemesi (EsitlemeWorker) uygulama ekrandayken çalışmasın — eşitlemeyi o sırada arayüz yapıyor
    static volatile boolean visible = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ArgusPlugin.class);
        super.onCreate(savedInstanceState);
        // "/medya/..." görselleri telefondaki depodan / PC'den (bkz. ArgusWebViewClient)
        bridge.setWebViewClient(new ArgusWebViewClient(bridge));
        // Fragman tam ekranı + yatay dönme (v1.27, T4; bkz. ArgusChromeClient)
        bridge.getWebView().setWebChromeClient(new ArgusChromeClient(bridge));
        // Telefon Ayarları'ndaki yazı boyutu (v1.27, T2; bkz. ArgusPlugin.setTextZoom)
        bridge.getWebView().getSettings().setTextZoom(ArgusPlugin.textZoom(this));
        WifiAg.watch(this);
        // Paylaş menüsü / kısayol / ana ekran kutusu ile açıldıysa (bkz. ArgusPlugin.deliver)
        if (savedInstanceState == null) ArgusPlugin.deliver(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        ArgusPlugin.deliver(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        visible = true;
    }

    @Override
    public void onPause() {
        super.onPause();
        visible = false;
    }
}
