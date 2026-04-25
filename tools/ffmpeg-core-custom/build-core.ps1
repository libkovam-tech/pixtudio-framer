$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$upstreamRoot = Join-Path $scriptDir "upstream\ffmpeg.wasm-v0.12.10"
$outputRoot = Join-Path $scriptDir "output"
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
$publicVendorRoot = Join-Path $repoRoot "public\vendor\ffmpeg-core-custom"

function Convert-ToLfFile([string]$Path) {
    $raw = [System.IO.File]::ReadAllText($Path)
    $normalized = $raw.Replace("`r`n", "`n").Replace("`r", "`n")
    if ($normalized -ne $raw) {
        [System.IO.File]::WriteAllText($Path, $normalized, (New-Object System.Text.UTF8Encoding($false)))
    }
}

if (!(Test-Path $upstreamRoot)) {
    throw "Upstream repo not found at $upstreamRoot. Run prepare-upstream.ps1 first."
}

if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker command not found. Verify Docker Desktop is installed and 'docker --version' works."
}

if (Test-Path $outputRoot) {
    Remove-Item -LiteralPath $outputRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $outputRoot | Out-Null

# Git on Windows may checkout upstream shell scripts with CRLF.
# Docker builds run them under Linux, so normalize them to LF first.
Get-ChildItem -Path (Join-Path $upstreamRoot "build") -Filter *.sh -File | ForEach-Object {
    Convert-ToLfFile $_.FullName
}

Push-Location $upstreamRoot
try {
    Write-Host "Building custom ffmpeg core with Docker..." -ForegroundColor Cyan
    Write-Host "Output folder:" -ForegroundColor DarkGray
    Write-Host "  $outputRoot"
    docker buildx build --output "type=local,dest=$outputRoot" .
    if ($LASTEXITCODE -ne 0) {
        throw "docker buildx build failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$esmRoot = Join-Path $outputRoot "dist\esm"
$coreJsSource = Join-Path $esmRoot "ffmpeg-core.js"
$coreWasmSource = Join-Path $esmRoot "ffmpeg-core.wasm"

if (!(Test-Path $coreJsSource) -or !(Test-Path $coreWasmSource)) {
    throw "Expected custom core artifacts were not found under $esmRoot"
}

New-Item -ItemType Directory -Force -Path $publicVendorRoot | Out-Null
Copy-Item -LiteralPath $coreJsSource -Destination (Join-Path $publicVendorRoot "ffmpeg-core.js") -Force
Copy-Item -LiteralPath $coreWasmSource -Destination (Join-Path $publicVendorRoot "ffmpeg-core.wasm") -Force

Write-Host ""
Write-Host "Build finished." -ForegroundColor Green
Write-Host "Artifacts should appear under:" -ForegroundColor DarkGray
Write-Host "  $outputRoot\\dist\\umd"
Write-Host "  $outputRoot\\dist\\esm"
Write-Host ""
Write-Host "The ESM core artifacts were copied to:" -ForegroundColor DarkGray
Write-Host "  $publicVendorRoot"
