# Masaüstündeki ARGUS kısayolunu açılış pencereli başlatıcıya (baslat.ps1) yönlendirir.
# Eski kısayollar doğrudan ARGUS.bat'ı açıyordu (siyah terminal penceresi). ARGUS.bat görünür çalıştığında
# bunu çağırır: kısayol hâlâ ARGUS.bat'ı gösteriyorsa yeni haline çevrilir, bir sonraki açılış pencereyle olur.
#   -Olustur : kısayol yoksa da oluştur (ARGUS Kur.bat ilk kurulumda kullanır)
param([switch]$Olustur)

$ErrorActionPreference = 'SilentlyContinue'
$app = Split-Path $PSScriptRoot -Parent
$root = Split-Path $app -Parent
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ARGUS.lnk'
$sh = New-Object -ComObject WScript.Shell

if (Test-Path $lnk) {
  $s = $sh.CreateShortcut($lnk)
  # Sadece bu ARGUS klasörünün eski (ARGUS.bat / PowerShell başlatıcı) kısayoluna dokun
  $eski = ($s.TargetPath -eq (Join-Path $root 'ARGUS.bat')) -or ($s.TargetPath -like '*powershell.exe' -and $s.Arguments -like ('*' + $PSScriptRoot + '*'))
  if (-not $eski) { exit }
} elseif (-not $Olustur) {
  exit
} else {
  $s = $sh.CreateShortcut($lnk)
}

$exe = Join-Path $root 'ARGUS.exe'
if (Test-Path $exe) {
  # ARGUS.exe: hiç terminal açmadan logolu açılış penceresi
  $s.TargetPath = $exe
  $s.Arguments = ''
  $s.WorkingDirectory = $root
  $s.IconLocation = $exe + ',0'
  $s.WindowStyle = 1
  $s.Description = 'ARGUS'
  $s.Save()
  exit
}
$s.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$s.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'baslat.ps1') + '"'
$s.WorkingDirectory = $root
$s.IconLocation = Join-Path $app 'public\argus.ico'
$s.WindowStyle = 7 # simge durumunda başlasın — gizlenmeden önceki kısa anda bile pencere görünmesin
$s.Description = 'ARGUS'
$s.Save()
