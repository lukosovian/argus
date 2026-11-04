package com.argus.mobil;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ArgusPlugin.class);
        super.onCreate(savedInstanceState);
        // "/medya/..." görselleri telefondaki depodan / PC'den (bkz. ArgusWebViewClient)
        bridge.setWebViewClient(new ArgusWebViewClient(bridge));
    }
}
