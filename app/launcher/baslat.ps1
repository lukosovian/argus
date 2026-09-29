# ARGUS başlatıcı + açılış penceresi (splash).
# Kullanıcı "açılışta terminal ekranı yerine logomuzun olduğu bir açılış ekranı görsek" dedi. Masaüstündeki
# ARGUS kısayolu bu dosyayı gizli bir PowerShell ile çalıştırır: ARGUS.bat'ı GÖRÜNMEZ başlatır, kendisi
# logolu küçük bir pencere gösterir. ARGUS.bat (ve start.mjs) o an ne yaptığını ARGUS_STATUS_FILE'a kısa
# bir kod olarak yazar, pencere onu Türkçe gösterir. Arayüz (5173) cevap verince pencere kapanır, tarayıcıyı
# ARGUS.bat açar. Bir sorun çıkarsa (Node.js yok, kurulum hatası) ARGUS.bat "gorunur" yazıp kendini
# görünür bir terminalde yeniden açar ki kullanıcı mesajı okuyabilsin; pencere de kapanır.
#   -Guncelleme : "Şimdi Güncelle" sonrası (bkz. server/restart.js) — tarayıcı sekmesi zaten açık, yenisi açılmaz
#   -Onizleme <png> : sadece pencereyi ekran dışında çizip resmini kaydeder (deneme için)
param([switch]$Guncelleme, [string]$Onizleme = '')

$ErrorActionPreference = 'SilentlyContinue'
$app = Split-Path $PSScriptRoot -Parent
$root = Split-Path $app -Parent
$status = Join-Path $env:TEMP 'argus-durum.txt'

function Test-Arayuz {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $ar = $c.BeginConnect('127.0.0.1', 5173, $null, $null)
    $ok = $ar.AsyncWaitHandle.WaitOne(150) -and $c.Connected
    return $ok
  } catch { return $false } finally { $c.Close() }
}

$zatenAcik = $false
if (-not $Onizleme) {
  # Zaten açıksa ikinci bir ARGUS başlatma — sadece tarayıcıyı aç. Pencere yine kısa bir an görünür
  # ("ARGUS zaten açık…"); kullanıcı tarayıcıyı kapatıp simgeye basınca pencere hiç çıkmayınca
  # "açılış ekranını göremedim" dedi — ARGUS arkada açık kalmıştı.
  if (-not $Guncelleme -and (Test-Arayuz)) {
    # Uygulama olarak açıksa pencereyi öne getir (ikinci açılış hemen kapanıp var olanı öne çıkarır), değilse tarayıcı
    $exe = Join-Path $app 'node_modules\electron\dist\electron.exe'
    if (Test-Path $exe) { Start-Process -FilePath $exe -ArgumentList 'desktop' -WorkingDirectory $app }
    else { Start-Process 'http://localhost:5173/' }
    $zatenAcik = $true
  }
}
if (-not $Onizleme -and -not $zatenAcik) {
  Set-Content -Path $status -Value $(if ($Guncelleme) { 'guncelleme' } else { 'update' }) -Encoding ascii
  $env:ARGUS_STATUS_FILE = $status
  if ($Guncelleme) { $env:ARGUS_NO_BROWSER = '1' }
  Start-Process -FilePath (Join-Path $root 'ARGUS.bat') -WorkingDirectory $root -WindowStyle Hidden
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$texts = @{
  'update'     = 'Güncellemeler kontrol ediliyor…'
  'guncelleme' = 'ARGUS güncelleniyor…'
  'modules'    = 'Gerekli dosyalar kontrol ediliyor…'
  'install'    = 'İlk kurulum: gerekli dosyalar indiriliyor, birkaç dakika sürebilir…'
  'start'      = 'ARGUS başlatılıyor…'
  'build'      = 'Arayüz hazırlanıyor…'
  'server'     = 'Neredeyse hazır…'
  'motor'      = 'Uygulama motoru indiriliyor (bir kereye mahsus, ~100 MB)…'
}

$W = 440; $H = 290
$bg = [System.Drawing.Color]::FromArgb(11, 11, 14)
$accent = [System.Drawing.Color]::FromArgb(0, 192, 250)

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.Size = New-Object System.Drawing.Size($W, $H)
$form.BackColor = $bg
$form.Text = 'ARGUS'
$form.ShowInTaskbar = $true
$form.TopMost = $true
$ico = Join-Path $app 'public\argus.ico'
if (Test-Path $ico) { $form.Icon = New-Object System.Drawing.Icon($ico) }
if ($Onizleme) {
  $form.StartPosition = 'Manual'
  $form.Location = New-Object System.Drawing.Point(-3000, -3000)
} else {
  $form.StartPosition = 'CenterScreen'
  $form.Opacity = 0
}

# Yuvarlak köşeler
$r = 26
$gp = New-Object System.Drawing.Drawing2D.GraphicsPath
$gp.AddArc(0, 0, $r, $r, 180, 90)
$gp.AddArc($W - $r, 0, $r, $r, 270, 90)
$gp.AddArc($W - $r, $H - $r, $r, $r, 0, 90)
$gp.AddArc(0, $H - $r, $r, $r, 90, 90)
$gp.CloseFigure()
$form.Region = New-Object System.Drawing.Region($gp)

# Arka planda hafif mavi ışıma
$form.Add_Paint({
    param($s, $e)
    $g = $e.Graphics
    $g.SmoothingMode = 'AntiAlias'
    $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glow.AddEllipse(-120, -170, $W + 240, 380)
    $pb = New-Object System.Drawing.Drawing2D.PathGradientBrush($glow)
    $pb.CenterColor = [System.Drawing.Color]::FromArgb(70, 0, 110, 200)
    $pb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
    $g.FillPath($pb, $glow)
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(40, 255, 255, 255), 1)
    $g.DrawPath($pen, $gp)
  })

$logo = New-Object System.Windows.Forms.PictureBox
$logo.SizeMode = 'Zoom'
$logo.Size = New-Object System.Drawing.Size(84, 84)
$logo.Location = New-Object System.Drawing.Point([int](($W - 84) / 2), 42)
$logo.BackColor = [System.Drawing.Color]::Transparent
$logoFile = Join-Path $app 'public\logoblue.png'
if (Test-Path $logoFile) { $logo.Image = [System.Drawing.Image]::FromFile($logoFile) }
$form.Controls.Add($logo)

$title = New-Object System.Windows.Forms.Label
$title.Text = 'ARGUS'
$title.Font = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = [System.Drawing.Color]::White
$title.BackColor = [System.Drawing.Color]::Transparent
$title.TextAlign = 'MiddleCenter'
$title.Size = New-Object System.Drawing.Size($W, 44)
$title.Location = New-Object System.Drawing.Point(0, 136)
$form.Controls.Add($title)

$label = New-Object System.Windows.Forms.Label
$label.Text = $texts[$(if ($Guncelleme) { 'guncelleme' } else { 'update' })]
$label.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$label.ForeColor = [System.Drawing.Color]::FromArgb(165, 165, 175)
$label.BackColor = [System.Drawing.Color]::Transparent
$label.TextAlign = 'MiddleCenter'
$label.Size = New-Object System.Drawing.Size(($W - 40), 40)
$label.Location = New-Object System.Drawing.Point(20, 184)
$form.Controls.Add($label)

# Hareketli ince çubuk
$track = New-Object System.Windows.Forms.Panel
$track.Size = New-Object System.Drawing.Size(240, 3)
$track.Location = New-Object System.Drawing.Point([int](($W - 240) / 2), 236)
$track.BackColor = [System.Drawing.Color]::FromArgb(38, 38, 44)
$bar = New-Object System.Windows.Forms.Panel
$bar.Size = New-Object System.Drawing.Size(70, 3)
$bar.BackColor = $accent
$track.Controls.Add($bar)
$form.Controls.Add($track)

# Sürüm (app/src/lib/version.ts)
$ver = ''
$vf = Join-Path $app 'src\lib\version.ts'
if (Test-Path $vf) { $m = [regex]::Match((Get-Content $vf -Raw), "APP_VERSION\s*=\s*'([^']+)'"); if ($m.Success) { $ver = $m.Groups[1].Value } }
$small = New-Object System.Windows.Forms.Label
$small.Text = $ver
$small.Font = New-Object System.Drawing.Font('Segoe UI', 8)
$small.ForeColor = [System.Drawing.Color]::FromArgb(90, 90, 100)
$small.BackColor = [System.Drawing.Color]::Transparent
$small.TextAlign = 'MiddleCenter'
$small.Size = New-Object System.Drawing.Size($W, 18)
$small.Location = New-Object System.Drawing.Point(0, 256)
$form.Controls.Add($small)

# Esc ile kapatılabilir (ARGUS arka planda açılmaya devam eder)
$form.KeyPreview = $true
$form.Add_KeyDown({ param($s, $e) if ($e.KeyCode -eq 'Escape') { $form.Close() } })

$script:tick = 0
$script:readyAt = -1
$script:started = Get-Date
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 30
$timer.Add_Tick({
    $script:tick++
    # açılışta yumuşak belirme
    if ($form.Opacity -lt 1) { $form.Opacity = [Math]::Min(1.0, $form.Opacity + 0.08) }
    # çubuk soldan sağa kayar
    $x = (($script:tick * 4) % (240 + 70)) - 70
    $bar.Left = $x
    if ($script:tick % 10 -ne 0) { return }
    if ($script:readyAt -ge 0) {
      if ($script:tick - $script:readyAt -ge 40) { $form.Close() }
      return
    }
    if (Test-Path $status) {
      $code = (Get-Content $status -Raw).Trim()
      if ($code -eq 'gorunur') { $form.Close(); return }
      if ($texts.ContainsKey($code)) { $label.Text = $texts[$code] }
    }
    if (Test-Arayuz) {
      $label.Text = $(if ($Guncelleme) { 'Güncellendi, ARGUS açılıyor…' } else { 'Hazır! ARGUS açılıyor…' })
      $script:readyAt = $script:tick
      return
    }
    $mins = ((Get-Date) - $script:started).TotalMinutes
    if ($mins -gt 15) { $form.Close() }
    elseif ($mins -gt 3 -and $code -ne 'install') { $label.Text = 'Beklenenden uzun sürüyor, biraz daha bekle…' }
  })

if ($Onizleme) {
  $form.Add_Shown({
      $form.Refresh()
      Start-Sleep -Milliseconds 300
      $bmp = New-Object System.Drawing.Bitmap($W, $H)
      $form.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $W, $H)))
      $bmp.Save($Onizleme, [System.Drawing.Imaging.ImageFormat]::Png)
      $form.Close()
    })
} else {
  # Masaüstü kısayolu "simge durumunda" çalıştırıyor (konsol hiç görünmesin diye) ve Windows bu ayarı
  # programın açtığı İLK pencereye de uyguluyor — kullanıcı "açılış ekranı altta açılıyor, ekrana
  # gelmiyor" dedi. Pencere gösterilir gösterilmez normal boyuta getirilip öne alınıyor.
  Add-Type -Namespace ArgusWin -Name Api -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
'@
  $form.Add_Shown({
      [ArgusWin.Api]::ShowWindow($form.Handle, 9) | Out-Null # SW_RESTORE
      $form.WindowState = 'Normal'
      $form.TopMost = $true
      $form.Activate()
      [ArgusWin.Api]::SetForegroundWindow($form.Handle) | Out-Null
    })
  if ($zatenAcik) {
    $label.Text = 'ARGUS zaten açık, öne getiriliyor…'
    $script:readyAt = 0
  }
  $timer.Start()
}
[void]$form.ShowDialog()
$timer.Stop()
