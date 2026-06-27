param(
    [string]$SessionDir = ""
)

if ([string]::IsNullOrEmpty($SessionDir)) {
    Write-Error "Usage: stop-server.ps1 <session_dir>"
    exit 1
}

$StateDir = Join-Path $SessionDir "state"
$PidFile = Join-Path $StateDir "server.pid"
$ServerIdFile = Join-Path $StateDir "server-instance-id"

function Mark-Stopped($reason) {
    Remove-Item (Join-Path $StateDir "server-info") -Force -ErrorAction SilentlyContinue
    $Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    '{"reason":"' + $reason + '","timestamp":' + $Timestamp + '}' | Out-File -FilePath (Join-Path $StateDir "server-stopped") -Encoding utf8
}

if (Test-Path $PidFile) {
    $PidVal = Get-Content $PidFile -Raw -ErrorAction SilentlyContinue
    if ($PidVal -match '^\d+$') {
        $Process = Get-Process -Id ([int]$PidVal) -ErrorAction SilentlyContinue
        if ($Process) {
            Stop-Process -Id ([int]$PidVal) -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 500
        }
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    Remove-Item $ServerIdFile -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $StateDir "server.log") -Force -ErrorAction SilentlyContinue
    Mark-Stopped "stop-server.ps1"

    $TempPath = [System.IO.Path]::GetTempPath()
    if ($SessionDir.StartsWith($TempPath)) {
        Remove-Item $SessionDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Output '{"status": "stopped"}'
} else {
    Write-Output '{"status": "not_running"}'
}
