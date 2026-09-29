import { spawn } from 'node:child_process'

// "Şimdi Güncelle"den sonra ARGUS'u yeniden başlatma: eski ARGUS'un tüm süreç ağacını
// (cmd → npm → concurrently → vite + bu sunucu) kapatıp YERİNE yeni bir ARGUS.bat başlatır.
//
// Neden iki kademeli PowerShell: `taskkill /T` bir sürecin ÇOCUKLARINI da (ebeveyn süreç
// kimliğine bakarak) kapatır. Bu sunucunun doğrudan başlattığı bir yardımcı, eski ağacın bir
// parçası sayılır — taskkill onu da, onun başlattığı YENİ ARGUS.bat'ı da öldürebiliyordu
// (zamanlamaya bağlı bir yarış). Bu yüzden: (A) bu sunucu kısa ömürlü bir PowerShell başlatır,
// (A) asıl işi yapacak (B)'yi başlatıp hemen kapanır. (B)'nin ebeveyni artık yaşamadığı için
// eski ağaçla bağı kopar. (B) önce A'nın gerçekten kapanmasını bekler, sonra eski ağacı kapatır
// (-Wait ile bitmesini bekleyerek — portlar boşalsın), en son yeni ARGUS.bat'ı başlatır.
// ARGUS_NO_BROWSER: güncellemede açık sekme zaten kendini yeniliyor, ARGUS.bat ikinci bir sekme
// açmasın diye.

// Yeni ARGUS, varsa ARGUS.exe --guncelleme ile (logolu açılış penceresi, hiç terminal yok), o yoksa açılış
// pencereli PowerShell başlatıcıyla (launcher/baslat.ps1 -Guncelleme), o da yoksa eskisi gibi ARGUS.bat ile açılır.
export function buildRestartScript({ oldPid, batPath, root, launcherPath, exePath }) {
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`
  const lines = ['Start-Sleep -Milliseconds 800']
  if (oldPid && /^\d+$/.test(oldPid)) {
    lines.push(`try { Start-Process -FilePath 'taskkill.exe' -ArgumentList '/PID','${oldPid}','/T','/F' -WindowStyle Hidden -Wait } catch {}`)
    lines.push('Start-Sleep -Milliseconds 700')
  }
  lines.push("$env:ARGUS_NO_BROWSER = '1'")
  if (exePath) lines.push(`if (Test-Path ${q(exePath)}) { Start-Process -FilePath ${q(exePath)} -ArgumentList '--guncelleme' -WorkingDirectory ${q(root)}; exit }`)
  if (launcherPath)
    lines.push(
      `if (Test-Path ${q(launcherPath)}) { Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -WorkingDirectory ${q(root)} -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',${q('"' + launcherPath + '"')},'-Guncelleme' } else { Start-Process -FilePath ${q(batPath)} -WorkingDirectory ${q(root)} }`,
    )
  else lines.push(`Start-Process -FilePath ${q(batPath)} -WorkingDirectory ${q(root)}`)
  return lines.join('\n')
}

export function launchDetachedRestart(script, cwd) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const launcher = `Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList '-NoProfile','-WindowStyle','Hidden','-EncodedCommand','${encoded}'`
  // `detached: true` KULLANILMIYOR: denemede o ayarla başlatılan PowerShell hiç çalışmadı (dosya
  // bile yazamadı). Bağımsızlığı zaten iki kademeli yapı sağlıyor — (A) saniyesinde kapanıyor,
  // (B) onunla birlikte gitmiyor.
  spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', launcher], {
    cwd,
    stdio: 'ignore',
    windowsHide: true,
  }).unref()
}
