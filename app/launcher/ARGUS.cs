// ARGUS.exe — ARGUS'u açan küçük program (klasörün kökündeki ARGUS.exe bundan derlenir, bkz. derle.cmd).
// Kullanıcı "terminal ekranı görmek istemiyorum, klasörde ARGUS diye bir .exe olsun, yükleniyor çubuğu daha
// akıcı olsun" dedi. Bu program:
//  - logolu açılış penceresini gösterir (çubuk zamana göre çizilir; kontroller arka planda yapılır, pencere donmaz),
//  - güncelleme / kurulum / başlatma adımlarını yapan ARGUS.bat'ı HİÇ pencere açmadan çalıştırır; ARGUS.bat o an
//    ne yaptığını %TEMP%\argus-durum.txt'ye yazar, pencere onu gösterir. Arayüz (5173) cevap verince kapanır;
//    ARGUS'un kendi penceresini (Electron, app\desktop\main.cjs) ARGUS.bat açar,
//  - her açılışta klasörü düzenler (ARGUS.bat, README vb. gizlenir) ve masaüstü kısayolunu kendisine çevirir,
//  - ARGUS zaten açıksa pencereyi öne getirir.
// Bir sorun olursa ARGUS.bat görünür bir terminal açar (mesajı okuyabilmek için), bu pencere de kapanır.
//   --guncelleme : "Şimdi Güncelle" sonrası (bkz. app\server\restart.js)
// Not: Windows'la gelen .NET Framework derleyicisi (C# 5) kullanıldığı için yeni C# sözdizimi yok.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    // Görev çubuğunda uygulamayla (Electron penceresi, appId ARGUS) aynı grupta dursun; sabitlenen ARGUS simgesine
    // basınca açılış penceresi de o simgenin altında görünür
    [System.Runtime.InteropServices.DllImport("shell32.dll")]
    static extern int SetCurrentProcessExplicitAppUserModelID([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] string id);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    static extern bool AllowSetForegroundWindow(int processId);

    public static string Root, App, StatusFile;

    [STAThread]
    static void Main(string[] args)
    {
        try { SetCurrentProcessExplicitAppUserModelID("ARGUS"); } catch { }
        bool guncelleme = Array.IndexOf(args, "--guncelleme") >= 0;
        // --arka-plan: bilgisayar açılırken (Ayarlar › Uygulama Ayarları › tepside başla) — açılış penceresi yok
        bool arkaPlan = Array.IndexOf(args, "--arka-plan") >= 0;
        bool created;
        using (var mutex = new Mutex(true, "ARGUS_Baslatici", out created))
        {
            if (!created) return; // iki kez hızlıca tıklandıysa ikinci açılış bir şey yapmasın

            Root = Path.GetDirectoryName(Application.ExecutablePath);
            App = Path.Combine(Root, "app");
            StatusFile = Path.Combine(Path.GetTempPath(), "argus-durum.txt");
            try { Duzenle(); } catch { }
            try { BaslatMenusu.Hazirla(Root); } catch { }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool zatenAcik = !guncelleme && PortAcik(150);
            if (arkaPlan && zatenAcik) return;
            if (zatenAcik)
            {
                // Kullanıcı "ARGUS açıkken tekrar açınca ARGUS zaten açık demesin" dedi: açılış penceresi hiç
                // çıkmıyor, açık pencere doğrudan öne geliyor (ikinci Electron, ilkine haber verip kapanır —
                // bkz. app\desktop\main.cjs 'second-instance'). AllowSetForegroundWindow: Windows öne gelmeyi
                // engelleyip sadece görev çubuğunu yakıp söndürmesin.
                AllowSetForegroundWindow(-1);
                string exe = Path.Combine(App, @"node_modules\electron\dist\electron.exe");
                try
                {
                    if (File.Exists(exe)) Process.Start(new ProcessStartInfo(exe, "desktop") { WorkingDirectory = App, UseShellExecute = false });
                    else Process.Start("http://localhost:5173/");
                }
                catch { }
                return;
            }
            else
            {
                try { File.WriteAllText(StatusFile, guncelleme ? "guncelleme" : "update"); } catch { }
                // Ayarlar › Uygulama Ayarları › Güncellemeler "Önce sor": yeni sürüm varsa sor; atlanırsa bu
                // açılışta ARGUS.bat'ın git komutları geçersiz bir GIT_DIR ile çalışıp hiçbir şey çekmez (ARGUS.bat
                // :check_node'da GIT_DIR'i temizler, uygulama içindeki "Şimdi Güncelle" etkilenmez).
                bool atla = false;
                if (!guncelleme && GuncellemeTercihi() == "sor")
                {
                    if (arkaPlan) atla = true; // bilgisayar açılırken soru penceresi çıkmasın
                    else if (YeniSurumVar())
                    {
                        var soru = new Soru();
                        Application.Run(soru);
                        atla = !soru.Guncelle;
                    }
                }
                var psi = new ProcessStartInfo("cmd.exe", "/c \"\"" + Path.Combine(Root, "ARGUS.bat") + "\"\"");
                psi.WorkingDirectory = Root;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.EnvironmentVariables["ARGUS_STATUS_FILE"] = StatusFile;
                if (guncelleme) psi.EnvironmentVariables["ARGUS_NO_BROWSER"] = "1";
                if (arkaPlan) psi.EnvironmentVariables["ARGUS_ARKA_PLAN"] = "1";
                if (atla) psi.EnvironmentVariables["GIT_DIR"] = Path.Combine(Root, ".guncelleme-atlandi");
                try { Process.Start(psi); }
                catch (Exception e) { MessageBox.Show(Program.T("ARGUS başlatılamadı: ") + e.Message, "ARGUS"); return; }
            }
            if (arkaPlan) return;
            Application.Run(new Splash(guncelleme, zatenAcik));
        }
    }

    // %APPDATA%\ARGUS\ayarlar.json'daki "guncelleme" ('otomatik' | 'sor'), bkz. app\desktop\main.cjs
    static string GuncellemeTercihi()
    {
        try
        {
            string f = Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ARGUS"), "ayarlar.json");
            var m = Regex.Match(File.ReadAllText(f), "\"guncelleme\"\\s*:\\s*\"(\\w+)\"");
            return m.Success ? m.Groups[1].Value : "otomatik";
        }
        catch { return "otomatik"; }
    }

    static string Git(string args, int ms)
    {
        try
        {
            var p = new ProcessStartInfo("git", args) { WorkingDirectory = Root, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            using (var pr = Process.Start(p))
            {
                string o = pr.StandardOutput.ReadToEnd();
                if (!pr.WaitForExit(ms)) { try { pr.Kill(); } catch { } return null; }
                return pr.ExitCode == 0 ? o : null;
            }
        }
        catch { return null; }
    }

    static bool YeniSurumVar()
    {
        if (!Directory.Exists(Path.Combine(Root, ".git"))) return false;
        if (Git("fetch --quiet origin", 20000) == null) return false;
        string n = Git("rev-list --count HEAD..@{u}", 5000);
        int k;
        return n != null && int.TryParse(n.Trim(), out k) && k > 0;
    }

    public static bool PortAcik(int ms)
    {
        try
        {
            using (var c = new TcpClient())
            {
                var ar = c.BeginConnect("127.0.0.1", 5173, null, null);
                bool ok = ar.AsyncWaitHandle.WaitOne(ms) && c.Connected;
                return ok;
            }
        }
        catch { return false; }
    }

    // Klasör düzeni: kullanıcı sadece ARGUS.exe'yi (ve kendi dosyalarını) görsün. ARGUS.bat silinemiyor
    // (eski sürümler güncellemeyi onun üzerinden alıyor) — gizleniyor. Masaüstü kısayolu bu programa döner.
    static void Duzenle()
    {
        foreach (var name in new[] { "ARGUS.bat", "README.md", ".gitignore", ".gelistirici" })
        {
            string p = Path.Combine(Root, name);
            if (File.Exists(p))
            {
                var a = File.GetAttributes(p);
                if ((a & FileAttributes.Hidden) == 0) File.SetAttributes(p, a | FileAttributes.Hidden);
            }
        }
        string lnk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "ARGUS.lnk");
        if (!File.Exists(lnk)) return;
        Type t = Type.GetTypeFromProgID("WScript.Shell");
        object sh = Activator.CreateInstance(t);
        object s = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, sh, new object[] { lnk });
        Type st = s.GetType();
        string target = (string)st.InvokeMember("TargetPath", BindingFlags.GetProperty, null, s, null) ?? "";
        string argsNow = (string)st.InvokeMember("Arguments", BindingFlags.GetProperty, null, s, null) ?? "";
        string me = Application.ExecutablePath;
        bool bizim = target.Equals(Path.Combine(Root, "ARGUS.bat"), StringComparison.OrdinalIgnoreCase)
            || (target.EndsWith("powershell.exe", StringComparison.OrdinalIgnoreCase) && argsNow.IndexOf(Path.Combine(App, "launcher"), StringComparison.OrdinalIgnoreCase) >= 0);
        if (!bizim || target.Equals(me, StringComparison.OrdinalIgnoreCase)) return;
        st.InvokeMember("TargetPath", BindingFlags.SetProperty, null, s, new object[] { me });
        st.InvokeMember("Arguments", BindingFlags.SetProperty, null, s, new object[] { "" });
        st.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, s, new object[] { Root });
        st.InvokeMember("IconLocation", BindingFlags.SetProperty, null, s, new object[] { me + ",0" });
        st.InvokeMember("WindowStyle", BindingFlags.SetProperty, null, s, new object[] { 1 });
        st.InvokeMember("Save", BindingFlags.InvokeMethod, null, s, null);
    }

    // Arayüz dili: ARGUS'un data\ui-prefs.json'undaki argus_lang (kullanıcı "argus u komple ingilizce yap" dedi)
    static bool? en;
    public static string T(string tr)
    {
        if (en == null)
        {
            try
            {
                string f = Path.Combine(Path.Combine(Root, "data"), "ui-prefs.json");
                en = File.Exists(f) && File.ReadAllText(f).Replace(" ", "").Contains("\"argus_lang\":\"en\"");
            }
            catch { en = false; }
        }
        if (en != true) return tr;
        switch (tr)
        {
            case "Güncellemeler kontrol ediliyor…": return "Checking for updates…";
            case "ARGUS güncelleniyor…": return "Updating ARGUS…";
            case "Gerekli dosyalar kontrol ediliyor…": return "Checking required files…";
            case "İlk kurulum: gerekli dosyalar indiriliyor, birkaç dakika sürebilir…": return "First setup: downloading required files, this may take a few minutes…";
            case "Uygulama motoru indiriliyor (bir kereye mahsus, ~100 MB)…": return "Downloading the app engine (one time only, ~100 MB)…";
            case "ARGUS başlatılıyor…": return "Starting ARGUS…";
            case "Arayüz hazırlanıyor…": return "Preparing the interface…";
            case "Neredeyse hazır…": return "Almost ready…";
            case "ARGUS zaten açık, öne getiriliyor…": return "ARGUS is already open, bringing it to the front…";
            case "Güncellendi, ARGUS açılıyor…": return "Updated, opening ARGUS…";
            case "Hazır! ARGUS açılıyor…": return "Ready! Opening ARGUS…";
            case "Beklenenden uzun sürüyor, biraz daha bekle…": return "This is taking longer than expected, please wait a bit more…";
            case "Güncelle": return "Update";
            case "Şimdilik atla": return "Skip for now";
            case "ARGUS'un yeni bir sürümü var": return "A new version of ARGUS is available";
            case "Şimdi güncelleyebilir ya da bu sefer atlayabilirsin. Yenilikleri Yama Notları'nda görürsün.": return "You can update now or skip it this time. You'll find what's new in Patch Notes.";
            case "ARGUS başlatılamadı: ": return "Couldn't start ARGUS: ";
            default: return tr;
        }
    }

    public static string Metin(string code)
    {
        switch (code)
        {
            case "update": return T("Güncellemeler kontrol ediliyor…");
            case "guncelleme": return T("ARGUS güncelleniyor…");
            case "modules": return T("Gerekli dosyalar kontrol ediliyor…");
            case "install": return T("İlk kurulum: gerekli dosyalar indiriliyor, birkaç dakika sürebilir…");
            case "motor": return T("Uygulama motoru indiriliyor (bir kereye mahsus, ~100 MB)…");
            case "start": return T("ARGUS başlatılıyor…");
            case "build": return T("Arayüz hazırlanıyor…");
            case "server": return T("Neredeyse hazır…");
            default: return null;
        }
    }
}

class Splash : Form
{
    const int W = 440, H = 290;
    readonly Stopwatch clock = Stopwatch.StartNew();
    readonly System.Windows.Forms.Timer anim = new System.Windows.Forms.Timer();
    readonly bool guncelleme;
    Image logo;
    string status, version = "";
    volatile bool ready, gorunur;
    long readyAt = -1;
    Thread watcher;
    // Ekstralar (v1.23.4, ARGUS'ta Ayarlar › Ekstralar › Açılış): logo çizimi + afiş duvarı, bugünün haberi, mevsim.
    // Ayarlar data\ui-prefs.json'dan, afiş/haber listesi data\splash-info.txt'den (ARGUS'un kendisi yazar) okunur.
    bool ciz, bilgi;
    string mevsim;
    Bitmap duvar;
    readonly List<string[]> haberler = new List<string[]>();
    readonly List<Image> haberAfis = new List<Image>();
    float[] px, py, pr, pv, pt;

    public Splash(bool guncelleme, bool zatenAcik)
    {
        this.guncelleme = guncelleme;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(W, H);
        BackColor = Color.FromArgb(11, 11, 14);
        ShowInTaskbar = true;
        TopMost = true;
        Text = "ARGUS";
        DoubleBuffered = true;
        Opacity = 0;
        KeyPreview = true;
        string ico = Path.Combine(Program.App, @"public\argus.ico");
        try { if (File.Exists(ico)) Icon = new Icon(ico); } catch { }
        try { logo = Image.FromFile(Path.Combine(Program.App, @"public\logoblue.png")); } catch { }
        try
        {
            var m = Regex.Match(File.ReadAllText(Path.Combine(Program.App, @"src\lib\version.ts")), "APP_VERSION\\s*=\\s*'([^']+)'");
            if (m.Success) version = m.Groups[1].Value;
        }
        catch { }
        status = zatenAcik ? Program.T("ARGUS zaten açık, öne getiriliyor…") : Program.Metin(guncelleme ? "guncelleme" : "update");
        try { Ekstralar(); } catch { }
        if (zatenAcik) { ready = true; readyAt = 0; }

        var path = new GraphicsPath();
        int r = 26;
        path.AddArc(0, 0, r, r, 180, 90);
        path.AddArc(W - r, 0, r, r, 270, 90);
        path.AddArc(W - r, H - r, r, r, 0, 90);
        path.AddArc(0, H - r, r, r, 90, 90);
        path.CloseFigure();
        Region = new Region(path);

        KeyDown += (s, e) => { if (e.KeyCode == Keys.Escape) Close(); };
        anim.Interval = 15;
        anim.Tick += (s, e) => Tick();
        Shown += (s, e) =>
        {
            WindowState = FormWindowState.Normal;
            Activate();
            anim.Start();
            if (!zatenAcik)
            {
                watcher = new Thread(Watch) { IsBackground = true };
                watcher.Start();
            }
        };
    }

    static bool Tercih(string prefs, string key)
    {
        return Regex.IsMatch(prefs, "\"" + key + "\"\\s*:\\s*\"1\"");
    }

    void Ekstralar()
    {
        string prefsFile = Path.Combine(Program.Root, @"data\ui-prefs.json");
        if (!File.Exists(prefsFile)) return;
        string prefs = File.ReadAllText(prefsFile);
        ciz = Tercih(prefs, "argus_splash_ciz");
        bilgi = Tercih(prefs, "argus_splash_bilgi");
        if (Tercih(prefs, "argus_mevsim"))
        {
            var d = DateTime.Now;
            if ((d.Month == 12 && d.Day >= 28) || (d.Month == 1 && d.Day <= 3)) mevsim = "yilbasi";
            else if (d.Month == 10 && d.Day >= 25) mevsim = "cadilar";
            else if (d.Month == 12 || d.Month == 1 || (d.Month == 2 && d.Day <= 15)) mevsim = "kis";
        }
        var rnd = new Random();
        if (mevsim != null)
        {
            int n = mevsim == "cadilar" ? 9 : mevsim == "yilbasi" ? 40 : 70;
            px = new float[n]; py = new float[n]; pr = new float[n]; pv = new float[n]; pt = new float[n];
            for (int i = 0; i < n; i++)
            {
                px[i] = (float)(rnd.NextDouble() * W); py[i] = (float)(rnd.NextDouble() * H);
                pr[i] = 1 + (float)(rnd.NextDouble() * 2.2); pv[i] = 0.3f + (float)(rnd.NextDouble() * 0.9); pt[i] = (float)(rnd.NextDouble() * 6.28);
            }
        }
        string infoFile = Path.Combine(Program.Root, @"data\splash-info.txt");
        if ((!ciz && !bilgi) || !File.Exists(infoFile)) return;
        var afisler = new List<Image>();
        foreach (string line in File.ReadAllLines(infoFile))
        {
            string[] p = line.Split('\t');
            if (p.Length >= 2 && p[0] == "P" && ciz && afisler.Count < 24)
            {
                Image im = Resim(p[1]);
                if (im != null) afisler.Add(im);
            }
            else if (p.Length >= 3 && p[0] == "L" && bilgi && haberler.Count < 6)
            {
                haberler.Add(new[] { p[1], p[2] });
                haberAfis.Add(p.Length >= 4 ? Resim(p[3]) : null);
            }
        }
        if (afisler.Count >= 4)
        {
            // Afiş duvarı: 8 sütun, iki kat boy (yukarı kayarken döngü), çok soluk
            int cw = W / 8, chh = cw * 3 / 2, rows = (H * 2) / chh + 2;
            duvar = new Bitmap(W, rows * chh);
            using (var g = Graphics.FromImage(duvar))
            {
                g.Clear(Color.Transparent);
                var cm = new System.Drawing.Imaging.ColorMatrix { Matrix33 = 0.16f };
                var ia = new System.Drawing.Imaging.ImageAttributes();
                ia.SetColorMatrix(cm);
                int k = 0;
                for (int r = 0; r < rows; r++)
                    for (int c = 0; c < 8; c++)
                    {
                        Image im = afisler[k++ % afisler.Count];
                        g.DrawImage(im, new Rectangle(c * cw + 2, r * chh + 2, cw - 4, chh - 4), 0, 0, im.Width, im.Height, GraphicsUnit.Pixel, ia);
                    }
            }
        }
    }

    static Image Resim(string webPath)
    {
        if (string.IsNullOrEmpty(webPath) || !webPath.StartsWith("/medya/")) return null;
        string f = Path.Combine(Program.Root, "medya", webPath.Substring(7).Replace('/', '\\'));
        try
        {
            if (!File.Exists(f)) return null;
            using (var src = Image.FromFile(f))
            {
                int w = 120, h = Math.Max(1, src.Height * 120 / Math.Max(1, src.Width));
                return new Bitmap(src, w, h);
            }
        }
        catch { return null; }
    }

    // Arka planda: durum dosyası ve arayüzün hazır olup olmadığı (pencere hiç beklemez)
    void Watch()
    {
        var started = DateTime.Now;
        while (!IsDisposed && !ready)
        {
            try
            {
                if (File.Exists(Program.StatusFile))
                {
                    string code = File.ReadAllText(Program.StatusFile).Trim();
                    if (code == "gorunur") { gorunur = true; return; }
                    string t = Program.Metin(code);
                    if (t != null) status = t;
                }
            }
            catch { }
            if (Program.PortAcik(250))
            {
                status = guncelleme ? Program.T("Güncellendi, ARGUS açılıyor…") : Program.T("Hazır! ARGUS açılıyor…");
                ready = true;
                return;
            }
            double mins = (DateTime.Now - started).TotalMinutes;
            if (mins > 15) { gorunur = true; return; }
            if (mins > 3 && status == Program.Metin("modules")) status = Program.T("Beklenenden uzun sürüyor, biraz daha bekle…");
            Thread.Sleep(300);
        }
    }

    void Tick()
    {
        long ms = clock.ElapsedMilliseconds;
        if (Opacity < 1) Opacity = Math.Min(1.0, ms / 250.0);
        if (gorunur) { Close(); return; }
        if (ready && readyAt < 0) readyAt = ms;
        if (readyAt >= 0 && ms - readyAt > 1200) { Close(); return; }
        if (px != null)
            for (int i = 0; i < px.Length; i++)
            {
                pt[i] += 0.02f;
                if (mevsim == "kis") { py[i] += pv[i]; px[i] += (float)Math.Sin(pt[i]) * 0.4f; }
                else if (mevsim == "cadilar") { px[i] += pv[i] * 1.2f; py[i] += (float)Math.Sin(pt[i] * 2) * 0.7f; }
                if (py[i] > H + 5) py[i] = -5;
                if (px[i] > W + 20) px[i] = -20;
            }
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        // Ekstralar çiziminde bir sorun olsa bile açılış penceresi çökmesin
        try { Ciz(e.Graphics); }
        catch { ciz = false; duvar = null; px = null; haberler.Clear(); }
    }

    void Ciz(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        long ms0 = clock.ElapsedMilliseconds;
        if (duvar != null)
        {
            int off = (int)((ms0 / 45) % (duvar.Height / 2));
            g.DrawImage(duvar, 0, -off);
        }
        // hafif ışıma (mevsimde mevsimin renginde)
        using (var glow = new GraphicsPath())
        {
            glow.AddEllipse(-120, -170, W + 240, 380);
            using (var pb = new PathGradientBrush(glow))
            {
                pb.CenterColor = mevsim == "cadilar" ? Color.FromArgb(80, 249, 115, 22) : mevsim == "yilbasi" ? Color.FromArgb(60, 250, 204, 21) : Color.FromArgb(70, 0, 110, 200);
                pb.SurroundColors = new[] { Color.FromArgb(0, 0, 0, 0) };
                g.FillPath(pb, glow);
            }
        }
        if (logo != null && ciz)
        {
            // Logo aşağıdan yukarı "çizilerek" gelir, önünde parlak bir çizgi; sonra hafif parlar
            float p0 = Math.Min(1f, ms0 / 1400f);
            int lh = (int)(84 * p0);
            var old = g.Clip;
            g.SetClip(new Rectangle((W - 84) / 2 - 4, 40 + 84 - lh, 92, lh));
            g.DrawImage(logo, (W - 84) / 2, 40, 84, 84);
            g.Clip = old;
            if (p0 < 1)
                using (var pen = new Pen(Color.FromArgb(220, 0, 192, 250), 2))
                    g.DrawLine(pen, (W - 84) / 2 - 6, 40 + 84 - lh, (W + 84) / 2 + 6, 40 + 84 - lh);
            else
            {
                int a = (int)(60 + 50 * Math.Sin(ms0 / 300.0));
                using (var gp = new GraphicsPath())
                {
                    gp.AddEllipse((W - 150) / 2, 20, 150, 124);
                    using (var pb2 = new PathGradientBrush(gp) { CenterColor = Color.FromArgb(Math.Max(0, a), 0, 192, 250), SurroundColors = new[] { Color.FromArgb(0, 0, 0, 0) } })
                        g.FillPath(pb2, gp);
                }
                g.DrawImage(logo, (W - 84) / 2, 40, 84, 84);
            }
        }
        else if (logo != null) g.DrawImage(logo, (W - 84) / 2, 40, 84, 84);
        var center = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        using (var f = new Font("Segoe UI", 22, FontStyle.Bold))
            g.DrawString("ARGUS", f, Brushes.White, new RectangleF(0, 134, W, 44), center);
        using (var f = new Font("Segoe UI", 10))
        using (var b = new SolidBrush(Color.FromArgb(165, 165, 175)))
            g.DrawString(status ?? "", f, b, new RectangleF(20, haberler.Count > 0 ? 172 : 182, W - 40, haberler.Count > 0 ? 26 : 42), center);
        if (haberler.Count > 0)
        {
            // Bugünün haberi: 2,6 saniyede bir sıradaki
            int hi = (int)((ms0 / 2600) % haberler.Count);
            float fade = Math.Min(1f, (ms0 % 2600) / 350f);
            int aa = (int)(255 * fade);
            var box = new Rectangle(28, 200, W - 56, 34);
            using (var bg = new SolidBrush(Color.FromArgb((int)(18 * fade), 255, 255, 255)))
                g.FillRectangle(bg, box);
            int tx0 = box.X + 10;
            Image ha = haberAfis[hi];
            if (ha != null) { g.DrawImage(ha, box.X + 6, box.Y + 3, 19, 28); tx0 = box.X + 32; }
            var left = new StringFormat { Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Near, Trimming = StringTrimming.EllipsisCharacter, FormatFlags = StringFormatFlags.NoWrap };
            using (var f1 = new Font("Segoe UI", 8, FontStyle.Bold))
            using (var b1 = new SolidBrush(Color.FromArgb(aa, 127, 220, 255)))
                g.DrawString(haberler[hi][0], f1, b1, new RectangleF(tx0, box.Y + 2, box.Right - tx0 - 6, 15), left);
            using (var f2 = new Font("Segoe UI", 8.5f))
            using (var b2 = new SolidBrush(Color.FromArgb(aa, 230, 230, 236)))
                g.DrawString(haberler[hi][1], f2, b2, new RectangleF(tx0, box.Y + 16, box.Right - tx0 - 6, 16), left);
        }
        // çubuk: zamana göre (kare atlasa bile hız sabit), iki ucu yumuşak
        int tw = 240, bw = 80, tx = (W - tw) / 2, ty = haberler.Count > 0 ? 246 : 236;
        using (var track = new SolidBrush(Color.FromArgb(38, 38, 44)))
            g.FillRectangle(track, tx, ty, tw, 3);
        double p = (clock.ElapsedMilliseconds % 1400) / 1400.0;
        double eased = p < 0.5 ? 2 * p * p : 1 - Math.Pow(-2 * p + 2, 2) / 2;
        float bx = (float)(tx - bw + eased * (tw + bw));
        var clip = g.Clip;
        g.SetClip(new Rectangle(tx, ty, tw, 3));
        using (var lg = new LinearGradientBrush(new RectangleF(bx, ty, bw, 3), Color.FromArgb(0, 0, 192, 250), Color.FromArgb(0, 0, 192, 250), 0f))
        {
            var blend = new ColorBlend
            {
                Colors = new[] { Color.FromArgb(0, 0, 192, 250), Color.FromArgb(255, 0, 192, 250), Color.FromArgb(0, 0, 192, 250) },
                Positions = new[] { 0f, 0.5f, 1f },
            };
            lg.InterpolationColors = blend;
            g.FillRectangle(lg, bx, ty, bw, 3);
        }
        g.Clip = clip;
        using (var f = new Font("Segoe UI", 8))
        using (var b = new SolidBrush(Color.FromArgb(90, 90, 100)))
            g.DrawString(version, f, b, new RectangleF(0, haberler.Count > 0 ? 262 : 256, W, 18), center);
        if (px != null)
            for (int i = 0; i < px.Length; i++)
            {
                if (mevsim == "kis")
                    using (var sb = new SolidBrush(Color.FromArgb(205, 255, 255, 255))) g.FillEllipse(sb, px[i], py[i], pr[i] * 2, pr[i] * 2);
                else if (mevsim == "cadilar")
                {
                    float s = pr[i] * 3, fl = (float)Math.Sin(pt[i] * 8) * s * 0.6f;
                    using (var gp = new GraphicsPath())
                    {
                        gp.AddBezier(px[i], py[i], px[i] - s * 1.5f, py[i] - fl, px[i] - s * 2.5f, py[i] - fl, px[i] - s * 3, py[i]);
                        gp.AddBezier(px[i] - s * 3, py[i], px[i] - s * 1.5f, py[i] + s * 0.4f, px[i] + s * 1.5f, py[i] + s * 0.4f, px[i] + s * 3, py[i]);
                        gp.AddBezier(px[i] + s * 3, py[i], px[i] + s * 2.5f, py[i] - fl, px[i] + s * 1.5f, py[i] - fl, px[i], py[i]);
                        using (var sb = new SolidBrush(Color.FromArgb(230, 12, 6, 3))) g.FillPath(sb, gp);
                    }
                }
                else
                {
                    int a2 = (int)(255 * (Math.Sin(pt[i] * 3) + 1) / 2);
                    using (var sb = new SolidBrush(Color.FromArgb(a2, 253, 224, 71)))
                    {
                        var pts = new PointF[10];
                        for (int k = 0; k < 10; k++)
                        {
                            double an = k * Math.PI / 5 - Math.PI / 2;
                            float rr = k % 2 == 0 ? pr[i] * 2.6f : pr[i];
                            pts[k] = new PointF(px[i] + (float)Math.Cos(an) * rr, py[i] + (float)Math.Sin(an) * rr);
                        }
                        g.FillPolygon(sb, pts);
                    }
                }
            }
        using (var pen = new Pen(Color.FromArgb(40, 255, 255, 255)))
            g.DrawRectangle(pen, 0, 0, W - 1, H - 1);
    }
}


// Başlat menüsünde "ARGUS" kısayolu, ARGUS kimliğiyle (AppUserModelID = "ARGUS"). Kullanıcı "görev çubuğuna
// sabitle deyince uygulamayı değil Electron'u sabitliyor" dedi: Windows, sabitlenen pencerenin kimliğiyle (ARGUS
// penceresi de "ARGUS" kimliğini taşıyor, bkz. app\desktop\main.cjs) eşleşen Başlat menüsü kısayolunu sabitliyor —
// adı, simgesi ve tıklanınca açılan program (ARGUS.exe) buradan geliyor. Ayrıca ARGUS Başlat menüsünde aranabiliyor.
static class BaslatMenusu
{
    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    class CShellLink { }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
    interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cch, IntPtr pfd, uint fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cch);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cch);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cch);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cch, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
        void Resolve(IntPtr hwnd, uint fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    struct PropertyKey { public Guid fmtid; public uint pid; }

    [StructLayout(LayoutKind.Explicit)]
    struct PropVariant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    interface IPropertyStore
    {
        void GetCount(out uint cProps);
        void GetAt(uint iProp, out PropertyKey pkey);
        void GetValue(ref PropertyKey key, out PropVariant pv);
        void SetValue(ref PropertyKey key, ref PropVariant pv);
        void Commit();
    }

    public static void Hazirla(string root)
    {
        string exe = Path.Combine(root, "ARGUS.exe");
        string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "");
        string lnk = Path.Combine(dir, "ARGUS.lnk");
        // Zaten doğru hedefi gösteren bir kısayol varsa dokunma
        if (File.Exists(lnk))
        {
            var mevcut = (IShellLinkW)new CShellLink();
            ((IPersistFile)mevcut).Load(lnk, 0);
            var sb = new StringBuilder(520);
            mevcut.GetPath(sb, sb.Capacity, IntPtr.Zero, 0);
            if (string.Equals(sb.ToString(), exe, StringComparison.OrdinalIgnoreCase)) return;
        }
        var link = (IShellLinkW)new CShellLink();
        link.SetPath(exe);
        link.SetWorkingDirectory(root);
        link.SetIconLocation(exe, 0);
        link.SetDescription("ARGUS");
        var store = (IPropertyStore)link;
        var key = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 }; // System.AppUserModel.ID
        var pv = new PropVariant { vt = 31, p = Marshal.StringToCoTaskMemUni("ARGUS") }; // VT_LPWSTR
        try
        {
            store.SetValue(ref key, ref pv);
            store.Commit();
        }
        finally { Marshal.FreeCoTaskMem(pv.p); }
        ((IPersistFile)link).Save(lnk, true);
    }
}

// "Önce sor" seçiliyken yeni sürüm varsa açılışta çıkan küçük soru penceresi (açılış penceresiyle aynı görünüm)
class Soru : Form
{
    public bool Guncelle;
    const int W = 440, H = 250;
    Image logo;

    public Soru()
    {
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(W, H);
        BackColor = Color.FromArgb(11, 11, 14);
        ShowInTaskbar = true;
        TopMost = true;
        Text = "ARGUS";
        DoubleBuffered = true;
        KeyPreview = true;
        try { Icon = new Icon(Path.Combine(Program.App, @"public\argus.ico")); } catch { }
        try { logo = Image.FromFile(Path.Combine(Program.App, @"public\logoblue.png")); } catch { }
        var path = new GraphicsPath();
        int r = 26;
        path.AddArc(0, 0, r, r, 180, 90);
        path.AddArc(W - r, 0, r, r, 270, 90);
        path.AddArc(W - r, H - r, r, r, 0, 90);
        path.AddArc(0, H - r, r, r, 90, 90);
        path.CloseFigure();
        Region = new Region(path);
        var guncelle = Dugme(Program.T("Güncelle"), true, new Rectangle(W / 2 + 6, 176, 150, 38));
        guncelle.Click += (s, e) => { Guncelle = true; Close(); };
        var atla = Dugme(Program.T("Şimdilik atla"), false, new Rectangle(W / 2 - 156, 176, 150, 38));
        atla.Click += (s, e) => { Guncelle = false; Close(); };
        Controls.Add(guncelle);
        Controls.Add(atla);
        AcceptButton = guncelle;
        KeyDown += (s, e) => { if (e.KeyCode == Keys.Escape) { Guncelle = false; Close(); } };
        Shown += (s, e) => { WindowState = FormWindowState.Normal; Activate(); guncelle.Focus(); };
    }

    static Button Dugme(string text, bool accent, Rectangle b)
    {
        var btn = new Button { Text = text, Bounds = b, FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, Font = new Font("Segoe UI", 10, FontStyle.Bold) };
        btn.FlatAppearance.BorderSize = 1;
        if (accent)
        {
            btn.BackColor = Color.FromArgb(0, 128, 230);
            btn.ForeColor = Color.White;
            btn.FlatAppearance.BorderColor = Color.FromArgb(0, 192, 250);
            btn.FlatAppearance.MouseOverBackColor = Color.FromArgb(0, 150, 245);
        }
        else
        {
            btn.BackColor = Color.FromArgb(24, 24, 28);
            btn.ForeColor = Color.FromArgb(210, 210, 215);
            btn.FlatAppearance.BorderColor = Color.FromArgb(60, 60, 68);
            btn.FlatAppearance.MouseOverBackColor = Color.FromArgb(38, 38, 44);
        }
        return btn;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        using (var glow = new GraphicsPath())
        {
            glow.AddEllipse(-120, -170, W + 240, 340);
            using (var pb = new PathGradientBrush(glow))
            {
                pb.CenterColor = Color.FromArgb(70, 0, 110, 200);
                pb.SurroundColors = new[] { Color.FromArgb(0, 0, 0, 0) };
                g.FillPath(pb, glow);
            }
        }
        if (logo != null) g.DrawImage(logo, (W - 60) / 2, 28, 60, 60);
        var center = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        using (var f = new Font("Segoe UI", 14, FontStyle.Bold))
            g.DrawString(Program.T("ARGUS'un yeni bir sürümü var"), f, Brushes.White, new RectangleF(0, 100, W, 30), center);
        using (var f = new Font("Segoe UI", 9.5f))
        using (var b = new SolidBrush(Color.FromArgb(165, 165, 175)))
            g.DrawString(Program.T("Şimdi güncelleyebilir ya da bu sefer atlayabilirsin. Yenilikleri Yama Notları'nda görürsün."), f, b, new RectangleF(30, 128, W - 60, 40), center);
        using (var pen = new Pen(Color.FromArgb(40, 255, 255, 255)))
            g.DrawRectangle(pen, 0, 0, W - 1, H - 1);
    }
}
