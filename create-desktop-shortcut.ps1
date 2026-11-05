$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "Hongguo.lnk"
$TargetPath = Join-Path $PSScriptRoot "start-desktop.bat"

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetPath
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.Description = "OpenHongguo Desktop Client"
$Shortcut.Save()

Write-Output "Shortcut created at: $ShortcutPath"
