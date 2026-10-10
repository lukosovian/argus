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
