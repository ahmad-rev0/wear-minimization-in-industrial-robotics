# Auto-commit watcher: watches repo for changes, commits and pushes to origin.
# Run this when you start coding so changes are committed and pushed automatically.
# Stop with Ctrl+C.

param(
    [int] $DebounceSeconds = 8,
    [string] $CommitMessagePrefix = "Auto-commit"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $repoRoot ".git"))) {
    $repoRoot = $PSScriptRoot
}
Set-Location $repoRoot

$lastChange = [datetime]::MinValue
$debounceMs = $DebounceSeconds * 1000
$excludeDirs = @(".git", "node_modules", ".venv", "venv", "__pycache__", ".cursor", "dist", "build", ".next")

function Get-ExcludeFilter {
    $exclude = @()
    foreach ($d in $excludeDirs) {
        $exclude += "*\$d\*"
        $exclude += "*\$d"
    }
    $exclude
}

function Do-CommitAndPush {
    Set-Location $repoRoot
    $status = git status --porcelain 2>$null
    if (-not $status) { return }
    git add -A 2>$null
    if ($LASTEXITCODE -ne 0) { return }
    $msg = "${CommitMessagePrefix}: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    git commit -m $msg 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Committed and pushing..."
        git push origin HEAD 2>&1
        if ($LASTEXITCODE -eq 0) { Write-Host "Pushed to origin." } else { Write-Host "Push failed (e.g. network). Will retry on next commit." }
    }
}

function On-Change {
    $script:lastChange = Get-Date
}

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $repoRoot
$watcher.IncludeSubdirectories = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]::FileName -bor [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::DirectoryName

$action = {
    $path = $Event.SourceEventArgs.FullPath
    $name = $Event.SourceEventArgs.Name
    foreach ($ex in $excludeDirs) {
        if ($path -like "*\$ex\*" -or $path -like "*\$ex") { return }
    }
    On-Change
}

Register-ObjectEvent -InputObject $watcher -EventName Created -Action $action -SourceIdentifier FWC | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $action -SourceIdentifier FWC2 | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Deleted -Action $action -SourceIdentifier FWD | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action $action -SourceIdentifier FWR | Out-Null
$watcher.EnableRaisingEvents = $true

Write-Host "Auto-commit watcher started. Repo: $repoRoot | Debounce: ${DebounceSeconds}s | Stop with Ctrl+C"
Write-Host ""

try {
    while ($true) {
        Start-Sleep -Milliseconds 2000
        if ($lastChange -gt [datetime]::MinValue -and ((Get-Date) - $lastChange).TotalMilliseconds -ge $debounceMs) {
            Do-CommitAndPush
            $script:lastChange = [datetime]::MinValue
        }
    }
} finally {
    $watcher.EnableRaisingEvents = $false
    Get-EventSubscriber | Where-Object { $_.SourceIdentifier -like "FW*" } | Unregister-Event
    $watcher.Dispose()
}
