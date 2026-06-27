param(
    [string]$ProjectDir = "",
    [string]$HostBind = "127.0.0.1",
    [string]$UrlHost = "",
    [int]$IdleTimeoutMinutes = 0,
    [switch]$Open = $false,
    [switch]$Foreground = $false,
    [switch]$Background = $false
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if ([string]::IsNullOrEmpty($UrlHost)) {
    if ($HostBind -eq "127.0.0.1" -or $HostBind -eq "localhost") {
        $UrlHost = "localhost"
    } else {
        $UrlHost = $HostBind
    }
}

if ($IdleTimeoutMinutes -gt 0) {
    $env:BRAINSTORM_IDLE_TIMEOUT_MS = [string]($IdleTimeoutMinutes * 60 * 1000)
}

if ($Open) {
    $env:BRAINSTORM_OPEN = "1"
}

# Generate unique session ID
$SessionId = "$pid-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"

if ($ProjectDir) {
    $SessionDir = Join-Path $ProjectDir ".superpowers/brainstorm/$SessionId"
    $env:BRAINSTORM_PORT_FILE = Join-Path $ProjectDir ".superpowers/brainstorm/.last-port"
    $env:BRAINSTORM_TOKEN_FILE = Join-Path $ProjectDir ".superpowers/brainstorm/.last-token"
} else {
    $TempPath = [System.IO.Path]::GetTempPath()
    $SessionDir = Join-Path $TempPath "brainstorm-$SessionId"
}

$StateDir = Join-Path $SessionDir "state"
$PidFile = Join-Path $StateDir "server.pid"
$LogFile = Join-Path $StateDir "server.log"
$ServerIdFile = Join-Path $StateDir "server-instance-id"

New-Item -ItemType Directory -Force -Path (Join-Path $SessionDir "content") | Out-Null
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

# Generate Server ID
$ServerId = [Guid]::NewGuid().ToString("N")
$ServerId | Out-File -FilePath $ServerIdFile -NoNewline -Encoding utf8

# Kill any existing server
if (Test-Path $PidFile) {
    $OldPid = Get-Content $PidFile -Raw
    if ($OldPid -match '^\d+$') {
        Stop-Process -Id ([int]$OldPid) -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

$env:BRAINSTORM_DIR = $SessionDir
$env:BRAINSTORM_HOST = $HostBind
$env:BRAINSTORM_URL_HOST = $UrlHost
$env:BRAINSTORM_OWNER_PID = "" # disable watchdog on Windows by default

$NodePath = "node"
$ServerArgs = @(
    (Join-Path $ScriptDir "server.cjs"),
    "--brainstorm-server-id=$ServerId"
)

if ($Foreground) {
    $Process = Start-Process $NodePath -ArgumentList $ServerArgs -NoNewWindow -PassThru -Wait
    exit $Process.ExitCode
} else {
    # Start in background
    $ArgList = "/c node `"$ScriptDir\server.cjs`" --brainstorm-server-id=$ServerId > `"$LogFile`" 2>&1"
    $Process = Start-Process cmd.exe -ArgumentList $ArgList -NoNewWindow -PassThru
    $ServerPid = $Process.Id
    $ServerPid | Out-File -FilePath $PidFile -NoNewline -Encoding utf8

    # Wait for server-started in log file
    for ($i = 0; $i -lt 50; $i++) {
        if (Test-Path $LogFile) {
            $LogContent = Get-Content $LogFile -Raw
            if ($LogContent -match "server-started") {
                $StartedLine = $LogContent -split "`r?`n" | Where-Object { $_ -match "server-started" } | Select-Object -First 1
                Write-Output $StartedLine
                exit 0
            }
        }
        Start-Sleep -Milliseconds 100
    }

    Write-Error "Server failed to start within 5 seconds"
    exit 1
}
