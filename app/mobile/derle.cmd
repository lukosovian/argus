@echo off
REM ARGUS Android uygulamasini derler: arayuz paketlenir, Android projesine kopyalanir, APK cikar.
REM Sonuc: app\mobile\ARGUS.apk + app\mobile\surum.json  -  ikisi de PC surumuyle birlikte GitHub'a gonderilir;
REM PC'deki ARGUS guncellenince telefon PC'ye baglaninca yeni surumu gorup kendini gunceller.
REM Gradle 8.14 Java 25 ile calismiyor (Android Studio'nun kendi Java'si) - JDK 21 kullaniliyor.
REM Imza: bu bilgisayarin Android debug anahtari (%USERPROFILE%\.android\debug.keystore). Guncellemeler ayni anahtarla
REM imzalanmak zorunda - bu dosya kaybolursa telefondaki uygulama kaldirilip yeniden kurulmali.
setlocal
set "MOBIL=%~dp0"
cd /d "%MOBIL%.."
if exist "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot" set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
call npx vite build --logLevel warn || exit /b 1
call npx cap sync android || exit /b 1
cd /d "%MOBIL%android"
call "%MOBIL%android\gradlew.bat" assembleDebug --console=plain -q || exit /b 1
copy /y "%MOBIL%android\app\build\outputs\apk\debug\app-debug.apk" "%MOBIL%ARGUS.apk" >nul
cd /d "%MOBIL%.."
node -e "const v=/APP_VERSION = 'v([0-9.]+)'/.exec(require('fs').readFileSync('src/lib/version.ts','utf8'))[1];const p=v.split('.').map(Number);while(p.length<3)p.push(0);require('fs').writeFileSync('mobile/surum.json',JSON.stringify({version:'v'+v,code:p[0]*10000+p[1]*100+p[2]})+'\n')"
echo APK hazir: %MOBIL%ARGUS.apk
