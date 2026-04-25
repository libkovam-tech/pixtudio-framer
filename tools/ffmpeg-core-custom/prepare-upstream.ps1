param(
    [string]$Tag = "v0.12.10"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$upstreamRoot = Join-Path $scriptDir "upstream"
$repoDir = Join-Path $upstreamRoot ("ffmpeg.wasm-" + $Tag)
$repoUrl = "https://github.com/ffmpegwasm/ffmpeg.wasm.git"

if (!(Test-Path $upstreamRoot)) {
    New-Item -ItemType Directory -Path $upstreamRoot | Out-Null
}

if (Test-Path $repoDir) {
    Write-Host "Upstream repo already exists:" -ForegroundColor Yellow
    Write-Host "  $repoDir"
    Write-Host ""
    Write-Host "Delete that folder if you want a clean clone."
    exit 0
}

Write-Host "Cloning ffmpeg.wasm upstream..." -ForegroundColor Cyan
Write-Host "  repo: $repoUrl"
Write-Host "  tag : $Tag"
Write-Host "  dest: $repoDir"

& git clone --branch $Tag --depth 1 $repoUrl $repoDir
$cloneExitCode = $LASTEXITCODE

if ($cloneExitCode -ne 0) {
    throw "Failed to clone ffmpeg.wasm tag $Tag"
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Open the upstream Dockerfile inside:"
Write-Host "   $repoDir"
Write-Host "2. Apply the reduction plan from:"
Write-Host "   $scriptDir\\component-plan.md"
Write-Host "   $scriptDir\\minimal-configure.flags.txt"
Write-Host "3. Run the upstream production build:"
Write-Host "   make prd"
Write-Host ""
Write-Host "Build output should appear under:"
Write-Host "   packages\\core\\dist\\"
