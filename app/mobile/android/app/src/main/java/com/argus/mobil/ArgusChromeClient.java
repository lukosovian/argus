package com.argus.mobil;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

// Fragman tam ekranı (v1.27, T4). Uygulama dikey sabit (AndroidManifest screenOrientation="portrait"); YouTube
// oynatıcısında tam ekran düğmesine basılınca video bütün ekrana çıkar ve telefon yan çevrilince yatay döner.
// Capacitor'un kendi istemcisi tam ekranı hemen kapatıyordu (onShowCustomView içinde onCustomViewHidden) — o yüzden
// fragmanlar telefonda hiç tam ekran olmuyordu. Dosya seçici, izinler vb. için Capacitor'unki aynen kullanılır.
public class ArgusChromeClient extends BridgeWebChromeClient {
    private final Bridge bridge;
    private View custom;
    private CustomViewCallback customCallback;
    private OnBackPressedCallback backCallback;

    public ArgusChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        Activity act = bridge.getActivity();
        if (act == null) {
            callback.onCustomViewHidden();
            return;
        }
        if (custom != null) onHideCustomView();
        custom = view;
        customCallback = callback;
        FrameLayout decor = (FrameLayout) act.getWindow().getDecorView();
        view.setBackgroundColor(Color.BLACK);
        decor.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // Durum ve gezinme çubukları gizlensin; kenardan kaydırınca geçici görünür
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(act.getWindow(), decor);
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
        // Yan çevrilince yatay (iki yöne de); tam ekrandan çıkınca yeniden dikey
        act.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        // Geri tuşu önce tam ekrandan çıkarsın (uygulamada geri gitmesin)
        if (act instanceof ComponentActivity) {
            backCallback = new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    onHideCustomView();
                }
            };
            ((ComponentActivity) act).getOnBackPressedDispatcher().addCallback(backCallback);
        }
    }

    @Override
    public void onHideCustomView() {
        Activity act = bridge.getActivity();
        if (backCallback != null) {
            backCallback.remove();
            backCallback = null;
        }
        if (custom != null && act != null) {
            FrameLayout decor = (FrameLayout) act.getWindow().getDecorView();
            decor.removeView(custom);
            WindowCompat.getInsetsController(act.getWindow(), decor).show(WindowInsetsCompat.Type.systemBars());
            act.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }
        custom = null;
        if (customCallback != null) {
            CustomViewCallback cb = customCallback;
            customCallback = null;
            cb.onCustomViewHidden();
        }
    }
}
