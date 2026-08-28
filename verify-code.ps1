# Verify the published code without downloading the 29MB city model.
# NOTE: keep this file ASCII-only. PowerShell 5 decodes UTF-8 .ps1 as GBK and
# mangled Chinese characters can swallow quotes and break parsing.
$base = 'https://leejin1234.github.io/postman-3d/'
function Get-Text($u) { (Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 60).Content }

try {
  $g = Get-Text ($base + 'game.js')
  Write-Output ("=== game.js ({0} KB) ===" -f [math]::Round($g.Length / 1KB))
  $checks = [ordered]@{
    'cel hard bands (NearestFilter)' = $g.Contains('THREE.NearestFilter')
    'welded hull normals'            = $g.Contains('bakeHullNormals')
    'texture ink lines'              = $g.Contains('inkTexture')
    'outline 0.015 x4'               = ([regex]::Matches($g, 'addOutline\(\w+, 0\.015\)').Count -eq 4)
    'Cache Storage'                  = $g.Contains('caches.open(CACHE_NAME)')
    'cache timeout guard'            = $g.Contains('function withTimeout')
    'XHR progress download'          = $g.Contains('function fetchProgress')
    'backoff retry'                  = $g.Contains('function withRetry')
    'nocache purge switch'           = $g.Contains('caches.delete(k)')
  }
  foreach ($k in $checks.Keys) {
    Write-Output ("  {0,-34} {1}" -f $k, $(if ($checks[$k]) { 'OK' } else { 'MISSING!' }))
  }
} catch { Write-Output ("game.js check failed: " + $_.Exception.Message) }

try {
  $h = Get-Text ($base + 'index.html')
  Write-Output ""
  Write-Output "=== index.html ==="
  $hc = [ordered]@{
    'side rail (flex column)' = ($h -match '\.bottom\s*\{[^}]*flex-direction:column')
    'retry button #ldRetry'   = $h.Contains('id="ldRetry"')
    'loading tip #ldTip'      = $h.Contains('id="ldTip"')
  }
  foreach ($k in $hc.Keys) {
    Write-Output ("  {0,-34} {1}" -f $k, $(if ($hc[$k]) { 'OK' } else { 'MISSING!' }))
  }
} catch { Write-Output ("index.html check failed: " + $_.Exception.Message) }
