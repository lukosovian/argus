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
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    public static string Root, App, StatusFile;

    [STAThread]
    static void Main(string[] args)
    {
        bool guncelleme = Array.IndexOf(args, "--guncelleme") >= 0;
        bool created;
        using (var mutex = new Mutex(true, "ARGUS_Baslatici", out created))
        {
            if (!created) return; // iki kez hızlıca tıklandıysa ikinci açılış bir şey yapmasın

            Root = Path.GetDirectoryName(Application.ExecutablePath);
            App = Path.Combine(Root, "app");
            StatusFile = Path.Combine(Path.GetTempPath(), "argus-durum.txt");
            try { Duzenle(); } catch { }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool zatenAcik = !guncelleme && PortAcik(150);
            if (zatenAcik)
            {
                string exe = Path.Combine(App, @"node_modules\electron\dist\electron.exe");
                try
                {
                    if (File.Exists(exe)) Process.Start(new ProcessStartInfo(exe, "desktop") { WorkingDirectory = App, UseShellExecute = false });
                    else Process.Start("http://localhost:5173/");
                }
                catch { }
            }
            else
            {
                try { File.WriteAllText(StatusFile, guncelleme ? "guncelleme" : "update"); } catch { }
                var psi = new ProcessStartInfo("cmd.exe", "/c \"\"" + Path.Combine(Root, "ARGUS.bat") + "\"\"");
                psi.WorkingDirectory = Root;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.EnvironmentVariables["ARGUS_STATUS_FILE"] = StatusFile;
                if (guncelleme) psi.EnvironmentVariables["ARGUS_NO_BROWSER"] = "1";
                try { Process.Start(psi); }
                catch (Exception e) { MessageBox.Show("ARGUS başlatılamadı: " + e.Message, "ARGUS"); return; }
            }
            Application.Run(new Splash(guncelleme, zatenAcik));
        }
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

    public static string Metin(string code)
    {
        switch (code)
        {
            case "update": return "Güncellemeler kontrol ediliyor…";
            case "guncelleme": return "ARGUS güncelleniyor…";
            case "modules": return "Gerekli dosyalar kontrol ediliyor…";
            case "install": return "İlk kurulum: gerekli dosyalar indiriliyor, birkaç dakika sürebilir…";
            case "motor": return "Uygulama motoru indiriliyor (bir kereye mahsus, ~100 MB)…";
            case "start": return "ARGUS başlatılıyor…";
            case "build": return "Arayüz hazırlanıyor…";
            case "server": return "Neredeyse hazır…";
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
        status = zatenAcik ? "ARGUS zaten açık, öne getiriliyor…" : Program.Metin(guncelleme ? "guncelleme" : "update");
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
                status = guncelleme ? "Güncellendi, ARGUS açılıyor…" : "Hazır! ARGUS açılıyor…";
                ready = true;
                return;
            }
            double mins = (DateTime.Now - started).TotalMinutes;
            if (mins > 15) { gorunur = true; return; }
            if (mins > 3 && status == Program.Metin("modules")) status = "Beklenenden uzun sürüyor, biraz daha bekle…";
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
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        // hafif mavi ışıma
        using (var glow = new GraphicsPath())
        {
            glow.AddEllipse(-120, -170, W + 240, 380);
            using (var pb = new PathGradientBrush(glow))
            {
                pb.CenterColor = Color.FromArgb(70, 0, 110, 200);
                pb.SurroundColors = new[] { Color.FromArgb(0, 0, 0, 0) };
                g.FillPath(pb, glow);
            }
        }
        if (logo != null) g.DrawImage(logo, (W - 84) / 2, 40, 84, 84);
        var center = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        using (var f = new Font("Segoe UI", 22, FontStyle.Bold))
            g.DrawString("ARGUS", f, Brushes.White, new RectangleF(0, 134, W, 44), center);
        using (var f = new Font("Segoe UI", 10))
        using (var b = new SolidBrush(Color.FromArgb(165, 165, 175)))
            g.DrawString(status ?? "", f, b, new RectangleF(20, 182, W - 40, 42), center);
        // çubuk: zamana göre (kare atlasa bile hız sabit), iki ucu yumuşak
        int tw = 240, bw = 80, tx = (W - tw) / 2, ty = 236;
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
            g.DrawString(version, f, b, new RectangleF(0, 256, W, 18), center);
        using (var pen = new Pen(Color.FromArgb(40, 255, 255, 255)))
            g.DrawRectangle(pen, 0, 0, W - 1, H - 1);
    }
}

