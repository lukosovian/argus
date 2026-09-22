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
echo.

:check_node
REM 1) Node.js bu bilgisayarda kurulu mu?
where node >nul 2>nul
if errorlevel 1 goto :no_node
goto :check_modules

:no_node
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
if exist "app\node_modules" goto :quick_install
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

echo.
goto :launch

:install_failed
echo.
echo Kurulum sirasinda bir sorun oldu, yukaridaki mesaji kontrol et - genelde internet
echo baglantisi sorunudur. Duzelince bu dosyayi tekrar calistir.
pause
exit /b 1

:launch
echo ARGUS sunucusu baslatiliyor...
cd /d "%~dp0app"
del /q argus-pid.txt >nul 2>nul
REM Sunucu tamamen gizli calisir - ne ekranda ne gorev cubugunda bir pencere/simge kalir.
REM PID bir dosyaya yaziliyor ki "ARGUS Durdur.bat" onu tam olarak bulup kapatabilsin.
powershell -NoProfile -WindowStyle Hidden -Command "$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm run dev' -WorkingDirectory '%CD%' -WindowStyle Hidden -PassThru; Set-Content -Path 'argus-pid.txt' -Value $p.Id; Start-Sleep -Seconds 2; Start-Process 'http://localhost:5173/'"
exit /b 0
