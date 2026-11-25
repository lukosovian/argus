package com.argus.mobil;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

// Y11: ana ekran kutusu "Sıradaki bölüm". İzlemekte olduğun en fazla 3 yapım: afiş, ad, "S2 · B5 sırada".
// Veriyi arayüz yazar (ArgusPlugin.setWidget — eşitleme bitince ve uygulama açılınca, telefondaki kopyadan),
// PC kapalıyken de son hali görünür. Bir satıra dokununca uygulamada o kaydın detayı açılır.
public class SiradakiWidget extends AppWidgetProvider {
    private static final int[] ROWS = { R.id.w_row0, R.id.w_row1, R.id.w_row2 };
    private static final int[] IMGS = { R.id.w_img0, R.id.w_img1, R.id.w_img2 };
    private static final int[] TITLES = { R.id.w_title0, R.id.w_title1, R.id.w_title2 };
    private static final int[] SUBS = { R.id.w_sub0, R.id.w_sub1, R.id.w_sub2 };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    static void updateAll(Context ctx) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, SiradakiWidget.class));
            if (ids == null || ids.length == 0) return;
            RemoteViews v = build(ctx);
            for (int id : ids) mgr.updateAppWidget(id, v);
        } catch (Exception ignored) {
        }
    }

    private static PendingIntent open(Context ctx, int req, String url) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url), ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_siradaki);
        v.setOnClickPendingIntent(R.id.w_header, open(ctx, 7000, "argus://git?yol=%2F"));
        JSONArray items = new JSONArray();
        String empty = "";
        try {
            JSONObject w = new JSONObject(Medya.prefs(ctx).getString("widget", "{}"));
            items = w.optJSONArray("items");
            if (items == null) items = new JSONArray();
            empty = w.optString("empty", "");
        } catch (Exception ignored) {
        }
        for (int i = 0; i < ROWS.length; i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) {
                v.setViewVisibility(ROWS[i], View.GONE);
                continue;
            }
            v.setViewVisibility(ROWS[i], View.VISIBLE);
            v.setTextViewText(TITLES[i], it.optString("title"));
            v.setTextViewText(SUBS[i], it.optString("sub"));
            Bitmap b = poster(it.optString("img", ""));
            if (b != null) v.setImageViewBitmap(IMGS[i], b);
            else v.setImageViewResource(IMGS[i], R.drawable.widget_poster_bos);
            v.setOnClickPendingIntent(ROWS[i], open(ctx, 7001 + i, "argus://git?yol=" + Uri.encode(it.optString("yol", "/"))));
        }
        boolean none = items.length() == 0;
        v.setViewVisibility(R.id.w_empty, none ? View.VISIBLE : View.GONE);
        if (none) {
            v.setTextViewText(R.id.w_empty, empty.isEmpty() ? "ARGUS'u açınca izlediğin diziler burada görünür." : empty);
            v.setOnClickPendingIntent(R.id.w_empty, open(ctx, 7010, "argus://git?yol=%2F"));
        }
        return v;
    }

    // Kutunun bellek sınırına takılmasın diye küçültülerek
    private static Bitmap poster(String path) {
        if (path == null || path.isEmpty()) return null;
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(path, o);
            int s = 1;
            while (o.outWidth / (s * 2) >= 120) s *= 2;
            BitmapFactory.Options d = new BitmapFactory.Options();
            d.inSampleSize = s;
            return BitmapFactory.decodeFile(path, d);
        } catch (Exception e) {
            return null;
        }
    }
}
