# start.ps1 — SEFS launcher for Windows (PowerShell 5.1+)
$ErrorActionPreference = "Stop"

# ─── Colors ───────────────────────────────────────────────────────────────────
function Info  { param($msg) Write-Host "[SEFS] $msg" -ForegroundColor Green }
function Warn  { param($msg) Write-Host "[SEFS] $msg" -ForegroundColor Yellow }
function Fatal { param($msg) Write-Host "[SEFS] $msg" -ForegroundColor Red; exit 1 }

Set-Location $PSScriptRoot

# ─── 1. Check Ollama ─────────────────────────────────────────────────────────
Info "Checking Ollama..."
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Fatal "Ollama not found. Install from https://ollama.com"
}

try {
    $null = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 3
} catch {
    Warn "Ollama not running — starting it..."
    Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
    try {
        $null = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 3
    } catch {
        Fatal "Failed to start Ollama. Start it manually: ollama serve"
    }
}
Info "Ollama is running."

# ─── 2. Python environment ───────────────────────────────────────────────────
Info "Setting up Python environment..."

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Fatal "uv not found. Install with: powershell -c 'irm https://astral.sh/uv/install.ps1 | iex'"
}

if (-not (Test-Path ".venv")) {
    Info "Creating virtual environment with Python 3.11..."
    uv venv --python 3.11 .venv
}

# Activate
& .\.venv\Scripts\Activate.ps1

# Build deps first (Cython + numpy must precede hdbscan/umap)
Info "Installing build dependencies (Cython + numpy)..."
uv pip install "cython>=3.0" "numpy>=1.26.0,<2.0.0"

# Install project and all remaining deps
Info "Installing SEFS and all dependencies..."
uv pip install -e .

Info "Python environment ready."

# ─── 3. Create default watch folder ──────────────────────────────────────────
$watchDir = if ($env:SEFS_ROOT) { $env:SEFS_ROOT } else { Join-Path $HOME "sefs-root" }
if (-not (Test-Path $watchDir)) {
    New-Item -ItemType Directory -Path $watchDir -Force | Out-Null
    Info "Created watch folder: $watchDir"
} else {
    Info "Watch folder exists: $watchDir"
}

# ─── 4. Frontend setup ───────────────────────────────────────────────────────
Info "Setting up frontend..."
Push-Location frontend

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fatal "Node.js not found. Install Node 18+."
}

$nodeVersion = [int]((node -v) -replace '^v' -split '\.')[0]
if ($nodeVersion -lt 18) {
    Fatal "Node.js 18+ required. Found: $(node -v)"
}

if (-not (Test-Path "node_modules")) {
    npm install
}

# Start frontend in background
Info "Starting frontend on http://localhost:5173 ..."
$frontendJob = Start-Process "npm.cmd" -ArgumentList "run","dev" -PassThru -WindowStyle Normal
Pop-Location

# ─── 5. Start backend ────────────────────────────────────────────────────────
Info "Starting backend on http://localhost:8484 ..."
Info "Press Ctrl+C to stop both servers."

try {
    Set-Location backend
    uvicorn main:app --host 0.0.0.0 --port 8484 --reload
} finally {
    Info "Shutting down..."
    if ($frontendJob -and -not $frontendJob.HasExited) {
        Stop-Process -Id $frontendJob.Id -Force -ErrorAction SilentlyContinue
        # Also kill any child node processes spawned by npm
        Get-Process -Name node -ErrorAction SilentlyContinue |
            Where-Object { $_.StartTime -ge $frontendJob.StartTime } |
            Stop-Process -Force -ErrorAction SilentlyContinue
    }
    Info "Done."
}