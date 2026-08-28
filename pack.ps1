$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root 'dist'
$zip = Join-Path $root 'postman-3d.zip'

if (Test-Path $dist) {
  Get-ChildItem $dist -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force
}
else { New-Item -ItemType Directory -Path $dist | Out-Null }
New-Item -ItemType Directory -Path (Join-Path $dist 'assets') | Out-Null

foreach ($f in @('index.html', 'game.js', 'manifest.webmanifest', 'icon.svg', 'serve.ps1', 'README.txt')) {
  Copy-Item (Join-Path $root $f) $dist
}
Copy-Item (Join-Path $root 'vendor') $dist -Recurse

$assets = @(
  'city-lowpoly.fbx', 'City_low_poly_1024.png',
  'motuo.fbx', 'motuo_basecolor.jpg',
  'the-boy.fbx', 'the-boy_basecolor.jpg'
)
foreach ($a in $assets) {
  Copy-Item (Join-Path $root "assets\$a") (Join-Path $dist 'assets')
}

$ui = Join-Path $root 'assets\ui'
if (Test-Path $ui) { Copy-Item $ui (Join-Path $dist 'assets') -Recurse }

Set-Content -Path (Join-Path $dist '.nojekyll') -Value '' -NoNewline -Encoding ascii

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $dist '*') -DestinationPath $zip -CompressionLevel Optimal

$size = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host "packed: $zip  ($size MB)"
Write-Host "dist folder: $dist"
