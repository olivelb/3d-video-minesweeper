#!/usr/bin/env pwsh
# Build the WASM solver module
# Usage: .\shared\solver-wasm\build.ps1 [--release]

param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"
$crateDir = "$PSScriptRoot"

Write-Host "🦀 Building WASM solver..." -ForegroundColor Cyan

$buildArgs = @("build", "--target", "web", "--out-dir", "pkg")
if (-not $Release) {
    $buildArgs += "--dev"
}

Push-Location $crateDir
try {
    wasm-pack @buildArgs
    if ($LASTEXITCODE -ne 0) { throw "wasm-pack build failed" }

    $wasmFile = Join-Path $crateDir "pkg/solver_wasm_bg.wasm"
    $size = (Get-Item $wasmFile).Length
    $sizeKB = [math]::Round($size / 1024, 1)
    Write-Host "✅ Build complete! WASM binary: ${sizeKB}KB" -ForegroundColor Green
} finally {
    Pop-Location
}
