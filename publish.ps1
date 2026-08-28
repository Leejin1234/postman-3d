# Publish dist/ to GitHub Pages (gh-pages branch of a repo you own).
#   .\publish.ps1 -Repo https://github.com/<user>/<repo>.git
param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [string]$Branch = 'gh-pages'
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root 'dist'

if (-not (Test-Path $dist)) {
  Write-Host 'dist/ missing -> running pack.ps1'
  & (Join-Path $root 'pack.ps1')
}

Set-Content -Path (Join-Path $dist '.nojekyll') -Value '' -NoNewline -Encoding ascii

Push-Location $dist
try {
  if (-not (Test-Path (Join-Path $dist '.git'))) {
    git init -q
    git checkout -q -B $Branch
    git remote add origin $Repo
  }
  else {
    git remote set-url origin $Repo
    git checkout -q -B $Branch
  }

  # 29MB fbx: git-lfs not needed, plain blob under 100MB limit
  git add -A
  git -c user.name='postman-bot' -c user.email='postman@local' commit -q -m ('deploy ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')) 2>$null
  git push -q -f origin $Branch
  if ($LASTEXITCODE -ne 0) { throw 'git push failed' }

  if ($Repo -match 'github\.com[:/]+([^/]+)/([^/.]+)') {
    $user = $Matches[1]; $name = $Matches[2]
    Write-Host ''
    Write-Host ('pushed to ' + $Repo + ' [' + $Branch + ']')
    Write-Host ('enable Pages: https://github.com/' + $user + '/' + $name + '/settings/pages  -> Branch: ' + $Branch + ' / (root)')
    Write-Host ('share URL   : https://' + $user + '.github.io/' + $name + '/')
  }
}
finally { Pop-Location }
