@echo off
REM ARGUS.exe'yi app\launcher\ARGUS.cs'ten derler (Windows'la gelen .NET Framework derleyicisi).
REM Gelistirici bilgisayarinda, ARGUS.cs degistiginde calistirilir; olusan ARGUS.exe Git'e gonderilir.
cd /d "%~dp0"
"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /optimize+ /win32icon:..\public\argus.ico /out:..\..\ARGUS.exe /r:System.Windows.Forms.dll /r:System.Drawing.dll ARGUS.cs
