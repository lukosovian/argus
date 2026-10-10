@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title ARGUS

REM Dil: ARGUS daha once acildiysa arayuzde secilen dil (data\ui-prefs.json), ilk kurulumda Windows'un dili
set "ARGUS_EN="
if exist "data\ui-prefs.json" (
  findstr /c:"argus_lang\": \"en" "data\ui-prefs.json" >nul 2>nul && set "ARGUS_EN=1"
) else (
  set "ARGUS_LOC="
  for /f "tokens=3" %%L in ('reg query "HKCU\Control Panel\International" /v LocaleName 2^>nul') do set "ARGUS_LOC=%%L"
  if /i not "!ARGUS_LOC:~0,2!"=="tr" set "ARGUS_EN=1"
)

echo ============================================
if defined ARGUS_EN (echo   Starting ARGUS...) else (echo   ARGUS baslatiliyor...)
echo ============================================
echo.

REM 0) Guncelleme var mi? (bu klasor bir git deposuysa sessizce en son surume gunceller)
if not exist ".git" goto :check_node
where git >nul 2>nul
if errorlevel 1 goto :check_node
if defined ARGUS_EN (echo Checking for updates...) else (echo Guncellemeler kontrol ediliyor...)
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
REM ARGUS.exe "guncellemeyi simdilik atla" dediyse git komutlari gecersiz bir GIT_DIR ile calisti (hicbir sey
REM cekilmedi); buradan sonrasi (sunucu, uygulama icindeki "Simdi Guncelle") normal git kullansin.
set "GIT_DIR="
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
if defined ARGUS_EN (echo ARGUS needs a program called "Node.js" to run, and it wasn't found on this computer.) else (echo ARGUS'un calismasi icin once "Node.js" adli bir program gerekiyor, bu bilgisayarda bulunamadi.)
echo.
where winget >nul 2>nul
if errorlevel 1 goto :no_winget

if defined ARGUS_EN (
  set /p KURULSUN=Shall I install Node.js automatically now? Type Y or N, then press Enter: 
) else (
  set /p KURULSUN=Node.js'i simdi otomatik kurmami ister misin? E ya da H yaz, sonra Enter'a bas:
)
if /i not "!KURULSUN!"=="E" if /i not "!KURULSUN!"=="Y" goto :install_declined

echo.
if defined ARGUS_EN (echo Installing Node.js, this may take a few minutes. A Windows User Account Control) else (echo Node.js kuruluyor, bu birkac dakika surebilir. Windows Kullanici Hesabi Denetimi)
if defined ARGUS_EN (echo window may open; if it does, choose "Yes".) else (echo penceresi acabilir, cikarsa "Evet" de.)
echo.
winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto :winget_failed

echo.
if defined ARGUS_EN (echo Node.js is installed. For this change to take effect, close this window and) else (echo Node.js kuruldu. Bu degisikligin etkili olmasi icin bu pencereyi kapatip)
if defined ARGUS_EN (echo double-click this file ONE MORE TIME - just this once.) else (echo bu dosyayi BIR KEZ DAHA cift tiklaman gerekiyor - sadece bu seferlik.)
pause
exit /b 0

:winget_failed
echo.
if defined ARGUS_EN (echo Automatic install failed. Continue from the page that just opened to install it by hand.) else (echo Otomatik kurulum basarisiz oldu. Elle kurmak icin simdi acilan sayfadan devam et.)
start "" "https://nodejs.org"
pause
exit /b 1

:install_declined
echo.
if defined ARGUS_EN (echo OK, nothing was installed. After installing Node.js from https://nodejs.org,) else (echo Tamam, bir sey kurulmadi. Node.js'i https://nodejs.org adresinden kurduktan)
if defined ARGUS_EN (echo double-click this file again.) else (echo sonra bu dosyayi tekrar cift tikla.)
pause
exit /b 1

:no_winget
if defined ARGUS_EN (echo This computer has no automatic install tool either, so install it by hand - it's easy.) else (echo Bu bilgisayarda otomatik kurulum araci da yok, elle kurman lazim - cok kolay.)
if defined ARGUS_EN (echo   1. On the page that just opened, click the green "LTS" button) else (echo   1. Simdi acilan sayfada "LTS" yazan yesil butona tikla)
if defined ARGUS_EN (echo   2. Run the downloaded file and click "Next" through all the steps) else (echo   2. Inen dosyayi calistir, hepsine "Next"/"Ileri" diyerek gec)
if defined ARGUS_EN (echo   3. When the install is done, close this window and double-click this file again) else (echo   3. Kurulum bitince bu pencereyi kapat, bu dosyayi tekrar cift tikla)
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
if defined ARGUS_EN (echo First run - downloading the files ARGUS needs, this may take a few minutes...) else (echo Ilk calistirma - ARGUS'un ihtiyac duydugu dosyalar indiriliyor, bu birkac dakika surebilir...)
echo.
goto :do_install

:quick_install
if defined ARGUS_EN (echo Checking...) else (echo Kontrol ediliyor...)
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
  if defined ARGUS_EN (echo Downloading the app engine ^(one time only, about 100 MB^)...) else (echo Uygulama motoru indiriliyor ^(bir kereye mahsus, yaklasik 100 MB^)...)
  call node "app\node_modules\electron\install.js"
)

echo.
goto :launch

:install_failed
if defined ARGUS_STATUS_FILE goto :goster
echo.
if defined ARGUS_EN (echo Something went wrong during setup, check the message above - it's usually an internet) else (echo Kurulum sirasinda bir sorun oldu, yukaridaki mesaji kontrol et - genelde internet)
if defined ARGUS_EN (echo connection problem. Run this file again once it's fixed.) else (echo baglantisi sorunudur. Duzelince bu dosyayi tekrar calistir.)
pause
exit /b 1

:launch
if defined ARGUS_EN (echo Starting the ARGUS server...) else (echo ARGUS sunucusu baslatiliyor...)
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
