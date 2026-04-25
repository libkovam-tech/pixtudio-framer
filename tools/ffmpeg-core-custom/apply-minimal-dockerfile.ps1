$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$upstreamRoot = Join-Path $scriptDir "upstream"
$repoDir = Join-Path $upstreamRoot "ffmpeg.wasm-v0.12.10"
$sourceDockerfile = Join-Path $scriptDir "minimal.Dockerfile"
$targetDockerfile = Join-Path $repoDir "Dockerfile"

if (!(Test-Path $repoDir)) {
    throw "Upstream repo not found at $repoDir. Run prepare-upstream.ps1 first."
}

if (!(Test-Path $sourceDockerfile)) {
    throw "Template Dockerfile not found at $sourceDockerfile"
}

Copy-Item -LiteralPath $sourceDockerfile -Destination $targetDockerfile -Force

Write-Host "Minimal Dockerfile copied to:" -ForegroundColor Green
Write-Host "  $targetDockerfile"
Write-Host ""
Write-Host "Next step:"
Write-Host "  Set-Location $repoDir"
Write-Host "  make prd"
