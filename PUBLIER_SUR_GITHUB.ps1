$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$repo = "https://github.com/tdubour/radar-immo.git"

function Find-Git {
  $cmd = Get-Command git -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    "$env:ProgramFiles\Git\cmd\git.exe",
    "$env:ProgramFiles\Git\bin\git.exe",
    "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

$git = Find-Git
if (-not $git) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Git absent : installation via winget..." -ForegroundColor Yellow
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    $git = Find-Git
  }
}

if (-not $git) {
  Write-Host "Git n'est pas installé. Installe Git for Windows puis relance ce fichier." -ForegroundColor Red
  Read-Host "Appuie sur Entrée pour fermer"
  exit 1
}

Write-Host "Tests du projet..." -ForegroundColor Cyan
if (Get-Command npm -ErrorAction SilentlyContinue) {
  npm test
  npm run check
} else {
  Write-Host "Node.js absent : tests locaux ignorés. Le projet reste une application statique sans build." -ForegroundColor Yellow
}

if (-not (Test-Path ".git")) {
  & $git init -b main
}

& $git branch -M main

if (-not (& $git config user.name)) {
  & $git config user.name "tdubour"
}
if (-not (& $git config user.email)) {
  & $git config user.email "tom.dubourjal@gmail.com"
}

$origin = (& $git remote get-url origin 2>$null)
if ($LASTEXITCODE -ne 0) {
  & $git remote add origin $repo
} else {
  & $git remote set-url origin $repo
}

& $git add -A
& $git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  & $git commit -m "Deploy Radar Immo web app"
} else {
  Write-Host "Aucun nouveau changement à committer." -ForegroundColor DarkGray
}

Write-Host "Connexion et envoi vers GitHub..." -ForegroundColor Cyan
Write-Host "Une fenêtre de connexion GitHub peut s'ouvrir. Valide-la avec ton compte tdubour." -ForegroundColor Yellow

# Tente de récupérer la branche distante pour rendre le force push plus sûr.
& $git fetch origin main 2>$null
$remoteExists = ($LASTEXITCODE -eq 0)

if ($remoteExists) {
  & $git push -u origin main --force-with-lease
} else {
  & $git push -u origin main --force
}

if ($LASTEXITCODE -ne 0) {
  Write-Host "L'envoi a échoué. Vérifie que Git Credential Manager ouvre bien la connexion GitHub." -ForegroundColor Red
  Read-Host "Appuie sur Entrée pour fermer"
  exit 1
}

Write-Host "Terminé : le projet est publié sur tdubour/radar-immo." -ForegroundColor Green
Read-Host "Appuie sur Entrée pour fermer"
