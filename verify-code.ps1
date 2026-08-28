# 只校验代码，不下大模型：.\verify-code.ps1
$base = 'https://leejin1234.github.io/postman-3d/'
try {
  $g = (Invoke-WebRequest ($base + 'game.js') -UseBasicParsing -TimeoutSec 60).Content
  $thin = [regex]::Matches($g, 'addOutline\(\w+, 0\.015\)').Count
  Write-Output "0.015 描边调用数     = $thin  (应为 4)"
  Write-Output ("bakeHullNormals    = " + $g.Contains('bakeHullNormals'))
  Write-Output ("inkTexture         = " + $g.Contains('inkTexture'))
  Write-Output ("NearestFilter 分色带 = " + $g.Contains('t.minFilter = t.magFilter = THREE.NearestFilter'))
  Write-Output ("noline 开关         = " + $g.Contains('noline'))
  [regex]::Matches($g, 'addOutline\(\w+, [\d.]+\)') | ForEach-Object { Write-Output ("  " + $_.Value) }
} catch {
  Write-Output ("game.js 校验失败: " + $_.Exception.Message)
}
try {
  $h = (Invoke-WebRequest ($base + 'assets/the-boy_basecolor.jpg') -UseBasicParsing -TimeoutSec 60)
  Write-Output ("the-boy 贴图        = " + $h.StatusCode)
} catch { Write-Output 'the-boy 贴图 ERR' }
