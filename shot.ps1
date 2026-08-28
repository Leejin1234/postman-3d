# 截图辅助：.\shot.ps1 -Name cel_insp1 -Query "debug&insp&lw=1"
#           .\shot.ps1 -Name rect1 -Page rect.html -Query "" -W 900 -H 420
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Query = 'debug',
  [string]$Page = '',
  [int]$W = 480,
  [int]$H = 900,
  [int]$Budget = 240000
)
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $root ("_" + $Name + ".png")
Remove-Item $out -ErrorAction SilentlyContinue
$url = 'http://localhost:8130/' + $Page
if ($Query) { $url += '?' + $Query }
& $chrome --headless=new --disable-gpu --enable-unsafe-swiftshader `
  "--window-size=$W,$H" "--virtual-time-budget=$Budget" "--screenshot=$out" $url 2>&1 | Out-Null
if (Test-Path $out) { "ok  $out" } else { "FAIL $url" }
