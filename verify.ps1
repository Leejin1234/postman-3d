# 校验线上站点：.\verify.ps1
$base = 'https://leejin1234.github.io/postman-3d/'
$files = @('index.html', 'game.js', 'README.txt', 'assets/the-boy.fbx', 'assets/city-lowpoly.fbx', 'assets/ui/avatar.png')
foreach ($f in $files) {
  $u = $base + $f
  try {
    $r = Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 60
    $kb = [math]::Round($r.RawContentLength / 1KB)
    Write-Output ("{0,-28} {1}  {2} KB" -f $f, $r.StatusCode, $kb)
  } catch {
    Write-Output ("{0,-28} ERR {1}" -f $f, $_.Exception.Message)
  }
}
try {
  $g = (Invoke-WebRequest ($base + 'game.js') -UseBasicParsing -TimeoutSec 60).Content
  $thin = [regex]::Matches($g, 'addOutline\(\w+, 0\.015\)').Count
  Write-Output ""
  Write-Output "线上 game.js 里 0.015 描边调用数 = $thin  (应为 4)"
  Write-Output ("含 bakeHullNormals = " + $g.Contains('bakeHullNormals'))
  Write-Output ("含 inkTexture      = " + $g.Contains('inkTexture'))
} catch {
  Write-Output "game.js 内容校验失败"
}
