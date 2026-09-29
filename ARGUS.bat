@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title ARGUS

echo ============================================
echo   ARGUS baslatiliyor...
echo ============================================
echo.

REM 0) Guncelleme var mi? (bu klasor bir git deposuysa sessizce en son surume gunceller)
if not exist ".git" goto :check_node
where git >nul 2>nul
if errorlevel 1 goto :check_node
echo Guncellemeler kontrol ediliyor...
git pull --ff-only >nul 2>nul
if exist ".gelistirici" goto :update_done
if "%~1"=="guncel" goto :update_done
(
  git fetch --quiet origin >nul 2>nul
  git reset --hard --quiet "@{u}" >nul 2>nul
  call "%~f0" guncel
  exit /b
)
:update_done
echo.

:check_node
REM Bu dosyaya (ya da onu acan eski kisayola) cift tiklandiysa ARGUS.exe'ye devret: logolu acilis penceresi
REM gosterir, bu dosyayi hic pencere acmadan yeniden calistirir; bu terminal kapanir. ARGUS.exe her acilista
REM klasoru duzenler (bu dosya gizlenir) ve masaustu kisayolunu kendisine cevirir. ARGUS_TERMINAL: bir sorun
REM yuzunden bilerek gorunur acildiysa (bkz. :goster) tekrar devretme.
if not defined ARGUS_STATUS_FILE if not defined ARGUS_TERMINAL if exist "%~dp0ARGUS.exe" (
  start "" "%~dp0ARGUS.exe"
  exit /b 0
)
if not defined ARGUS_STATUS_FILE if not defined ARGUS_TERMINAL if exist "%~dp0app\launcher\baslat.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\launcher\kisayol.ps1" >nul 2>nul
  start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0app\launcher\baslat.ps1"
  exit /b 0
)
REM 1) Node.js bu bilgisayarda kurulu mu?
where node >nul 2>nul
if errorlevel 1 goto :no_node
goto :check_modules

:no_node
REM Acilis penceresiyle (gizli) calisiyorsa bu mesaj gorunmez - kendini gorunur bir pencerede yeniden ac
if defined ARGUS_STATUS_FILE goto :goster
echo ARGUS'un calismasi icin once "Node.js" adli bir program gerekiyor, bu bilgisayarda bulunamadi.
echo.
where winget >nul 2>nul
if errorlevel 1 goto :no_winget

set /p KURULSUN=Node.js'i simdi otomatik kurmami ister misin? E ya da H yaz, sonra Enter'a bas:
if /i not "!KURULSUN!"=="E" goto :install_declined

echo.
echo Node.js kuruluyor, bu birkac dakika surebilir. Windows Kullanici Hesabi Denetimi
echo penceresi acabilir, cikarsa "Evet" de.
echo.
winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto :winget_failed

echo.
echo Node.js kuruldu. Bu degisikligin etkili olmasi icin bu pencereyi kapatip
echo bu dosyayi BIR KEZ DAHA cift tiklaman gerekiyor - sadece bu seferlik.
pause
exit /b 0

:winget_failed
echo.
echo Otomatik kurulum basarisiz oldu. Elle kurmak icin simdi acilan sayfadan devam et.
start "" "https://nodejs.org"
pause
exit /b 1

:install_declined
echo.
echo Tamam, bir sey kurulmadi. Node.js'i https://nodejs.org adresinden kurduktan
echo sonra bu dosyayi tekrar cift tikla.
pause
exit /b 1

:no_winget
echo Bu bilgisayarda otomatik kurulum araci da yok, elle kurman lazim - cok kolay.
echo   1. Simdi acilan sayfada "LTS" yazan yesil butona tikla
echo   2. Inen dosyayi calistir, hepsine "Next"/"Ileri" diyerek gec
echo   3. Kurulum bitince bu pencereyi kapat, bu dosyayi tekrar cift tikla
start "" "https://nodejs.org"
echo.
pause
exit /b 1

REM 2) Gerekli paketler guncel mi? (ilk calistirmada birkac dakika surer, sonrasinda saniyeler
REM icinde biter - bir guncelleme yeni bir paket eklediyse burada otomatik kurulur.)
:check_modules
if defined ARGUS_STATUS_FILE (>"%ARGUS_STATUS_FILE%" echo modules)
if exist "app\node_modules" goto :quick_install
if defined ARGUS_STATUS_FILE (>"%ARGUS_STATUS_FILE%" echo install)
echo Ilk calistirma - ARGUS'un ihtiyac duydugu dosyalar indiriliyor, bu birkac dakika surebilir...
echo.
goto :do_install

:quick_install
echo Kontrol ediliyor...
echo.

:do_install
pushd app
call npm install
set INSTALL_SONUC=!errorlevel!
popd
if not "!INSTALL_SONUC!"=="0" goto :install_failed
REM ARGUS artik kendi penceresinde acilan bir uygulama (Electron). Uygulama motoru npm install sirasinda
REM inmediyse (npm bazen paketlerin kurulum adimini atliyor) burada bir kereye mahsus indirilir.
if not exist "app\node_modules\electron\dist\electron.exe" if exist "app\node_modules\electron\install.js" (
  if defined ARGUS_STATUS_FILE (>"%ARGUS_STATUS_FILE%" echo motor)
  echo Uygulama motoru indiriliyor ^(bir kereye mahsus, yaklasik 100 MB^)...
  call node "app\node_modules\electron\install.js"
)

echo.
goto :launch

:install_failed
if defined ARGUS_STATUS_FILE goto :goster
echo.
echo Kurulum sirasinda bir sorun oldu, yukaridaki mesaji kontrol et - genelde internet
echo baglantisi sorunudur. Duzelince bu dosyayi tekrar calistir.
pause
exit /b 1

:launch
echo ARGUS sunucusu baslatiliyor...
if defined ARGUS_STATUS_FILE (>"%ARGUS_STATUS_FILE%" echo start)
cd /d "%~dp0app"
del /q argus-pid.txt >nul 2>nul
REM Sunucu tamamen gizli calisir - ne ekranda ne gorev cubugunda bir pencere/simge kalir.
REM PID bir dosyaya yaziliyor ki "ARGUS Durdur.bat" onu tam olarak bulup kapatabilsin.
REM Uygulama icinden "Simdi Guncelle" ile yeniden baslatildiysa acik sekme zaten kendini
REM yeniliyor - ikinci bir sekme acilmasin.
REM Uygulama motoru varsa ARGUS kendi penceresinde acilir (app\desktop\main.cjs sunucuyu da kendisi
REM baslatir, pencere kapaninca kapatir). PID uygulamanin kendisi - "ARGUS Durdur" ve "Simdi Guncelle"
REM onu (ve altindaki sunucuyu) kapatir. Motor yoksa asagida eskisi gibi sunucu + tarayici.
if exist "node_modules\electron\dist\electron.exe" (
  powershell -NoProfile -WindowStyle Hidden -Command "$p = Start-Process -FilePath '%CD%\node_modules\electron\dist\electron.exe' -ArgumentList 'desktop' -WorkingDirectory '%CD%' -PassThru; Set-Content -Path 'argus-pid.txt' -Value $p.Id"
  exit /b 0
)
set "ARGUS_OPEN=; for ($i = 0; $i -lt 120; $i++) { try { $null = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 2; break } catch { Start-Sleep -Milliseconds 500 } }; Start-Process 'http://localhost:5173/'"
if defined ARGUS_NO_BROWSER set "ARGUS_OPEN="
powershell -NoProfile -WindowStyle Hidden -Command "$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm start' -WorkingDirectory '%CD%' -WindowStyle Hidden -PassThru; Set-Content -Path 'argus-pid.txt' -Value $p.Id%ARGUS_OPEN%"
exit /b 0

REM Acilis penceresiyle gizli calisirken bir sorun cikti: pencere kapansin ("gorunur"), ayni islem
REM gorunur bir terminalde yeniden baslasin ki kullanici mesaji okuyup cevap verebilsin.
:goster
>"%ARGUS_STATUS_FILE%" echo gorunur
set "ARGUS_STATUS_FILE="
set "ARGUS_TERMINAL=1"
start "ARGUS" cmd /c ""%~f0" guncel"
exit /b 0
