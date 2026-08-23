param(
    [string]$Scope = ".",
    [string]$Extensions = "",
    [int]$MaxFiles = 200
)

$ErrorActionPreference = "Stop"

$repoRoot = git rev-parse --show-toplevel 2>$null

if (-not $repoRoot) {
    Write-Error "Not inside a Git repository."
    exit 1
}

Set-Location $repoRoot

Write-Output "=== REPOSITORY ==="
Write-Output $repoRoot
Write-Output ""

Write-Output "=== GIT STATUS ==="
git status --short
Write-Output ""

Write-Output "=== PACKAGE.JSON ==="
if (Test-Path "package.json") {
    Get-Content "package.json"
}
else {
    Write-Output "package.json not found"
}
Write-Output ""

Write-Output "=== REPOSITORY FILES: $Scope ==="

$files = @(
    git ls-files --cached --others --exclude-standard -- $Scope
)

if ($Extensions) {
    $normalizedExtensions = @(
        $Extensions.Split(",") | ForEach-Object {
            $_.Trim().TrimStart(".").ToLowerInvariant()
        }
    )

    $files = @(
        $files | Where-Object {
            $extension = [System.IO.Path]::GetExtension($_).TrimStart(".").ToLowerInvariant()
            $normalizedExtensions -contains $extension
        }
    )
}

if ($files.Count -eq 0) {
    Write-Output "No repository files found for scope: $Scope"
    exit 0
}

$files |
    Select-Object -First $MaxFiles |
    ForEach-Object { Write-Output $_ }

if ($files.Count -gt $MaxFiles) {
    Write-Output ""
    Write-Output "... truncated: showing $MaxFiles of $($files.Count) repository files"
    Write-Output "Use a narrower scope or extension filter."
}