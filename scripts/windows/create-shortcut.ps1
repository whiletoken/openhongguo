$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$TargetBat = Join-Path $RootDir "start-desktop.bat"
if (-not (Test-Path $TargetBat)) {
    $TargetBat = Join-Path $ScriptDir "start-desktop.bat"
}

$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "Hongguo.lnk"

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetBat
$Shortcut.WorkingDirectory = $RootDir
$Shortcut.Description = "OpenHongguo Desktop Client"
$Shortcut.Save()

Write-Output "桌面快捷方式已成功创建: $ShortcutPath"
